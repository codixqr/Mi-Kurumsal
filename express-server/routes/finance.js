const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const conds = ["fr.deleted_at IS NULL"];
    const params = [];
    const add = (sql, val) => {
      params.push(val);
      conds.push(`${sql}$${params.length}`);
    };
    if (q.contractId) add("fr.contract_id = ", Number(q.contractId));
    if (q.investorId) add("fr.investor_id = ", Number(q.investorId));
    if (q.brandId) add("fr.brand_id = ", Number(q.brandId));
    if (q.projectId) add("fr.project_id = ", Number(q.projectId));
    if (q.locationId) add("fr.location_id = ", Number(q.locationId));
    if (q.incomeType) add("fr.income_type = ", q.incomeType);
    if (q.status) add("fr.status = ", q.status);
    if (q.dateFrom) add("fr.created_at::date >= ", q.dateFrom);
    if (q.dateTo) add("fr.created_at::date <= ", q.dateTo);
    const where = conds.join(" AND ");
    const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM finance_records fr WHERE ${where}`, params);
    const rows = await pool.query(`SELECT fr.*, c.name AS contract_name, i.name AS investor_name, b.name AS brand_name, l.name AS location_name
     FROM finance_records fr
     LEFT JOIN contracts c ON c.id = fr.contract_id
     LEFT JOIN investors i ON i.id = fr.investor_id
     LEFT JOIN brands b ON b.id = fr.brand_id
     LEFT JOIN locations l ON l.id = fr.location_id
     WHERE ${where}
     ORDER BY fr.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, offset]);
    let kpis = {
      total: 0,
      totalAmount: 0,
      collected: 0,
      pending: 0,
      overdue: 0,
      netProfit: 0,
      thisMonthRevenue: 0,
      thisMonthExpense: 0
    };
    try {
      kpis = await computeFinanceKpis();
    } catch (e) {
      console.error('computeFinanceKpis error:', e.message);
    }
    const today = new Date().toISOString().split("T")[0];
    let overdueWarnings = [];
    try {
      const overdueWarn = await pool.query(`SELECT id, contract_id, amount, due_date FROM finance_records WHERE deleted_at IS NULL AND status='Açık' AND due_date < $1::date ORDER BY due_date ASC LIMIT 10`, [today]);
      overdueWarnings = overdueWarn.rows;
    } catch (_) {}
    res.json({
      items: rows.rows.map(mapFinanceRecord),
      total: totalR.rows[0].c,
      page,
      pageSize,
      kpis,
      overdueWarnings
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const row = await pool.query(`SELECT fr.*, c.name AS contract_name, i.name AS investor_name, b.name AS brand_name, l.name AS location_name
     FROM finance_records fr
     LEFT JOIN contracts c ON c.id=fr.contract_id
     LEFT JOIN investors i ON i.id=fr.investor_id
     LEFT JOIN brands b ON b.id=fr.brand_id
     LEFT JOIN locations l ON l.id=fr.location_id
     WHERE fr.id=$1`, [id]);
  if (row.rowCount === 0) return res.status(404).json({
    message: "Bulunamadı."
  });
  const plans = await pool.query("SELECT * FROM payment_plans WHERE finance_record_id=$1 ORDER BY taksit_no ASC", [id]);
  res.json({
    record: mapFinanceRecord(row.rows[0]),
    paymentPlans: plans.rows.map(mapPaymentPlan)
  });
});

router.post("/", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount || 0);
  const vatPct = Number(b.vatPct || 0);
  const vatAmount = Math.round(amount * vatPct / 100 * 100) / 100;
  const netAmount = amount + vatAmount;
  const inserted = await pool.query(`INSERT INTO finance_records(contract_id,project_id,investor_id,brand_id,location_id,income_type,amount,vat_pct,vat_amount,net_amount,currency,description,payment_type,status,consultant_commission_pct,company_share_pct,due_date,payment_method,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`, [b.contractId || null, b.projectId || null, b.investorId || null, b.brandId || null, b.locationId || null, b.incomeType || "Danışmanlık", amount, vatPct, vatAmount, netAmount, b.currency || "TRY", b.description || null, b.paymentType || "Peşin", b.status || "Açık", b.consultantCommissionPct != null ? Number(b.consultantCommissionPct) : null, b.companySharePct != null ? Number(b.companySharePct) : null, b.dueDate || null, b.paymentMethod || null, req.user.id]);
  const item = mapFinanceRecord(inserted.rows[0]);
  // Auto-create payment plan for taksitli
  if (b.paymentType === "Taksitli" && Array.isArray(b.installments) && b.installments.length > 0) {
    for (const inst of b.installments) {
      await pool.query(`INSERT INTO payment_plans(finance_record_id,taksit_no,amount,due_date,status) VALUES($1,$2,$3,$4,'Bekliyor')`, [item.id, Number(inst.no || 1), Number(inst.amount || 0), inst.dueDate]);
    }
  }
  await logActivity({
    userId: req.user.id,
    moduleName: "finance",
    actionType: "create",
    recordId: item.id,
    summary: `Finans kaydı oluşturuldu: ${item.incomeType}`,
    afterData: item
  });
  res.status(201).json(item);
});

router.put("/:id", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount || 0);
  const vatPct = Number(b.vatPct || 0);
  const vatAmount = Math.round(amount * vatPct / 100 * 100) / 100;
  const netAmount = amount + vatAmount;
  const updated = await pool.query(`UPDATE finance_records SET contract_id=$1,project_id=$2,investor_id=$3,brand_id=$4,location_id=$5,income_type=$6,amount=$7,vat_pct=$8,vat_amount=$9,net_amount=$10,currency=$11,description=$12,payment_type=$13,status=$14,consultant_commission_pct=$15,company_share_pct=$16,due_date=$17,paid_date=$18,payment_method=$19,updated_at=NOW()
     WHERE id=$20 RETURNING *`, [b.contractId || null, b.projectId || null, b.investorId || null, b.brandId || null, b.locationId || null, b.incomeType || "Danışmanlık", amount, vatPct, vatAmount, netAmount, b.currency || "TRY", b.description || null, b.paymentType || "Peşin", b.status || "Açık", b.consultantCommissionPct != null ? Number(b.consultantCommissionPct) : null, b.companySharePct != null ? Number(b.companySharePct) : null, b.dueDate || null, b.paidDate || null, b.paymentMethod || null, req.params.id]);
  if (updated.rowCount === 0) return res.status(404).json({
    message: "Bulunamadı."
  });
  res.json(mapFinanceRecord(updated.rows[0]));
});

router.delete("/:id", authMiddleware, async (req, res) => {
  await pool.query("UPDATE finance_records SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

// Ödeme al (taksit / peşin)

// Ödeme al (taksit / peşin)

// Ödeme planı upsert

// Gider API
router.post("/:id/collect", authMiddleware, async (req, res) => {
  const {
    amount = null,
    paymentMethod = "Banka Transferi",
    paidDate = null,
    installmentId = null
  } = req.body || {};
  const today = paidDate || new Date().toISOString().split("T")[0];
  if (installmentId) {
    await pool.query(`UPDATE payment_plans SET status='Ödendi', paid_date=$1, payment_method=$2, updated_at=NOW() WHERE id=$3`, [today, paymentMethod, installmentId]);
    // Check if all installments paid
    const rec = await pool.query("SELECT finance_record_id FROM payment_plans WHERE id=$1", [installmentId]);
    if (rec.rowCount > 0) {
      const remaining = await pool.query(`SELECT COUNT(*)::int AS c FROM payment_plans WHERE finance_record_id=$1 AND status<>'Ödendi'`, [rec.rows[0].finance_record_id]);
      if (remaining.rows[0].c === 0) {
        await pool.query(`UPDATE finance_records SET status='Tahsil edildi', paid_date=$1, updated_at=NOW() WHERE id=$2`, [today, rec.rows[0].finance_record_id]);
      }
    }
  } else {
    await pool.query(`UPDATE finance_records SET status='Tahsil edildi', paid_date=$1, payment_method=$2, updated_at=NOW() WHERE id=$3`, [today, paymentMethod, req.params.id]);
  }
  res.json({
    ok: true
  });
});

// Ödeme planı upsert
router.post("/:id/payment-plan", authMiddleware, async (req, res) => {
  const {
    installments = []
  } = req.body || {};
  const finId = Number(req.params.id);
  await pool.query("DELETE FROM payment_plans WHERE finance_record_id=$1", [finId]);
  for (const inst of installments) {
    await pool.query(`INSERT INTO payment_plans(finance_record_id,taksit_no,amount,due_date,status,note) VALUES($1,$2,$3,$4,$5,$6)`, [finId, Number(inst.no || 1), Number(inst.amount || 0), inst.dueDate, inst.status || "Bekliyor", inst.note || null]);
  }
  const plans = await pool.query("SELECT * FROM payment_plans WHERE finance_record_id=$1 ORDER BY taksit_no", [finId]);
  res.json(plans.rows.map(mapPaymentPlan));
});

// Gider API

// Gider API
router.get("/expenses", authMiddleware, async (req, res) => {
  const q = req.query || {};
  const conds = ["1=1"];
  const params = [];
  const add = (sql, val) => {
    params.push(val);
    conds.push(`${sql}$${params.length}`);
  };
  if (q.projectId) add("e.project_id = ", Number(q.projectId));
  if (q.contractId) add("e.contract_id = ", Number(q.contractId));
  if (q.type) add("e.expense_type = ", q.type);
  if (q.dateFrom) add("e.expense_date >= ", q.dateFrom);
  if (q.dateTo) add("e.expense_date <= ", q.dateTo);
  const rows = await pool.query(`SELECT e.*, p.name AS project_name FROM finance_expenses e LEFT JOIN projects p ON p.id=e.project_id WHERE ${conds.join(" AND ")} ORDER BY e.expense_date DESC`, params);
  res.json(rows.rows.map(mapExpense));
});

router.post("/expenses", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const inserted = await pool.query(`INSERT INTO finance_expenses(contract_id,project_id,expense_type,amount,currency,expense_date,description,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [b.contractId || null, b.projectId || null, b.expenseType || "Operasyon", Number(b.amount || 0), b.currency || "TRY", b.expenseDate || new Date().toISOString().split("T")[0], b.description || null, req.user.id]);
  res.status(201).json(mapExpense(inserted.rows[0]));
});

router.delete("/expenses/:id", authMiddleware, async (req, res) => {
  await pool.query("DELETE FROM finance_expenses WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("contracts"));

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const conds = ["c.deleted_at IS NULL"];
    const params = [];
    const add = (sql, val) => {
      params.push(val);
      conds.push(`${sql}$${params.length}`);
    };
    if (q.name) add("c.name ILIKE ", `%${q.name}%`);
    if (q.type) add("c.contract_type = ", q.type);
    if (q.status) add("c.status = ", q.status);
    if (q.investorId) add("c.investor_id = ", Number(q.investorId));
    if (q.brandId) add("c.brand_id = ", Number(q.brandId));
    if (q.projectId) add("c.project_id = ", Number(q.projectId));
    if (q.locationId) add("c.location_id = ", Number(q.locationId));
    if (q.consultant) add("c.consultant_name ILIKE ", `%${q.consultant}%`);
    if (q.startFrom) add("c.start_date >= ", q.startFrom);
    if (q.startTo) add("c.start_date <= ", q.startTo);
    if (q.endFrom) add("c.end_date >= ", q.endFrom);
    if (q.endTo) add("c.end_date <= ", q.endTo);
    if (q.amountMin) add("c.amount >= ", Number(q.amountMin));
    if (q.amountMax) add("c.amount <= ", Number(q.amountMax));
    const whereSql = conds.join(" AND ");
    const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM contracts c WHERE ${whereSql}`, params);
    const rows = await pool.query(`SELECT c.*, i.name AS investor_name, b.name AS brand_name, p.name AS project_name, l.name AS location_name,
            COALESCE(tm.name, c.consultant_name) AS consultant_name
     FROM contracts c
     LEFT JOIN investors i ON i.id = c.investor_id
     LEFT JOIN brands b ON b.id = c.brand_id
     LEFT JOIN projects p ON p.id = c.project_id
     LEFT JOIN locations l ON l.id = c.location_id
     LEFT JOIN team_members tm ON tm.id = c.assigned_member_id
     WHERE ${whereSql}
     ORDER BY c.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, offset]);
    let kpis = {
      total: 0,
      active: 0,
      signedThisMonth: 0,
      expiringSoon: 0,
      terminated: 0,
      totalValue: 0
    };
    try {
      kpis = await computeContractKpis();
    } catch (e) {
      console.error('computeContractKpis error:', e.message);
    }
    const today = new Date().toISOString().split("T")[0];
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    let warnings = [];
    try {
      const wRes = await pool.query(`SELECT id, name, end_date FROM contracts WHERE deleted_at IS NULL AND status='Aktif' AND end_date BETWEEN $1::date AND $2::date ORDER BY end_date ASC LIMIT 10`, [today, soon]);
      warnings = wRes.rows;
    } catch (_) {}
    res.json({
      items: rows.rows.map(mapContract),
      total: totalR.rows[0].c,
      page,
      pageSize,
      kpis,
      expiryWarnings: warnings
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/detail", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const row = await pool.query(`SELECT c.*, i.name AS investor_name, b.name AS brand_name, p.name AS project_name, l.name AS location_name,
            COALESCE(tm.name, c.consultant_name) AS consultant_name
     FROM contracts c
     LEFT JOIN investors i ON i.id = c.investor_id
     LEFT JOIN brands b ON b.id = c.brand_id
     LEFT JOIN projects p ON p.id = c.project_id
     LEFT JOIN locations l ON l.id = c.location_id
     LEFT JOIN team_members tm ON tm.id = c.assigned_member_id
     WHERE c.id=$1`, [id]);
  if (row.rowCount === 0) return res.status(404).json({
    message: "Bulunamadı."
  });
  const contract = mapContract(row.rows[0]);
  const [financeRecords, agreements] = await Promise.all([pool.query("SELECT fr.*, c.name AS contract_name FROM finance_records fr LEFT JOIN contracts c ON c.id=fr.contract_id WHERE fr.contract_id=$1 ORDER BY fr.id DESC", [id]), pool.query("SELECT * FROM brand_agreements WHERE brand_id=$1 ORDER BY version_no DESC", [row.rows[0].brand_id || 0])]);
  res.json({
    contract,
    financeRecords: financeRecords.rows.map(mapFinanceRecord),
    agreements: agreements.rows
  });
});

router.post("/", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const inserted = await pool.query(`INSERT INTO contracts(
      name, note, contract_type, status, counterparty, start_date, end_date, sign_date, renewal_date,
      amount, consulting_fee, franchise_commission, franchise_commission_pct, location_commission, extra_income,
      currency, file_url, docs_urls,
      investor_id, brand_id, project_id, location_id, assigned_member_id,
      consultant_name, legal_person, finance_person, risk_level, risk_note, notes, created_by
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
    ) RETURNING *`, [b.name || b.note || "Yeni sözleşme", b.note || null, b.type || b.contractType || null, b.status || "Taslak", b.counterparty || null, b.startDate || null, b.endDate || null, b.signDate || null, b.renewalDate || null, b.amount ? Number(b.amount) : null, b.consultingFee ? Number(b.consultingFee) : null, b.franchiseCommission ? Number(b.franchiseCommission) : null, b.franchiseCommissionPct ? Number(b.franchiseCommissionPct) : null, b.locationCommission ? Number(b.locationCommission) : null, b.extraIncome || null, b.currency || "TRY", b.fileUrl || null, Array.isArray(b.docsUrls) ? b.docsUrls : [], b.investorId || b.investor_id || null, b.brandId || b.brand_id || null, b.projectId || b.project_id || null, b.locationId || b.location_id || null, b.assignedMemberId || b.assigned_member_id || null, b.consultantName || null, b.legalPerson || null, b.financePerson || null, b.riskLevel || null, b.riskNote || null, b.notes || null, req.user.id]);
  const item = mapContract(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "contracts",
    actionType: "create",
    recordId: item.id,
    summary: `${item.name} oluşturuldu`,
    afterData: item
  });

  // Otomasyon: İmzalandı veya Aktif → Lokasyonu "Kiralandı", Yatırımcıyı "Kazanıldı", Projeyi "Kapanış" yap
  if (item.status === "İmzalandı" || item.status === "Aktif") {
    if (item.locationId) {
      await pool.query(`UPDATE locations SET status='Kiralandı' WHERE id=$1 AND status='Boş'`, [item.locationId]);
    }
    if (item.investorId) {
      await pool.query(`UPDATE investors SET pipeline_stage='Kazanıldı' WHERE id=$1 AND pipeline_stage <> 'Kazanıldı'`, [item.investorId]);
    }
    if (item.projectId) {
      await pool.query(`UPDATE projects SET stage='Kapanış', pipeline_stage='Kapanış', progress=100 WHERE id=$1 AND stage <> 'Kapanış'`, [item.projectId]);
    }
    if (item.amount) {
      await pool.query(`INSERT INTO finance_records(contract_id,investor_id,brand_id,location_id,project_id,income_type,amount,net_amount,currency,description,created_by)
         VALUES($1,$2,$3,$4,$5,'Danışmanlık',$6,$6,$7,$8,$9)`, [item.id, item.investorId, item.brandId, item.locationId, item.projectId, Number(item.amount), item.currency, `${item.name} – otomatik finans kaydı`, req.user.id]);
    }
  }
  res.status(201).json(item);
});

router.put("/:id", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const before = await pool.query("SELECT * FROM contracts WHERE id=$1", [req.params.id]);
  const updated = await pool.query(`UPDATE contracts SET
      name=$1, note=$2, contract_type=$3, status=$4, counterparty=$5, start_date=$6, end_date=$7, sign_date=$8, renewal_date=$9,
      amount=$10, consulting_fee=$11, franchise_commission=$12, franchise_commission_pct=$13, location_commission=$14, extra_income=$15,
      currency=$16, file_url=$17, docs_urls=$18,
      investor_id=$19, brand_id=$20, project_id=$21, location_id=$22, assigned_member_id=$23,
      consultant_name=$24, legal_person=$25, finance_person=$26, risk_level=$27, risk_note=$28, notes=$29, updated_at=NOW()
     WHERE id=$30 RETURNING *`, [b.name || before.rows[0]?.name, b.note || null, b.type || b.contractType || null, b.status || "Taslak", b.counterparty || null, b.startDate || null, b.endDate || null, b.signDate || null, b.renewalDate || null, b.amount ? Number(b.amount) : null, b.consultingFee ? Number(b.consultingFee) : null, b.franchiseCommission ? Number(b.franchiseCommission) : null, b.franchiseCommissionPct ? Number(b.franchiseCommissionPct) : null, b.locationCommission ? Number(b.locationCommission) : null, b.extraIncome || null, b.currency || "TRY", b.fileUrl || null, Array.isArray(b.docsUrls) ? b.docsUrls : [], b.investorId ?? before.rows[0]?.investor_id ?? null, b.brandId ?? before.rows[0]?.brand_id ?? null, b.projectId ?? before.rows[0]?.project_id ?? null, b.locationId ?? before.rows[0]?.location_id ?? null, b.assignedMemberId ?? before.rows[0]?.assigned_member_id ?? null, b.consultantName || null, b.legalPerson || null, b.financePerson || null, b.riskLevel || null, b.riskNote || null, b.notes || null, req.params.id]);
  if (updated.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  const item = mapContract(updated.rows[0]);
  const prevStatus = before.rows[0]?.status || "";

  // Otomasyon: İmzalandı veya Aktif → Lokasyonu "Kiralandı", Yatırımcıyı "Kazanıldı", Projeyi "Kapanış" yap
  if (item.status === "İmzalandı" || item.status === "Aktif") {
    if (item.locationId) {
      await pool.query(`UPDATE locations SET status='Kiralandı' WHERE id=$1 AND status='Boş'`, [item.locationId]);
    }
    if (item.investorId) {
      await pool.query(`UPDATE investors SET pipeline_stage='Kazanıldı' WHERE id=$1 AND pipeline_stage <> 'Kazanıldı'`, [item.investorId]);
    }
    if (item.projectId) {
      await pool.query(`UPDATE projects SET stage='Kapanış', pipeline_stage='Kapanış', progress=100 WHERE id=$1 AND stage <> 'Kapanış'`, [item.projectId]);
    }
    if (prevStatus !== "İmzalandı" && prevStatus !== "Aktif" && item.amount) {
      const existing = await pool.query("SELECT id FROM finance_records WHERE contract_id=$1 LIMIT 1", [item.id]);
      if (existing.rowCount === 0) {
        await pool.query(`INSERT INTO finance_records(contract_id,investor_id,brand_id,location_id,project_id,income_type,amount,net_amount,currency,description,created_by)
           VALUES($1,$2,$3,$4,$5,'Danışmanlık',$6,$6,$7,$8,$9)`, [item.id, item.investorId, item.brandId, item.locationId, item.projectId, Number(item.amount), item.currency, `${item.name} – otomatik finans kaydı`, req.user.id]);
      }
    }
  }

  // Otomasyon: Feshedildi → finans iptal ve Lokasyon boşalt
  if (item.status === "Feshedildi") {
    await pool.query(`UPDATE finance_records SET status='İptal', updated_at=NOW() WHERE contract_id=$1 AND status='Açık'`, [item.id]);
    if (item.locationId) {
      await pool.query(`UPDATE locations SET status='Boş' WHERE id=$1 AND status='Kiralandı'`, [item.locationId]);
    }
  }
  await logActivity({
    userId: req.user.id,
    moduleName: "contracts",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item
  });
  res.json(item);
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT id,name FROM contracts WHERE id=$1", [req.params.id]);
  await pool.query("UPDATE contracts SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "contracts",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name || "Sözleşme"} silindi`,
      beforeData: row.rows[0]
    });
  }
  res.status(204).send();
});

// ─── FINANCE RECORDS ─────────────────────────────────────────────────────────

module.exports = router;

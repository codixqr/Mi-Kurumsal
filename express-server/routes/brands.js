const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const xlsx = require('xlsx');
const { upload, uploadLocal } = require('../middlewares/upload');
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("brands"));

router.get("/", authMiddleware, async (req, res) => {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const sortMap = {
      name: "b.name",
      sector: "b.sector",
      min_budget: "b.min_budget",
      max_budget: "b.max_budget",
      created_at: "b.created_at",
      agreement_status: "b.agreement_status"
    };
    const sortCol = sortMap[q.sort] || "b.created_at";
    const order = String(q.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const conds = ["1=1"];
    const params = [];
    const add = (sql, val) => {
      params.push(val);
      conds.push(`${sql}$${params.length}`);
    };
    if (q.q) {
      params.push(`%${String(q.q)}%`);
      conds.push(`(b.name ILIKE $${params.length} OR b.sector ILIKE $${params.length} OR COALESCE(b.sub_sector,'') ILIKE $${params.length})`);
    }
    if (q.name) add("b.name ILIKE ", `%${q.name}%`);
    if (q.sector) add("b.sector ILIKE ", `%${q.sector}%`);
    if (q.subSector) add("b.sub_sector ILIKE ", `%${q.subSector}%`);
    if (q.targetCity) add("b.target_locations ILIKE ", `%${q.targetCity}%`);
    if (q.budgetMin) add("b.max_budget >= ", Number(q.budgetMin));
    if (q.budgetMax) add("b.min_budget <= ", Number(q.budgetMax));
    if (q.locationType) add("b.location_type = ", q.locationType);
    if (q.agreementStatus) add("b.agreement_status = ", q.agreementStatus);
    if (q.active === "true" || q.active === true) add("b.active = ", true);
    if (q.active === "false" || q.active === false) add("b.active = ", false);
    if (q.givesFranchise === "true" || q.givesFranchise === true) add("b.gives_franchise = ", true);
    if (q.givesFranchise === "false" || q.givesFranchise === false) add("b.gives_franchise = ", false);
    if (q.hasRoyalty === "true" || q.hasRoyalty === true) add("b.has_royalty = ", true);
    if (q.hasRoyalty === "false" || q.hasRoyalty === false) add("b.has_royalty = ", false);
    if (q.createdFrom) add("b.created_at::date >= ", q.createdFrom);
    if (q.createdTo) add("b.created_at::date <= ", q.createdTo);
    const whereSql = conds.join(" AND ");
    const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM brands b WHERE ${whereSql}`, params);
    const total = countR.rows[0].c;
    const listParams = [...params, pageSize, offset];
    const result = await pool.query(`SELECT b.* FROM brands b WHERE ${whereSql} ORDER BY ${sortCol} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, listParams);
    const rows = result.rows.map(mapBrand);
    let kpis = {
      total: 0,
      activeAgreed: 0,
      inDiscussion: 0,
      passive: 0,
      avgInvestment: 0,
      newThisMonth: 0
    };
    try {
      kpis = await computeBrandKpis();
    } catch (e) {
      console.error('computeBrandKpis error:', e.message);
    }
    res.json({
      items: rows,
      total,
      page,
      pageSize,
      kpis
    });
  } catch (err) {
    next(err);
  }
});

router.post("/bulk", authMiddleware, async (req, res) => {
  const {
    ids = [],
    agreementStatus,
    active
  } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      message: "ids zorunlu."
    });
  }
  const idList = ids.map(x => Number(x)).filter(n => Number.isFinite(n));
  if (!idList.length) {
    return res.status(400).json({
      message: "Geçersiz id listesi."
    });
  }
  if (agreementStatus !== undefined && agreementStatus !== null && agreementStatus !== "") {
    await pool.query(`UPDATE brands SET agreement_status=$1, updated_at=NOW() WHERE id = ANY($2::int[])`, [agreementStatus, idList]);
  }
  if (active === true || active === false) {
    await pool.query(`UPDATE brands SET active=$1, updated_at=NOW() WHERE id = ANY($2::int[])`, [active, idList]);
  }
  res.json({
    ok: true,
    updated: idList.length
  });
});

router.get("/:id/detail", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({
      message: "Geçersiz id."
    });
  }
  const brandRow = await pool.query("SELECT * FROM brands WHERE id=$1", [id]);
  if (brandRow.rowCount === 0) {
    return res.status(404).json({
      message: "Marka bulunamadı."
    });
  }
  const brand = mapBrand(brandRow.rows[0]);
  const [matches, projects, contracts, tasks, agreements, locRows] = await Promise.all([pool.query(`SELECT ibm.*, i.name AS investor_name, i.city AS investor_city, i.sector AS investor_sector
       FROM investor_brand_matches ibm JOIN investors i ON i.id = ibm.investor_id WHERE ibm.brand_id=$1 ORDER BY ibm.score DESC NULLS LAST`, [id]), pool.query("SELECT * FROM projects WHERE brand_id=$1 AND deleted_at IS NULL ORDER BY id DESC", [id]), pool.query("SELECT * FROM contracts WHERE brand_id=$1 AND deleted_at IS NULL ORDER BY id DESC", [id]), pool.query("SELECT * FROM tasks WHERE brand_id=$1 ORDER BY id DESC LIMIT 100", [id]), pool.query("SELECT * FROM brand_agreements WHERE brand_id=$1 ORDER BY version_no DESC, created_at DESC", [id]), pool.query(`SELECT * FROM locations WHERE deleted_at IS NULL AND (
        CAST($1 AS text) = ANY(recommended_brands) OR array_to_string(recommended_brands, ',') ILIKE '%' || $2 || '%'
      ) ORDER BY id DESC LIMIT 50`, [String(id), brand.name || ""])]);
  res.json({
    brand,
    investorMatches: matches.rows,
    projects: projects.rows.map(mapProject),
    contracts: contracts.rows.map(mapContract),
    tasks: tasks.rows.map(mapTask),
    agreements: agreements.rows,
    locations: locRows.rows.map(mapLocation)
  });
});

router.post("/", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const vals = brandWriteValues(body);
  const inserted = await pool.query(`INSERT INTO brands(
      name,sector,min_budget,max_budget,currency,min_sqm,max_sqm,target_locations,active,monthly_growth,
      agreement_status,franchise_fee,royalty_rate,contract_term_months,initial_investment,branch_count,
      contact_person,contact_phone,business_plan,operation_plan,onboarding_steps,kpi_targets,brand_notes,
      sub_sector,whatsapp_phone,email,website,brand_type,target_regions,location_type,
      storefront_need,chimney_need,tech_infrastructure,staff_need,ad_contribution_pct,avg_monthly_revenue,
      profit_margin_pct,payback_months,presentation_url,logo_url,contract_draft_url,documents,
      gives_franchise,has_royalty,score_operation,score_franchise_fit,score_location_flex,score_investor_interest,score_profitability,score_growth
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50)
    RETURNING *`, vals);
  const item = mapBrand(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "brands",
    actionType: "create",
    recordId: item.id,
    summary: `${item.name} eklendi`,
    afterData: item
  });
  await pool.query(`INSERT INTO tasks(note,status,priority,due_date,brand_id) VALUES($1,'Açık','Orta', CURRENT_DATE + INTERVAL '2 day', $2)`, [`Marka analizini tamamla: ${item.name}`, item.id]);
  res.status(201).json(item);
});

router.put("/:id", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const before = await pool.query("SELECT * FROM brands WHERE id=$1", [req.params.id]);
  const vals = brandWriteValues(body);
  const updated = await pool.query(`UPDATE brands SET
      name=$1,sector=$2,min_budget=$3,max_budget=$4,currency=$5,min_sqm=$6,max_sqm=$7,target_locations=$8,active=$9,monthly_growth=$10,
      agreement_status=$11,franchise_fee=$12,royalty_rate=$13,contract_term_months=$14,initial_investment=$15,branch_count=$16,
      contact_person=$17,contact_phone=$18,business_plan=$19,operation_plan=$20,onboarding_steps=$21,kpi_targets=$22,brand_notes=$23,
      sub_sector=$24,whatsapp_phone=$25,email=$26,website=$27,brand_type=$28,target_regions=$29,location_type=$30,
      storefront_need=$31,chimney_need=$32,tech_infrastructure=$33,staff_need=$34,ad_contribution_pct=$35,avg_monthly_revenue=$36,
      profit_margin_pct=$37,payback_months=$38,presentation_url=$39,logo_url=$40,contract_draft_url=$41,documents=$42,
      gives_franchise=$43,has_royalty=$44,score_operation=$45,score_franchise_fit=$46,score_location_flex=$47,score_investor_interest=$48,score_profitability=$49,score_growth=$50,
      updated_at=NOW()
     WHERE id=$51 RETURNING *`, [...vals, req.params.id]);
  if (updated.rowCount === 0) {
    return res.status(404).json({
      message: "Kayıt bulunamadı."
    });
  }
  const item = mapBrand(updated.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "brands",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item
  });
  res.json(item);
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM brands WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM brands WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "brands",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name} silindi`,
      beforeData: row.rows[0]
    });
  }
  res.status(204).send();
});

router.get("/:id/agreements", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM brand_agreements WHERE brand_id=$1 ORDER BY version_no DESC, created_at DESC", [req.params.id]);
  res.json(rows.rows);
});

router.post("/:id/agreements", authMiddleware, async (req, res) => {
  const brandId = Number(req.params.id);
  const {
    title,
    revisionNote = null,
    effectiveDate = null,
    fileName = null,
    fileUrl = null,
    mimeType = null
  } = req.body || {};
  if (!title) {
    return res.status(400).json({
      message: "Doküman başlığı zorunlu."
    });
  }
  const nextVersion = await pool.query("SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM brand_agreements WHERE brand_id=$1", [brandId]);
  const inserted = await pool.query(`INSERT INTO brand_agreements(brand_id,version_no,title,revision_note,effective_date,file_name,file_url,mime_type,uploaded_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [brandId, Number(nextVersion.rows[0].version_no), title, revisionNote, effectiveDate, fileName, fileUrl, mimeType, req.user.id]);
  res.status(201).json(inserted.rows[0]);
});

router.post("/import", authMiddleware, uploadLocal.single("excelFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({
    message: "Dosya yüklenmedi."
  });
  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  const imported = [];
  for (const row of data) {
    const inserted = await pool.query(`INSERT INTO brands(name,sector,min_budget,max_budget,currency,min_sqm,max_sqm,target_locations,active,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`, [row.Marka || row.Name || "İsimsiz Marka", row.Sektör || row.Sector || "Genel", Number(row.MinButce || 0), Number(row.MaxButce || 0), row.ParaBirimi || "TRY", Number(row.MinSqm || 0), Number(row.MaxSqm || 0), row.Lokasyonlar || "", true]);
    imported.push(inserted.rows[0]);
  }
  res.json({
    message: `${imported.length} marka başarıyla aktarıldı.`,
    imported
  });
});

module.exports = router;

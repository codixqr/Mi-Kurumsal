const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("locations"));

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const sortMap = {
      name: "l.name",
      rent: "l.rent",
      sqm: "l.sqm",
      potential: "l.potential",
      created_at: "l.created_at"
    };
    const sortCol = sortMap[q.sort] || "l.created_at";
    const order = String(q.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const conds = ["1=1"];
    const params = [];
    const add = (sql, val) => {
      params.push(val);
      conds.push(`${sql}$${params.length}`);
    };
    if (q.name) add("l.name ILIKE ", `%${q.name}%`);
    if (q.city) add("COALESCE(l.city,'') ILIKE ", `%${q.city}%`);
    if (q.district) add("COALESCE(l.district,'') ILIKE ", `%${q.district}%`);
    if (q.region) add("COALESCE(l.region,'') ILIKE ", `%${q.region}%`);
    if (q.type) add("l.location_type = ", q.type);
    if (q.sqmMin) add("l.sqm >= ", Number(q.sqmMin));
    if (q.sqmMax) add("l.sqm <= ", Number(q.sqmMax));
    if (q.rentMin) add("l.rent >= ", Number(q.rentMin));
    if (q.rentMax) add("l.rent <= ", Number(q.rentMax));
    if (q.potential) add("l.potential = ", q.potential);
    if (q.status) add("l.status = ", q.status);
    if (q.brandFit) add("COALESCE(l.brand_fit_score,0) >= ", Number(q.brandFit));
    if (q.footfall) add("COALESCE(l.footfall_score,0) >= ", Number(q.footfall));
    if (q.segment) add("COALESCE(l.segment,'') = ", q.segment);
    const whereSql = conds.join(" AND ");
    const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM locations l WHERE ${whereSql}`, params);
    const total = countR.rows[0].c;
    const result = await pool.query(`SELECT l.* FROM locations l WHERE ${whereSql} ORDER BY ${sortCol} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, offset]);
    let kpis = {
      total: 0,
      vacant: 0,
      negotiating: 0,
      rented: 0,
      avgRent: 0,
      newThisMonth: 0
    };
    try {
      kpis = await computeLocationKpis();
    } catch (e) {
      console.error('computeLocationKpis error:', e.message);
    }
    res.json({
      items: result.rows.map(mapLocation),
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
    status = null,
    potential = null
  } = req.body || {};
  const idList = Array.isArray(ids) ? ids.map(x => Number(x)).filter(n => Number.isFinite(n)) : [];
  if (!idList.length) return res.status(400).json({
    message: "ids zorunlu."
  });
  if (status) await pool.query("UPDATE locations SET status=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [status, idList]);
  if (potential) await pool.query("UPDATE locations SET potential=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [potential, idList]);
  res.json({
    ok: true,
    updated: idList.length
  });
});

router.get("/:id/detail", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({
    message: "Geçersiz id."
  });
  const base = await pool.query("SELECT * FROM locations WHERE id=$1", [id]);
  if (base.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  const location = mapLocation(base.rows[0]);
  const [projects, investors] = await Promise.all([pool.query("SELECT * FROM projects WHERE location_id=$1 ORDER BY id DESC", [id]), pool.query(`SELECT i.*, ibm.score FROM investor_brand_matches ibm
       JOIN investors i ON i.id = ibm.investor_id
       WHERE ibm.brand_id::text = ANY($1::text[]) ORDER BY ibm.score DESC NULLS LAST LIMIT 30`, [location.recommendedBrands.map(x => String(x))]).catch(() => ({
    rows: []
  }))]);
  res.json({
    location,
    projects: projects.rows.map(mapProject),
    investors: investors.rows.map(mapInvestor)
  });
});

router.post("/", authMiddleware, async (req, res) => {
  const values = locationRowFromBody(req.body, req.user.id);
  const inserted = await pool.query(`INSERT INTO locations(
      name,location_type,sqm,rent,currency,potential,recommended_brands,address,traffic,owner,owner_phone,
      city,district,region,avenue_name,maps_link,segment,storefront_length,floor_info,chimney_status,infrastructure_status,
      revenue_rent_pct,dues,deposit,footfall_score,competitor_brands,target_customer_profile,suitable_sectors,status,brand_fit_score,street_class,avm_segment,files,notes,attachment_name,attachment_data,attachment_url,created_by
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
    ) RETURNING *`, values);
  const item = mapLocation(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "locations",
    actionType: "create",
    recordId: item.id,
    summary: `${item.name} eklendi`,
    afterData: item
  });
  await pool.query(`INSERT INTO tasks(note,status,priority,due_date) VALUES($1,'Açık','Orta', CURRENT_DATE + INTERVAL '2 day')`, [`Analiz yap: ${item.name}`]);
  res.status(201).json(item);
});

router.put("/:id", authMiddleware, async (req, res) => {
  const before = await pool.query("SELECT * FROM locations WHERE id=$1", [req.params.id]);
  const values = [...locationRowFromBody(req.body, req.user.id), req.params.id];
  const updated = await pool.query(`UPDATE locations SET
      name=$1,location_type=$2,sqm=$3,rent=$4,currency=$5,potential=$6,recommended_brands=$7,address=$8,traffic=$9,owner=$10,owner_phone=$11,
      city=$12,district=$13,region=$14,avenue_name=$15,maps_link=$16,segment=$17,storefront_length=$18,floor_info=$19,chimney_status=$20,infrastructure_status=$21,
      revenue_rent_pct=$22,dues=$23,deposit=$24,footfall_score=$25,competitor_brands=$26,target_customer_profile=$27,suitable_sectors=$28,status=$29,brand_fit_score=$30,street_class=$31,avm_segment=$32,files=$33,notes=$34,attachment_name=$35,attachment_data=$36,attachment_url=$37,created_by=$38,updated_at=NOW()
      WHERE id=$39 RETURNING *`, values);
  if (updated.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  const item = mapLocation(updated.rows[0]);
  if (item.status === "Kiralandı") {
    await pool.query(`UPDATE projects SET stage='Kapanış', progress=100, updated_at=NOW() WHERE location_id=$1 AND stage <> 'Kapanış'`, [item.id]);
  }
  await logActivity({
    userId: req.user.id,
    moduleName: "locations",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item
  });
  res.json(item);
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM locations WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM locations WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "locations",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name} silindi`,
      beforeData: row.rows[0]
    });
  }
  res.status(204).send();
});

module.exports = router;

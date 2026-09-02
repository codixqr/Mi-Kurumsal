const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("projects"));

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const conds = ["1=1"];
    const params = [];
    const add = (sql, val) => {
      params.push(val);
      conds.push(`${sql}$${params.length}`);
    };
    if (q.name) add("p.name ILIKE ", `%${q.name}%`);
    if (q.type) add("p.project_type = ", q.type);
    if (q.stage) add("p.stage = ", q.stage);
    if (q.priority) add("p.priority = ", q.priority);
    if (q.investorId) add("p.investor_id = ", Number(q.investorId));
    if (q.brandId) add("p.brand_id = ", Number(q.brandId));
    if (q.locationId) add("p.location_id = ", Number(q.locationId));
    if (q.startFrom) add("COALESCE(p.start_date, p.created_at::date) >= ", q.startFrom);
    if (q.closeTo) add("COALESCE(p.close_date, p.due_date) <= ", q.closeTo);
    const whereSql = conds.join(" AND ");
    const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM projects p WHERE ${whereSql}`, params);
    const list = await pool.query(`SELECT p.*, i.name AS investor_name, b.name AS brand_name, l.name AS location_name
     FROM projects p
     LEFT JOIN investors i ON i.id = p.investor_id
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN locations l ON l.id = p.location_id
     WHERE ${whereSql}
     ORDER BY p.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, offset]);
    const items = list.rows.map(r => {
      const m = mapProject(r);
      m.investorName = r.investor_name || "";
      m.brandName = r.brand_name || "";
      m.locationName = r.location_name || "";
      return m;
    });
    let kpis = {
      total: 0,
      active: 0,
      closedThisMonth: 0,
      avgDuration: 0,
      newThisMonth: 0
    };
    try {
      kpis = await computeProjectKpis();
    } catch (e) {
      console.error('computeProjectKpis error:', e.message);
    }
    res.json({
      items,
      total: totalR.rows[0].c,
      page,
      pageSize,
      kpis
    });
  } catch (err) {
    next(err);
  }
});

router.get("/kanban", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM projects ORDER BY created_at DESC");
  const byStage = {};
  rows.rows.forEach(r => {
    const key = r.stage || "Lead";
    if (!byStage[key]) byStage[key] = [];
    byStage[key].push(mapProject(r));
  });
  res.json(byStage);
});

router.post("/bulk", authMiddleware, async (req, res) => {
  const {
    ids = [],
    stage = null,
    priority = null
  } = req.body || {};
  const idList = Array.isArray(ids) ? ids.map(x => Number(x)).filter(n => Number.isFinite(n)) : [];
  if (!idList.length) return res.status(400).json({
    message: "ids zorunlu."
  });
  if (stage) await pool.query("UPDATE projects SET stage=$1, pipeline_stage=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [stage, idList]);
  if (priority) await pool.query("UPDATE projects SET priority=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [priority, idList]);
  res.json({
    ok: true,
    updated: idList.length
  });
});

router.get("/:id/detail", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const row = await pool.query("SELECT * FROM projects WHERE id=$1", [id]);
  if (row.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  const project = mapProject(row.rows[0]);
  const [tasks, contracts] = await Promise.all([pool.query("SELECT * FROM tasks WHERE note ILIKE $1 ORDER BY id DESC LIMIT 100", [`%${project.name}%`]), pool.query("SELECT * FROM contracts WHERE brand_id=$1 OR investor_id=$2 ORDER BY id DESC", [project.brandId || 0, project.investorId || 0])]);
  res.json({
    project,
    tasks: tasks.rows.map(mapTask),
    contracts: contracts.rows.map(mapContract)
  });
});

router.post("/", authMiddleware, async (req, res) => {
  const inserted = await pool.query(`INSERT INTO projects(
      name,project_type,owner_team,assignees,priority,progress,stage,due_date,description,checklist,investor_id,brand_id,location_id,estimated_investment,estimated_revenue,owner_person,start_date,close_date,risk_level,pipeline_stage,files
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
    ) RETURNING *`, projectRowFromBody(req.body));
  const project = mapProject(inserted.rows[0]);
  if (project.investorId) {
    await pool.query(`UPDATE investors SET last_activity_at=NOW(), updated_at=NOW() WHERE id=$1`, [project.investorId]);
  }
  if (project.brandId) {
    await pool.query(`UPDATE brands SET updated_at=NOW() WHERE id=$1`, [project.brandId]);
  }
  if (project.locationId) {
    await pool.query(`UPDATE locations SET updated_at=NOW() WHERE id=$1`, [project.locationId]);
  }
  await logActivity({
    userId: req.user.id,
    moduleName: "projects",
    actionType: "create",
    recordId: project.id,
    summary: `${project.name} eklendi`,
    afterData: project
  });
  await triggerAutomation("Proje Açıldı", {
    summary: `${project.name} projesi açıldı`,
    project
  });
  await pool.query(`INSERT INTO tasks(note,status,priority,due_date) VALUES
     ($1,'Açık','Orta',CURRENT_DATE + INTERVAL '2 day'),
     ($2,'Açık','Orta',CURRENT_DATE + INTERVAL '5 day')`, [`Proje başlangıç analizi: ${project.name}`, `Saha ve teklif hazırlığı: ${project.name}`]);
  res.status(201).json(project);
});

router.put("/:id", authMiddleware, async (req, res) => {
  const before = await pool.query("SELECT * FROM projects WHERE id=$1", [req.params.id]);
  const updated = await pool.query(`UPDATE projects
     SET name=$1,project_type=$2,owner_team=$3,assignees=$4,priority=$5,progress=$6,stage=$7,due_date=$8,description=$9,checklist=$10,investor_id=$11,brand_id=$12,location_id=$13,estimated_investment=$14,estimated_revenue=$15,owner_person=$16,start_date=$17,close_date=$18,risk_level=$19,pipeline_stage=$20,files=$21,updated_at=NOW()
     WHERE id=$22 RETURNING *`, [...projectRowFromBody(req.body), req.params.id]);
  if (updated.rowCount === 0) {
    return res.status(404).json({
      message: "Kayıt bulunamadı."
    });
  }
  const item = mapProject(updated.rows[0]);
  if ((before.rows[0]?.stage || "") !== item.stage && item.stage === "Sözleşme") {
    await pool.query(`INSERT INTO contracts(note,contract_type,status,counterparty,brand_id,investor_id)
       VALUES($1,'Otomatik', 'Taslak', $2, $3, $4)`, [`Proje sözleşme başlangıcı: ${item.name}`, item.name, item.brandId || null, item.investorId || null]);
  }
  await logActivity({
    userId: req.user.id,
    moduleName: "projects",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item
  });
  res.json(item);
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM projects WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM projects WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "projects",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name} silindi`,
      beforeData: row.rows[0]
    });
  }
  res.status(204).send();
});

// ─── CONTRACT KPI ────────────────────────────────────────────────────────────

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

// Global Permission Guards
router.use("/", authMiddleware, requirePermission("investors"));

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const sortMap = {
      name: "i.name",
      budget: "i.budget",
      city: "i.city",
      created_at: "i.created_at",
      follow_up_date: "i.follow_up_date",
      pipeline: "i.pipeline_stage",
      priority: "i.priority"
    };
    const sortCol = sortMap[q.sort] || "i.created_at";
    const order = String(q.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const conds = ["1=1"];
    const params = [];
    const add = (sql, val) => {
      params.push(val);
      conds.push(`${sql}$${params.length}`);
    };
    if (q.q) {
      params.push(`%${String(q.q)}%`);
      conds.push(`(i.name ILIKE $${params.length} OR i.email ILIKE $${params.length} OR i.phone ILIKE $${params.length} OR i.city ILIKE $${params.length})`);
    }
    if (q.name) add("i.name ILIKE ", `%${q.name}%`);
    if (q.phone) add("i.phone ILIKE ", `%${q.phone}%`);
    if (q.email) add("i.email ILIKE ", `%${q.email}%`);
    if (q.city) add("i.city ILIKE ", `%${q.city}%`);
    if (q.district) add("i.district ILIKE ", `%${q.district}%`);
    if (q.sector) add("i.sector ILIKE ", `%${q.sector}%`);
    if (q.currency) add("i.currency = ", q.currency);
    if (q.pipeline) add("i.pipeline_stage = ", q.pipeline);
    if (q.priority) add("i.priority = ", q.priority);
    if (q.investmentType) add("i.investment_type = ", q.investmentType);
    if (q.assignedMemberId) add("i.assigned_member_id = ", Number(q.assignedMemberId));
    if (q.budgetMin) add("COALESCE(i.budget_max, i.budget_min, i.budget) >= ", Number(q.budgetMin));
    if (q.budgetMax) add("COALESCE(i.budget_min, i.budget_max, i.budget) <= ", Number(q.budgetMax));
    if (q.followUpFrom) add("i.follow_up_date >= ", q.followUpFrom);
    if (q.followUpTo) add("i.follow_up_date <= ", q.followUpTo);
    if (q.createdFrom) add("i.created_at::date >= ", q.createdFrom);
    if (q.createdTo) add("i.created_at::date <= ", q.createdTo);
    const whereSql = conds.join(" AND ");
    const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM investors i WHERE ${whereSql}`, params);
    const total = countR.rows[0].c;
    const listParams = [...params, pageSize, offset];
    const result = await pool.query(`SELECT i.*, tm.name AS assigned_member_name
     FROM investors i
     LEFT JOIN team_members tm ON tm.id = i.assigned_member_id
     WHERE ${whereSql}
     ORDER BY ${sortCol} ${order}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, listParams);
    const rows = result.rows.map(row => {
      const m = mapInvestor(row);
      m.assignedMemberName = row.assigned_member_name || "";
      return m;
    });
    let kpis = {
      total: 0,
      newLeads: 0,
      activeCount: 0,
      hotCount: 0,
      closedThisMonth: 0,
      avgBudget: 0
    };
    try {
      kpis = await computeInvestorKpis();
    } catch (e) {
      console.error('computeInvestorKpis error:', e.message);
    }
    const reminders = await investorReminders().catch(() => ({
      followUpDue: [],
      staleHot: []
    }));
    res.json({
      items: rows,
      total,
      page,
      pageSize,
      kpis,
      reminders
    });
  } catch (err) {
    next(err);
  }
});

router.post("/bulk", authMiddleware, async (req, res) => {
  const {
    ids = [],
    assignedMemberId,
    pipeline
  } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      message: "Seçim gerekli."
    });
  }
  if (assignedMemberId === undefined && !pipeline) {
    return res.status(400).json({
      message: "Atanan danışman veya pipeline gerekli."
    });
  }
  let updated = 0;
  for (const id of ids) {
    const sets = [];
    const vals = [];
    if (assignedMemberId !== undefined) {
      vals.push(assignedMemberId === "" || assignedMemberId === null ? null : Number(assignedMemberId));
      sets.push(`assigned_member_id=$${vals.length}`);
    }
    if (pipeline) {
      vals.push(pipeline);
      sets.push(`pipeline_stage=$${vals.length}`);
    }
    if (!sets.length) continue;
    vals.push(id);
    await pool.query(`UPDATE investors SET ${sets.join(", ")}, last_activity_at=NOW(), updated_at=NOW() WHERE id=$${vals.length}`, vals);
    updated++;
  }
  res.json({
    updated
  });
});

router.get("/:id/detail", authMiddleware, async (req, res) => {
  const inv = await pool.query(`SELECT i.*, tm.name AS assigned_member_name FROM investors i
     LEFT JOIN team_members tm ON tm.id = i.assigned_member_id WHERE i.id=$1`, [req.params.id]);
  if (inv.rowCount === 0) return res.status(404).json({
    message: "Bulunamadı."
  });
  const investor = mapInvestor(inv.rows[0]);
  investor.assignedMemberName = inv.rows[0].assigned_member_name || "";
  const [meetings, matches, projects, tasks, contracts] = await Promise.all([pool.query(`SELECT m.*, u.name AS created_by_name FROM investor_meetings m
       LEFT JOIN users u ON u.id = m.created_by WHERE m.investor_id=$1 ORDER BY m.meeting_date DESC, m.id DESC`, [req.params.id]), pool.query(`SELECT ibm.*, b.name AS brand_name FROM investor_brand_matches ibm
       JOIN brands b ON b.id = ibm.brand_id WHERE ibm.investor_id=$1 ORDER BY ibm.score DESC NULLS LAST`, [req.params.id]), pool.query(`SELECT * FROM projects WHERE investor_id=$1 ORDER BY id DESC`, [req.params.id]), pool.query(`SELECT id,note,status,assignee_id,assignee_name,priority,due_date,investor_id FROM tasks WHERE investor_id=$1 ORDER BY id DESC`, [req.params.id]), pool.query(`SELECT * FROM contracts WHERE investor_id=$1 ORDER BY id DESC`, [req.params.id])]);
  res.json({
    investor,
    meetings: meetings.rows,
    brandMatches: matches.rows,
    projects: projects.rows.map(mapProject),
    tasks: tasks.rows.map(mapTask),
    contracts: contracts.rows.map(mapContract)
  });
});

router.post("/:id/meetings", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const inserted = await pool.query(`INSERT INTO investor_meetings(investor_id,meeting_type,meeting_date,met_by,met_by_member_id,notes,next_action,reminder_date,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [req.params.id, b.meetingType || b.meeting_type || "Telefon", b.meetingDate || b.meeting_date, b.metBy || b.met_by || req.user.name || "", b.metByMemberId || b.met_by_member_id || null, b.notes || null, b.nextAction || b.next_action || null, b.reminderDate || b.reminder_date || null, req.user.id]);
  await pool.query(`UPDATE investors SET last_meeting_date=$1, next_action=$2, last_activity_at=NOW(), updated_at=NOW() WHERE id=$3`, [b.meetingDate || b.meeting_date, b.nextAction || b.next_action || null, req.params.id]);
  res.status(201).json(inserted.rows[0]);
});

router.post("/:id/match-brands", authMiddleware, async (req, res) => {
  const {
    matches = []
  } = req.body || {};
  if (!Array.isArray(matches) || matches.length === 0) {
    return res.status(400).json({
      message: "Eşleşme listesi boş."
    });
  }
  for (const m of matches) {
    await pool.query(`INSERT INTO investor_brand_matches(investor_id,brand_id,score,notes,created_by)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(investor_id, brand_id) DO UPDATE SET score=EXCLUDED.score, notes=EXCLUDED.notes`, [req.params.id, m.brandId || m.brand_id, Number(m.score || 0), m.notes || null, req.user.id]);
  }
  await pool.query(`UPDATE investors SET pipeline_stage=CASE WHEN pipeline_stage IN ('Yeni Lead','İlk Temas') THEN 'Marka Eşleşmesi' ELSE pipeline_stage END,
     last_activity_at=NOW(), updated_at=NOW() WHERE id=$1`, [req.params.id]);
  await logActivity({
    userId: req.user.id,
    moduleName: "investors",
    actionType: "update",
    recordId: Number(req.params.id),
    summary: "Marka eşleştirmesi kaydedildi",
    afterData: {
      matches
    }
  });
  res.json({
    saved: matches.length
  });
});

router.post("/", authMiddleware, async (req, res) => {
  const r = investorRowFromBody(req.body);
  const inserted = await pool.query(`INSERT INTO investors(
      name,budget,budget_min,budget_max,currency,city,sector,investment_type,pipeline_stage,
      phone,email,district,goal,contact_history,meeting_notes,follow_up_date,documents,created_by,
      investor_type,contact_person,whatsapp_phone,target_cities,target_location_type,sub_sector,
      investment_timing,financing_status,priority,lead_source,assigned_member_id,last_meeting_date,next_action,notes,last_activity_at
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,NOW()
    ) RETURNING *`, [r.name, r.budget, r.budgetMin, r.budgetMax, r.currency, r.city, r.sector, r.investment_type, r.pipeline_stage, r.phone, r.email, r.district, r.goal, r.contact_history, r.meeting_notes, r.follow_up_date, r.documents, req.user.id, r.investor_type, r.contact_person, r.whatsapp_phone, r.target_cities, r.target_location_type, r.sub_sector, r.investment_timing, r.financing_status, r.priority, r.lead_source, r.assigned_member_id, r.last_meeting_date, r.next_action, r.notes]);
  const investor = mapInvestor(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "investors",
    actionType: "create",
    recordId: investor.id,
    summary: `${investor.name} eklendi`,
    afterData: investor
  });
  await triggerAutomation("Yeni Lead", {
    summary: `${investor.name} lead olarak eklendi`,
    investor
  });
  await pool.query(`INSERT INTO tasks(note,status,priority,due_date,investor_id) VALUES($1,'Açık','Orta', CURRENT_DATE + INTERVAL '1 day', $2)`, [`İlk temas kur: ${investor.name}`, investor.id]);
  res.status(201).json(investor);
});

router.put("/:id", authMiddleware, async (req, res) => {
  const r = investorRowFromBody(req.body);
  const before = await pool.query("SELECT * FROM investors WHERE id=$1", [req.params.id]);
  const updated = await pool.query(`UPDATE investors SET
      name=$1,budget=$2,budget_min=$3,budget_max=$4,currency=$5,city=$6,sector=$7,investment_type=$8,pipeline_stage=$9,
      phone=$10,email=$11,district=$12,goal=$13,contact_history=$14,meeting_notes=$15,follow_up_date=$16,documents=$17,
      investor_type=$18,contact_person=$19,whatsapp_phone=$20,target_cities=$21,target_location_type=$22,sub_sector=$23,
      investment_timing=$24,financing_status=$25,priority=$26,lead_source=$27,assigned_member_id=$28,last_meeting_date=$29,next_action=$30,notes=$31,
      last_activity_at=NOW(),updated_at=NOW()
     WHERE id=$32 RETURNING *`, [r.name, r.budget, r.budgetMin, r.budgetMax, r.currency, r.city, r.sector, r.investment_type, r.pipeline_stage, r.phone, r.email, r.district, r.goal, r.contact_history, r.meeting_notes, r.follow_up_date, r.documents, r.investor_type, r.contact_person, r.whatsapp_phone, r.target_cities, r.target_location_type, r.sub_sector, r.investment_timing, r.financing_status, r.priority, r.lead_source, r.assigned_member_id, r.last_meeting_date, r.next_action, r.notes, req.params.id]);
  if (updated.rowCount === 0) {
    return res.status(404).json({
      message: "Kayıt bulunamadı."
    });
  }
  const item = mapInvestor(updated.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "investors",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item
  });
  return res.json(item);
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM investors WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM investors WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "investors",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name} silindi`,
      beforeData: row.rows[0]
    });
  }
  res.status(204).send();
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
    const inserted = await pool.query(`INSERT INTO investors(name,budget,city,sector,investment_type,pipeline_stage,phone,email,district,goal,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [row.Ad || row.Name || row.name || "İsimsiz", Number(row.Bütçe || row.Budget || 0), row.Şehir || row.City || "Belirtilmemiş", row.Sektör || row.Sector || "Genel", row.Tip || row.Type || "Franchise", row.Pipeline || "Yeni Lead", row.Telefon || row.Phone || "", row.Email || "", row.İlçe || row.District || "", row.Hedef || row.Goal || "", req.user.id]);
    imported.push(inserted.rows[0]);
  }
  res.json({
    message: `${imported.length} yatırımcı başarıyla aktarıldı.`,
    imported
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("tasks"));

router.get("/kpis", authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    let cond = "WHERE deleted_at IS NULL";
    const params = [];
    if (req.user.role !== "admin" && req.user.role !== "manager") {
      const member = await pool.query("SELECT id FROM team_members WHERE user_id=$1 LIMIT 1", [req.user.id]);
      if (member.rowCount > 0) {
        cond += " AND assignee_id = $1";
        params.push(member.rows[0].id);
      }
    }
    const runCount = async (whereExtra = "", extraParams = []) => {
      const sql = `SELECT COUNT(*)::int AS c FROM tasks ${cond} ${whereExtra}`;
      // Combined params: params (contains assignee_id if regular user) + extraParams (contains dates if any)
      const r = await pool.query(sql, [...params, ...extraParams]);
      return r.rows[0].c;
    };
    const pIdx = params.length; // 0 or 1
    const [total, open, inProgress, done, overdue, thisWeek, critical] = await Promise.all([runCount(), runCount("AND status='Açık'"), runCount("AND status='Devam Ediyor'"), runCount("AND status='Tamamlandı'"), runCount(`AND status != 'Tamamlandı' AND due_date < $${pIdx + 1}`, [today]), runCount(`AND status != 'Tamamlandı' AND due_date BETWEEN $${pIdx + 1} AND $${pIdx + 2}`, [today, weekEnd]), runCount("AND priority IN ('Yüksek','Çok Yüksek') AND status != 'Tamamlandı'")]);
    res.json({
      total,
      open,
      inProgress,
      done,
      overdue,
      thisWeek,
      critical
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 50));
    const offset = (page - 1) * pageSize;
    const conds = ["t.deleted_at IS NULL"];
    const params = [];
    const add = (sql, val) => {
      params.push(val);
      conds.push(`${sql}$${params.length}`);
    };
    if (req.user.role !== "admin" && req.user.role !== "manager") {
      const member = await pool.query("SELECT id FROM team_members WHERE user_id=$1 LIMIT 1", [req.user.id]);
      if (member.rowCount > 0) {
        add("t.assignee_id = ", member.rows[0].id);
      }
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      conds.push(`(t.title ILIKE $${params.length} OR t.note ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }
    if (q.status) add("t.status = ", q.status);
    if (q.priority) add("t.priority = ", q.priority);
    if (q.moduleType) add("t.module_type = ", q.moduleType);
    if (q.assigneeName) add("t.assignee_name ILIKE ", `%${q.assigneeName}%`);
    if (q.dateFrom) add("t.due_date >= ", q.dateFrom);
    if (q.dateTo) add("t.due_date <= ", q.dateTo);
    if (q.overdue === "true") {
      const today = new Date().toISOString().split("T")[0];
      add("t.due_date < ", today);
      conds.push("t.status != 'Tamamlandı'");
    }
    if (q.investorId) add("t.investor_id = ", Number(q.investorId));
    if (q.projectId) add("t.project_id = ", Number(q.projectId));
    const where = conds.join(" AND ");
    const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM tasks t WHERE ${where}`, params);
    const listParams = [...params, pageSize, offset];
    const sortCol = {
      due_date: "t.due_date",
      priority: "t.priority",
      status: "t.status",
      created_at: "t.created_at"
    }[q.sort] || "t.created_at";
    const order = q.order === "asc" ? "ASC" : "DESC";
    const result = await pool.query(`${TASK_BASE_SELECT} WHERE ${where} ORDER BY ${sortCol} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, listParams);
    res.json({
      items: result.rows.map(mapTask),
      total: countR.rows[0].c,
      page,
      pageSize
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      title,
      note,
      description = "",
      status = "Açık",
      assigneeId = null,
      assigneeName = null,
      priority = "Orta",
      dueDate = null,
      investorId = null,
      brandId = null,
      projectId = null,
      locationId = null,
      contractId = null,
      moduleType = "Genel",
      tags = []
    } = req.body || {};
    const taskTitle = title || note || "";
    const inserted = await pool.query(`INSERT INTO tasks(title,note,description,status,assignee_id,assignee_name,priority,due_date,investor_id,brand_id,project_id,location_id,contract_id,module_type,tags)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [taskTitle, taskTitle, description, status, assigneeId, assigneeName, priority, dueDate || null, investorId || null, brandId || null, projectId || null, locationId || null, contractId || null, moduleType, tags]);
    const item = mapTask(inserted.rows[0]);
    await logActivity({
      userId: req.user.id,
      moduleName: "tasks",
      actionType: "create",
      recordId: item.id,
      summary: `Görev oluşturuldu: ${taskTitle}`,
      afterData: item
    });
    if (assigneeId) {
      const member = await pool.query("SELECT email,name FROM team_members WHERE id=$1", [assigneeId]);
      if (member.rowCount > 0 && member.rows[0].email) {
        try {
          await sendMailToRecipient(member.rows[0].email, `Yeni Görev: ${taskTitle}`, `Size yeni bir görev atandı.\nGörev: ${taskTitle}\nÖncelik: ${priority}\nSon Tarih: ${dueDate || "-"}`);
        } catch (_) {}
      }
    }
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const {
      title,
      note,
      description,
      status,
      assigneeId = null,
      assigneeName = null,
      priority = "Orta",
      dueDate = null,
      investorId = null,
      brandId = null,
      projectId = null,
      locationId = null,
      contractId = null,
      moduleType,
      tags
    } = req.body || {};
    const taskTitle = title || note || "";
    const completedAt = status === "Tamamlandı" ? "NOW()" : "NULL";
    const updated = await pool.query(`UPDATE tasks SET title=$1,note=$1,description=$2,status=$3,assignee_id=$4,assignee_name=$5,priority=$6,due_date=$7,
       investor_id=$8,brand_id=$9,project_id=$10,location_id=$11,contract_id=$12,module_type=$13,tags=$14,
       updated_at=NOW(),completed_at=${completedAt === "NOW()" ? "NOW()" : "NULL"}
       WHERE id=$15 RETURNING *`, [taskTitle, description || null, status, assigneeId, assigneeName, priority, dueDate || null, investorId || null, brandId || null, projectId || null, locationId || null, contractId || null, moduleType || "Genel", tags || [], req.params.id]);
    if (updated.rowCount === 0) return res.status(404).json({
      message: "Kayıt bulunamadı."
    });
    const item = mapTask(updated.rows[0]);
    await logActivity({
      userId: req.user.id,
      moduleName: "tasks",
      actionType: "update",
      recordId: item.id,
      summary: `Görev güncellendi: ${taskTitle}`,
      afterData: item
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "manager") {
      return res.status(403).json({
        message: "Yetkisiz."
      });
    }
    const row = await pool.query("SELECT id,title,note FROM tasks WHERE id=$1", [req.params.id]);
    await pool.query("UPDATE tasks SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
    if (row.rowCount > 0) {
      await logActivity({
        userId: req.user.id,
        moduleName: "tasks",
        actionType: "delete",
        recordId: Number(req.params.id),
        summary: `Görev silindi: ${row.rows[0].title || row.rows[0].note}`,
        beforeData: row.rows[0]
      });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;

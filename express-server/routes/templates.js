const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("templates"));

router.get("/", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM message_templates ORDER BY id DESC");
  res.json(rows.rows);
});

router.post("/", authMiddleware, async (req, res) => {
  const {
    channel,
    eventName,
    title,
    body,
    active,
    imageUrl = null
  } = req.body || {};
  const inserted = await pool.query(`INSERT INTO message_templates(channel,event_name,title,body,active,image_url)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [channel, eventName, title, body, active, imageUrl]);
  await logActivity({
    userId: req.user.id,
    moduleName: "templates",
    actionType: "create",
    recordId: inserted.rows[0].id,
    summary: `${channel} şablonu eklendi`,
    afterData: inserted.rows[0]
  });
  res.status(201).json(inserted.rows[0]);
});

router.put("/:id", authMiddleware, async (req, res) => {
  const {
    channel,
    eventName,
    title,
    body,
    active,
    imageUrl = null
  } = req.body || {};
  const before = await pool.query("SELECT * FROM message_templates WHERE id=$1", [req.params.id]);
  const updated = await pool.query(`UPDATE message_templates
     SET channel=$1,event_name=$2,title=$3,body=$4,active=$5,image_url=$6,updated_at=NOW()
     WHERE id=$7 RETURNING *`, [channel, eventName, title, body, active, imageUrl, req.params.id]);
  if (updated.rowCount === 0) {
    return res.status(404).json({
      message: "Şablon bulunamadı."
    });
  }
  await logActivity({
    userId: req.user.id,
    moduleName: "templates",
    actionType: "update",
    recordId: Number(req.params.id),
    summary: "Şablon güncellendi",
    beforeData: before.rows[0] || null,
    afterData: updated.rows[0]
  });
  res.json(updated.rows[0]);
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const before = await pool.query("SELECT * FROM message_templates WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM message_templates WHERE id=$1", [req.params.id]);
  if (before.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "templates",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: "Şablon silindi",
      beforeData: before.rows[0]
    });
  }
  res.status(204).send();
});

router.post("/:id/test", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM message_templates WHERE id=$1", [req.params.id]);
  if (row.rowCount === 0) {
    return res.status(404).json({
      message: "Şablon bulunamadı."
    });
  }
  const template = row.rows[0];
  const payload = {
    summary: "Bu bir test mesajıdır",
    user: req.user.name
  };
  const title = fillTemplate(template.title, payload);
  const body = fillTemplate(template.body, payload);
  if (template.channel === "mail") {
    await sendMailNotification(title, body);
  } else if (template.channel === "whatsapp") {
    await sendWhatsAppNotification(body);
  }
  res.json({
    success: true
  });
});

module.exports = router;

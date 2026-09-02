const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  const rows = await pool.query("SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key ASC");
  const payload = {};
  for (const row of rows.rows) payload[row.setting_key] = row.setting_value;
  res.json(payload);
});

router.put("/", authMiddleware, requireAdmin, async (req, res) => {
  const settings = req.body || {};
  const keys = Object.keys(settings);
  for (const key of keys) {
    await pool.query(`INSERT INTO app_settings(setting_key,setting_value,updated_by,updated_at)
       VALUES($1,$2::jsonb,$3,NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value=EXCLUDED.setting_value, updated_by=EXCLUDED.updated_by, updated_at=NOW()`, [key, JSON.stringify(settings[key] || {}), req.user.id]);
  }
  res.json({
    success: true
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("timeline"));

router.get("/", authMiddleware, async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit || 50));
  const rows = await pool.query(`SELECT a.id, a.module_name, a.action_type, a.record_id, a.summary, a.created_at, u.name AS user_name
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT $1`, [limit]);
  res.json(rows.rows);
});

module.exports = router;

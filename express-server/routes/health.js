const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.get("/", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({
      status: "ok",
      db: "connected"
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      db: "disconnected",
      message: error.message
    });
  }
});

// ─── Müşteri Kar/Zarar Modülü ───────────────────────────────────────────────

module.exports = router;

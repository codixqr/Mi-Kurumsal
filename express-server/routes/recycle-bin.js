const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.get("/", authMiddleware, async (req, res) => {
  res.json([]);
});

// =====================================================
// PnL - Gelirler (Revenues) CRUD
// =====================================================

module.exports = router;

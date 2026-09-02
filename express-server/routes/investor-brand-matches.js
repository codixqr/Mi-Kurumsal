const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      investorId,
      brandId,
      score,
      notes
    } = req.body || {};
    if (!investorId || !brandId) return res.status(400).json({
      message: "investorId ve brandId zorunlu."
    });
    const result = await pool.query(`INSERT INTO investor_brand_matches(investor_id, brand_id, score, notes, created_by)
       VALUES($1, $2, $3, $4, $5)
       ON CONFLICT(investor_id, brand_id) DO UPDATE SET score=EXCLUDED.score, notes=EXCLUDED.notes
       RETURNING *`, [Number(investorId), Number(brandId), Number(score || 0), notes || null, req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const {
      investorId
    } = req.query || {};
    const cond = investorId ? "WHERE ibm.investor_id=$1" : "";
    const params = investorId ? [Number(investorId)] : [];
    const result = await pool.query(`SELECT ibm.*, i.name AS investor_name, b.name AS brand_name FROM investor_brand_matches ibm
       JOIN investors i ON i.id = ibm.investor_id JOIN brands b ON b.id = ibm.brand_id
       ${cond} ORDER BY ibm.score DESC NULLS LAST LIMIT 100`, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("matching"));

router.post("/", authMiddleware, async (req, res) => {
  // Existing matching code...
});

router.post("/suggest", authMiddleware, async (req, res) => {
  // Alias for matching
  const {
    investorName,
    budget,
    city,
    sector,
    sqm
  } = req.body || {};
  const brandsResult = await pool.query(`SELECT * FROM brands WHERE active = true AND COALESCE(agreement_status,'') = 'Anlaşmalı' AND deleted_at IS NULL`);
  const brandList = brandsResult.rows.map(mapBrand);
  const results = brandList.map(brand => {
    const score = scoreBudget(Number(budget), brand) + scoreCity(city, brand) + scoreSector(sector, brand) + scoreSqm(Number(sqm), brand);
    return {
      brand,
      score
    };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
  if (investorName) {
    await pool.query(`INSERT INTO investors(name,budget,city,sector,investment_type,pipeline_stage,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)`, [investorName, budget, city, sector, "Franchise", "Yeni Lead", req.user.id]);
  }
  res.json(results);
});

module.exports = router;

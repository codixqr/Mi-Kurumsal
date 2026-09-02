const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.get("/", authMiddleware, async (req, res) => {
  const investors = await pool.query("SELECT COUNT(*)::int AS count FROM investors");
  const projects = await pool.query("SELECT COUNT(*)::int AS count FROM projects");
  const contracts = await pool.query("SELECT COUNT(*)::int AS count FROM contracts");
  const strong = await pool.query("SELECT COUNT(*)::int AS count FROM brands WHERE monthly_growth >= 10");
  res.json({
    activeInvestors: investors.rows[0].count,
    activeProjects: projects.rows[0].count,
    expectedRevenue: contracts.rows[0].count * 275000,
    strongMatches: strong.rows[0].count
  });
});

router.get("/stats", authMiddleware, async (req, res, next) => {
  try {
    const runQuery = async sql => {
      try {
        const qr = await pool.query(sql);
        return qr.rows[0]?.value || 0;
      } catch (e) {
        console.error("Dashboard stats query failed:", sql, e.message);
        return 0;
      }
    };
    const [leadCount, winCount, projectCount, financeCount, taskCount, brandCount, locCount, finRevCount] = await Promise.all([runQuery(`SELECT COUNT(*)::int AS value FROM investors WHERE deleted_at IS NULL`), runQuery(`SELECT COUNT(*)::int AS value FROM investors WHERE deleted_at IS NULL AND pipeline_stage ILIKE '%Kapandı%'`), runQuery(`SELECT COUNT(*)::int AS value FROM projects WHERE deleted_at IS NULL`), runQuery(`SELECT COUNT(*)::int AS value FROM contracts WHERE deleted_at IS NULL AND status='Aktif'`), runQuery(`SELECT COUNT(*)::int AS value FROM tasks WHERE deleted_at IS NULL AND status != 'Tamamlandı'`), runQuery(`SELECT COUNT(*)::int AS value FROM brands WHERE deleted_at IS NULL`), runQuery(`SELECT COUNT(*)::int AS value FROM locations WHERE deleted_at IS NULL`), runQuery(`SELECT COALESCE(SUM(amount::numeric),0)::numeric AS value FROM finance_records WHERE status='Tahsil Edildi'`)]);
    const invRem = await investorReminders().catch(() => ({
      followUpDue: [],
      staleHot: []
    }));
    res.json({
      activeInvestors: leadCount,
      activeProjects: projectCount,
      openTasks: taskCount,
      strongMatches: winCount,
      financeCount: financeCount,
      totalBrands: brandCount,
      totalLocations: locCount,
      totalRevenue: Number(finRevCount || 0),
      investorFollowUps: invRem.followUpDue,
      investorStaleHot: invRem.staleHot
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

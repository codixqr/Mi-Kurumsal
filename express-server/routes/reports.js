const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("reports"));

router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const {
      from,
      to
    } = req.query;
    const dateFrom = from ? from : "1970-01-01";
    const dateTo = to ? to : new Date().toISOString().split("T")[0];
    const [leads, wins, projects, contracts, tasks, topSectorR, brands, locations, financeR] = await Promise.all([pool.query(`SELECT COUNT(*)::int AS c FROM investors WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`, [dateFrom, dateTo]), pool.query(`SELECT COUNT(*)::int AS c FROM investors WHERE deleted_at IS NULL AND pipeline_stage ILIKE '%Kapandı%' AND created_at BETWEEN $1 AND $2`, [dateFrom, dateTo]), pool.query(`SELECT COUNT(*)::int AS c FROM projects WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`, [dateFrom, dateTo]), pool.query(`SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`, [dateFrom, dateTo]), pool.query(`SELECT COUNT(*)::int AS c FROM tasks WHERE deleted_at IS NULL AND status != 'Tamamlandı'`), pool.query(`SELECT sector, COUNT(*)::int AS c FROM investors WHERE deleted_at IS NULL GROUP BY sector ORDER BY c DESC LIMIT 1`), pool.query(`SELECT COUNT(*)::int AS c FROM brands WHERE deleted_at IS NULL`), pool.query(`SELECT COUNT(*)::int AS c FROM locations WHERE deleted_at IS NULL`), pool.query(`SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE created_at BETWEEN $1 AND $2`, [dateFrom, dateTo])]);
    const totalLeads = leads.rows[0].c;
    const totalWins = wins.rows[0].c;
    const convRate = totalLeads > 0 ? Math.round(totalWins / totalLeads * 100) : 0;
    res.json({
      leads: totalLeads,
      wins: totalWins,
      conversionRate: convRate,
      activeProjects: projects.rows[0].c,
      activeContracts: contracts.rows[0].c,
      openTasks: tasks.rows[0].c,
      topSector: topSectorR.rows[0]?.sector || '-',
      totalBrands: brands.rows[0].c,
      totalLocations: locations.rows[0].c,
      totalRevenue: Number(financeR.rows[0].s || 0)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.get("/:module", authMiddleware, async (req, res) => {
  const moduleName = req.params.module;
  const config = {
    investors: `SELECT id,name,city,sector,budget_min,budget_max,currency,investment_type,pipeline_stage,priority,phone,email,created_at FROM investors ORDER BY id DESC`,
    brands: "SELECT id,name,sector,min_budget,max_budget,target_locations,agreement_status,created_at FROM brands ORDER BY id DESC",
    locations: "SELECT id,name,location_type,sqm,rent,potential,created_at FROM locations ORDER BY id DESC",
    projects: "SELECT id,name,project_type,owner_team,stage,due_date,created_at FROM projects ORDER BY id DESC",
    contracts: "SELECT id,note,contract_type,status,counterparty,amount,currency,created_at FROM contracts ORDER BY id DESC",
    tasks: "SELECT id,note,status,created_at FROM tasks ORDER BY id DESC",
    pnl: "SELECT id,month_name,year_value,revenue,expense,profit,note,created_at FROM pnl_reports ORDER BY id DESC"
  };
  const sql = config[moduleName];
  if (!sql) {
    return res.status(404).json({
      message: "Geçersiz PDF export modülü."
    });
  }
  const rows = (await pool.query(sql)).rows;
  const doc = new PDFDocument({
    margin: 36,
    size: "A4"
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=mi-crm-${moduleName}.pdf`);
  doc.pipe(res);

  // Dynamic font registration
  try {
    const fontReg = await getRobotoRegular();
    const fontBold = await getRobotoBold();
    if (fontReg) doc.registerFont("Roboto", fontReg);
    if (fontBold) doc.registerFont("Roboto-Bold", fontBold);
  } catch (err) {
    console.error("PDF font loading failed, using default Helvetica:", err.message);
  }
  const hasRoboto = doc.font("Roboto-Bold").name === "Roboto-Bold";
  if (!hasRoboto) {
    doc.font("Helvetica-Bold");
  }
  doc.fontSize(14).text(`Mi Core CRM - ${moduleName.toUpperCase()} Raporu`, {
    underline: true
  });
  doc.moveDown(0.6);
  if (hasRoboto) {
    doc.font("Roboto");
  } else {
    doc.font("Helvetica");
  }
  if (!rows.length) {
    doc.fontSize(11).text("Bu modül için kayıt bulunamadı.");
  } else {
    for (const row of rows) {
      const line = Object.entries(row).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v ?? "-")}`).join(" | ");
      doc.fontSize(9).text(line, {
        width: 520
      });
      doc.moveDown(0.25);
    }
  }
  doc.end();
});

module.exports = router;

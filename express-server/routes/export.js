const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const xlsx = require('xlsx');
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.get("/:module", authMiddleware, async (req, res) => {
  const moduleName = req.params.module;
  const config = {
    investors: {
      sql: `SELECT id,name,investor_type,contact_person,phone,whatsapp_phone,email,city,district,target_cities,target_location_type,
            sector,sub_sector,budget_min,budget_max,currency,investment_type,investment_timing,financing_status,priority,pipeline_stage,lead_source,
            assigned_member_id,follow_up_date,last_meeting_date,next_action,notes,created_at
            FROM investors ORDER BY id DESC`,
      file: "yatirimcilar.xlsx",
      sheet: "Yatirimcilar"
    },
    brands: {
      sql: `SELECT id,name,sector,sub_sector,min_budget,max_budget,currency,min_sqm,max_sqm,target_locations,target_regions,location_type,
            active,agreement_status,brand_type,gives_franchise,has_royalty,franchise_fee,royalty_rate,ad_contribution_pct,
            contact_person,contact_phone,email,website,created_at
            FROM brands ORDER BY id DESC`,
      file: "markalar.xlsx",
      sheet: "Markalar"
    },
    locations: {
      sql: `SELECT id,name,city,district,region,location_type,segment,sqm,rent,currency,potential,status,
            footfall_score,street_class,avm_segment,recommended_brands,created_at
            FROM locations ORDER BY id DESC`,
      file: "lokasyonlar.xlsx",
      sheet: "Lokasyonlar"
    },
    projects: {
      sql: `SELECT id,name,project_type,owner_team,owner_person,stage,pipeline_stage,priority,progress,start_date,due_date,close_date,
            investor_id,brand_id,location_id,estimated_investment,estimated_revenue,created_at
            FROM projects ORDER BY id DESC`,
      file: "projeler.xlsx",
      sheet: "Projeler"
    },
    contracts: {
      sql: "SELECT id,note,created_at FROM contracts ORDER BY id DESC",
      file: "sozlesmeler.xlsx",
      sheet: "Sozlesmeler"
    },
    tasks: {
      sql: "SELECT id,note,status,created_at FROM tasks ORDER BY id DESC",
      file: "gorevler.xlsx",
      sheet: "Gorevler"
    },
    pnl: {
      sql: "SELECT id,month_name,year_value,revenue,expense,profit,note,source_file,created_at FROM pnl_reports ORDER BY id DESC",
      file: "kar-zarar.xlsx",
      sheet: "KarZarar"
    },
    all: null
  };
  if (moduleName === "all") {
    const workbook = xlsx.utils.book_new();
    for (const [key, value] of Object.entries(config)) {
      if (!value || key === "all") {
        continue;
      }
      const rows = await pool.query(value.sql);
      const sheet = xlsx.utils.json_to_sheet(rows.rows);
      xlsx.utils.book_append_sheet(workbook, sheet, value.sheet);
    }
    const buffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx"
    });
    res.setHeader("Content-Disposition", "attachment; filename=mikurumsal-crm-all.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  }
  const exportConfig = config[moduleName];
  if (!exportConfig) {
    return res.status(404).json({
      message: "Geçersiz export modülü."
    });
  }
  const rows = await pool.query(exportConfig.sql);
  const worksheet = xlsx.utils.json_to_sheet(rows.rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, exportConfig.sheet);
  const fileBuffer = xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  });
  res.setHeader("Content-Disposition", `attachment; filename=${exportConfig.file}`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return res.send(fileBuffer);
});

module.exports = router;

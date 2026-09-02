const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const { upload, uploadLocal } = require('../middlewares/upload');
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "Dosya yüklenemedi."
    });
  }
  const moduleName = String(req.body.moduleName || "general");
  const storedName = req.file.key || req.file.filename;
  const fileUrl = isR2Enabled && req.file.key ? `${process.env.R2_PUBLIC_URL || ""}/${req.file.key}` : `/uploads/${req.file.filename}`;
  const inserted = await pool.query(`INSERT INTO uploaded_files(module_name,original_name,stored_name,file_url,mime_type,size_bytes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`, [moduleName, req.file.originalname, storedName, fileUrl, req.file.mimetype, req.file.size, req.user.id]);
  res.status(201).json(inserted.rows[0]);
});

router.get("/:module", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM uploaded_files WHERE module_name=$1 ORDER BY created_at DESC LIMIT 50", [req.params.module]);
  res.json(rows.rows);
});

// 12. Database Health Check API

module.exports = router;

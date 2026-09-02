const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const bcrypt = require('bcryptjs');
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  const rows = await pool.query("SELECT * FROM team_members ORDER BY id DESC");
  res.json(rows.rows.map(mapTeamMember));
});

router.get("/options", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT id,name,role_name FROM team_members WHERE active=true ORDER BY name ASC");
  res.json(rows.rows.map(x => ({
    id: x.id,
    name: x.name,
    roleName: x.role_name
  })));
});

router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  const {
    name,
    email,
    password,
    phone = null,
    department = null,
    roleName = "Temsilci",
    permissions = [],
    active = true
  } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({
      message: "İsim, e-posta ve parola zorunludur."
    });
  }
  const userExists = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
  if (userExists.rowCount > 0) {
    return res.status(409).json({
      message: "Bu e-posta için kullanıcı zaten mevcut."
    });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const userRole = roleName === "Yönetici" ? "admin" : "agent";
  const insertedUser = await pool.query(`INSERT INTO users(name,email,password_hash,role)
     VALUES($1,$2,$3,$4) RETURNING id`, [name, email, passwordHash, userRole]);
  const inserted = await pool.query(`INSERT INTO team_members(user_id,name,email,phone,department,role_name,permissions,active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [insertedUser.rows[0].id, name, email, phone, department, roleName, permissions, active]);
  res.status(201).json(mapTeamMember(inserted.rows[0]));
});

router.put("/:id", authMiddleware, requireAdmin, async (req, res) => {
  const {
    name,
    email = null,
    phone = null,
    department = null,
    roleName = "Temsilci",
    permissions = [],
    active = true
  } = req.body || {};
  const updated = await pool.query(`UPDATE team_members
     SET name=$1,email=$2,phone=$3,department=$4,role_name=$5,permissions=$6,active=$7,updated_at=NOW()
     WHERE id=$8 RETURNING *`, [name, email, phone, department, roleName, permissions, active, req.params.id]);
  if (updated.rowCount === 0) {
    return res.status(404).json({
      message: "Ekip üyesi bulunamadı."
    });
  }
  res.json(mapTeamMember(updated.rows[0]));
});

router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM team_members WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requireSuperAdmin, requirePermission } = require('../middlewares/auth');
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
  if (updated.rowCount > 0 && updated.rows[0].user_id) {
    const uRole = roleName === "Yönetici" ? "admin" : "agent";
    await pool.query("UPDATE users SET name = $1, email = COALESCE($2, email), role = $3 WHERE id = $4", [name, email, uRole, updated.rows[0].user_id]);
  }
  if (updated.rowCount === 0) {
    return res.status(404).json({
      message: "Ekip üyesi bulunamadı."
    });
  }
  res.json(mapTeamMember(updated.rows[0]));
});

router.delete("/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
  await pool.query("DELETE FROM team_members WHERE id=$1", [req.params.id]);
  res.status(204).send();
});


// Admin reset password for team member
router.post("/:id/reset-password", authMiddleware, requireSuperAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "Yeni şifre en az 6 karakter olmalıdır." });
  }
  const tmRes = await pool.query("SELECT id, user_id, email, name FROM team_members WHERE id = $1", [req.params.id]);
  if (tmRes.rowCount === 0) {
    return res.status(404).json({ message: "Ekip üyesi bulunamadı." });
  }
  const tm = tmRes.rows[0];
  const newHash = await bcrypt.hash(newPassword, 10);

  let userId = tm.user_id;
  if (!userId && tm.email) {
    const uRes = await pool.query("SELECT id FROM users WHERE email = $1", [tm.email]);
    if (uRes.rowCount > 0) userId = uRes.rows[0].id;
  }

  if (userId) {
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, userId]);
  } else if (tm.email) {
    // If no user record exists, create one
    const insUser = await pool.query("INSERT INTO users(name, email, password_hash, role) VALUES($1, $2, $3, $4) RETURNING id", [tm.name, tm.email, newHash, 'agent']);
    userId = insUser.rows[0].id;
    await pool.query("UPDATE team_members SET user_id = $1 WHERE id = $2", [userId, tm.id]);
  } else {
    return res.status(400).json({ message: "Bu ekip üyesinin e-postası bulunmadığı için kullanıcı hesabı oluşturulamadı." });
  }

  return res.json({ message: "Şifre başarıyla güncellendi." });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.post("/register", async (req, res) => {
  const {
    name,
    email,
    password,
    role = "agent"
  } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({
      message: "Ad, e-posta ve şifre zorunludur."
    });
  }
  const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (exists.rowCount > 0) {
    return res.status(409).json({
      message: "Bu e-posta zaten kayıtlı."
    });
  }
  const hash = await bcrypt.hash(password, 10);
  const inserted = await pool.query(`INSERT INTO users(name, email, password_hash, role)
     VALUES($1,$2,$3,$4) RETURNING id,name,email,role`, [name, email, hash, role]);
  const token = signToken(inserted.rows[0]);
  return res.status(201).json({
    token,
    user: inserted.rows[0]
  });
});

router.post("/login", async (req, res) => {
  const {
    email,
    password
  } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({
      message: "E-posta ve şifre zorunludur."
    });
  }
  const result = await pool.query("SELECT id,name,email,role,password_hash FROM users WHERE email = $1", [email]);
  if (result.rowCount === 0) {
    return res.status(401).json({
      message: "Kullanıcı bulunamadı."
    });
  }
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({
      message: "Şifre hatalı."
    });
  }
  let permissions = [];
  if (user.role === "admin") {
    permissions = ["investors", "brands", "locations", "projects", "contracts", "tasks", "reports", "templates", "matching", "pnl", "timeline"];
  } else {
    try {
      const tmRes = await pool.query("SELECT permissions FROM team_members WHERE user_id = $1", [user.id]);
      permissions = tmRes.rows[0]?.permissions || [];
    } catch (err) {
      console.error("Failed to fetch team member permissions:", err.message);
    }
  }
  const token = signToken(user, permissions);
  await logActivity({
    userId: user.id,
    moduleName: "auth",
    actionType: "login",
    summary: `${user.email} giriş yaptı`
  });
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions
    }
  });
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT id,name,email,role FROM users WHERE id = $1", [req.user.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Kullanıcı bulunamadı."
      });
    }
    const user = result.rows[0];
    if (user.role === "admin") {
      user.permissions = ["investors", "brands", "locations", "projects", "contracts", "tasks", "reports", "templates", "matching", "pnl", "timeline"];
    } else {
      try {
        const tmRes = await pool.query("SELECT permissions FROM team_members WHERE user_id = $1", [user.id]);
        user.permissions = tmRes.rows[0]?.permissions || [];
      } catch (err) {
        console.error("Failed to fetch team member permissions for me:", err.message);
        user.permissions = [];
      }
    }
    return res.json(user);
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;

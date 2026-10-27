const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Yetkisiz erişim." });
  }
  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Geçersiz oturum." });
  }
}

function isSuperAdminUser(user) {
  if (!user) return false;
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@mikurumsal.com").toLowerCase();
  return user.role === "superadmin" || (user.email && user.email.toLowerCase() === adminEmail);
}

function requireAdmin(req, res, next) {
  if (!req.user || (req.user.role !== "admin" && !isSuperAdminUser(req.user))) {
    return res.status(403).json({ message: "Bu işlem sadece yöneticiye açıktır." });
  }
  return next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || !isSuperAdminUser(req.user)) {
    return res.status(403).json({ message: "Bu işlem yalnızca Superadmin yetkisi gerektirir." });
  }
  return next();
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Yetkisiz erişim." });
    }
    if (isSuperAdminUser(req.user)) {
      return next();
    }
    if (perm === "timeline") {
      return res.status(403).json({ message: "İşlem geçmişi sadece Superadmin tarafından görüntülenebilir." });
    }
    if (req.user.role === "admin") {
      return next();
    }
    const permissions = req.user.permissions || [];
    if (!permissions.includes(perm)) {
      return res.status(403).json({ message: `Bu işlem için yetkiniz yok (${perm}).` });
    }
    return next();
  };
}

module.exports = {
  authMiddleware,
  requireAdmin,
  requireSuperAdmin,
  requirePermission,
  isSuperAdminUser,
  jwtSecret
};

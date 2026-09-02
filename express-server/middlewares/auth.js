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

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Bu işlem sadece yöneticiye açıktır." });
  }
  return next();
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Yetkisiz erişim." });
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
  requirePermission,
  jwtSecret
};

const jwt = require("jsonwebtoken");
const db = require("../models");

const jwtSecret = process.env.JWT_SECRET || "change_this";

// Middleware for admin/staff authentication
async function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth)
    return res.status(401).json({ error: "Missing authorization header" });
  const parts = auth.split(" ");
  if (parts.length !== 2)
    return res.status(401).json({ error: "Invalid authorization header" });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, jwtSecret);
    // Attach admin user
    const user = await db.User.findByPk(payload.id);
    if (!user) return res.status(401).json({ error: "Invalid token user" });
    if (!["super_admin", "admin", "staff"].includes(user.role)) {
      return res.status(403).json({ error: "Access denied. Admin/Staff only." });
    }
    
    req.admin = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Middleware for admin-only endpoints (Settings, user management)
async function adminOnlyAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth)
    return res.status(401).json({ error: "Missing authorization header" });
  const parts = auth.split(" ");
  if (parts.length !== 2)
    return res.status(401).json({ error: "Invalid authorization header" });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await db.User.findByPk(payload.id);
    if (!user) return res.status(401).json({ error: "Invalid token user" });
    if (!["super_admin", "admin"].includes(user.role)) {
      return res.status(403).json({ error: "Access denied. Admin only." });
    }
    req.admin = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Middleware for Super Admin endpoints (financial reports such as Service Charge)
async function superAdminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth)
    return res.status(401).json({ error: "Missing authorization header" });
  const parts = auth.split(" ");
  if (parts.length !== 2)
    return res.status(401).json({ error: "Invalid authorization header" });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await db.User.findByPk(payload.id);
    if (!user) return res.status(401).json({ error: "Invalid token user" });
    // Role is read from the database, not the token, so a demoted user loses access at once.
    if (user.role !== "super_admin") {
      return res.status(403).json({ error: "Access denied. Super Admin only." });
    }
    req.admin = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { adminAuth, adminOnlyAuth, superAdminAuth };




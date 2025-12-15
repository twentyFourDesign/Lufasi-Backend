const jwt = require("jsonwebtoken");
const db = require("../models");

const jwtSecret = process.env.JWT_SECRET || "change_this";

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
    req.admin = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { adminAuth };

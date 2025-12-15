const db = require("../models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const jwtSecret = process.env.JWT_SECRET || "change_this";
const jwtExpires = process.env.JWT_EXPIRES_IN || "7d";

async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const user = await db.User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await user.validPassword(password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, {
      expiresIn: jwtExpires,
    });

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { adminLogin };

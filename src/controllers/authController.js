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

    // Check if user has admin or staff role
    if (!["super_admin", "admin", "staff"].includes(user.role)) {
      return res.status(403).json({ error: "Access denied. Admin/Staff only." });
    }

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

async function createAdmin(req, res, next) {
  try {
    const { fullName, email, password, phone, role } = req.body;
    const requestingUser = req.admin; // Set by adminAuth middleware

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        error: "Full name, email, and password are required"
      });
    }

    // Role validation based on requesting user's role
    const targetRole = role || "user";

    if (requestingUser.role === "staff") {
      // Staff can only create users, not admin or staff
      if (["admin", "staff"].includes(targetRole)) {
        return res.status(403).json({
          error: "Staff members cannot create admin or staff accounts"
        });
      }
    }

    // Only a Super Admin can create another Super Admin
    if (targetRole === "super_admin" && requestingUser.role !== "super_admin") {
      return res.status(403).json({
        error: "Only a Super Admin can create Super Admin accounts"
      });
    }

    // Check if user already exists
    const existingUser = await db.User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await db.User.create({
      fullName,
      email,
      phone: phone || null,
      passwordHash,
      role: targetRole,
    });

    res.status(201).json({
      message: "User created successfully",
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

/**
 * Get all admin/staff users - Admin only
 */
async function getAdmins(req, res, next) {
  try {
    const users = await db.User.findAll({
      where: {
        role: ["super_admin", "admin", "staff"]
      },
      attributes: ["id", "fullName", "email", "role", "phone", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    res.json({ users });
  } catch (err) {
    next(err);
  }
}

/**
 * Update admin/staff user - Admin only
 */
async function updateAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { fullName, email, phone, role, password } = req.body;

    const user = await db.User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Super Admin accounts (and the Super Admin role) are managed by Super Admins only,
    // otherwise an Admin could reset a Super Admin's password or promote themselves.
    const requestingUser = req.admin;
    const requesterIsSuper = requestingUser?.role === "super_admin";
    if (!requesterIsSuper && (user.role === "super_admin" || role === "super_admin")) {
      return res.status(403).json({
        error: "Only a Super Admin can change Super Admin accounts"
      });
    }
    // Never leave the system without a Super Admin
    if (user.role === "super_admin" && role && role !== "super_admin") {
      const supers = await db.User.count({ where: { role: "super_admin" } });
      if (supers <= 1) {
        return res.status(400).json({
          error: "Cannot change the role of the only Super Admin"
        });
      }
    }

    // Update fields
    if (fullName) user.fullName = fullName;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (role && ["super_admin", "admin", "staff", "user"].includes(role)) {
      user.role = role;
    }

    // Update password if provided
    if (password) {
      const saltRounds = 10;
      user.passwordHash = await bcrypt.hash(password, saltRounds);
    }

    await user.save();

    res.json({
      message: "User updated successfully",
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

/**
 * Delete admin/staff user - Admin only
 */
async function deleteAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const requestingUser = req.admin;

    // Prevent self-deletion
    if (requestingUser.id === id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const user = await db.User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "super_admin") {
      if (requestingUser.role !== "super_admin") {
        return res.status(403).json({
          error: "Only a Super Admin can delete a Super Admin account"
        });
      }
      const supers = await db.User.count({ where: { role: "super_admin" } });
      if (supers <= 1) {
        return res.status(400).json({ error: "Cannot delete the only Super Admin" });
      }
    }

    await user.destroy();

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminLogin,
  createAdmin,
  getAdmins,
  updateAdmin,
  deleteAdmin
};

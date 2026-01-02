const express = require("express");
const router = express.Router();
const {
    adminLogin,
    createAdmin,
    getAdmins,
    updateAdmin,
    deleteAdmin
} = require("../controllers/authController");
const { adminAuth, adminOnlyAuth } = require("../middleware/auth");

// Public route - Login
router.post("/admin/login", adminLogin);

// Protected routes - Require authentication
// Create user - admin can create all roles, staff can only create "user"
router.post("/admin/create", adminAuth, createAdmin);

// Admin-only routes - Only admin role can access
router.get("/admin/users", adminOnlyAuth, getAdmins);
router.put("/admin/users/:id", adminOnlyAuth, updateAdmin);
router.delete("/admin/users/:id", adminOnlyAuth, deleteAdmin);

module.exports = router;

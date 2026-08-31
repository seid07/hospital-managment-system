const express = require("express");
const authController = require("../controllers/auth.controller");
const { authenticateToken } = require("../middleware/auth.middleware");

const router = express.Router();

// System bootstrap & Public Auth
router.get("/status", authController.getSystemStatus);
router.post("/setup-admin", authController.setupAdmin);
router.post("/login", authController.login);

// Email Verification (Public endpoint for clicking verification link)
const staffController = require("../controllers/staff.controller");
router.get("/verify-email", staffController.verifyEmail);
router.post("/verify-email", staffController.verifyEmail);

// Forgot Password with 6-Digit OTP Flow
router.post("/forgot-password", authController.requestResetOtp);
router.post("/forgot-password/request-otp", authController.requestResetOtp);
router.post("/forgot-password/verify-otp", authController.verifyResetOtp);
router.post("/forgot-password/resend-otp", authController.requestResetOtp);
router.post("/reset-password", authController.resetPassword);

// Authenticated Password Management (First Login & Profile Area)
router.post("/verify-password", authenticateToken, authController.verifyPassword);
router.post("/change-password", authenticateToken, authController.changePassword);


module.exports = router;

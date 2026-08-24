const express = require("express");
const authController = require("../controllers/auth.controller");

const router = express.Router();

router.get("/status", authController.getSystemStatus);
router.post("/setup-admin", authController.setupAdmin);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;

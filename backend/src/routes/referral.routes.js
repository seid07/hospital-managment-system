const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const ctrl = require("../controllers/referral.controller");

const router = express.Router();
router.use(authenticateToken);

// Create referral (doctor only)
router.post("/", authorizeRoles("DOCTOR"), ctrl.createReferral);

// Referral queue for receiving doctor (Inbox)
router.get("/queue", authorizeRoles("DOCTOR"), ctrl.getReferralQueue);

// Referrals sent by this doctor (Outbox)
router.get("/sent", authorizeRoles("DOCTOR"), ctrl.getSentReferrals);

// Single referral (participant check inside service)
router.get("/:id", authorizeRoles("DOCTOR", "ADMIN"), ctrl.getReferral);

// Mark as viewed (receiving doctor only - enforced in service)
router.patch("/:id/view", authorizeRoles("DOCTOR"), ctrl.viewReferral);

// Submit response (receiving doctor only - enforced in service)
router.patch("/:id/respond", authorizeRoles("DOCTOR"), ctrl.respondReferral);

// Message thread
router.get("/:id/messages", authorizeRoles("DOCTOR", "ADMIN"), ctrl.getMessages);
router.post("/:id/messages", authorizeRoles("DOCTOR"), ctrl.sendMessage);

module.exports = router;

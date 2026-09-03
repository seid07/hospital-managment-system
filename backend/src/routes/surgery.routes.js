const express = require("express");
const controller = require("../controllers/surgery.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

const SURGERY_ROLES = ["ADMIN", "SURGEON", "DOCTOR", "NURSE"];

router.get("/metrics", authorizeRoles(...SURGERY_ROLES), controller.getMetrics);
router.get("/queue", authorizeRoles(...SURGERY_ROLES), controller.getSurgeryQueue);
router.post("/orders/:serviceOrderId/checklist", authorizeRoles("ADMIN", "SURGEON", "DOCTOR", "NURSE"), controller.updateChecklist);
router.post("/orders/:serviceOrderId/start", authorizeRoles("ADMIN", "SURGEON", "DOCTOR"), controller.startSurgery);
router.post("/orders/:serviceOrderId/complete", authorizeRoles("ADMIN", "SURGEON", "DOCTOR"), controller.completeSurgery);

module.exports = router;

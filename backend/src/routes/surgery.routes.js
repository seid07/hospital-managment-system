const express = require("express");
const controller = require("../controllers/surgery.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/queue", authorizeRoles("ADMIN", "SURGEON", "DOCTOR", "NURSE"), controller.getSurgeryQueue);
router.post("/orders/:serviceOrderId/status", authorizeRoles("ADMIN", "SURGEON", "DOCTOR"), controller.updateSurgeryStatus);

module.exports = router;

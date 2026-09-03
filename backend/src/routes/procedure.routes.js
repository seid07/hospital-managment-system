const express = require("express");
const controller = require("../controllers/procedure.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/metrics", authorizeRoles("ADMIN", "NURSE", "DOCTOR"), controller.getProcedureMetrics);
router.get("/queue", authorizeRoles("ADMIN", "NURSE", "DOCTOR"), controller.getProcedureQueue);
router.post("/orders/:serviceOrderId/start", authorizeRoles("ADMIN", "NURSE", "DOCTOR"), controller.startProcedure);
router.post("/orders/:serviceOrderId/complete", authorizeRoles("ADMIN", "NURSE", "DOCTOR"), controller.completeProcedure);

module.exports = router;

const express = require("express");
const controller = require("../controllers/radiology.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/metrics", authorizeRoles("ADMIN", "RADIOLOGIST", "DOCTOR"), controller.getRadiologyMetrics);
router.get("/queue", authorizeRoles("ADMIN", "RADIOLOGIST", "DOCTOR"), controller.getRadiologyQueue);
router.post("/orders/:serviceOrderId/start", authorizeRoles("ADMIN", "RADIOLOGIST"), controller.startRadiologyExam);
router.post("/orders/:serviceOrderId/result", authorizeRoles("ADMIN", "RADIOLOGIST"), controller.recordRadiologyResult);
router.get("/orders/:id", authorizeRoles("ADMIN", "RADIOLOGIST", "DOCTOR"), controller.getRadiologyOrder);
router.get("/patients/:patientId/history", authorizeRoles("ADMIN", "RADIOLOGIST", "DOCTOR"), controller.getPatientRadiologyHistory);

module.exports = router;

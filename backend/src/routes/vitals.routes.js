const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const vitalsController = require("../controllers/vitals.controller");

const router = express.Router();

router.use(authenticateToken);

router.post(
  "/",
  authorizeRoles("ADMIN", "NURSE", "DOCTOR"),
  vitalsController.recordVitals
);

router.get(
  "/patient/:patientId",
  authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE", "PHARMACIST", "LAB_TECH", "FINANCE"),
  vitalsController.getPatientVitals
);

router.get(
  "/triage/queue",
  authorizeRoles("ADMIN", "NURSE", "DOCTOR", "REGISTRAR"),
  vitalsController.getTriageQueue
);

module.exports = router;

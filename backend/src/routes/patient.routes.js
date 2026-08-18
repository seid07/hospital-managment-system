const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const patientController = require("../controllers/patient.controller");

const router = express.Router();

router.use(authenticateToken);

const ALL_CLINICAL_AND_ADMIN_ROLES = [
  "ADMIN",
  "REGISTRAR",
  "DOCTOR",
  "NURSE",
  "PHARMACIST",
  "LAB_TECH",
  "FINANCE",
];

router.post(
  "/",
  authorizeRoles("ADMIN", "REGISTRAR"),
  patientController.createPatient
);

router.get(
  "/search",
  authorizeRoles(...ALL_CLINICAL_AND_ADMIN_ROLES),
  patientController.searchPatients
);

router.get(
  "/",
  authorizeRoles(...ALL_CLINICAL_AND_ADMIN_ROLES),
  patientController.getPatients
);

router.get(
  "/:id",
  authorizeRoles(...ALL_CLINICAL_AND_ADMIN_ROLES),
  patientController.getPatient
);

router.put(
  "/:id",
  authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE"),
  patientController.updatePatient
);

router.get(
  "/:id/record",
  authorizeRoles(...ALL_CLINICAL_AND_ADMIN_ROLES),
  patientController.getPatientRecord
);

module.exports = router;

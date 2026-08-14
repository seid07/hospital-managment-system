const express = require("express");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  authorizeRoles,
} = require("../middleware/rbac.middleware");

const patientController =
  require("../controllers/patient.controller");

const router = express.Router();

router.use(authenticateToken);

router.post(
  "/",
  authorizeRoles("ADMIN", "REGISTRAR"),
  patientController.createPatient
);

router.get(
  "/search",
  authorizeRoles(
    "ADMIN",
    "REGISTRAR",
    "DOCTOR",
    "PHARMACIST",
    "FINANCE"
  ),
  patientController.searchPatients
);

router.get(
  "/:id",
  authorizeRoles(
    "ADMIN",
    "REGISTRAR",
    "DOCTOR",
    "PHARMACIST",
    "FINANCE"
  ),
  patientController.getPatient
);

module.exports = router;

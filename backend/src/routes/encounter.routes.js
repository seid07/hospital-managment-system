const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const encounterController = require("../controllers/encounter.controller");

const router = express.Router();

router.use(authenticateToken);

router.post(
  "/",
  authorizeRoles("ADMIN", "DOCTOR"),
  encounterController.createEncounter
);

router.get(
  "/:id",
  authorizeRoles("ADMIN", "DOCTOR", "NURSE", "PHARMACIST", "LAB_TECH", "REGISTRAR"),
  encounterController.getEncounter
);

router.put(
  "/:id",
  authorizeRoles("ADMIN", "DOCTOR"),
  encounterController.updateEncounter
);

router.post(
  "/:id/complete",
  authorizeRoles("ADMIN", "DOCTOR"),
  encounterController.completeEncounter
);

router.get(
  "/doctor/:doctorId/queue",
  authorizeRoles("ADMIN", "DOCTOR", "NURSE", "REGISTRAR"),
  encounterController.getDoctorQueue
);

module.exports = router;

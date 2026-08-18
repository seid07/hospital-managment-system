const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const appointmentController = require("../controllers/appointment.controller");

const router = express.Router();

router.use(authenticateToken);

const APPOINTMENT_VIEW_ROLES = [
  "ADMIN",
  "REGISTRAR",
  "DOCTOR",
  "NURSE",
  "PHARMACIST",
  "LAB_TECH",
  "FINANCE",
];

router.get(
  "/availability",
  authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE"),
  appointmentController.getAvailableSlots
);

router.get(
  "/",
  authorizeRoles(...APPOINTMENT_VIEW_ROLES),
  appointmentController.getAppointments
);

router.get(
  "/:id",
  authorizeRoles(...APPOINTMENT_VIEW_ROLES),
  appointmentController.getAppointment
);

router.post(
  "/",
  authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE"),
  appointmentController.createAppointment
);

router.patch(
  "/:id/status",
  authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE"),
  appointmentController.updateStatus
);

router.post(
  "/:id/reschedule",
  authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR"),
  appointmentController.reschedule
);

module.exports = router;

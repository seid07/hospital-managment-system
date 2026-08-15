const express = require("express");

const { authenticateToken } = require("../middleware/auth.middleware");

const { authorizeRoles } = require("../middleware/rbac.middleware");

const appointmentController = require("../controllers/appointment.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/availability",
  authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR"),
  appointmentController.getAvailableSlots,
);

router.post(
  "/",
  authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR"),
  appointmentController.createAppointment,
);

module.exports = router;

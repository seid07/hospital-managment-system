const express = require("express");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  authorizeRoles,
} = require("../middleware/rbac.middleware");

const controller =
  require("../controllers/appointment.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/availability",
  authorizeRoles(
    "ADMIN",
    "REGISTRAR",
    "DOCTOR"
  ),
  controller.getAvailableSlots
);

module.exports = router;

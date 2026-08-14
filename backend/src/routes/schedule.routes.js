const express = require("express");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  authorizeRoles,
} = require("../middleware/rbac.middleware");

const controller =
  require("../controllers/schedule.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/doctors",
  authorizeRoles(
    "ADMIN",
    "REGISTRAR",
    "DOCTOR"
  ),
  controller.getDoctors
);

router.get(
  "/doctors/:doctorId",
  authorizeRoles(
    "ADMIN",
    "REGISTRAR",
    "DOCTOR"
  ),
  controller.getDoctorSchedules
);

router.post(
  "/doctors/:doctorId",
  authorizeRoles("ADMIN"),
  controller.createSchedule
);

router.delete(
  "/:id",
  authorizeRoles("ADMIN"),
  controller.deleteSchedule
);

module.exports = router;

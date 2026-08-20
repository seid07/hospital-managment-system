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

const ALL_ROLES = [
  "ADMIN",
  "REGISTRAR",
  "DOCTOR",
  "NURSE",
  "PHARMACIST",
  "LAB_TECH",
  "FINANCE",
  "RADIOLOGIST",
  "SURGEON",
  "WARD_STAFF",
];

// List doctors (supports optional ?date=YYYY-MM-DD filter)
router.get(
  "/doctors",
  authorizeRoles(...ALL_ROLES),
  controller.getDoctors
);

// Get doctor's upcoming availability with date & slots
router.get(
  "/doctors/:doctorId/upcoming",
  authorizeRoles(...ALL_ROLES),
  controller.getDoctorUpcomingAvailability
);

// Get doctor weekly schedule (Admin/Registrar or Doctor own schedule)
router.get(
  "/doctors/:doctorId",
  authorizeRoles(
    "ADMIN",
    "REGISTRAR",
    "DOCTOR"
  ),
  controller.getDoctorSchedules
);

// Create schedule - strictly ADMIN
router.post(
  "/doctors/:doctorId",
  authorizeRoles("ADMIN"),
  controller.createSchedule
);

// Delete schedule - strictly ADMIN
router.delete(
  "/:id",
  authorizeRoles("ADMIN"),
  controller.deleteSchedule
);

module.exports = router;

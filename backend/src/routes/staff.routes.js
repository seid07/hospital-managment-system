const express = require("express");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  authorizeRoles,
} = require("../middleware/rbac.middleware");

const staffController =
  require("../controllers/staff.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/roles",
  authorizeRoles("ADMIN"),
  staffController.getRoles
);

router.get(
  "/",
  authorizeRoles("ADMIN"),
  staffController.getStaff
);

router.post(
  "/",
  authorizeRoles("ADMIN"),
  staffController.createStaff
);

router.patch(
  "/:id/status",
  authorizeRoles("ADMIN"),
  staffController.updateStatus
);

module.exports = router;

const express = require("express");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  authorizeRoles,
} = require("../middleware/rbac.middleware");

const {
  getProtectedData,
  getAdminData,
} = require("../controllers/test.controller");

const router = express.Router();

router.get(
  "/protected",
  authenticateToken,
  getProtectedData
);

router.get(
  "/admin",
  authenticateToken,
  authorizeRoles("ADMIN"),
  getAdminData
);

module.exports = router;

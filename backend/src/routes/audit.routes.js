const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const auditController = require("../controllers/audit.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/",
  authorizeRoles("ADMIN"),
  auditController.getAuditLogs
);

module.exports = router;

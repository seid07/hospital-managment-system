const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const reportController = require("../controllers/report.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/dashboard-kpis",
  reportController.getDashboardKPIs
);

router.get(
  "/analytics",
  authorizeRoles("ADMIN", "FINANCE", "DOCTOR"),
  reportController.getAnalyticsReport
);

module.exports = router;

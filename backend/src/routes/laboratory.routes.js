const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const laboratoryController = require("../controllers/laboratory.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/catalog",
  authorizeRoles("ADMIN", "LAB_TECH", "DOCTOR", "NURSE"),
  laboratoryController.getTestCatalog
);

router.post(
  "/catalog",
  authorizeRoles("ADMIN", "LAB_TECH"),
  laboratoryController.addCatalogTest
);

router.post(
  "/orders",
  authorizeRoles("ADMIN", "DOCTOR"),
  laboratoryController.createLabOrder
);

router.get(
  "/orders",
  authorizeRoles("ADMIN", "LAB_TECH", "DOCTOR", "NURSE"),
  laboratoryController.getLabOrders
);

router.get(
  "/orders/:id",
  authorizeRoles("ADMIN", "LAB_TECH", "DOCTOR", "NURSE"),
  laboratoryController.getLabOrder
);

router.post(
  "/orders/:id/specimen",
  authorizeRoles("ADMIN", "LAB_TECH", "NURSE"),
  laboratoryController.collectSpecimen
);

router.post(
  "/orders/:id/results",
  authorizeRoles("ADMIN", "LAB_TECH"),
  laboratoryController.enterResults
);

router.post(
  "/orders/:id/verify",
  authorizeRoles("ADMIN", "LAB_TECH", "DOCTOR"),
  laboratoryController.verifyResults
);

module.exports = router;

const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const labController = require("../controllers/laboratory.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/catalog",
  labController.getCatalog
);

router.post(
  "/catalog",
  authorizeRoles("ADMIN", "LAB_TECH"),
  labController.addCatalogTest
);

router.put(
  "/catalog/:id/link-service",
  authorizeRoles("ADMIN", "LAB_TECH"),
  labController.linkCatalogTestService
);

router.post(
  "/orders",
  authorizeRoles("ADMIN", "DOCTOR"),
  labController.createLabOrder
);

router.get(
  "/orders",
  authorizeRoles("ADMIN", "LAB_TECH", "DOCTOR", "NURSE"),
  labController.getOrdersQueue
);

router.get(
  "/orders/:id",
  authorizeRoles("ADMIN", "LAB_TECH", "DOCTOR", "NURSE"),
  labController.getOrderById
);

router.post(
  "/orders/:id/collect",
  authorizeRoles("ADMIN", "LAB_TECH", "NURSE"),
  labController.collectSpecimen
);

router.post(
  "/orders/:id/specimen",
  authorizeRoles("ADMIN", "LAB_TECH", "NURSE"),
  labController.collectSpecimen
);

router.post(
  "/orders/:id/process",
  authorizeRoles("ADMIN", "LAB_TECH"),
  labController.startProcessing
);

router.post(
  "/orders/:id/results",
  authorizeRoles("ADMIN", "LAB_TECH"),
  labController.enterResults
);

router.post(
  "/orders/:id/verify",
  authorizeRoles("ADMIN", "LAB_TECH"),
  labController.verifyResults
);

module.exports = router;

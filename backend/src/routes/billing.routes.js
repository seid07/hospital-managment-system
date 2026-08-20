const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const billingController = require("../controllers/billing.controller");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/services",
  billingController.getServices
);

router.post(
  "/services",
  authorizeRoles("ADMIN", "FINANCE"),
  billingController.addService
);

router.post(
  "/invoices",
  authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"),
  billingController.createInvoice
);

router.get(
  "/invoices",
  authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"),
  billingController.getInvoices
);

router.get(
  "/invoices/:id",
  authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"),
  billingController.getInvoice
);

router.post(
  "/payments",
  authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"),
  billingController.recordPayment
);

module.exports = router;

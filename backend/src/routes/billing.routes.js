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

router.post(
  "/payments/selective",
  authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"),
  billingController.recordSelectivePayment
);

router.post(
  "/payments/:id/reverse",
  authorizeRoles("ADMIN", "FINANCE"),
  billingController.reversePayment
);

router.get(
  "/pending-orders",
  authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"),
  billingController.getPendingCashierOrders
);

router.get(
  "/pending-orders-grouped",
  authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"),
  billingController.getPendingCashierOrdersGrouped
);

// Requirement 6: Full Transaction History Print & Export
// ONLY REGISTRAR and ADMIN are permitted to print / export full transaction history.
// Any other role (DOCTOR, NURSE, LAB_TECH, RADIOLOGIST, PHARMACIST, SURGEON, FINANCE, etc.) will receive 403 Forbidden.
router.get(
  "/transactions/full-history",
  authorizeRoles("ADMIN", "REGISTRAR"),
  billingController.getFullTransactionHistory
);

router.get(
  "/transactions/print",
  authorizeRoles("ADMIN", "REGISTRAR"),
  billingController.getFullTransactionHistory
);

router.get(
  "/transactions/export",
  authorizeRoles("ADMIN", "REGISTRAR"),
  billingController.getFullTransactionHistory
);


module.exports = router;

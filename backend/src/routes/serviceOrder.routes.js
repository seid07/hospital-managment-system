const express = require("express");
const controller = require("../controllers/serviceOrder.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

router.post("/", authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE"), controller.createServiceOrders);
// Requirement 16: service orders carry cross-department financial detail
// (price, payment status, clinical notes). Restrict lookups to roles with a
// legitimate business need; department-specific staff (lab, pharmacy,
// radiology, surgery, ward) already get their own scoped view through their
// respective queue endpoints and should not be able to browse arbitrary
// service orders belonging to other departments.
router.get("/visit/:visitId", authorizeRoles("ADMIN", "REGISTRAR", "FINANCE", "DOCTOR", "NURSE"), controller.getServiceOrdersByVisit);
router.get("/:id", authorizeRoles("ADMIN", "REGISTRAR", "FINANCE", "DOCTOR", "NURSE"), controller.getServiceOrderById);
router.post("/:id/authorize", authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"), controller.authorizeServiceOrder);
router.post("/:id/cancel", authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR"), controller.cancelServiceOrder);

module.exports = router;

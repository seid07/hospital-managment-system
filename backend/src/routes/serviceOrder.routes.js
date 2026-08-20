const express = require("express");
const controller = require("../controllers/serviceOrder.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

router.post("/", authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE"), controller.createServiceOrders);
router.get("/visit/:visitId", controller.getServiceOrdersByVisit);
router.get("/:id", controller.getServiceOrderById);
router.post("/:id/authorize", authorizeRoles("ADMIN", "FINANCE", "REGISTRAR"), controller.authorizeServiceOrder);
router.post("/:id/cancel", authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR"), controller.cancelServiceOrder);

module.exports = router;

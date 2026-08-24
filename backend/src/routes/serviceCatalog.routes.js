const express = require("express");
const controller = require("../controllers/serviceCatalog.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/departments", controller.getDepartments);
router.get("/", controller.getServices);
router.get("/:id", controller.getServiceById);
router.get("/:id/history", authorizeRoles("ADMIN", "FINANCE"), controller.getServicePriceHistory);
router.post("/", authorizeRoles("ADMIN"), controller.createService);
router.put("/:id", authorizeRoles("ADMIN"), controller.updateService);
router.patch("/:id", authorizeRoles("ADMIN"), controller.updateService);

module.exports = router;

const express = require("express");
const controller = require("../controllers/ward.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/beds", controller.getBeds);
router.get("/queue", authorizeRoles("ADMIN", "WARD_STAFF", "NURSE", "DOCTOR"), controller.getWardQueue);
router.post("/admit", authorizeRoles("ADMIN", "WARD_STAFF", "DOCTOR"), controller.admitPatient);
router.post("/discharge/:id", authorizeRoles("ADMIN", "WARD_STAFF", "DOCTOR"), controller.dischargePatient);

module.exports = router;

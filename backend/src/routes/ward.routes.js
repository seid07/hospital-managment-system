const express = require("express");
const controller = require("../controllers/ward.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

const WARD_CLINICAL_ROLES = ["ADMIN", "WARD_STAFF", "NURSE", "DOCTOR", "SURGEON"];

router.get("/metrics", authorizeRoles(...WARD_CLINICAL_ROLES), controller.getMetrics);
router.get("/beds", authorizeRoles(...WARD_CLINICAL_ROLES), controller.getBeds);
router.post("/beds", authorizeRoles("ADMIN", "WARD_STAFF"), controller.createBed);
router.patch("/beds/:id/status", authorizeRoles("ADMIN", "WARD_STAFF"), controller.updateBedStatus);
router.get("/queue", authorizeRoles(...WARD_CLINICAL_ROLES), controller.getWardQueue);

// Admission endpoints
router.post("/admit", authorizeRoles("ADMIN", "WARD_STAFF", "DOCTOR"), controller.admitPatient);
router.post("/admissions", authorizeRoles("ADMIN", "WARD_STAFF", "DOCTOR"), controller.admitPatient);
router.post("/admissions/:id/transfer", authorizeRoles("ADMIN", "WARD_STAFF", "DOCTOR"), controller.transferBed);
router.post("/admissions/:id/discharge", authorizeRoles("ADMIN", "WARD_STAFF", "DOCTOR"), controller.dischargePatient);
router.post("/discharge/:id", authorizeRoles("ADMIN", "WARD_STAFF", "DOCTOR"), controller.dischargePatient);

module.exports = router;

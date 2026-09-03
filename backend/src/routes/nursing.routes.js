const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const controller = require("../controllers/nursing.controller");

const router = express.Router();

router.use(authenticateToken);

const CLINICAL_ROLES = ["ADMIN", "NURSE", "DOCTOR", "SURGEON", "WARD_STAFF"];

// Dashboard KPIs
router.get("/metrics", authorizeRoles(...CLINICAL_ROLES), controller.getMetrics);

// Patients under nursing care & clinical snapshot
router.get("/patients", authorizeRoles(...CLINICAL_ROLES), controller.getPatients);
router.get("/patients/:patientId/overview", authorizeRoles(...CLINICAL_ROLES), controller.getPatientOverview);

// Nursing tasks
router.get("/tasks", authorizeRoles(...CLINICAL_ROLES), controller.getTasks);
router.post("/tasks", authorizeRoles("ADMIN", "NURSE", "DOCTOR"), controller.createTask);
router.patch("/tasks/:id/status", authorizeRoles("ADMIN", "NURSE", "DOCTOR"), controller.updateTaskStatus);

// Medication administration record (MAR)
router.get("/patients/:patientId/medications", authorizeRoles(...CLINICAL_ROLES), controller.getMedAdmins);
router.post("/medications", authorizeRoles("ADMIN", "NURSE", "DOCTOR"), controller.recordMedAdmin);

// Nursing clinical notes
router.get("/patients/:patientId/notes", authorizeRoles(...CLINICAL_ROLES), controller.getNotes);
router.post("/notes", authorizeRoles("ADMIN", "NURSE", "DOCTOR"), controller.createNote);

// Escalation to doctor
router.post("/escalations", authorizeRoles("ADMIN", "NURSE"), controller.escalateToDoctor);

module.exports = router;

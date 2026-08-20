const express = require("express");
const controller = require("../controllers/visit.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

router.post("/", authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE"), controller.createVisit);
router.get("/patient/:patientId", controller.getPatientVisits);
router.get("/:id", controller.getVisitById);
router.patch("/:id/close", authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR"), controller.closeVisit);

module.exports = router;

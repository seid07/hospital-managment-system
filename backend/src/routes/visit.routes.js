const express = require("express");
const controller = require("../controllers/visit.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

// Requirement 16 (broader RBAC pass): getPatientVisits/getVisitById return
// full patient PII (name, DOB, phone), cross-department service orders, and
// invoice/payment totals. These had no role check at all, so any
// authenticated staff member (e.g. a pharmacist or ward clerk) could pull
// any patient's complete visit + billing history just by knowing/guessing
// the ID. Restrict to roles with a legitimate need to see a full visit.
const VISIT_VIEW_ROLES = ["ADMIN", "REGISTRAR", "DOCTOR", "NURSE", "FINANCE"];

router.post("/", authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR", "NURSE"), controller.createVisit);
router.get("/patient/:patientId", authorizeRoles(...VISIT_VIEW_ROLES), controller.getPatientVisits);
router.get("/:id", authorizeRoles(...VISIT_VIEW_ROLES), controller.getVisitById);
router.patch("/:id/close", authorizeRoles("ADMIN", "REGISTRAR", "DOCTOR"), controller.closeVisit);

module.exports = router;

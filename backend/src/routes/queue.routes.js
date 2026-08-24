const express = require("express");
const controller = require("../controllers/queue.controller");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(authenticateToken);

// Requirement 16: this generic endpoint can return ANY department's queue
// (including cross-department clinical/financial detail) by simply changing
// the URL param, so it must not be open to every authenticated role. It is
// currently unused by the frontend (each department has its own scoped
// queue endpoint) and is kept for admin/ops tooling only.
router.get("/:departmentCode", authorizeRoles("ADMIN"), controller.getDepartmentQueue);

// call-next / status updates are used by every department's own queue page,
// so we allow the operational roles that run a queue, but exclude
// purely financial roles (FINANCE/REGISTRAR) that have no reason to call or
// progress a clinical queue entry.
router.post(
  "/:departmentCode/call-next",
  authorizeRoles("ADMIN", "DOCTOR", "NURSE", "LAB_TECH", "RADIOLOGIST", "SURGEON", "WARD_STAFF", "PHARMACIST"),
  controller.callNext
);
router.patch(
  "/entry/:id/status",
  authorizeRoles("ADMIN", "DOCTOR", "NURSE", "LAB_TECH", "RADIOLOGIST", "SURGEON", "WARD_STAFF", "PHARMACIST"),
  controller.updateQueueStatus
);

module.exports = router;

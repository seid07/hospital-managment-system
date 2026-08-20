const queueService = require("../services/queue.service");

// Department to role authorization mapping
const DEPT_ROLE_MAP = {
  CLINICAL: ["ADMIN", "DOCTOR", "NURSE"],
  LABORATORY: ["ADMIN", "LAB_TECH"],
  RADIOLOGY: ["ADMIN", "RADIOLOGIST", "DOCTOR"],
  CARDIOLOGY: ["ADMIN", "DOCTOR", "NURSE"],
  PROCEDURE: ["ADMIN", "NURSE", "DOCTOR"],
  WARD: ["ADMIN", "WARD_STAFF", "NURSE", "DOCTOR"],
  SURGERY: ["ADMIN", "SURGEON", "DOCTOR", "NURSE"],
  PHARMACY: ["ADMIN", "PHARMACIST"],
  REGISTRATION: ["ADMIN", "REGISTRAR", "FINANCE"],
};

async function getDepartmentQueue(req, res, next) {
  try {
    const departmentCode = req.params.departmentCode.toUpperCase();
    const userRole = req.user.role;

    // Check server-side access control
    const allowedRoles = DEPT_ROLE_MAP[departmentCode] || ["ADMIN"];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Your role (${userRole}) is not authorized to view the ${departmentCode} queue.`,
      });
    }

    const { status, date } = req.query;
    const data = await queueService.getDepartmentQueue(departmentCode, { status, date });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function updateQueueStatus(req, res, next) {
  try {
    const { status, notes } = req.body;
    const data = await queueService.updateQueueStatus(req.params.id, status, {
      staffId: req.user.staff_id,
      notes,
      userId: req.user.id,
    });
    res.json({ success: true, data, message: `Queue status updated to ${status}.` });
  } catch (error) {
    next(error);
  }
}

async function callNext(req, res, next) {
  try {
    const departmentCode = req.params.departmentCode.toUpperCase();
    const userRole = req.user.role;

    const allowedRoles = DEPT_ROLE_MAP[departmentCode] || ["ADMIN"];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Your role (${userRole}) is not authorized to call patients for ${departmentCode}.`,
      });
    }

    const data = await queueService.callNext(departmentCode, {
      staffId: req.user.staff_id,
      userId: req.user.id,
    });
    if (!data) {
      return res.json({ success: true, data: null, message: "No patients currently waiting in queue." });
    }
    res.json({ success: true, data, message: "Next patient called." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDepartmentQueue,
  updateQueueStatus,
  callNext,
};

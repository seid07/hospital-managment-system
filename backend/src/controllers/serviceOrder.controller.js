const serviceOrderService = require("../services/serviceOrder.service");

async function createServiceOrders(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    const staffId = req.user?.staffId || req.user?.staff_id;
    if (!req.body.doctorId && staffId) {
      req.body.doctorId = staffId;
    }
    if (!req.body.patientId && req.body.encounterId && isValidUUID(req.body.encounterId)) {
      const pool = require("../config/database");
      const enc = await pool.query("SELECT patient_id, doctor_id FROM encounters WHERE id = $1", [req.body.encounterId]);
      if (enc.rows.length > 0) {
        req.body.patientId = enc.rows[0].patient_id;
        if (!req.body.doctorId) req.body.doctorId = enc.rows[0].doctor_id;
      }
    }
    const data = await serviceOrderService.createServiceOrders(req.body, userId);
    res.status(201).json({ success: true, data, message: "Service orders created successfully." });
  } catch (error) {
    next(error);
  }
}

async function getServiceOrdersByVisit(req, res, next) {
  try {
    const data = await serviceOrderService.getServiceOrdersByVisit(req.params.visitId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getServiceOrderById(req, res, next) {
  try {
    const data = await serviceOrderService.getServiceOrderById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Service order not found." });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function authorizeServiceOrder(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    const data = await serviceOrderService.authorizeServiceOrder(req.params.id, {
      userId,
      reason: req.body.reason,
      source: req.body.source || "ADMIN_OVERRIDE",
    });
    res.json({ success: true, data, message: "Service order authorized." });
  } catch (error) {
    next(error);
  }
}

async function cancelServiceOrder(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    const data = await serviceOrderService.cancelServiceOrder(req.params.id, {
      userId,
      reason: req.body.reason,
    });
    res.json({ success: true, data, message: "Service order cancelled." });
  } catch (error) {
    next(error);
  }
}

async function getPatientClinicalResults(req, res, next) {
  try {
    const data = await serviceOrderService.getPatientClinicalResults(req.params.patientId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createServiceOrders,
  getServiceOrdersByVisit,
  getServiceOrderById,
  authorizeServiceOrder,
  cancelServiceOrder,
  getPatientClinicalResults,
};

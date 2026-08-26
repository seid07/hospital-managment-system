const radiologyService = require("../services/radiology.service");

async function getRadiologyQueue(req, res, next) {
  try {
    const doctorId = req.user?.role === "DOCTOR" ? req.user?.staffId : null;
    const data = await radiologyService.getRadiologyQueue({ ...req.query, doctorId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function recordRadiologyResult(req, res, next) {
  try {
    const data = await radiologyService.recordRadiologyResult(
      req.params.serviceOrderId,
      req.body,
      req.user.id
    );
    res.json({ success: true, data, message: "Radiology results recorded and reported." });
  } catch (error) {
    next(error);
  }
}

async function getRadiologyOrder(req, res, next) {
  try {
    const data = await radiologyService.getRadiologyOrder(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Radiology order not found." });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRadiologyQueue,
  recordRadiologyResult,
  getRadiologyOrder,
};

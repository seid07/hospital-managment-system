const wardService = require("../services/ward.service");

async function getMetrics(req, res, next) {
  try {
    const data = await wardService.getWardMetrics();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getBeds(req, res, next) {
  try {
    const doctorId = req.user?.role === "DOCTOR" ? req.user?.staffId : null;
    const data = await wardService.getBeds({ doctorId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function createBed(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    const data = await wardService.createBed(req.body, userId);
    res.status(201).json({ success: true, data, message: "Bed created successfully." });
  } catch (error) {
    if (error.statusCode === 409 || error.code === "23505" || error.message?.includes("DUPLICATE_BED") || error.message?.includes("already exists")) {
      return res.status(409).json({ success: false, message: error.message || "A bed with this code already exists in the selected ward." });
    }
    next(error);
  }
}

async function updateBedStatus(req, res, next) {
  try {
    const data = await wardService.updateBedStatus(req.params.id, req.body.status, req.user.id);
    res.json({ success: true, data, message: "Bed status updated." });
  } catch (error) {
    next(error);
  }
}

async function getWardQueue(req, res, next) {
  try {
    const doctorId = req.user?.role === "DOCTOR" ? req.user?.staffId : null;
    const data = await wardService.getWardQueue({ ...req.query, doctorId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function admitPatient(req, res, next) {
  try {
    const data = await wardService.admitPatient(req.body, req.user.id);
    res.status(201).json({ success: true, data, message: "Patient admitted to ward." });
  } catch (error) {
    next(error);
  }
}

async function transferBed(req, res, next) {
  try {
    const data = await wardService.transferBed(req.params.id, req.body, req.user.id);
    res.json({ success: true, data, message: "Bed transfer completed successfully." });
  } catch (error) {
    next(error);
  }
}

async function dischargePatient(req, res, next) {
  try {
    const data = await wardService.dischargePatient(req.params.id, req.body, req.user.id);
    res.json({ success: true, data, message: "Patient discharged from ward." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMetrics,
  getBeds,
  createBed,
  updateBedStatus,
  getWardQueue,
  admitPatient,
  transferBed,
  dischargePatient,
};

const surgeryService = require("../services/surgery.service");

async function getMetrics(req, res, next) {
  try {
    const data = await surgeryService.getSurgeryMetrics();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getSurgeryQueue(req, res, next) {
  try {
    const doctorId = req.user?.role === "DOCTOR" ? req.user?.staffId : null;
    const data = await surgeryService.getSurgeryQueue({ ...req.query, doctorId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function updateChecklist(req, res, next) {
  try {
    const data = await surgeryService.updateChecklist(
      req.params.serviceOrderId,
      req.body,
      req.user.id
    );
    res.json({ success: true, data, message: "Pre-operative checklist updated." });
  } catch (error) {
    next(error);
  }
}

async function startSurgery(req, res, next) {
  try {
    const data = await surgeryService.startSurgery(
      req.params.serviceOrderId,
      req.user.id
    );
    res.json({ success: true, data, message: "Surgery commenced in Operating Theatre." });
  } catch (error) {
    next(error);
  }
}

async function completeSurgery(req, res, next) {
  try {
    const data = await surgeryService.completeSurgery(
      req.params.serviceOrderId,
      req.body,
      req.user.id
    );
    res.json({ success: true, data, message: "Surgery documented and completed." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMetrics,
  getSurgeryQueue,
  updateChecklist,
  startSurgery,
  completeSurgery,
};

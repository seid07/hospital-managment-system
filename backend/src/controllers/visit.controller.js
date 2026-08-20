const visitService = require("../services/visit.service");

async function createVisit(req, res, next) {
  try {
    const data = await visitService.createVisit(req.body, req.user.id);
    res.status(201).json({ success: true, data, message: "Visit created successfully." });
  } catch (error) {
    next(error);
  }
}

async function getPatientVisits(req, res, next) {
  try {
    const data = await visitService.getPatientVisits(req.params.patientId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getVisitById(req, res, next) {
  try {
    const data = await visitService.getVisitById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Visit not found." });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function closeVisit(req, res, next) {
  try {
    const data = await visitService.closeVisit(req.params.id, req.user.id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Visit not found." });
    }
    res.json({ success: true, data, message: "Visit closed successfully." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createVisit,
  getPatientVisits,
  getVisitById,
  closeVisit,
};

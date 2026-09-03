const nursingService = require("../services/nursing.service");

async function getMetrics(req, res, next) {
  try {
    const data = await nursingService.getNursingMetrics();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getPatients(req, res, next) {
  try {
    const data = await nursingService.getNursingPatients(req.query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getPatientOverview(req, res, next) {
  try {
    const data = await nursingService.getPatientNursingOverview(req.params.patientId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getTasks(req, res, next) {
  try {
    const data = await nursingService.getNursingTasks(req.query.patientId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const data = await nursingService.createNursingTask(req.body, req.user.id);
    res.status(201).json({ success: true, data, message: "Nursing task created." });
  } catch (error) {
    next(error);
  }
}

async function updateTaskStatus(req, res, next) {
  try {
    const data = await nursingService.updateNursingTaskStatus(
      req.params.id,
      req.body.status,
      req.body.notes,
      req.user.id
    );
    res.json({ success: true, data, message: "Nursing task status updated." });
  } catch (error) {
    next(error);
  }
}

async function getMedAdmins(req, res, next) {
  try {
    const data = await nursingService.getMedicationAdministrations(req.params.patientId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function recordMedAdmin(req, res, next) {
  try {
    const data = await nursingService.recordMedicationAdministration(req.body, req.user.id);
    res.status(201).json({ success: true, data, message: "Medication administration recorded." });
  } catch (error) {
    next(error);
  }
}

async function getNotes(req, res, next) {
  try {
    const data = await nursingService.getNursingNotes(req.params.patientId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function createNote(req, res, next) {
  try {
    const data = await nursingService.createNursingNote(req.body, req.user.id);
    res.status(201).json({ success: true, data, message: "Nursing note recorded." });
  } catch (error) {
    next(error);
  }
}

async function escalateToDoctor(req, res, next) {
  try {
    const data = await nursingService.escalateToDoctor(req.body, req.user.id);
    res.json({ success: true, data, message: "Doctor notified successfully." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMetrics,
  getPatients,
  getPatientOverview,
  getTasks,
  createTask,
  updateTaskStatus,
  getMedAdmins,
  recordMedAdmin,
  getNotes,
  createNote,
  escalateToDoctor,
};

const encounterService = require("../services/encounter.service");
const { isValidUUID } = require("../validators");

async function createEncounter(req, res) {
  try {
    const { patientId, doctorId, appointmentId, chiefComplaint, clinicalNotes, treatmentPlan, followUpDate, diagnoses } = req.body;

    if (!patientId || !doctorId) {
      return res.status(400).json({
        success: false,
        message: "patientId and doctorId are required.",
      });
    }

    if (!isValidUUID(patientId) || !isValidUUID(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid UUID format for patientId or doctorId.",
      });
    }

    const encounter = await encounterService.createEncounter({
      patientId,
      doctorId,
      appointmentId: appointmentId && isValidUUID(appointmentId) ? appointmentId : null,
      chiefComplaint,
      clinicalNotes,
      treatmentPlan,
      followUpDate,
      diagnoses,
      createdBy: req.user?.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Clinical encounter started.",
      data: encounter,
    });
  } catch (error) {
    console.error("Create encounter error:", error);
    if (error.message === "PATIENT_NOT_FOUND" || error.message === "DOCTOR_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to create encounter.",
    });
  }
}

async function updateEncounter(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid encounter ID format.",
      });
    }

    const encounter = await encounterService.updateEncounter(id, req.body, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Encounter updated successfully.",
      data: encounter,
    });
  } catch (error) {
    console.error("Update encounter error:", error);
    if (error.message.startsWith("CANNOT_MODIFY")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message === "ENCOUNTER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Encounter not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to update encounter.",
    });
  }
}

async function completeEncounter(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid encounter ID format.",
      });
    }

    const completed = await encounterService.completeEncounter(id, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Clinical encounter finalized and completed.",
      data: completed,
    });
  } catch (error) {
    console.error("Complete encounter error:", error);
    if (error.message === "ENCOUNTER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Encounter not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to complete encounter.",
    });
  }
}

async function getEncounter(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid encounter ID format.",
      });
    }

    const encounter = await encounterService.getEncounterById(id);

    if (!encounter) {
      return res.status(404).json({
        success: false,
        message: "Encounter not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: encounter,
    });
  } catch (error) {
    console.error("Get encounter error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve encounter.",
    });
  }
}

async function getDoctorQueue(req, res) {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!isValidUUID(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid doctor ID format.",
      });
    }

    const queue = await encounterService.getDoctorQueue(doctorId, date);

    return res.status(200).json({
      success: true,
      data: queue,
    });
  } catch (error) {
    console.error("Get doctor queue error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve doctor consultation queue.",
    });
  }
}

module.exports = {
  createEncounter,
  updateEncounter,
  completeEncounter,
  getEncounter,
  getDoctorQueue,
};

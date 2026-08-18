const vitalsService = require("../services/vitals.service");
const { isValidUUID } = require("../validators");

async function recordVitals(req, res) {
  try {
    const { patientId, encounterId, appointmentId } = req.body;

    if (!patientId || !isValidUUID(patientId)) {
      return res.status(400).json({
        success: false,
        message: "A valid patientId is required.",
      });
    }

    const vitals = await vitalsService.recordVitals({
      patientId,
      encounterId: encounterId && isValidUUID(encounterId) ? encounterId : null,
      appointmentId: appointmentId && isValidUUID(appointmentId) ? appointmentId : null,
      data: req.body,
      userId: req.user?.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Vital signs recorded successfully.",
      data: vitals,
    });
  } catch (error) {
    console.error("Record vitals error:", error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Unable to record vital signs.",
    });
  }
}

async function getPatientVitals(req, res) {
  try {
    const { patientId } = req.params;
    if (!isValidUUID(patientId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patientId format.",
      });
    }

    const vitals = await vitalsService.getPatientVitals(patientId);

    return res.status(200).json({
      success: true,
      data: vitals,
    });
  } catch (error) {
    console.error("Get vitals error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve vital signs.",
    });
  }
}

async function getTriageQueue(req, res) {
  try {
    const queue = await vitalsService.getTriageQueue();

    return res.status(200).json({
      success: true,
      data: queue,
    });
  } catch (error) {
    console.error("Get triage queue error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve triage queue.",
    });
  }
}

module.exports = {
  recordVitals,
  getPatientVitals,
  getTriageQueue,
};

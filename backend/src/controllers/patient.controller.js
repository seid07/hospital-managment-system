const patientService = require("../services/patient.service");
const { isValidUUID } = require("../validators");

async function createPatient(req, res) {
  try {
    const { firstName, lastName, dateOfBirth, gender, phone } = req.body;

    if (!firstName || !lastName || !dateOfBirth || !gender || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, date of birth, gender, and phone are required.",
      });
    }

    const patient = await patientService.createPatient(req.body, req.user?.userId);

    return res.status(201).json({
      success: true,
      message: "Patient registered successfully.",
      data: patient,
    });
  } catch (error) {
    console.error("Create patient error:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A patient with this phone or patient number already exists.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to create patient.",
    });
  }
}

async function updatePatient(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID format.",
      });
    }

    const patient = await patientService.updatePatient(id, req.body, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Patient updated successfully.",
      data: patient,
    });
  } catch (error) {
    if (error.message === "PATIENT_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }
    console.error("Update patient error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update patient.",
    });
  }
}

async function searchPatients(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must contain at least 2 characters.",
      });
    }

    const result = await patientService.searchPatients(q.trim(), req.query);

    return res.status(200).json({
      success: true,
      data: result.patients,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Search patients error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to search patients.",
    });
  }
}

async function getPatients(req, res) {
  try {
    const result = await patientService.getPatients(req.query);

    return res.status(200).json({
      success: true,
      data: result.patients,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get patients list error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve patients list.",
    });
  }
}

async function getPatient(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID format.",
      });
    }

    const patient = await patientService.getPatientById(id);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: patient,
    });
  } catch (error) {
    console.error("Get patient error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve patient.",
    });
  }
}

async function getPatientRecord(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID format.",
      });
    }

    const record = await patientService.getPatientMedicalRecord(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error("Get medical record error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve patient medical record.",
    });
  }
}

module.exports = {
  createPatient,
  updatePatient,
  searchPatients,
  getPatients,
  getPatient,
  getPatientRecord,
};

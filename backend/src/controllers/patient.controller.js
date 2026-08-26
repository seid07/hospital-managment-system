const patientService = require("../services/patient.service");
const { isValidUUID } = require("../validators");

async function createPatient(req, res) {
  try {
    const { firstName, lastName, dateOfBirth, age, gender, phone } = req.body;

    if (!firstName || !lastName || (!dateOfBirth && (age === undefined || age === null || age === "")) || !gender || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, age or date of birth, gender, and phone are required.",
      });
    }

    const patient = await patientService.createPatient(req.body, req.user?.userId);

    return res.status(201).json({
      success: true,
      message: "Patient registered successfully.",
      data: patient,
    });
  } catch (error) {
    if (error.message === "INVALID_PHONE_FORMAT") {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Ethiopian phone number starting with 09, 07, or +251.",
      });
    }
    if (error.message === "INVALID_EMERGENCY_PHONE_FORMAT") {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Ethiopian emergency phone number starting with 09, 07, or +251.",
      });
    }
    if (error.message === "AGE_OR_DOB_REQUIRED") {
      return res.status(400).json({
        success: false,
        message: "Valid age or date of birth is required.",
      });
    }
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
    if (error.message === "INVALID_PHONE_FORMAT") {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Ethiopian phone number starting with 09, 07, or +251.",
      });
    }
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

async function deletePatient(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID format.",
      });
    }

    const patient = await patientService.deletePatient(id, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Patient deleted successfully.",
      data: patient,
    });
  } catch (error) {
    if (error.message === "PATIENT_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }
    console.error("Delete patient error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete patient.",
    });
  }
}

async function searchPatients(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 1) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
    }

    const doctorStaffId = req.user?.role === "DOCTOR" ? req.user.staffId : null;
    const result = await patientService.searchPatients(q.trim(), req.query, doctorStaffId);

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
    const query = { ...req.query };
    if (req.user?.role === "DOCTOR" && req.user?.staffId) {
      query.doctorStaffId = req.user.staffId;
    }

    const result = await patientService.getPatients(query);

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
  deletePatient,
  searchPatients,
  getPatients,
  getPatient,
  getPatientRecord,
};

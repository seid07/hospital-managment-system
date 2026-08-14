const patientService = require("../services/patient.service");

async function createPatient(req, res) {
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      phone,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !dateOfBirth ||
      !gender ||
      !phone
    ) {
      return res.status(400).json({
        success: false,
        message:
          "First name, last name, date of birth, gender and phone are required.",
      });
    }

    const patient =
      await patientService.createPatient(
        req.body,
        req.user.userId
      );

    return res.status(201).json({
      success: true,
      data: patient,
    });
  } catch (error) {
    console.error("Create patient error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create patient.",
    });
  }
}

async function searchPatients(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message:
          "Search query must contain at least 2 characters.",
      });
    }

    const patients =
      await patientService.searchPatients(
        q.trim()
      );

    return res.status(200).json({
      success: true,
      data: patients,
    });
  } catch (error) {
    console.error("Search patients error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to search patients.",
    });
  }
}

async function getPatient(req, res) {
  try {
    const patient =
      await patientService.getPatientById(
        req.params.id
      );

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

module.exports = {
  createPatient,
  searchPatients,
  getPatient,
};

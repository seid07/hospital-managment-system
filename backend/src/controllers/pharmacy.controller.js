const pharmacyService = require("../services/pharmacy.service");
const { isValidUUID } = require("../validators");

async function createPrescription(req, res) {
  try {
    const { patientId, doctorId, medicationName, dosage, frequency, quantity } = req.body;

    if (!patientId || !doctorId || !medicationName || !dosage || !frequency) {
      return res.status(400).json({
        success: false,
        message: "patientId, doctorId, medicationName, dosage, and frequency are required.",
      });
    }

    if (!isValidUUID(patientId) || !isValidUUID(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid UUID format for patientId or doctorId.",
      });
    }

    const rx = await pharmacyService.createPrescription({
      ...req.body,
      createdBy: req.user?.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Prescription created successfully.",
      data: rx,
    });
  } catch (error) {
    console.error("Create prescription error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to create prescription.",
    });
  }
}

async function dispensePrescription(req, res) {
  try {
    const { id } = req.params;
    const { dispensedNotes } = req.body;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prescription ID format.",
      });
    }

    const rx = await pharmacyService.dispensePrescription(id, { dispensedNotes }, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Prescription dispensed successfully.",
      data: rx,
    });
  } catch (error) {
    console.error("Dispense prescription error:", error);
    if (error.message === "PRESCRIPTION_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Prescription not found.",
      });
    }
    if (error.message === "PRESCRIPTION_ALREADY_DISPENSED") {
      return res.status(400).json({
        success: false,
        message: "Prescription has already been dispensed.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to dispense prescription.",
    });
  }
}

async function getPrescriptionsQueue(req, res) {
  try {
    const result = await pharmacyService.getPrescriptionsQueue(req.query);

    return res.status(200).json({
      success: true,
      data: result.prescriptions,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get prescriptions queue error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve prescriptions queue.",
    });
  }
}

async function getMedications(req, res) {
  try {
    const result = await pharmacyService.getMedications(req.query);

    return res.status(200).json({
      success: true,
      data: result.medications,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get medications error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve medications catalog.",
    });
  }
}

async function addMedication(req, res) {
  try {
    const { name, code } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: "Medication name and code are required.",
      });
    }

    const med = await pharmacyService.addMedication(req.body, req.user?.userId);

    return res.status(201).json({
      success: true,
      message: "Medication added to catalog.",
      data: med,
    });
  } catch (error) {
    console.error("Add medication error:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A medication with this code already exists.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to add medication.",
    });
  }
}

async function updateStock(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid medication ID format.",
      });
    }

    const med = await pharmacyService.updateStock(id, req.body, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Medication stock updated successfully.",
      data: med,
    });
  } catch (error) {
    console.error("Update stock error:", error);
    if (error.message === "MEDICATION_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Medication not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to update medication stock.",
    });
  }
}

module.exports = {
  createPrescription,
  dispensePrescription,
  getPrescriptionsQueue,
  getMedications,
  addMedication,
  updateStock,
};

const pharmacyService = require("../services/pharmacy.service");
const { isValidUUID } = require("../validators");

async function createPrescription(req, res) {
  try {
    let { patientId, doctorId, medicationName, dosage, frequency, quantity, encounterId } = req.body;

    doctorId = doctorId || req.user?.staffId || req.user?.staff_id;

    if (!patientId && encounterId && isValidUUID(encounterId)) {
      const pool = require("../config/database");
      const enc = await pool.query("SELECT patient_id, doctor_id FROM encounters WHERE id = $1", [encounterId]);
      if (enc.rows.length > 0) {
        patientId = enc.rows[0].patient_id;
        if (!doctorId) doctorId = enc.rows[0].doctor_id;
      }
    }

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
      patientId,
      doctorId,
      createdBy: req.user?.id || req.user?.userId,
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

async function recordPharmacyPayment(req, res) {
  try {
    const { prescriptionId, amount, paymentMethod, transactionReference, notes } = req.body;
    if (!prescriptionId || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: "prescriptionId and amount are required.",
      });
    }

    const result = await pharmacyService.recordPharmacyPayment({
      prescriptionId,
      amount,
      paymentMethod,
      transactionReference,
      notes,
      receivedBy: req.user?.id || req.user?.userId,
    });

    return res.status(200).json({
      success: true,
      message: "Pharmacy payment recorded successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Record pharmacy payment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to record pharmacy payment.",
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

    const rx = await pharmacyService.dispensePrescription(
      id,
      { dispensedNotes },
      req.user?.id || req.user?.userId
    );

    return res.status(200).json({
      success: true,
      message: "Prescription dispensed successfully.",
      data: rx,
    });
  } catch (error) {
    console.error("Dispense prescription error:", error);
    if (error.message.startsWith("INSUFFICIENT_STOCK")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
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
      message: error.message || "Unable to dispense prescription.",
    });
  }
}

async function getPrescriptionsQueue(req, res) {
  try {
    const doctorId = req.user?.role === "DOCTOR" ? req.user?.staffId : null;
    const result = await pharmacyService.getPrescriptionsQueue({ ...req.query, doctorId });

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

    const med = await pharmacyService.addMedication(req.body, req.user?.id || req.user?.userId);

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

    const med = await pharmacyService.updateStock(id, req.body, req.user?.id || req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Medication stock and pricing updated successfully.",
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

async function getInventoryTransactions(req, res) {
  try {
    const result = await pharmacyService.getInventoryTransactions(req.query);
    return res.status(200).json({
      success: true,
      data: result.transactions,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get inventory transactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve inventory transactions.",
    });
  }
}

async function dispenseMultiplePrescriptions(req, res) {
  try {
    const { prescriptionIds, paymentMethod, transactionReference, dispensedNotes } = req.body;

    if (!Array.isArray(prescriptionIds) || prescriptionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "prescriptionIds array with at least one ID is required.",
      });
    }

    const dispensed = await pharmacyService.dispenseMultiplePrescriptions(
      { prescriptionIds, paymentMethod, transactionReference, dispensedNotes },
      req.user?.id || req.user?.userId
    );

    return res.status(200).json({
      success: true,
      message: `Successfully dispensed ${dispensed.length} medication(s).`,
      data: dispensed,
    });
  } catch (error) {
    console.error("Dispense multiple prescriptions error:", error);
    if (error.message.startsWith("INSUFFICIENT_STOCK")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to dispense medications.",
    });
  }
}

module.exports = {
  createPrescription,
  recordPharmacyPayment,
  dispensePrescription,
  dispenseMultiplePrescriptions,
  getPrescriptionsQueue,
  getMedications,
  addMedication,
  updateStock,
  getInventoryTransactions,
};

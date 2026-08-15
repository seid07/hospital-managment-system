const appointmentService = require("../services/appointment.service");

async function getAvailableSlots(req, res) {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({
        success: false,
        message: "doctorId and date are required.",
      });
    }

    const slots = await appointmentService.getAvailableSlots(doctorId, date);

    return res.status(200).json({
      success: true,
      data: slots,
    });
  } catch (error) {
    console.error("Get availability error:", error);

    if (error.message === "INVALID_DATE") {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve appointment availability.",
    });
  }
}

async function createAppointment(req, res) {
  try {
    const {
      patientId,
      doctorId,
      appointmentDate,
      startTime,
      endTime,
      reason,
      notes,
    } = req.body;

    if (!patientId || !doctorId || !appointmentDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Patient, doctor, date, start time and end time are required.",
      });
    }

    /*
     * Your authentication middleware uses req.user.userId.
     *
     * We confirmed this from patient.controller.js:
     *
     * req.user.userId
     *
     * Therefore we MUST use the same property here.
     */

    const createdBy = req.user.userId;

    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user identity is missing.",
      });
    }

    const appointment = await appointmentService.createAppointment({
      patientId,
      doctorId,
      appointmentDate,
      startTime,
      endTime,
      reason,
      notes,
      createdBy,
    });

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully.",
      data: appointment,
    });
  } catch (error) {
    console.error("Create appointment error:", error);

    if (error.message === "PATIENT_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Patient not found or inactive.",
      });
    }

    if (error.message === "DOCTOR_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Doctor not found or inactive.",
      });
    }

    if (error.message === "INVALID_DATE") {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date.",
      });
    }

    if (error.message === "PAST_DATE") {
      return res.status(400).json({
        success: false,
        message: "Appointments cannot be booked for a past date.",
      });
    }

    if (error.message === "INVALID_TIME") {
      return res.status(400).json({
        success: false,
        message: "Appointment start time must be before end time.",
      });
    }

    if (error.message === "OUTSIDE_DOCTOR_SCHEDULE") {
      return res.status(409).json({
        success: false,
        message: "The selected time is outside the doctor's working schedule.",
      });
    }

    /*
     * PostgreSQL exclusion constraint:
     *
     * prevent_doctor_double_booking
     *
     * SQLSTATE 23P01
     */
    if (error.code === "23P01") {
      return res.status(409).json({
        success: false,
        message: "This appointment slot has already been booked.",
      });
    }

    /*
     * Unique appointment number.
     */
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Appointment number already exists. Please try again.",
      });
    }

    /*
     * Foreign-key violation.
     */
    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "One of the selected records is invalid.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create appointment.",
    });
  }
}

module.exports = {
  getAvailableSlots,
  createAppointment,
};

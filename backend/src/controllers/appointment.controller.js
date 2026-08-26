const appointmentService = require("../services/appointment.service");
const { isValidUUID } = require("../validators");

async function getAvailableSlots(req, res) {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({
        success: false,
        message: "doctorId and date are required.",
      });
    }

    if (!isValidUUID(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid doctorId format.",
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

    if (!isValidUUID(patientId) || !isValidUUID(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient or doctor ID format.",
      });
    }

    const createdBy = req.user?.userId;

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

    if (error.code === "23P01") {
      return res.status(409).json({
        success: false,
        message: "This appointment slot has already been booked.",
      });
    }

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Appointment number already exists. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create appointment.",
    });
  }
}

async function getAppointments(req, res) {
  try {
    const query = { ...req.query };
    // If the authenticated user is a DOCTOR, strictly scope to their scheduled appointments
    if (req.user?.role === "DOCTOR" && req.user?.staffId) {
      query.doctorId = req.user.staffId;
    }

    const result = await appointmentService.getAppointments(query);

    return res.status(200).json({
      success: true,
      data: result.appointments,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get appointments error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve appointments list.",
    });
  }
}

async function getAppointment(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID format.",
      });
    }

    const appointment = await appointmentService.getAppointmentById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: appointment,
    });
  } catch (error) {
    console.error("Get appointment error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve appointment.",
    });
  }
}

async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID format.",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required.",
      });
    }

    const appointment = await appointmentService.updateAppointmentStatus(
      id,
      status,
      req.user?.userId,
      notes,
      req.user?.role
    );

    return res.status(200).json({
      success: true,
      message: `Appointment status updated to ${status}.`,
      data: appointment,
    });
  } catch (error) {
    console.error("Update appointment status error:", error);

    if (error.message.startsWith("INVALID_STATUS_TRANSITION")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "APPOINTMENT_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update appointment status.",
    });
  }
}

async function reschedule(req, res) {
  try {
    const { id } = req.params;
    const { appointmentDate, startTime, endTime, reason } = req.body;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID format.",
      });
    }

    if (!appointmentDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Appointment date, start time and end time are required.",
      });
    }

    const appointment = await appointmentService.rescheduleAppointment(
      id,
      { appointmentDate, startTime, endTime, reason },
      req.user?.userId
    );

    return res.status(200).json({
      success: true,
      message: "Appointment rescheduled successfully.",
      data: appointment,
    });
  } catch (error) {
    console.error("Reschedule appointment error:", error);

    if (error.message.startsWith("CANNOT_RESCHEDULE")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "OUTSIDE_DOCTOR_SCHEDULE") {
      return res.status(409).json({
        success: false,
        message: "The selected time is outside the doctor's working schedule.",
      });
    }

    if (error.code === "23P01") {
      return res.status(409).json({
        success: false,
        message: "This appointment slot has already been booked.",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to reschedule appointment.",
    });
  }
}

module.exports = {
  getAvailableSlots,
  createAppointment,
  getAppointments,
  getAppointment,
  updateStatus,
  reschedule,
};

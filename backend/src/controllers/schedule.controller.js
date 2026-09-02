const scheduleService = require("../services/schedule.service");

async function getDoctors(req, res) {
  try {
    const { date, specialty, allStaff } = req.query;
    const doctors = await scheduleService.getDoctors({
      date,
      specialty,
      allStaff: allStaff === "true" || allStaff === true,
    });

    res.json({
      success: true,
      data: doctors,
    });
  } catch (error) {
    console.error("Get doctors error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve doctors.",
    });
  }
}

async function getDoctorSchedules(req, res) {
  try {
    const schedules = await scheduleService.getDoctorSchedules(
      req.params.doctorId
    );

    res.json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    console.error("Get doctor schedules error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve doctor schedules.",
    });
  }
}

async function getDoctorUpcomingAvailability(req, res) {
  try {
    const { doctorId } = req.params;
    const daysAhead = parseInt(req.query.days || "14", 10);
    const data = await scheduleService.getDoctorUpcomingAvailability(
      doctorId,
      daysAhead
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error.message === "DOCTOR_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Doctor not found or inactive.",
      });
    }

    console.error("Get doctor upcoming availability error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve doctor availability.",
    });
  }
}

async function getDoctorAvailableDates(req, res) {
  try {
    const { doctorId } = req.params;
    const daysAhead = parseInt(req.query.days || "30", 10);
    const data = await scheduleService.getDoctorUpcomingAvailability(doctorId, daysAhead);
    // Filter to only dates that have at least one free slot
    const availableDates = (data.availableDates || []).filter((d) => d.hasAvailableSlots);
    res.json({ success: true, data: { doctor: data.doctor, availableDates } });
  } catch (error) {
    if (error.message === "DOCTOR_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Doctor not found or inactive." });
    }
    console.error("Get available dates error:", error);
    res.status(500).json({ success: false, message: "Unable to retrieve available dates." });
  }
}

async function createSchedule(req, res) {
  try {
    const { dayOfWeek, daysOfWeek, startTime, endTime, slotDurationMinutes } = req.body;

    if (dayOfWeek === undefined && (!daysOfWeek || daysOfWeek.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Day of week is required.",
      });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Start time and end time are required.",
      });
    }

    const schedule = await scheduleService.createSchedule(req.params.doctorId, {
      dayOfWeek,
      daysOfWeek,
      startTime,
      endTime,
      slotDurationMinutes,
    });

    res.status(201).json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    if (error.message === "DOCTOR_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Doctor not found.",
      });
    }

    if (error.message === "INVALID_TIME_RANGE") {
      return res.status(400).json({
        success: false,
        message: "Start time must be before end time.",
      });
    }

    if (error.code === "23P01") {
      return res.status(409).json({
        success: false,
        message: "This doctor already has an overlapping schedule for this day.",
      });
    }

    console.error("Create schedule error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create schedule.",
    });
  }
}

async function updateSchedule(req, res) {
  try {
    const { id } = req.params;
    const schedule = await scheduleService.updateSchedule(id, req.body);

    res.json({
      success: true,
      message: "Schedule updated successfully.",
      data: schedule,
    });
  } catch (error) {
    if (error.message === "SCHEDULE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Schedule not found.",
      });
    }

    if (error.message?.startsWith("INVALID_TIME_RANGE")) {
      return res.status(400).json({
        success: false,
        message: "Start time must be before end time.",
      });
    }

    console.error("Update schedule error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update schedule.",
    });
  }
}

async function deleteSchedule(req, res) {
  try {
    const schedule = await scheduleService.deleteSchedule(req.params.id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found.",
      });
    }

    res.json({
      success: true,
      message: "Schedule deleted.",
    });
  } catch (error) {
    console.error("Delete schedule error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete schedule.",
    });
  }
}

module.exports = {
  getDoctors,
  getDoctorSchedules,
  getDoctorUpcomingAvailability,
  getDoctorAvailableDates,
  createSchedule,
  updateSchedule,
  deleteSchedule,
};

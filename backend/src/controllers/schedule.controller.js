const scheduleService = require("../services/schedule.service");

async function getDoctors(req, res) {
  try {
    const { date, specialty } = req.query;
    const doctors = await scheduleService.getDoctors({ date, specialty });

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
    const requestedDoctorId = req.params.doctorId;

    // Doctor privacy enforcement: A doctor can only access their own schedule
    if (req.user?.role === "DOCTOR") {
      if (req.user?.staffId !== requestedDoctorId) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You are only authorized to view your own doctor schedule.",
        });
      }
    }

    const schedules = await scheduleService.getDoctorSchedules(requestedDoctorId);

    res.json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    console.error("Get schedules error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve schedules.",
    });
  }
}

async function getDoctorUpcomingAvailability(req, res) {
  try {
    const requestedDoctorId = req.params.doctorId;
    const daysAhead = parseInt(req.query.days || "14", 10);

    const data = await scheduleService.getDoctorUpcomingAvailability(requestedDoctorId, daysAhead);

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

    console.error("Get upcoming availability error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve doctor availability.",
    });
  }
}

async function createSchedule(req, res) {
  try {
    const { dayOfWeek, startTime, endTime, slotDurationMinutes } = req.body;

    if (dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Day, start time and end time are required.",
      });
    }

    const schedule = await scheduleService.createSchedule(req.params.doctorId, {
      dayOfWeek,
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
  createSchedule,
  deleteSchedule,
};

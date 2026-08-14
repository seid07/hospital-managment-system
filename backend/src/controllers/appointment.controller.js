const appointmentService =
  require("../services/appointment.service");

async function getAvailableSlots(req, res) {
  try {
    const {
      doctorId,
      date,
    } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({
        success: false,
        message:
          "doctorId and date are required.",
      });
    }

    const slots =
      await appointmentService.getAvailableSlots(
        doctorId,
        date
      );

    return res.json({
      success: true,
      data: slots,
    });
  } catch (error) {
    if (error.message === "INVALID_DATE") {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date.",
      });
    }

    console.error(
      "Availability error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve appointment availability.",
    });
  }
}

module.exports = {
  getAvailableSlots,
};

const reportService = require("../services/report.service");

async function getDashboardKPIs(req, res) {
  try {
    const role = req.user?.role;
    const staffId = req.user?.staffId;
    const userId = req.user?.userId;

    const kpis = await reportService.getDashboardKPIs(role, staffId, userId);

    return res.status(200).json({
      success: true,
      data: kpis,
    });
  } catch (error) {
    console.error("Get dashboard KPIs error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve dashboard metrics.",
    });
  }
}

async function getAnalyticsReport(req, res) {
  try {
    const { type = "APPOINTMENTS", startDate, endDate, doctorId } = req.query;

    const report = await reportService.getAnalyticsReport(type, {
      startDate,
      endDate,
      doctorId,
    });

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Get report error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to generate analytics report.",
    });
  }
}

module.exports = {
  getDashboardKPIs,
  getAnalyticsReport,
};

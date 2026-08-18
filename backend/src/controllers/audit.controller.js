const auditService = require("../services/audit.service");

async function getAuditLogs(req, res) {
  try {
    const result = await auditService.getAuditLogs(req.query);

    return res.status(200).json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve audit logs.",
    });
  }
}

module.exports = {
  getAuditLogs,
};

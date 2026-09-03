const procedureService = require("../services/procedure.service");

async function getProcedureMetrics(req, res, next) {
  try {
    const data = await procedureService.getProcedureMetrics();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getProcedureQueue(req, res, next) {
  try {
    const doctorId = req.user?.role === "DOCTOR" ? req.user?.staffId : null;
    const data = await procedureService.getProcedureQueue({ ...req.query, doctorId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function startProcedure(req, res, next) {
  try {
    const data = await procedureService.startProcedure(
      req.params.serviceOrderId,
      req.user.id
    );
    res.json({ success: true, data, message: "Procedure marked as in progress." });
  } catch (error) {
    next(error);
  }
}

async function completeProcedure(req, res, next) {
  try {
    const data = await procedureService.completeProcedure(
      req.params.serviceOrderId,
      req.body,
      req.user.id
    );
    res.json({ success: true, data, message: "Procedure completed and documented." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProcedureMetrics,
  getProcedureQueue,
  startProcedure,
  completeProcedure,
};

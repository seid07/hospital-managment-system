const procedureService = require("../services/procedure.service");

async function getProcedureQueue(req, res, next) {
  try {
    const data = await procedureService.getProcedureQueue(req.query);
    res.json({ success: true, data });
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
    res.json({ success: true, data, message: "Procedure marked as completed." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProcedureQueue,
  completeProcedure,
};

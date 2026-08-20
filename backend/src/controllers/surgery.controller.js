const surgeryService = require("../services/surgery.service");

async function getSurgeryQueue(req, res, next) {
  try {
    const data = await surgeryService.getSurgeryQueue(req.query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function updateSurgeryStatus(req, res, next) {
  try {
    const data = await surgeryService.updateSurgeryStatus(
      req.params.serviceOrderId,
      req.body,
      req.user.id
    );
    res.json({ success: true, data, message: "Surgery record updated." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSurgeryQueue,
  updateSurgeryStatus,
};

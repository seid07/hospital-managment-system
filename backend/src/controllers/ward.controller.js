const wardService = require("../services/ward.service");

async function getBeds(req, res, next) {
  try {
    const data = await wardService.getBeds();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getWardQueue(req, res, next) {
  try {
    const data = await wardService.getWardQueue(req.query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function admitPatient(req, res, next) {
  try {
    const data = await wardService.admitPatient(req.body, req.user.id);
    res.status(201).json({ success: true, data, message: "Patient admitted to ward." });
  } catch (error) {
    next(error);
  }
}

async function dischargePatient(req, res, next) {
  try {
    const data = await wardService.dischargePatient(req.params.id, req.body, req.user.id);
    res.json({ success: true, data, message: "Patient discharged from ward." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBeds,
  getWardQueue,
  admitPatient,
  dischargePatient,
};

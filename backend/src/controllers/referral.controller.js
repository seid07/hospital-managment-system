const referralService = require("../services/referral.service");

async function createReferral(req, res, next) {
  try {
    const referringDoctorId = req.user?.staffId || req.user?.staff_id;
    const userId = req.user?.userId || req.user?.id;
    const referral = await referralService.createReferral(
      { ...req.body, referringDoctorId },
      userId
    );
    res.status(201).json({ success: true, data: referral });
  } catch (err) {
    next(err);
  }
}

async function getReferralQueue(req, res, next) {
  try {
    const receivingDoctorId = req.user?.staffId || req.user?.staff_id;
    const queue = await referralService.getReferralQueue(receivingDoctorId);
    res.json({ success: true, data: queue });
  } catch (err) {
    next(err);
  }
}

async function getReferral(req, res, next) {
  try {
    const staffId = req.user?.staffId || req.user?.staff_id;
    const referral = await referralService.getReferralById(
      req.params.id,
      staffId,
      req.user?.role
    );
    res.json({ success: true, data: referral });
  } catch (err) {
    next(err);
  }
}

async function viewReferral(req, res, next) {
  try {
    const staffId = req.user?.staffId || req.user?.staff_id;
    const userId = req.user?.userId || req.user?.id;
    const referral = await referralService.openReferral(
      req.params.id,
      staffId,
      userId
    );
    res.json({ success: true, data: referral });
  } catch (err) {
    next(err);
  }
}

async function respondReferral(req, res, next) {
  try {
    const staffId = req.user?.staffId || req.user?.staff_id;
    const userId = req.user?.userId || req.user?.id;
    const referral = await referralService.respondToReferral(
      req.params.id,
      req.body,
      staffId,
      userId
    );
    res.json({ success: true, data: referral });
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const staffId = req.user?.staffId || req.user?.staff_id;
    const messages = await referralService.getReferralMessages(
      req.params.id,
      staffId,
      req.user?.role
    );
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const staffId = req.user?.staffId || req.user?.staff_id;
    const userId = req.user?.userId || req.user?.id;
    const msg = await referralService.sendReferralMessage(
      req.params.id,
      req.body.message,
      staffId,
      userId,
      req.user?.role
    );
    res.status(201).json({ success: true, data: msg });
  } catch (err) {
    next(err);
  }
}

async function getSentReferrals(req, res, next) {
  try {
    const referringDoctorId = req.user.staffId || req.user.staff_id;
    const referrals = await referralService.getSentReferrals(referringDoctorId);
    res.json({ success: true, data: referrals });
  } catch (err) {
    next(err);
  }
}

async function getPatientReferrals(req, res, next) {
  try {
    const referrals = await referralService.getPatientReferrals(req.params.patientId);
    res.json({ success: true, data: referrals });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReferral,
  getReferralQueue,
  getSentReferrals,
  getReferral,
  viewReferral,
  respondReferral,
  getMessages,
  sendMessage,
  getPatientReferrals,
};

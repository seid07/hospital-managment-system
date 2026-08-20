const serviceOrderService = require("../services/serviceOrder.service");

async function createServiceOrders(req, res, next) {
  try {
    const data = await serviceOrderService.createServiceOrders(req.body, req.user.id);
    res.status(201).json({ success: true, data, message: "Service orders created successfully." });
  } catch (error) {
    next(error);
  }
}

async function getServiceOrdersByVisit(req, res, next) {
  try {
    const data = await serviceOrderService.getServiceOrdersByVisit(req.params.visitId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getServiceOrderById(req, res, next) {
  try {
    const data = await serviceOrderService.getServiceOrderById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Service order not found." });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function authorizeServiceOrder(req, res, next) {
  try {
    const data = await serviceOrderService.authorizeServiceOrder(req.params.id, {
      userId: req.user.id,
      reason: req.body.reason,
      source: req.body.source || "ADMIN_OVERRIDE",
    });
    res.json({ success: true, data, message: "Service order authorized." });
  } catch (error) {
    next(error);
  }
}

async function cancelServiceOrder(req, res, next) {
  try {
    const data = await serviceOrderService.cancelServiceOrder(req.params.id, {
      userId: req.user.id,
      reason: req.body.reason,
    });
    res.json({ success: true, data, message: "Service order cancelled." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createServiceOrders,
  getServiceOrdersByVisit,
  getServiceOrderById,
  authorizeServiceOrder,
  cancelServiceOrder,
};

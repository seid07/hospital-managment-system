const serviceCatalog = require("../services/serviceCatalog.service");

async function getServices(req, res, next) {
  try {
    const { category, department, activeOnly } = req.query;
    const data = await serviceCatalog.getServices({
      category,
      departmentCode: department,
      activeOnly: activeOnly === "false" ? false : true,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getDepartments(req, res, next) {
  try {
    const data = await serviceCatalog.getDepartments();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getServiceById(req, res, next) {
  try {
    const data = await serviceCatalog.getServiceById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Service not found in catalog." });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function createService(req, res, next) {
  try {
    const data = await serviceCatalog.createService(req.body, req.user.id);
    res.status(201).json({ success: true, data, message: "Service created in catalog." });
  } catch (error) {
    next(error);
  }
}

async function updateService(req, res, next) {
  try {
    const data = await serviceCatalog.updateService(req.params.id, req.body, req.user.id);
    res.json({ success: true, data, message: "Service updated successfully." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getServices,
  getDepartments,
  getServiceById,
  createService,
  updateService,
};

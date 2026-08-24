const serviceCatalog = require("../services/serviceCatalog.service");

async function getServices(req, res) {
  try {
    const { category, department, activeOnly, search } = req.query;
    const services = await serviceCatalog.getServices({
      category,
      departmentCode: department,
      activeOnly: activeOnly === "true",
      search,
    });
    return res.json({ success: true, data: services });
  } catch (error) {
    console.error("Error fetching services:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function getDepartments(req, res) {
  try {
    const departments = await serviceCatalog.getDepartments();
    return res.json({ success: true, data: departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function getServiceById(req, res) {
  try {
    const service = await serviceCatalog.getServiceById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }
    return res.json({ success: true, data: service });
  } catch (error) {
    console.error("Error fetching service:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function createService(req, res) {
  try {
    const service = await serviceCatalog.createService(req.body, req.user?.id || req.user?.userId);
    return res.status(201).json({ success: true, data: service });
  } catch (error) {
    console.error("Error creating service:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function updateService(req, res) {
  try {
    const service = await serviceCatalog.updateService(req.params.id, req.body, req.user?.id || req.user?.userId);
    return res.json({ success: true, data: service });
  } catch (error) {
    console.error("Error updating service:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function getServicePriceHistory(req, res) {
  try {
    const history = await serviceCatalog.getServicePriceHistory(req.params.id);
    return res.json({ success: true, data: history });
  } catch (error) {
    console.error("Error fetching service price history:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getServices,
  getDepartments,
  getServiceById,
  createService,
  updateService,
  getServicePriceHistory,
};

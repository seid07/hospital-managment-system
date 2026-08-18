const laboratoryService = require("../services/laboratory.service");
const { isValidUUID } = require("../validators");

async function getTestCatalog(req, res) {
  try {
    const result = await laboratoryService.getTestCatalog(req.query);

    return res.status(200).json({
      success: true,
      data: result.catalog,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get lab catalog error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve laboratory test catalog.",
    });
  }
}

async function addCatalogTest(req, res) {
  try {
    const { code, name, category } = req.body;

    if (!code || !name || !category) {
      return res.status(400).json({
        success: false,
        message: "Code, name, and category are required.",
      });
    }

    const test = await laboratoryService.addCatalogTest(req.body, req.user?.userId);

    return res.status(201).json({
      success: true,
      message: "Laboratory test added to catalog.",
      data: test,
    });
  } catch (error) {
    console.error("Add lab test error:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A lab test with this code already exists.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to add lab test to catalog.",
    });
  }
}

async function createLabOrder(req, res) {
  try {
    const { patientId, doctorId, testId, clinicalIndication, priority } = req.body;

    if (!patientId || !doctorId || !testId) {
      return res.status(400).json({
        success: false,
        message: "patientId, doctorId, and testId are required.",
      });
    }

    if (!isValidUUID(patientId) || !isValidUUID(doctorId) || !isValidUUID(testId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid UUID format for patientId, doctorId, or testId.",
      });
    }

    const order = await laboratoryService.createLabOrder({
      ...req.body,
      createdBy: req.user?.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Laboratory test ordered successfully.",
      data: order,
    });
  } catch (error) {
    console.error("Create lab order error:", error);
    if (error.message === "LAB_TEST_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Selected lab test was not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to create laboratory order.",
    });
  }
}

async function collectSpecimen(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lab order ID format.",
      });
    }

    const order = await laboratoryService.collectSpecimen(id, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Specimen collected.",
      data: order,
    });
  } catch (error) {
    console.error("Collect specimen error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to update specimen status.",
    });
  }
}

async function enterResults(req, res) {
  try {
    const { id } = req.params;
    const { resultValue } = req.body;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lab order ID format.",
      });
    }

    if (!resultValue || !resultValue.trim()) {
      return res.status(400).json({
        success: false,
        message: "Result value is required.",
      });
    }

    const order = await laboratoryService.enterResults(id, req.body, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Laboratory result entered successfully.",
      data: order,
    });
  } catch (error) {
    console.error("Enter lab results error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to enter lab results.",
    });
  }
}

async function verifyResults(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lab order ID format.",
      });
    }

    const order = await laboratoryService.verifyResults(id, req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Laboratory results verified and released.",
      data: order,
    });
  } catch (error) {
    console.error("Verify lab results error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to verify lab results.",
    });
  }
}

async function getLabOrders(req, res) {
  try {
    const result = await laboratoryService.getLabOrdersQueue(req.query);

    return res.status(200).json({
      success: true,
      data: result.orders,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get lab orders error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve lab orders queue.",
    });
  }
}

async function getLabOrder(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lab order ID format.",
      });
    }

    const order = await laboratoryService.getLabOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Lab order not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Get lab order error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve lab order.",
    });
  }
}

module.exports = {
  getTestCatalog,
  addCatalogTest,
  createLabOrder,
  collectSpecimen,
  enterResults,
  verifyResults,
  getLabOrders,
  getLabOrder,
};

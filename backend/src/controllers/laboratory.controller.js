const labService = require("../services/laboratory.service");
const { isValidUUID } = require("../validators");

async function getCatalog(req, res) {
  try {
    const result = await labService.getTestCatalog(req.query);

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
      message: "Unable to retrieve laboratory catalog.",
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

    const test = await labService.addCatalogTest(req.body, req.user?.id || req.user?.userId);

    return res.status(201).json({
      success: true,
      message: "Laboratory test added to catalog.",
      data: test,
    });
  } catch (error) {
    console.error("Add lab catalog test error:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A test with this code already exists.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to add laboratory test.",
    });
  }
}

async function linkCatalogTestService(req, res) {
  try {
    const { id } = req.params;
    const { serviceId } = req.body;

    if (!isValidUUID(id) || !serviceId || !isValidUUID(serviceId)) {
      return res.status(400).json({
        success: false,
        message: "A valid lab test ID and serviceId are required.",
      });
    }

    const test = await labService.linkCatalogTestService(id, serviceId, req.user?.id || req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Laboratory test linked to billable service.",
      data: test,
    });
  } catch (error) {
    console.error("Link lab catalog test error:", error);
    if (error.message === "SERVICE_NOT_FOUND" || error.message === "LAB_TEST_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: error.message === "SERVICE_NOT_FOUND" ? "Billable service not found." : "Laboratory test not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to link laboratory test to a billable service.",
    });
  }
}

async function createLabOrder(req, res) {
  try {
    const { patientId, doctorId, testId } = req.body;

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

    const order = await labService.createLabOrder({
      ...req.body,
      createdBy: req.user?.id || req.user?.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Laboratory order created successfully.",
      data: order,
    });
  } catch (error) {
    console.error("Create lab order error:", error);
    if (error.message?.startsWith("LAB_TEST_NOT_LINKED_TO_BILLABLE_SERVICE")) {
      return res.status(409).json({
        success: false,
        message: error.message.replace("LAB_TEST_NOT_LINKED_TO_BILLABLE_SERVICE: ", ""),
      });
    }
    if (error.message === "LAB_TEST_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Laboratory test not found in the catalog.",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to create laboratory order.",
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

    const order = await labService.collectSpecimen(id, req.user?.id || req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Specimen collection recorded successfully.",
      data: order,
    });
  } catch (error) {
    console.error("Collect specimen error:", error);
    if (error.message === "ORDER_NOT_FOUND_OR_INVALID_STATUS") {
      return res.status(400).json({
        success: false,
        message: "Order not found or specimen already collected.",
      });
    }
    if (error.message?.startsWith("PAYMENT_REQUIRED")) {
      return res.status(402).json({
        success: false,
        message: error.message.replace("PAYMENT_REQUIRED: ", ""),
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to record specimen collection.",
    });
  }
}

async function startProcessing(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lab order ID format.",
      });
    }

    const order = await labService.startProcessing(id, req.user?.id || req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Processing started recorded.",
      data: order,
    });
  } catch (error) {
    console.error("Start processing error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to start processing.",
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

    if (!resultValue || typeof resultValue !== "string" || !resultValue.trim()) {
      return res.status(400).json({
        success: false,
        message: "A non-empty resultValue string is required.",
      });
    }

    const order = await labService.enterResults(id, req.body, req.user?.id || req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Laboratory results entered and turnaround time calculated successfully.",
      data: order,
    });
  } catch (error) {
    console.error("Enter lab results error:", error);
    if (error.message === "LAB_ORDER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Laboratory order not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to record laboratory results.",
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

    const order = await labService.verifyResults(id, req.user?.id || req.user?.userId);

    return res.status(200).json({
      success: true,
      message: "Laboratory results verified and released successfully.",
      data: order,
    });
  } catch (error) {
    console.error("Verify lab results error:", error);
    if (error.message.startsWith("ORDER_NOT_RESULTED")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message === "LAB_ORDER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Laboratory order not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to verify laboratory results.",
    });
  }
}

async function getOrdersQueue(req, res) {
  try {
    const doctorId = req.user?.role === "DOCTOR" ? req.user?.staffId : null;
    const result = await labService.getLabOrdersQueue({ ...req.query, doctorId });

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
    console.error("Get lab orders queue error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve laboratory orders queue.",
    });
  }
}

async function getOrderById(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lab order ID format.",
      });
    }

    const order = await labService.getLabOrderById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Laboratory order not found.",
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
      message: "Unable to retrieve laboratory order.",
    });
  }
}

module.exports = {
  getCatalog,
  addCatalogTest,
  linkCatalogTestService,
  createLabOrder,
  collectSpecimen,
  startProcessing,
  enterResults,
  verifyResults,
  getOrdersQueue,
  getOrderById,
};

const billingService = require("../services/billing.service");
const { isValidUUID } = require("../validators");

async function getServices(req, res) {
  try {
    const result = await billingService.getBillableServices(req.query);

    return res.status(200).json({
      success: true,
      data: result.services,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get services error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve billable services.",
    });
  }
}

async function addService(req, res) {
  try {
    const { code, name, category, standardFee } = req.body;

    if (!code || !name || !category || standardFee === undefined) {
      return res.status(400).json({
        success: false,
        message: "Code, name, category, and standardFee are required.",
      });
    }

    const service = await billingService.addBillableService(req.body, req.user?.id || req.user?.userId);

    return res.status(201).json({
      success: true,
      message: "Billable service added to chargemaster.",
      data: service,
    });
  } catch (error) {
    console.error("Add service error:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A service with this code already exists.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to add billable service.",
    });
  }
}

async function createInvoice(req, res) {
  try {
    const { patientId, items } = req.body;

    if (!patientId || !isValidUUID(patientId)) {
      return res.status(400).json({
        success: false,
        message: "A valid patientId is required.",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invoice must contain at least one line item.",
      });
    }

    const invoice = await billingService.createInvoice({
      ...req.body,
      createdBy: req.user?.id || req.user?.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Invoice generated successfully.",
      data: invoice,
    });
  } catch (error) {
    console.error("Create invoice error:", error);
    if (error.message.startsWith("INVOICE_ITEMS_REQUIRED")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to create invoice.",
    });
  }
}

async function recordPayment(req, res) {
  try {
    const { invoiceId, amount, paymentMethod } = req.body;

    if (!invoiceId || !isValidUUID(invoiceId)) {
      return res.status(400).json({
        success: false,
        message: "A valid invoiceId is required.",
      });
    }

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than zero.",
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Payment method is required.",
      });
    }

    const result = await billingService.recordPayment({
      ...req.body,
      receivedBy: req.user?.id || req.user?.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Record payment error:", error);
    if (
      error.message.startsWith("PAYMENT_EXCEEDS_BALANCE") ||
      error.message.startsWith("INVOICE_ALREADY_PAID") ||
      error.message.startsWith("INVALID_PAYMENT_AMOUNT")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message === "INVOICE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to record payment.",
    });
  }
}

async function recordSelectivePayment(req, res) {
  try {
    const { serviceOrderIds, paymentMethod } = req.body;

    if (!serviceOrderIds || !Array.isArray(serviceOrderIds) || serviceOrderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one service order to pay.",
      });
    }

    const result = await billingService.recordSelectivePayment({
      ...req.body,
      receivedBy: req.user?.id || req.user?.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Selective payment processed and services authorized successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Record selective payment error:", error);
    if (
      error.message.startsWith("NO_SERVICES_SELECTED") ||
      error.message.startsWith("INVALID_SERVICE_SELECTION") ||
      error.message.startsWith("PHARMACY_SERVICE_DISALLOWED") ||
      error.message.startsWith("SERVICE_ALREADY_PAID") ||
      error.message.startsWith("INVALID_TOTAL_AMOUNT")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to process selective payment.",
    });
  }
}

async function getInvoices(req, res) {
  try {
    const result = await billingService.getInvoices(req.query);

    return res.status(200).json({
      success: true,
      data: result.invoices,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get invoices error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve invoices.",
    });
  }
}

async function getInvoice(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID format.",
      });
    }

    const invoice = await billingService.getInvoiceById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error("Get invoice error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve invoice.",
    });
  }
}

async function getPendingCashierOrders(req, res) {
  try {
    const orders = await billingService.getPendingCashierOrders(req.query);
    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error("Get pending cashier orders error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve pending cashier orders.",
    });
  }
}

async function reversePayment(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID format.",
      });
    }

    const result = await billingService.reversePayment(id, { reason }, req.user?.id || req.user?.userId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Reverse payment error:", error);
    if (error.message.startsWith("REVERSAL_REASON_REQUIRED")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message === "PAYMENT_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Payment record not found.",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to reverse payment.",
    });
  }
}

async function getPendingCashierOrdersGrouped(req, res) {
  try {
    const patients = await billingService.getPendingCashierOrdersGrouped(req.query);
    return res.status(200).json({
      success: true,
      data: patients,
    });
  } catch (error) {
    console.error("Get grouped cashier orders error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve grouped cashier orders.",
    });
  }
}

async function getFullTransactionHistory(req, res) {
  try {
    const result = await billingService.getFullTransactionHistory(req.query);
    return res.status(200).json({
      success: true,
      data: result.transactions,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get full transaction history error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve full transaction history.",
    });
  }
}

module.exports = {
  getServices,
  addService,
  createInvoice,
  recordPayment,
  recordSelectivePayment,
  getInvoices,
  getInvoice,
  getPendingCashierOrders,
  getPendingCashierOrdersGrouped,
  getFullTransactionHistory,
  reversePayment,
};


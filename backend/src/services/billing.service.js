const pool = require("../config/database");
const { generateInvoiceNumber, generatePaymentNumber } = require("../utils/number-generators");
const { recordAuditLog } = require("../utils/audit");
const { parsePagination } = require("../validators");

async function getBillableServices(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? query.search.trim() : null;
  const category = query.category || null;

  const conditions = ["is_active = TRUE"];
  const params = [];

  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query(`SELECT COUNT(*) AS total FROM billable_services ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listResult = await pool.query(
    `
    SELECT *
    FROM billable_services
    ${whereClause}
    ORDER BY category ASC, name ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    services: listResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function addBillableService(data, userId) {
  const result = await pool.query(
    `
    INSERT INTO billable_services (
      code,
      name,
      category,
      standard_fee,
      is_active
    )
    VALUES ($1, $2, $3, $4, TRUE)
    RETURNING *
    `,
    [
      data.code.trim().toUpperCase(),
      data.name.trim(),
      data.category.trim(),
      parseFloat(data.standardFee) || 0,
    ]
  );

  const service = result.rows[0];

  await recordAuditLog(pool, {
    userId,
    action: "BILLABLE_SERVICE_ADDED",
    entity: "billable_services",
    entityId: service.id,
    details: { code: service.code, name: service.name },
  });

  return service;
}

async function createInvoice({
  patientId,
  encounterId,
  items = [],
  discountAmount = 0,
  taxAmount = 0,
  dueDate,
  notes,
  createdBy,
}) {
  if (!items || items.length === 0) {
    throw new Error("INVOICE_ITEMS_REQUIRED: An invoice must contain at least one line item.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const patientCheck = await client.query(
      "SELECT id, patient_number FROM patients WHERE id = $1 AND is_active = TRUE",
      [patientId]
    );
    if (patientCheck.rows.length === 0) {
      throw new Error("PATIENT_NOT_FOUND");
    }

    // 1. Calculate line item totals on the server
    let subtotal = 0;
    const sanitizedItems = items.map((item) => {
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      const unitPrice = Math.max(0, parseFloat(item.unitPrice) || 0);
      const totalPrice = parseFloat((quantity * unitPrice).toFixed(2));
      subtotal += totalPrice;

      return {
        itemType: item.itemType || "SERVICE",
        referenceId: item.referenceId || null,
        description: item.description ? item.description.trim() : "Service charge",
        unitPrice,
        quantity,
        totalPrice,
      };
    });

    subtotal = parseFloat(subtotal.toFixed(2));
    const discount = Math.max(0, parseFloat(discountAmount) || 0);
    const tax = Math.max(0, parseFloat(taxAmount) || 0);
    const grandTotal = parseFloat(Math.max(0, subtotal - discount + tax).toFixed(2));

    const invoiceNumber = await generateInvoiceNumber(client);

    const invoiceRes = await client.query(
      `
      INSERT INTO invoices (
        invoice_number,
        patient_id,
        encounter_id,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        paid_amount,
        balance_amount,
        status,
        due_date,
        notes,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $7, 'PENDING', $8, $9, $10)
      RETURNING *
      `,
      [
        invoiceNumber,
        patientId,
        encounterId || null,
        subtotal,
        discount,
        tax,
        grandTotal,
        dueDate || null,
        notes || null,
        createdBy || null,
      ]
    );

    const invoice = invoiceRes.rows[0];

    // 2. Insert line items
    const savedItems = [];
    for (const item of sanitizedItems) {
      const itemRes = await client.query(
        `
        INSERT INTO invoice_items (
          invoice_id,
          item_type,
          reference_id,
          description,
          unit_price,
          quantity,
          total_price
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
          invoice.id,
          item.itemType,
          item.referenceId,
          item.description,
          item.unitPrice,
          item.quantity,
          item.totalPrice,
        ]
      );
      savedItems.push(itemRes.rows[0]);
    }

    await recordAuditLog(client, {
      userId: createdBy,
      action: "INVOICE_CREATED",
      entity: "invoices",
      entityId: invoice.id,
      details: {
        invoiceNumber,
        totalAmount: grandTotal,
        itemsCount: savedItems.length,
      },
    });

    await client.query("COMMIT");

    return {
      ...invoice,
      items: savedItems,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function recordPayment({
  invoiceId,
  amount,
  paymentMethod,
  transactionReference,
  notes,
  receivedBy,
}) {
  const payAmount = parseFloat(amount);
  if (Number.isNaN(payAmount) || payAmount <= 0) {
    throw new Error("INVALID_PAYMENT_AMOUNT: Payment amount must be greater than zero.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceRes = await client.query(
      "SELECT * FROM invoices WHERE id = $1 FOR UPDATE",
      [invoiceId]
    );

    if (invoiceRes.rows.length === 0) {
      throw new Error("INVOICE_NOT_FOUND");
    }

    const invoice = invoiceRes.rows[0];

    if (invoice.status === "PAID") {
      throw new Error("INVOICE_ALREADY_PAID: This invoice is already fully paid.");
    }

    const currentBalance = parseFloat(invoice.balance_amount);
    if (payAmount > currentBalance + 0.001) {
      throw new Error(
        `PAYMENT_EXCEEDS_BALANCE: Payment amount ($${payAmount}) cannot exceed outstanding balance ($${currentBalance}).`
      );
    }

    const newPaid = parseFloat((parseFloat(invoice.paid_amount) + payAmount).toFixed(2));
    const newBalance = parseFloat(Math.max(0, parseFloat(invoice.total_amount) - newPaid).toFixed(2));
    const newStatus = newBalance === 0 ? "PAID" : "PARTIALLY_PAID";

    // 1. Generate payment number and insert payment
    const paymentNumber = await generatePaymentNumber(client);

    const paymentRes = await client.query(
      `
      INSERT INTO payments (
        payment_number,
        invoice_id,
        patient_id,
        amount,
        payment_method,
        transaction_reference,
        notes,
        received_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        paymentNumber,
        invoiceId,
        invoice.patient_id,
        payAmount,
        paymentMethod || "CASH",
        transactionReference || null,
        notes || null,
        receivedBy,
      ]
    );

    const payment = paymentRes.rows[0];

    // 2. Update invoice status and amounts
    const updateInvoiceRes = await client.query(
      `
      UPDATE invoices
      SET
        paid_amount = $1,
        balance_amount = $2,
        status = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
      `,
      [newPaid, newBalance, newStatus, invoiceId]
    );

    await recordAuditLog(client, {
      userId: receivedBy,
      action: "PAYMENT_RECORDED",
      entity: "payments",
      entityId: payment.id,
      details: {
        paymentNumber,
        invoiceNumber: invoice.invoice_number,
        amount: payAmount,
        newBalance,
        newStatus,
      },
    });

    await client.query("COMMIT");

    return {
      payment,
      invoice: updateInvoiceRes.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getInvoices(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const status = query.status || null;
  const search = query.search ? query.search.trim() : null;
  const patientId = query.patientId || null;

  const conditions = [];
  const params = [];

  if (status && status !== "ALL") {
    params.push(status);
    conditions.push(`i.status = $${params.length}`);
  }

  if (patientId) {
    params.push(patientId);
    conditions.push(`i.patient_id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(
      i.invoice_number ILIKE $${params.length}
      OR p.first_name ILIKE $${params.length}
      OR p.last_name ILIKE $${params.length}
      OR p.patient_number ILIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM invoices i
    JOIN patients p ON i.patient_id = p.id
    ${whereClause}
    `,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listQuery = `
    SELECT
      i.*,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.phone AS patient_phone,
      p.email AS patient_email,
      u.username AS created_by_username
    FROM invoices i
    JOIN patients p ON i.patient_id = p.id
    LEFT JOIN users u ON i.created_by = u.id
    ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(listQuery, params);

  return {
    invoices: result.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function getInvoiceById(id) {
  const invoiceRes = await pool.query(
    `
    SELECT
      i.*,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.phone AS patient_phone,
      p.email AS patient_email,
      p.address AS patient_address,
      u.username AS created_by_username
    FROM invoices i
    JOIN patients p ON i.patient_id = p.id
    LEFT JOIN users u ON i.created_by = u.id
    WHERE i.id = $1
    `,
    [id]
  );

  if (invoiceRes.rows.length === 0) {
    return null;
  }

  const invoice = invoiceRes.rows[0];

  const itemsRes = await pool.query(
    "SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC",
    [id]
  );

  const paymentsRes = await pool.query(
    `
    SELECT
      p.*,
      u.username AS received_by_username
    FROM payments p
    LEFT JOIN users u ON p.received_by = u.id
    WHERE p.invoice_id = $1
    ORDER BY p.created_at DESC
    `,
    [id]
  );

  return {
    ...invoice,
    items: itemsRes.rows,
    payments: paymentsRes.rows,
  };
}

module.exports = {
  getBillableServices,
  addBillableService,
  createInvoice,
  recordPayment,
  getInvoices,
  getInvoiceById,
};

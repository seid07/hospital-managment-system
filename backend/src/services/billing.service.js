const pool = require("../config/database");
const { generateInvoiceNumber, generatePaymentNumber } = require("../utils/number-generators");
const { recordAuditLog } = require("../utils/audit");
const { parsePagination } = require("../validators");
const { generateQueueNumber } = require("./serviceOrder.service");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveValidUserId(clientOrPool, userId) {
  if (!userId || typeof userId !== "string" || !UUID_REGEX.test(userId)) return null;
  try {
    const res = await clientOrPool.query("SELECT id FROM users WHERE id = $1 LIMIT 1", [userId]);
    return res.rows.length > 0 ? res.rows[0].id : null;
  } catch {
    return null;
  }
}

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

  const countResult = await pool.query(`SELECT COUNT(*) AS total FROM services ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listResult = await pool.query(
    `
    SELECT *
    FROM services
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
    INSERT INTO services (
      code,
      name,
      category,
      department_id,
      price,
      currency,
      is_active
    )
    VALUES (
      $1, $2, $3,
      (SELECT id FROM departments WHERE code = 'CLINICAL' LIMIT 1),
      $4, 'ETB', TRUE
    )
    RETURNING *
    `,
    [
      data.code.trim().toUpperCase(),
      data.name.trim(),
      data.category.trim(),
      parseFloat(data.standardFee || data.price) || 0,
    ]
  );

  const service = result.rows[0];

  await recordAuditLog(pool, {
    userId,
    action: "BILLABLE_SERVICE_ADDED",
    entity: "services",
    entityId: service.id,
    details: { code: service.code, name: service.name },
  });

  return service;
}

async function createInvoice({
  patientId,
  visitId,
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
        visit_id,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $8, 'PENDING', $9, $10, $11)
      RETURNING *
      `,
      [
        invoiceNumber,
        patientId,
        visitId || null,
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

      // If item references a service order, associate with invoice
      if (item.referenceId) {
        await client.query(
          `UPDATE service_orders SET invoice_id = $1 WHERE id = $2`,
          [invoice.id, item.referenceId]
        );
      }
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

/**
 * Requirement 5 & 6: Selective / Partial Payment Processing
 * - Server is the sole authority for amounts, calculated from database so.price
 * - Authorizes only selected service orders
 * - Leaves unselected service orders as WAITING_PAYMENT
 * - Enqueues only paid services into department queues
 * - Updates invoice status to PARTIALLY_PAID or PAID
 */
async function recordSelectivePayment({
  patientId,
  visitId,
  invoiceId,
  serviceOrderIds = [],
  paymentMethod = "CASH",
  transactionReference,
  notes,
  receivedBy,
}) {
  if (!serviceOrderIds || !Array.isArray(serviceOrderIds) || serviceOrderIds.length === 0) {
    throw new Error("NO_SERVICES_SELECTED: Please select at least one service to pay.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Lock and fetch selected service orders
    const ordersRes = await client.query(
      `
      SELECT
        so.*,
        s.name AS service_name,
        s.code AS service_code,
        s.queue_enabled,
        s.payment_location,
        d.code AS department_code,
        d.name AS department_name
      FROM service_orders so
      JOIN services s ON so.service_id = s.id
      JOIN departments d ON so.department_id = d.id
      WHERE so.id = ANY($1::uuid[])
      FOR UPDATE
      `,
      [serviceOrderIds]
    );

    if (ordersRes.rows.length !== serviceOrderIds.length) {
      throw new Error("INVALID_SERVICE_SELECTION: Some selected services could not be found.");
    }

    // Verify all selected services are payable at cashier and unpaid
    let calculatedTotal = 0;
    for (const order of ordersRes.rows) {
      if (order.payment_location === "PHARMACY") {
        throw new Error(`PHARMACY_SERVICE_DISALLOWED: Service "${order.service_name}" must be paid at the Pharmacy cashier.`);
      }
      if (order.status === "PAID" || order.status === "COMPLETED") {
        throw new Error(`SERVICE_ALREADY_PAID: Service "${order.service_name}" (${order.order_number}) is already paid.`);
      }
      calculatedTotal += parseFloat(order.price);
    }

    calculatedTotal = parseFloat(calculatedTotal.toFixed(2));
    if (calculatedTotal <= 0) {
      throw new Error("INVALID_TOTAL_AMOUNT: Selected services total must be greater than zero.");
    }

    const effectivePatientId = patientId || ordersRes.rows[0].patient_id;
    const effectiveVisitId = visitId || ordersRes.rows[0].visit_id;
    const effectiveInvoiceId = invoiceId || ordersRes.rows[0].invoice_id;

    // Validate receivedBy to prevent foreign key violations (payments_received_by_fkey)
    const validReceivedBy = await resolveValidUserId(client, receivedBy);

    // 2. Generate payment record
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
      RETURNING *;
      `,
      [
        paymentNumber,
        effectiveInvoiceId || null,
        effectivePatientId,
        calculatedTotal,
        paymentMethod || "CASH",
        transactionReference || null,
        notes || `Selective service payment for ${ordersRes.rows.length} item(s)`,
        validReceivedBy,
      ]
    );

    const payment = paymentRes.rows[0];
    const authorizedOrders = [];
    const authorizedAt = new Date();

    // 3. Authorize each selected service order and enqueue into department queue
    for (const order of ordersRes.rows) {
      const orderPrice = parseFloat(order.price);

      await client.query(
        `
        UPDATE service_orders
        SET
          status = 'PAID',
          paid_amount = $1,
          authorized_at = $2,
          authorized_by = $3,
          authorization_source = 'PAYMENT',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        `,
        [orderPrice, authorizedAt, validReceivedBy, order.id]
      );

      // Record allocation
      await client.query(
        `
        INSERT INTO payment_allocations (payment_id, service_order_id, invoice_id, amount)
        VALUES ($1, $2, $3, $4)
        `,
        [payment.id, order.id, order.invoice_id || effectiveInvoiceId || null, orderPrice]
      );

      // Enqueue to department queue if queue_enabled
      if (order.queue_enabled) {
        const existingQ = await client.query(
          `SELECT id FROM queue_entries WHERE service_order_id = $1`,
          [order.id]
        );

        if (existingQ.rowCount === 0) {
          const queueNumber = await generateQueueNumber(client, order.department_code);
          await client.query(
            `
            INSERT INTO queue_entries (
              department_id, service_order_id, visit_id, patient_id,
              queue_number, priority, status, authorized_at, queued_at
            )
            VALUES ($1, $2, $3, $4, $5, 'NORMAL', 'WAITING', $6, CURRENT_TIMESTAMP)
            `,
            [
              order.department_id,
              order.id,
              order.visit_id,
              order.patient_id,
              queueNumber,
              authorizedAt,
            ]
          );
        }
      }

      authorizedOrders.push({
        id: order.id,
        orderNumber: order.order_number,
        serviceName: order.service_name,
        price: orderPrice,
        status: "PAID",
      });
    }

    // 4. Update associated invoice if present
    let updatedInvoice = null;
    if (effectiveInvoiceId) {
      const invRes = await client.query(
        `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
        [effectiveInvoiceId]
      );

      if (invRes.rows.length > 0) {
        const inv = invRes.rows[0];
        const newPaid = parseFloat((parseFloat(inv.paid_amount) + calculatedTotal).toFixed(2));
        const newBalance = parseFloat(Math.max(0, parseFloat(inv.total_amount) - newPaid).toFixed(2));
        const newStatus = newBalance === 0 ? "PAID" : "PARTIALLY_PAID";

        const updateInvRes = await client.query(
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
          [newPaid, newBalance, newStatus, effectiveInvoiceId]
        );
        updatedInvoice = updateInvRes.rows[0];
      }
    }

    await recordAuditLog(client, {
      userId: receivedBy,
      action: "SELECTIVE_PAYMENT_RECORDED",
      entity: "payments",
      entityId: payment.id,
      details: {
        paymentNumber,
        selectedCount: serviceOrderIds.length,
        totalAmount: calculatedTotal,
        paymentMethod,
        authorizedOrders: authorizedOrders.map((o) => o.orderNumber),
      },
    });

    await client.query("COMMIT");

    return {
      payment,
      invoice: updatedInvoice,
      authorizedOrders,
      totalAmountPaid: calculatedTotal,
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
        `PAYMENT_EXCEEDS_BALANCE: Payment amount (${payAmount}) cannot exceed outstanding balance (${currentBalance}).`
      );
    }

    const newPaid = parseFloat((parseFloat(invoice.paid_amount) + payAmount).toFixed(2));
    const newBalance = parseFloat(Math.max(0, parseFloat(invoice.total_amount) - newPaid).toFixed(2));
    const newStatus = newBalance === 0 ? "PAID" : "PARTIALLY_PAID";

    // Validate receivedBy to prevent foreign key violations (payments_received_by_fkey)
    const validReceivedBy = await resolveValidUserId(client, receivedBy);

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
        validReceivedBy,
      ]
    );

    const payment = paymentRes.rows[0];

    const ordersRes = await client.query(
      `
      SELECT so.*, s.queue_enabled, s.name AS service_name, d.code AS department_code
      FROM service_orders so
      JOIN services s ON so.service_id = s.id
      JOIN departments d ON so.department_id = d.id
      WHERE so.invoice_id = $1 OR so.id IN (
        SELECT reference_id FROM invoice_items WHERE invoice_id = $1 AND reference_id IS NOT NULL
      )
      `,
      [invoiceId]
    );

    const authorizedOrders = [];
    const authorizedAt = new Date();

    for (const order of ordersRes.rows) {
      if (order.status === "WAITING_PAYMENT" || order.status === "ORDERED") {
        await client.query(
          `
          UPDATE service_orders
          SET
            status = 'PAID',
            paid_amount = $1,
            authorized_at = $2,
            authorized_by = $3,
            authorization_source = 'PAYMENT',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          `,
          [order.price, authorizedAt, validReceivedBy, order.id]
        );

        await client.query(
          `
          INSERT INTO payment_allocations (payment_id, service_order_id, invoice_id, amount)
          VALUES ($1, $2, $3, $4)
          `,
          [payment.id, order.id, invoiceId, order.price]
        );

        if (order.queue_enabled) {
          const existingQ = await client.query(
            `SELECT id FROM queue_entries WHERE service_order_id = $1`,
            [order.id]
          );

          if (existingQ.rowCount === 0) {
            const queueNumber = await generateQueueNumber(client, order.department_code);
            await client.query(
              `
              INSERT INTO queue_entries (
                department_id, service_order_id, visit_id, patient_id,
                queue_number, priority, status, authorized_at, queued_at
              )
              VALUES ($1, $2, $3, $4, $5, 'NORMAL', 'WAITING', $6, CURRENT_TIMESTAMP)
              `,
              [
                order.department_id,
                order.id,
                order.visit_id,
                order.patient_id,
                queueNumber,
                authorizedAt,
              ]
            );
          }
        }

        authorizedOrders.push(order.id);
      }
    }

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
        authorizedOrdersCount: authorizedOrders.length,
      },
    });

    await client.query("COMMIT");

    return {
      payment,
      invoice: updateInvoiceRes.rows[0],
      authorizedOrders,
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

  const conditions = ["p.is_active = TRUE"];
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
    `
    SELECT
      ii.*,
      so.status AS service_order_status,
      so.order_number AS service_order_number
    FROM invoice_items ii
    LEFT JOIN service_orders so ON ii.reference_id = so.id
    WHERE ii.invoice_id = $1
    ORDER BY ii.created_at ASC
    `,
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

async function getPendingCashierOrders(query = {}) {
  const { search, patientId } = query;
  let sql = `
    SELECT
      so.id AS service_order_id,
      so.order_number,
      so.price,
      so.status AS payment_status,
      so.clinical_notes,
      so.created_at,
      so.visit_id,
      s.name AS service_name,
      s.code AS service_code,
      s.category AS service_category,
      d.name AS department_name,
      d.code AS department_code,
      p.id AS patient_id,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.phone AS patient_phone,
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name,
      so.invoice_id
    FROM service_orders so
    JOIN services s ON so.service_id = s.id
    JOIN departments d ON so.department_id = d.id
    JOIN patients p ON so.patient_id = p.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    WHERE so.status = 'WAITING_PAYMENT'
      AND s.payment_location != 'PHARMACY'
      AND p.is_active = TRUE
  `;
  const params = [];

  if (patientId) {
    params.push(patientId);
    sql += ` AND so.patient_id = $${params.length}`;
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    sql += ` AND (p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length} OR p.patient_number ILIKE $${params.length} OR so.order_number ILIKE $${params.length})`;
  }

  sql += ` ORDER BY so.created_at ASC`;
  const res = await pool.query(sql, params);
  return res.rows;
}

/**
 * Requirement 22: Payment Reversal Workflow
 */
async function reversePayment(paymentId, { reason }, userId) {
  if (!reason || !reason.trim()) {
    throw new Error("REVERSAL_REASON_REQUIRED: A valid justification reason is required to reverse a payment.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentRes = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    );

    if (paymentRes.rows.length === 0) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    const payment = paymentRes.rows[0];

    // Find all allocations for this payment
    const allocsRes = await client.query(
      `SELECT * FROM payment_allocations WHERE payment_id = $1`,
      [paymentId]
    );

    // Rollback service orders to WAITING_PAYMENT and cancel queue entries if not completed
    for (const alloc of allocsRes.rows) {
      await client.query(
        `
        UPDATE service_orders
        SET
          status = 'WAITING_PAYMENT',
          paid_amount = 0.00,
          authorized_at = NULL,
          authorization_source = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status != 'COMPLETED'
        `,
        [alloc.service_order_id]
      );

      await client.query(
        `
        DELETE FROM queue_entries
        WHERE service_order_id = $1 AND status = 'WAITING'
        `,
        [alloc.service_order_id]
      );
    }

    // Update invoice balance if linked
    if (payment.invoice_id) {
      const invRes = await client.query(
        `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
        [payment.invoice_id]
      );

      if (invRes.rows.length > 0) {
        const inv = invRes.rows[0];
        const newPaid = Math.max(0, parseFloat(inv.paid_amount) - parseFloat(payment.amount));
        const newBalance = parseFloat((parseFloat(inv.total_amount) - newPaid).toFixed(2));
        const newStatus = newPaid === 0 ? "PENDING" : "PARTIALLY_PAID";

        await client.query(
          `
          UPDATE invoices
          SET
            paid_amount = $1,
            balance_amount = $2,
            status = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          `,
          [newPaid, newBalance, newStatus, payment.invoice_id]
        );
      }
    }

    // Annotate payment record with reversal notes instead of deleting
    await client.query(
      `
      UPDATE payments
      SET notes = COALESCE(notes, '') || ' [REVERSED: ' || $1 || ' by ' || $2 || ' at ' || CURRENT_TIMESTAMP || ']'
      WHERE id = $3
      `,
      [reason.trim(), userId, paymentId]
    );

    await recordAuditLog(client, {
      userId,
      action: "PAYMENT_REVERSED",
      entity: "payments",
      entityId: paymentId,
      details: {
        paymentNumber: payment.payment_number,
        reversedAmount: payment.amount,
        reason: reason.trim(),
      },
    });

    await client.query("COMMIT");
    return {
      success: true,
      message: `Payment ${payment.payment_number} reversed successfully.`,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Group pending cashier service orders by patient.
 * Returns one entry per patient with their nested pending orders.
 * Sorted by latest_order_at DESC (newest patient activity first).
 */
async function getPendingCashierOrdersGrouped(query = {}) {
  const { search } = query;
  const params = [];
  let searchClause = "";

  if (search) {
    params.push(`%${search.trim()}%`);
    searchClause = ` AND (p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length} OR p.patient_number ILIKE $${params.length} OR so.order_number ILIKE $${params.length})`;
  }

  // Fetch all pending non-pharmacy orders
  const ordersRes = await pool.query(
    `SELECT
       so.id AS service_order_id,
       so.order_number,
       so.price,
       so.status AS payment_status,
       so.clinical_notes,
       so.created_at,
       so.visit_id,
       so.invoice_id,
       s.name AS service_name,
       s.code AS service_code,
       s.category AS service_category,
       d.name AS department_name,
       d.code AS department_code,
       p.id AS patient_id,
       p.patient_number,
       p.first_name AS patient_first_name,
       p.last_name AS patient_last_name,
       p.phone AS patient_phone,
       doc.first_name AS doctor_first_name,
       doc.last_name AS doctor_last_name
     FROM service_orders so
     JOIN services s ON so.service_id = s.id
     JOIN departments d ON so.department_id = d.id
     JOIN patients p ON so.patient_id = p.id
     LEFT JOIN staff doc ON so.doctor_id = doc.id
     WHERE so.status = 'WAITING_PAYMENT'
       AND s.payment_location != 'PHARMACY'
       AND p.is_active = TRUE
       ${searchClause}
     ORDER BY so.created_at DESC`,
    params
  );

  // Group by patient in JS
  const patientMap = new Map();
  for (const row of ordersRes.rows) {
    const pid = row.patient_id;
    if (!patientMap.has(pid)) {
      patientMap.set(pid, {
        patient_id: pid,
        patient_number: row.patient_number,
        patient_first_name: row.patient_first_name,
        patient_last_name: row.patient_last_name,
        patient_phone: row.patient_phone,
        latest_order_at: row.created_at,
        pending_count: 0,
        orders: [],
      });
    }
    const entry = patientMap.get(pid);
    entry.orders.push(row);
    entry.pending_count += 1;
    // Keep latest order time
    if (new Date(row.created_at) > new Date(entry.latest_order_at)) {
      entry.latest_order_at = row.created_at;
    }
  }

  // Sort patients by latest_order_at DESC
  return Array.from(patientMap.values()).sort(
    (a, b) => new Date(b.latest_order_at) - new Date(a.latest_order_at)
  );
}

/**
 * Check whether a patient's registration card service order has been paid.
 */
async function getRegistrationCardStatus(patientId) {
  const res = await pool.query(
    `SELECT so.id, so.status, so.price, s.name AS service_name
     FROM service_orders so
     JOIN services s ON so.service_id = s.id
     WHERE so.patient_id = $1 AND s.code = 'ADMIN-REGISTRATION'
     ORDER BY so.created_at DESC
     LIMIT 1`,
    [patientId]
  );
  if (res.rows.length === 0) return { exists: false, paid: false };
  const order = res.rows[0];
  return {
    exists: true,
    paid: order.status === "PAID" || order.status === "COMPLETED",
    status: order.status,
    serviceOrderId: order.id,
    price: order.price,
    serviceName: order.service_name,
  };
}

/**
 * Requirement 6: Full Transaction History & Payment Records
 * Used for administrative reporting, cashier reconciliation, and strict printing/exporting.
 */
async function getFullTransactionHistory(query = {}) {
  const { startDate, endDate, search, paymentMethod, page = 1, limit = 50 } = query;
  const conditions = [];
  const params = [];

  if (startDate) {
    params.push(startDate);
    conditions.push(`p.created_at >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`p.created_at <= ($${params.length}::date + INTERVAL '1 day')`);
  }
  if (paymentMethod) {
    params.push(paymentMethod);
    conditions.push(`p.payment_method = $${params.length}`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(
      p.payment_number ILIKE $${params.length}
      OR p.transaction_reference ILIKE $${params.length}
      OR pat.patient_number ILIKE $${params.length}
      OR pat.first_name ILIKE $${params.length}
      OR pat.last_name ILIKE $${params.length}
      OR inv.invoice_number ILIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query(
    `SELECT COUNT(*) AS total
     FROM payments p
     LEFT JOIN invoices inv ON p.invoice_id = inv.id
     LEFT JOIN patients pat ON p.patient_id = pat.id
     ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.total || 0, 10);

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (parsedPage - 1) * parsedLimit;
  const listParams = [...params, parsedLimit, offset];

  const listRes = await pool.query(
    `SELECT
       p.id,
       p.payment_number,
       p.amount,
       p.payment_method,
       p.transaction_reference,
       p.created_at AS payment_date,
       p.created_at,
       inv.status AS status,
       p.notes,
       inv.id AS invoice_id,
       inv.invoice_number,
       pat.id AS patient_id,
       pat.patient_number,
       pat.first_name AS patient_first_name,
       pat.last_name AS patient_last_name,
       pat.phone AS patient_phone,
       rec_staff.first_name AS received_by_first_name,
       rec_staff.last_name AS received_by_last_name,
       r.name AS received_by_role
     FROM payments p
     LEFT JOIN invoices inv ON p.invoice_id = inv.id
     LEFT JOIN patients pat ON p.patient_id = pat.id
     LEFT JOIN users u ON p.received_by = u.id

     LEFT JOIN staff rec_staff ON u.staff_id = rec_staff.id
     LEFT JOIN roles r ON rec_staff.role_id = r.id
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );


  return {
    transactions: listRes.rows,
    total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages: Math.ceil(total / parsedLimit) || 1,
  };
}

module.exports = {
  getBillableServices,
  addBillableService,
  createInvoice,
  recordPayment,
  recordSelectivePayment,
  getInvoices,
  getInvoiceById,
  getPendingCashierOrders,
  getPendingCashierOrdersGrouped,
  getRegistrationCardStatus,
  getFullTransactionHistory,
  reversePayment,
};


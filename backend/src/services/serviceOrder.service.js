const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { generateOrderNumber, generateInvoiceNumber } = require("../utils/number-generators");

async function generateQueueNumber(client, deptCode) {
  const prefix = deptCode === "LABORATORY" ? "LAB" :
                 deptCode === "RADIOLOGY" ? "XRAY" :
                 deptCode === "CLINICAL" ? "DOC" :
                 deptCode === "CARDIOLOGY" ? "ECG" :
                 deptCode === "PROCEDURE" ? "PROC" :
                 deptCode === "WARD" ? "WARD" :
                 deptCode === "SURGERY" ? "SURG" :
                 deptCode === "PHARMACY" ? "PHARM" : "Q";

  const today = new Date().toISOString().split("T")[0];
  const res = await client.query(
    `
    SELECT COUNT(*) 
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    WHERE d.code = $1 AND DATE(qe.created_at) = $2
    `,
    [deptCode, today]
  );
  const count = parseInt(res.rows[0].count, 10) + 1;
  return `${prefix}-${String(count).padStart(3, "0")}`;
}

async function createServiceOrders(data, userId) {
  const {
    visitId,
    patientId,
    doctorId = null,
    items = [], // [{ serviceId, notes, price }]
    emergencyOverride = false,
    overrideReason = null,
    generateInvoice = true,
  } = data;

  if (!items || items.length === 0) {
    throw new Error("At least one service item must be specified.");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Verify patient and visit
    const visitRes = await client.query(
      `SELECT id, patient_id, emergency_override, override_reason FROM visits WHERE id = $1`,
      [visitId]
    );
    if (visitRes.rowCount === 0) {
      throw new Error("Visit not found.");
    }
    const visit = visitRes.rows[0];

    const isEmergency = emergencyOverride || Boolean(visit.emergency_override);
    const reason = overrideReason || visit.override_reason || (isEmergency ? "Emergency Immediate Stabilization" : null);

    const createdOrders = [];
    let invoiceSubtotal = 0;
    const invoiceLineItems = [];

    for (const item of items) {
      const srvRes = await client.query(
        `
        SELECT s.*, d.code AS department_code, d.name AS department_name
        FROM services s
        JOIN departments d ON s.department_id = d.id
        WHERE s.id = $1
        `,
        [item.serviceId]
      );
      if (srvRes.rowCount === 0) {
        throw new Error(`Service not found: ${item.serviceId}`);
      }
      const service = srvRes.rows[0];

      const itemPrice = item.price !== undefined ? parseFloat(item.price) : parseFloat(service.price);
      const orderNumber = await generateOrderNumber(client);

      // Determine initial status & authorization
      let status = "ORDERED";
      let authorizedAt = null;
      let authorizedBy = null;
      let authorizationSource = null;

      if (isEmergency) {
        status = "AUTHORIZED";
        authorizedAt = new Date();
        authorizedBy = userId;
        authorizationSource = "EMERGENCY_OVERRIDE";
      } else if (!service.requires_payment || itemPrice === 0) {
        status = "AUTHORIZED";
        authorizedAt = new Date();
        authorizedBy = userId;
        authorizationSource = "ZERO_FEE";
      } else {
        status = "WAITING_PAYMENT";
      }

      const orderRes = await client.query(
        `
        INSERT INTO service_orders (
          order_number, visit_id, patient_id, service_id, department_id,
          doctor_id, price, status, emergency_override, override_reason,
          authorized_at, authorized_by, authorization_source, clinical_notes,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *;
        `,
        [
          orderNumber,
          visitId,
          patientId,
          service.id,
          service.department_id,
          doctorId,
          itemPrice,
          status,
          isEmergency,
          reason,
          authorizedAt,
          authorizedBy,
          authorizationSource,
          item.notes || null,
          userId,
        ]
      );
      const order = orderRes.rows[0];
      order.service_name = service.name;
      order.service_code = service.code;
      order.department_code = service.department_code;

      // If authorized immediately (emergency or zero fee), enqueue to department queue
      if (status === "AUTHORIZED" && service.queue_enabled) {
        const queueNumber = await generateQueueNumber(client, service.department_code);
        const priority = isEmergency ? "EMERGENCY" : "NORMAL";

        const qRes = await client.query(
          `
          INSERT INTO queue_entries (
            department_id, service_order_id, visit_id, patient_id,
            queue_number, priority, status, authorized_at, queued_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'WAITING', $7, CURRENT_TIMESTAMP)
          RETURNING *;
          `,
          [
            service.department_id,
            order.id,
            visitId,
            patientId,
            queueNumber,
            priority,
            authorizedAt,
          ]
        );
        order.queue_entry = qRes.rows[0];
      }

      // Add to invoice lines if payable at cashier
      if (service.payment_location !== "PHARMACY" && itemPrice > 0) {
        invoiceSubtotal += itemPrice;
        invoiceLineItems.push({
          orderId: order.id,
          serviceName: service.name,
          serviceCategory: service.category,
          price: itemPrice,
        });
      }

      createdOrders.push(order);
    }

    let createdInvoice = null;
    if (generateInvoice && invoiceLineItems.length > 0) {
      const invoiceNumber = await generateInvoiceNumber(client);
      const invRes = await client.query(
        `
        INSERT INTO invoices (
          invoice_number, patient_id, visit_id, subtotal, discount_amount,
          tax_amount, total_amount, paid_amount, balance_amount, status,
          created_by
        )
        VALUES ($1, $2, $3, $4, 0.00, 0.00, $4, 0.00, $4, 'PENDING', $5)
        RETURNING *;
        `,
        [invoiceNumber, patientId, visitId, invoiceSubtotal, userId]
      );
      createdInvoice = invRes.rows[0];

      for (const line of invoiceLineItems) {
        await client.query(
          `
          INSERT INTO invoice_items (
            invoice_id, item_type, reference_id, description, unit_price, quantity, total_price
          )
          VALUES ($1, $2, $3, $4, $5, 1, $5)
          `,
          [createdInvoice.id, line.serviceCategory, line.orderId, line.serviceName, line.price]
        );

        await client.query(
          `UPDATE service_orders SET invoice_id = $1 WHERE id = $2`,
          [createdInvoice.id, line.orderId]
        );
      }
    }

    await recordAuditLog(
      client,
      {
        userId,
        action: "SERVICE_ORDERS_CREATED",
        entity: "service_orders",
        details: {
          visitId,
          patientId,
          orderCount: createdOrders.length,
          emergencyOverride: isEmergency,
          invoiceId: createdInvoice?.id || null,
        },
      }
    );

    await client.query("COMMIT");
    return {
      serviceOrders: createdOrders,
      invoice: createdInvoice,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getServiceOrdersByVisit(visitId) {
  const result = await db.query(
    `
    SELECT 
      so.*,
      s.code AS service_code,
      s.name AS service_name,
      s.category AS service_category,
      s.payment_location,
      s.queue_enabled,
      d.code AS department_code,
      d.name AS department_name,
      st.first_name AS doctor_first_name,
      st.last_name AS doctor_last_name,
      qe.queue_number,
      qe.status AS queue_status,
      qe.priority AS queue_priority
    FROM service_orders so
    JOIN services s ON so.service_id = s.id
    JOIN departments d ON so.department_id = d.id
    LEFT JOIN staff st ON so.doctor_id = st.id
    LEFT JOIN queue_entries qe ON qe.service_order_id = so.id
    WHERE so.visit_id = $1
    ORDER BY so.created_at ASC
    `,
    [visitId]
  );
  return result.rows;
}

async function getServiceOrderById(id) {
  const result = await db.query(
    `
    SELECT 
      so.*,
      s.code AS service_code,
      s.name AS service_name,
      s.category AS service_category,
      s.payment_location,
      s.queue_enabled,
      d.code AS department_code,
      d.name AS department_name,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      st.first_name AS doctor_first_name,
      st.last_name AS doctor_last_name,
      qe.queue_number,
      qe.status AS queue_status
    FROM service_orders so
    JOIN services s ON so.service_id = s.id
    JOIN departments d ON so.department_id = d.id
    JOIN patients p ON so.patient_id = p.id
    LEFT JOIN staff st ON so.doctor_id = st.id
    LEFT JOIN queue_entries qe ON qe.service_order_id = so.id
    WHERE so.id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

async function authorizeServiceOrder(orderId, { userId, reason = "Manual authorization", source = "ADMIN_OVERRIDE" }) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `
      SELECT so.*, s.queue_enabled, d.code AS department_code
      FROM service_orders so
      JOIN services s ON so.service_id = s.id
      JOIN departments d ON so.department_id = d.id
      WHERE so.id = $1
      `,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      throw new Error("Service order not found.");
    }
    const order = orderRes.rows[0];

    const authorizedAt = new Date();

    await client.query(
      `
      UPDATE service_orders
      SET 
        status = 'AUTHORIZED',
        authorized_at = $1,
        authorized_by = $2,
        authorization_source = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      `,
      [authorizedAt, userId, source, orderId]
    );

    // Enqueue if queue_enabled and not already enqueued
    let queueEntry = null;
    if (order.queue_enabled) {
      const existingQ = await client.query(
        `SELECT id FROM queue_entries WHERE service_order_id = $1`,
        [orderId]
      );
      if (existingQ.rowCount === 0) {
        const queueNumber = await generateQueueNumber(client, order.department_code);
        const qRes = await client.query(
          `
          INSERT INTO queue_entries (
            department_id, service_order_id, visit_id, patient_id,
            queue_number, priority, status, authorized_at, queued_at
          )
          VALUES ($1, $2, $3, $4, $5, 'NORMAL', $6, CURRENT_TIMESTAMP)
          RETURNING *;
          `,
          [
            order.department_id,
            orderId,
            order.visit_id,
            order.patient_id,
            queueNumber,
            authorizedAt,
          ]
        );
        queueEntry = qRes.rows[0];
      }
    }

    await recordAuditLog(
      client,
      {
        userId,
        action: "SERVICE_ORDER_AUTHORIZED",
        entity: "service_orders",
        entityId: orderId,
        details: { source, reason },
      }
    );

    await client.query("COMMIT");
    return { orderId, status: "AUTHORIZED", authorizedAt, queueEntry };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cancelServiceOrder(orderId, { userId, reason }) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE service_orders
      SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [orderId]
    );

    await client.query(
      `
      UPDATE queue_entries
      SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
      WHERE service_order_id = $1
      `,
      [orderId]
    );

    await recordAuditLog(
      client,
      {
        userId,
        action: "SERVICE_ORDER_CANCELLED",
        entity: "service_orders",
        entityId: orderId,
        details: { reason },
      }
    );

    await client.query("COMMIT");
    return { orderId, status: "CANCELLED" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createServiceOrders,
  getServiceOrdersByVisit,
  getServiceOrderById,
  authorizeServiceOrder,
  cancelServiceOrder,
  generateQueueNumber,
};

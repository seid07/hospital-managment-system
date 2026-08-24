const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function getServices({ category, departmentCode, activeOnly = false, search } = {}) {
  let query = `
    SELECT
      s.id,
      s.code,
      s.name,
      s.category,
      s.price,
      s.currency,
      s.is_active,
      s.requires_payment,
      s.payment_location,
      s.queue_enabled,
      s.description,
      s.updated_at,
      d.id AS department_id,
      d.code AS department_code,
      d.name AS department_name
    FROM services s
    JOIN departments d ON s.department_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (activeOnly) {
    query += ` AND s.is_active = TRUE`;
  }

  if (category) {
    params.push(category);
    query += ` AND s.category = $${params.length}`;
  }

  if (departmentCode) {
    params.push(departmentCode);
    query += ` AND d.code = $${params.length}`;
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    query += ` AND (s.name ILIKE $${params.length} OR s.code ILIKE $${params.length} OR s.category ILIKE $${params.length})`;
  }

  query += ` ORDER BY s.category ASC, s.name ASC`;

  const result = await db.query(query, params);
  return result.rows;
}

async function getDepartments() {
  const result = await db.query(`
    SELECT id, code, name, description
    FROM departments
    ORDER BY name ASC
  `);
  return result.rows;
}

async function getServiceById(id) {
  const result = await db.query(
    `
    SELECT
      s.id,
      s.code,
      s.name,
      s.category,
      s.price,
      s.currency,
      s.is_active,
      s.requires_payment,
      s.payment_location,
      s.queue_enabled,
      s.description,
      s.updated_at,
      d.id AS department_id,
      d.code AS department_code,
      d.name AS department_name
    FROM services s
    JOIN departments d ON s.department_id = d.id
    WHERE s.id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

async function createService(data, userId) {
  const {
    code,
    name,
    category,
    departmentId,
    price = 0,
    currency = "ETB",
    requiresPayment = true,
    paymentLocation = "CASHIER",
    queueEnabled = true,
    description,
  } = data;

  const result = await db.query(
    `
    INSERT INTO services (
      code, name, category, department_id, price, currency,
      requires_payment, payment_location, queue_enabled, description
    )
    VALUES ($1, $2, $3, $4, $5, 'ETB', $6, $7, $8, $9)
    RETURNING *;
    `,
    [
      code.toUpperCase().trim(),
      name.trim(),
      category.trim(),
      departmentId,
      parseFloat(price) || 0,
      requiresPayment,
      paymentLocation,
      queueEnabled,
      description || null,
    ]
  );

  const newService = result.rows[0];

  await recordAuditLog(db, {
    userId,
    action: "SERVICE_CREATED",
    entity: "services",
    entityId: newService.id,
    details: { code: newService.code, name: newService.name, price: newService.price },
  });

  return newService;
}

/**
 * Requirement 7: Service Price Management
 * - Editable by ADMIN
 * - Currency is ETB
 * - Records price history audit
 */
async function updateService(id, data, userId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query("SELECT * FROM services WHERE id = $1 FOR UPDATE", [id]);
    if (currentRes.rows.length === 0) {
      throw new Error("SERVICE_NOT_FOUND");
    }
    const current = currentRes.rows[0];
    const prevPrice = parseFloat(current.price);

    const fields = [];
    const params = [id];

    if (data.name !== undefined) {
      params.push(data.name.trim());
      fields.push(`name = $${params.length}`);
    }
    if (data.price !== undefined) {
      const newPrice = Math.max(0, parseFloat(data.price));
      params.push(newPrice);
      fields.push(`price = $${params.length}`);

      // Record price history if price changed
      if (newPrice !== prevPrice) {
        await client.query(
          `
          INSERT INTO service_price_history (service_id, old_price, new_price, changed_by)
          VALUES ($1, $2, $3, $4)
          `,
          [id, prevPrice, newPrice, userId]
        );
      }
    }
    if (data.isActive !== undefined) {
      params.push(Boolean(data.isActive));
      fields.push(`is_active = $${params.length}`);
    }
    if (data.requiresPayment !== undefined) {
      params.push(Boolean(data.requiresPayment));
      fields.push(`requires_payment = $${params.length}`);
    }
    if (data.paymentLocation !== undefined) {
      params.push(data.paymentLocation);
      fields.push(`payment_location = $${params.length}`);
    }
    if (data.queueEnabled !== undefined) {
      params.push(Boolean(data.queueEnabled));
      fields.push(`queue_enabled = $${params.length}`);
    }
    if (data.description !== undefined) {
      params.push(data.description);
      fields.push(`description = $${params.length}`);
    }

    fields.push(`currency = 'ETB'`);
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await client.query(
      `
      UPDATE services
      SET ${fields.join(", ")}
      WHERE id = $1
      RETURNING *;
      `,
      params
    );

    const updated = result.rows[0];

    await recordAuditLog(client, {
      userId,
      action: "SERVICE_UPDATED",
      entity: "services",
      entityId: id,
      details: {
        code: updated.code,
        name: updated.name,
        oldPrice: prevPrice,
        newPrice: updated.price,
        isActive: updated.is_active,
      },
    });

    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getServicePriceHistory(serviceId) {
  const result = await db.query(
    `
    SELECT
      sph.*,
      u.username AS changed_by_username,
      s.first_name AS staff_first_name,
      s.last_name AS staff_last_name
    FROM service_price_history sph
    LEFT JOIN users u ON sph.changed_by = u.id
    LEFT JOIN staff s ON u.staff_id = s.id
    WHERE sph.service_id = $1
    ORDER BY sph.created_at DESC
    `,
    [serviceId]
  );
  return result.rows;
}

module.exports = {
  getServices,
  getDepartments,
  getServiceById,
  createService,
  updateService,
  getServicePriceHistory,
};

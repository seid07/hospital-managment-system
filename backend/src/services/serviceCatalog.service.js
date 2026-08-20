const db = require("../config/database");

async function getServices({ category, departmentCode, activeOnly = true } = {}) {
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
    `,
    [
      code.toUpperCase().trim(),
      name.trim(),
      category.trim(),
      departmentId,
      price,
      currency,
      requiresPayment,
      paymentLocation,
      queueEnabled,
      description || null,
    ]
  );

  return result.rows[0];
}

async function updateService(id, data, userId) {
  const fields = [];
  const params = [id];

  if (data.name !== undefined) {
    params.push(data.name.trim());
    fields.push(`name = $${params.length}`);
  }
  if (data.price !== undefined) {
    params.push(data.price);
    fields.push(`price = $${params.length}`);
  }
  if (data.isActive !== undefined) {
    params.push(data.isActive);
    fields.push(`is_active = $${params.length}`);
  }
  if (data.requiresPayment !== undefined) {
    params.push(data.requiresPayment);
    fields.push(`requires_payment = $${params.length}`);
  }
  if (data.paymentLocation !== undefined) {
    params.push(data.paymentLocation);
    fields.push(`payment_location = $${params.length}`);
  }
  if (data.queueEnabled !== undefined) {
    params.push(data.queueEnabled);
    fields.push(`queue_enabled = $${params.length}`);
  }
  if (data.description !== undefined) {
    params.push(data.description);
    fields.push(`description = $${params.length}`);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const result = await db.query(
    `
    UPDATE services
    SET ${fields.join(", ")}
    WHERE id = $1
    RETURNING *;
    `,
    params
  );

  return result.rows[0];
}

module.exports = {
  getServices,
  getDepartments,
  getServiceById,
  createService,
  updateService,
};

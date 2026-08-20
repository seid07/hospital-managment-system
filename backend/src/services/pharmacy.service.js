const pool = require("../config/database");
const { generatePrescriptionNumber, generatePaymentNumber } = require("../utils/number-generators");
const { recordAuditLog } = require("../utils/audit");
const { parsePagination } = require("../validators");

async function createPrescription({
  encounterId,
  patientId,
  doctorId,
  medicationId,
  medicationName,
  dosage,
  frequency,
  route,
  duration,
  quantity,
  instructions,
  createdBy,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let finalMedName = medicationName;
    let unitPrice = 0;
    if (medicationId) {
      const medCheck = await client.query(
        "SELECT id, name, unit_price FROM medications WHERE id = $1 AND is_active = TRUE",
        [medicationId]
      );
      if (medCheck.rows.length > 0) {
        finalMedName = medCheck.rows[0].name;
        unitPrice = parseFloat(medCheck.rows[0].unit_price) || 0;
      }
    }

    if (!finalMedName) {
      throw new Error("Medication name or valid medication ID is required.");
    }

    const prescriptionNumber = await generatePrescriptionNumber(client);

    const result = await client.query(
      `
      INSERT INTO prescriptions (
        prescription_number,
        encounter_id,
        patient_id,
        doctor_id,
        medication_id,
        medication_name,
        dosage,
        frequency,
        route,
        duration,
        quantity,
        instructions,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE')
      RETURNING *
      `,
      [
        prescriptionNumber,
        encounterId || null,
        patientId,
        doctorId,
        medicationId || null,
        finalMedName,
        dosage,
        frequency,
        route || "Oral",
        duration || null,
        quantity || 1,
        instructions || null,
      ]
    );

    const rx = result.rows[0];

    await recordAuditLog(client, {
      userId: createdBy,
      action: "PRESCRIPTION_CREATED",
      entity: "prescriptions",
      entityId: rx.id,
      details: {
        prescriptionNumber,
        medicationName: finalMedName,
        patientId,
      },
    });

    await client.query("COMMIT");
    return rx;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function recordPharmacyPayment({
  prescriptionId,
  amount,
  paymentMethod = "CASH",
  transactionReference,
  notes,
  receivedBy,
}) {
  const payAmount = parseFloat(amount);
  if (Number.isNaN(payAmount) || payAmount < 0) {
    throw new Error("Invalid payment amount.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rxRes = await client.query(
      `SELECT * FROM prescriptions WHERE id = $1 FOR UPDATE`,
      [prescriptionId]
    );
    if (rxRes.rowCount === 0) {
      throw new Error("Prescription not found.");
    }
    const rx = rxRes.rows[0];

    const paymentNumber = await generatePaymentNumber(client);

    const paymentRes = await client.query(
      `
      INSERT INTO payments (
        payment_number, invoice_id, patient_id, amount,
        payment_method, transaction_reference, notes, received_by
      )
      VALUES (
        $1, NULL, $2, $3,
        $4, $5, $6, $7
      )
      RETURNING *;
      `,
      [
        paymentNumber,
        rx.patient_id,
        payAmount,
        paymentMethod,
        transactionReference || null,
        notes ? `Pharmacy Medication Payment: ${notes}` : "Pharmacy Medication Payment",
        receivedBy,
      ]
    );

    await client.query(
      `UPDATE prescriptions SET status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [prescriptionId]
    );

    await recordAuditLog(client, {
      userId: receivedBy,
      action: "PHARMACY_PAYMENT_RECORDED",
      entity: "prescriptions",
      entityId: prescriptionId,
      details: {
        paymentNumber,
        prescriptionNumber: rx.prescription_number,
        amount: payAmount,
        paymentMethod,
      },
    });

    await client.query("COMMIT");
    return {
      payment: paymentRes.rows[0],
      prescription: { ...rx, status: "PAID" },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function dispensePrescription(prescriptionId, { dispensedNotes } = {}, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query(
      "SELECT * FROM prescriptions WHERE id = $1 FOR UPDATE",
      [prescriptionId]
    );

    if (currentRes.rows.length === 0) {
      throw new Error("PRESCRIPTION_NOT_FOUND");
    }

    const current = currentRes.rows[0];

    if (current.status === "DISPENSED") {
      throw new Error("PRESCRIPTION_ALREADY_DISPENSED");
    }

    // Deduct stock if medication linked
    if (current.medication_id) {
      const stockRes = await client.query(
        "SELECT id, stock_quantity, name FROM medications WHERE id = $1 FOR UPDATE",
        [current.medication_id]
      );
      if (stockRes.rows.length > 0) {
        const med = stockRes.rows[0];
        const newStock = Math.max(0, med.stock_quantity - (current.quantity || 1));
        await client.query(
          "UPDATE medications SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [newStock, current.medication_id]
        );
      }
    }

    const updateRes = await client.query(
      `
      UPDATE prescriptions
      SET
        status = 'DISPENSED',
        dispensed_by = $1,
        dispensed_at = CURRENT_TIMESTAMP,
        dispensed_notes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [userId, dispensedNotes || null, prescriptionId]
    );

    const rx = updateRes.rows[0];

    await recordAuditLog(client, {
      userId,
      action: "PRESCRIPTION_DISPENSED",
      entity: "prescriptions",
      entityId: prescriptionId,
      details: {
        prescriptionNumber: current.prescription_number,
        medicationName: current.medication_name,
        quantity: current.quantity,
      },
    });

    await client.query("COMMIT");
    return rx;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getPrescriptionsQueue(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const status = query.status || "ALL";
  const search = query.search ? query.search.trim() : null;

  const conditions = [];
  const params = [];

  if (status && status !== "ALL") {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(
      p.prescription_number ILIKE $${params.length}
      OR p.medication_name ILIKE $${params.length}
      OR pat.first_name ILIKE $${params.length}
      OR pat.last_name ILIKE $${params.length}
      OR pat.patient_number ILIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM prescriptions p
    JOIN patients pat ON p.patient_id = pat.id
    ${whereClause}
    `,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listQuery = `
    SELECT
      p.*,
      pat.patient_number,
      pat.first_name AS patient_first_name,
      pat.last_name AS patient_last_name,
      pat.date_of_birth AS patient_dob,
      pat.gender AS patient_gender,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      m.unit_price AS unit_price,
      m.stock_quantity AS current_stock,
      u.username AS dispensed_by_username
    FROM prescriptions p
    JOIN patients pat ON p.patient_id = pat.id
    JOIN staff s ON p.doctor_id = s.id
    LEFT JOIN medications m ON p.medication_id = m.id
    LEFT JOIN users u ON p.dispensed_by = u.id
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(listQuery, params);

  return {
    prescriptions: result.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function getMedications(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? query.search.trim() : null;
  const lowStockOnly = query.lowStock === "true";

  const conditions = ["is_active = TRUE"];
  const params = [];

  if (lowStockOnly) {
    conditions.push("stock_quantity <= reorder_level");
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query(`SELECT COUNT(*) AS total FROM medications ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listResult = await pool.query(
    `
    SELECT *
    FROM medications
    ${whereClause}
    ORDER BY name ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    medications: listResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function addMedication(data, userId) {
  const result = await pool.query(
    `
    INSERT INTO medications (
      name,
      code,
      form,
      strength,
      stock_quantity,
      reorder_level,
      unit_price,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
    RETURNING *
    `,
    [
      data.name.trim(),
      data.code.trim().toUpperCase(),
      data.form || "Tablet",
      data.strength || null,
      parseInt(data.stockQuantity, 10) || 0,
      parseInt(data.reorderLevel, 10) || 10,
      parseFloat(data.unitPrice) || 0,
    ]
  );

  const med = result.rows[0];

  await recordAuditLog(pool, {
    userId,
    action: "MEDICATION_ADDED",
    entity: "medications",
    entityId: med.id,
    details: { name: med.name, code: med.code },
  });

  return med;
}

async function updateStock(medicationId, { quantityChange, newStock, unitPrice }, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query(
      "SELECT * FROM medications WHERE id = $1 FOR UPDATE",
      [medicationId]
    );

    if (currentRes.rows.length === 0) {
      throw new Error("MEDICATION_NOT_FOUND");
    }

    const current = currentRes.rows[0];
    let finalStock = current.stock_quantity;

    if (newStock !== undefined) {
      finalStock = Math.max(0, parseInt(newStock, 10));
    } else if (quantityChange !== undefined) {
      finalStock = Math.max(0, current.stock_quantity + parseInt(quantityChange, 10));
    }

    const finalPrice = unitPrice !== undefined ? parseFloat(unitPrice) : current.unit_price;

    const updateRes = await client.query(
      `
      UPDATE medications
      SET
        stock_quantity = $1,
        unit_price = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [finalStock, finalPrice, medicationId]
    );

    const updated = updateRes.rows[0];

    await recordAuditLog(client, {
      userId,
      action: "MEDICATION_STOCK_ADJUSTED",
      entity: "medications",
      entityId: medicationId,
      details: {
        name: current.name,
        oldStock: current.stock_quantity,
        newStock: finalStock,
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

module.exports = {
  createPrescription,
  recordPharmacyPayment,
  dispensePrescription,
  getPrescriptionsQueue,
  getMedications,
  addMedication,
  updateStock,
};

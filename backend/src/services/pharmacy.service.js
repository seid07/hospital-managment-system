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
    let finalMedId = medicationId || null;
    let unitPrice = 0;

    if (medicationId) {
      const medCheck = await client.query(
        "SELECT id, name, unit_price, stock_quantity FROM medications WHERE id = $1 AND is_active = TRUE",
        [medicationId]
      );
      if (medCheck.rows.length > 0) {
        finalMedName = medCheck.rows[0].name;
        unitPrice = parseFloat(medCheck.rows[0].unit_price) || 0;
      }
    } else if (medicationName) {
      const nameCheck = await client.query(
        "SELECT id, name, unit_price FROM medications WHERE name ILIKE $1 AND is_active = TRUE LIMIT 1",
        [medicationName.trim()]
      );
      if (nameCheck.rows.length > 0) {
        finalMedId = nameCheck.rows[0].id;
        finalMedName = nameCheck.rows[0].name;
        unitPrice = parseFloat(nameCheck.rows[0].unit_price) || 0;
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
        finalMedId,
        finalMedName,
        dosage,
        frequency,
        route || "Oral",
        duration || null,
        parseInt(quantity, 10) || 1,
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
        quantity: rx.quantity,
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

/**
 * Requirement 2: Pharmacy Real Stock Deduction on Dispense
 * - Stock decreases ONLY when pharmacy confirms actual dispensing
 * - Rejects dispensing if available stock < requested quantity
 * - Creates inventory transaction audit log
 */
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

    const dispenseQty = current.quantity || 1;

    // Deduct stock if medication is linked
    if (current.medication_id) {
      const stockRes = await client.query(
        "SELECT id, stock_quantity, name FROM medications WHERE id = $1 FOR UPDATE",
        [current.medication_id]
      );

      if (stockRes.rows.length === 0) {
        throw new Error("MEDICATION_NOT_FOUND: Associated formulary item does not exist.");
      }

      const med = stockRes.rows[0];

      // Prevent dispensing when available stock < requested quantity
      if (med.stock_quantity < dispenseQty) {
        throw new Error(
          `INSUFFICIENT_STOCK: Available stock is ${med.stock_quantity} units, but requested dispense quantity is ${dispenseQty} units.`
        );
      }

      const prevQty = med.stock_quantity;
      const newStock = prevQty - dispenseQty;

      await client.query(
        "UPDATE medications SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [newStock, current.medication_id]
      );

      // Record detailed inventory transaction
      await client.query(
        `
        INSERT INTO inventory_transactions (
          medicine_id, transaction_type, previous_quantity, quantity_changed,
          new_quantity, patient_id, prescription_id, staff_id, notes
        )
        VALUES ($1, 'DISPENSE', $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          current.medication_id,
          prevQty,
          -dispenseQty,
          newStock,
          current.patient_id,
          prescriptionId,
          userId,
          dispensedNotes || `Dispensed prescription ${current.prescription_number}`,
        ]
      );
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
        quantity: dispenseQty,
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

/**
 * Multiple / Partial Prescription Dispensing Workflow
 * Supports atomic selection of multiple medications for a patient, deducting inventory strictly on dispense.
 */
async function dispenseMultiplePrescriptions(
  { prescriptionIds, paymentMethod = "CASH", transactionReference = null, dispensedNotes = null },
  userId
) {
  if (!Array.isArray(prescriptionIds) || prescriptionIds.length === 0) {
    throw new Error("PRESCRIPTION_IDS_REQUIRED: At least one prescription ID is required.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dispensedRxList = [];
    let totalPaid = 0;

    for (const rxId of prescriptionIds) {
      const currentRes = await client.query(
        "SELECT p.*, m.unit_price FROM prescriptions p LEFT JOIN medications m ON p.medication_id = m.id WHERE p.id = $1 FOR UPDATE OF p",
        [rxId]
      );
      if (currentRes.rows.length === 0) {
        throw new Error(`PRESCRIPTION_NOT_FOUND: Prescription ID ${rxId} not found.`);
      }
      const current = currentRes.rows[0];
      if (current.status === "DISPENSED") {
        throw new Error(`PRESCRIPTION_ALREADY_DISPENSED: Prescription ${current.prescription_number} has already been dispensed.`);
      }

      const dispenseQty = current.quantity || 1;
      const unitPrice = parseFloat(current.unit_price || 0);
      const lineTotal = unitPrice * dispenseQty;
      totalPaid += lineTotal;

      if (current.medication_id) {
        const stockRes = await client.query(
          "SELECT id, stock_quantity, name FROM medications WHERE id = $1 FOR UPDATE",
          [current.medication_id]
        );
        if (stockRes.rows.length === 0) {
          throw new Error("MEDICATION_NOT_FOUND: Associated formulary item does not exist.");
        }
        const med = stockRes.rows[0];
        if (med.stock_quantity < dispenseQty) {
          throw new Error(
            `INSUFFICIENT_STOCK: Available stock for ${med.name} is ${med.stock_quantity} units, but requested dispense quantity is ${dispenseQty} units.`
          );
        }
        const prevQty = med.stock_quantity;
        const newStock = prevQty - dispenseQty;
        await client.query(
          "UPDATE medications SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [newStock, current.medication_id]
        );
        await client.query(
          `INSERT INTO inventory_transactions (
            medicine_id, transaction_type, previous_quantity, quantity_changed,
            new_quantity, patient_id, prescription_id, staff_id, notes
          ) VALUES ($1, 'DISPENSE', $2, $3, $4, $5, $6, $7, $8)`,
          [
            current.medication_id,
            prevQty,
            -dispenseQty,
            newStock,
            current.patient_id,
            rxId,
            userId,
            dispensedNotes || `Dispensed prescription ${current.prescription_number}`,
          ]
        );
      }

      const updateRes = await client.query(
        `UPDATE prescriptions
         SET status = 'DISPENSED',
             dispensed_by = $1,
             dispensed_at = CURRENT_TIMESTAMP,
             dispensed_notes = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [userId, dispensedNotes || null, rxId]
      );
      dispensedRxList.push(updateRes.rows[0]);

      await recordAuditLog(client, {
        userId,
        action: "PRESCRIPTION_DISPENSED",
        entity: "prescriptions",
        entityId: rxId,
        details: {
          prescriptionNumber: current.prescription_number,
          medicationName: current.medication_name,
          quantity: dispenseQty,
        },
      });
    }

    if (totalPaid > 0 && paymentMethod) {
      const paymentNumber = await generatePaymentNumber(client);
      const patientId = dispensedRxList[0].patient_id;
      await client.query(
        `INSERT INTO payments (
          payment_number, invoice_id, patient_id, amount, payment_method, transaction_reference, notes, received_by
        ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)`,
        [
          paymentNumber,
          patientId,
          totalPaid,
          paymentMethod,
          transactionReference || null,
          `Pharmacy counter payment for ${dispensedRxList.length} medications`,
          userId,
        ]
      );
    }

    await client.query("COMMIT");
    return dispensedRxList;
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

  const conditions = ["pat.is_active = TRUE"];
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

  if (query.doctorId) {
    params.push(query.doctorId);
    conditions.push(`(
      p.doctor_id = $${params.length}
      OR pat.id IN (
        SELECT a.patient_id FROM appointments a WHERE a.doctor_id = $${params.length}
        UNION
        SELECT r.patient_id FROM referrals r WHERE r.receiving_doctor_id = $${params.length} OR r.referring_doctor_id = $${params.length}
        UNION
        SELECT ce.patient_id FROM encounters ce WHERE ce.doctor_id = $${params.length}
      )
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

/**
 * Requirement 3: Low Stock Alerts (< 15 Units)
 * Low stock threshold: LESS THAN 15 UNITS.
 * 15 is normal; 14 or below is low stock.
 */
async function getMedications(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? query.search.trim() : null;
  const lowStockOnly = query.lowStock === "true";

  const conditions = ["is_active = TRUE"];
  const params = [];

  if (lowStockOnly) {
    // Dynamically calculated: strictly LESS THAN 15 units
    conditions.push("stock_quantity < 15");
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
    SELECT
      m.*,
      CASE WHEN m.stock_quantity < 15 THEN TRUE ELSE FALSE END AS is_low_stock
    FROM medications m
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
      15, // standard low stock threshold
      parseFloat(data.unitPrice) || 0,
    ]
  );

  const med = result.rows[0];

  await recordAuditLog(pool, {
    userId,
    action: "MEDICATION_ADDED",
    entity: "medications",
    entityId: med.id,
    details: { name: med.name, code: med.code, stockQuantity: med.stock_quantity },
  });

  return med;
}

/**
 * Requirement 8: Medicine Price & Stock Management
 * Records stock movement into inventory_transactions and price changes into medicine_price_history.
 */
async function updateStock(medicationId, { quantityChange, newStock, unitPrice, notes }, userId) {
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
    const prevStock = current.stock_quantity;
    let finalStock = prevStock;
    let changeAmount = 0;
    let txType = "ADJUSTMENT";

    if (newStock !== undefined) {
      finalStock = Math.max(0, parseInt(newStock, 10));
      changeAmount = finalStock - prevStock;
      txType = changeAmount >= 0 ? "RESTOCK" : "ADJUSTMENT";
    } else if (quantityChange !== undefined) {
      changeAmount = parseInt(quantityChange, 10);
      finalStock = Math.max(0, prevStock + changeAmount);
      txType = changeAmount >= 0 ? "RESTOCK" : "ADJUSTMENT";
    }

    const prevPrice = parseFloat(current.unit_price) || 0;
    const finalPrice = unitPrice !== undefined ? Math.max(0, parseFloat(unitPrice)) : prevPrice;

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

    // If stock changed, record inventory transaction
    if (changeAmount !== 0) {
      await client.query(
        `
        INSERT INTO inventory_transactions (
          medicine_id, transaction_type, previous_quantity, quantity_changed,
          new_quantity, staff_id, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          medicationId,
          txType,
          prevStock,
          changeAmount,
          finalStock,
          userId,
          notes || `Manual stock update (${txType})`,
        ]
      );
    }

    // If price changed, record in medicine_price_history
    if (unitPrice !== undefined && finalPrice !== prevPrice) {
      await client.query(
        `
        INSERT INTO medicine_price_history (
          medicine_id, old_price, new_price, changed_by
        )
        VALUES ($1, $2, $3, $4)
        `,
        [medicationId, prevPrice, finalPrice, userId]
      );
    }

    await recordAuditLog(client, {
      userId,
      action: "MEDICATION_STOCK_ADJUSTED",
      entity: "medications",
      entityId: medicationId,
      details: {
        name: current.name,
        oldStock: prevStock,
        newStock: finalStock,
        oldPrice: prevPrice,
        newPrice: finalPrice,
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

async function getInventoryTransactions(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const medicineId = query.medicineId || null;

  const conditions = [];
  const params = [];

  if (medicineId) {
    params.push(medicineId);
    conditions.push(`it.medicine_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query(
    `SELECT COUNT(*) AS total FROM inventory_transactions it ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listRes = await pool.query(
    `
    SELECT
      it.*,
      m.name AS medicine_name,
      m.code AS medicine_code,
      m.form AS medicine_form,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      rx.prescription_number,
      u.username AS staff_username
    FROM inventory_transactions it
    JOIN medications m ON it.medicine_id = m.id
    LEFT JOIN patients p ON it.patient_id = p.id
    LEFT JOIN prescriptions rx ON it.prescription_id = rx.id
    LEFT JOIN users u ON it.staff_id = u.id
    ${whereClause}
    ORDER BY it.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    transactions: listRes.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function getMedicationById(id) {
  const result = await pool.query(
    `
    SELECT
      m.*,
      CASE WHEN m.stock_quantity < 15 THEN TRUE ELSE FALSE END AS is_low_stock
    FROM medications m
    WHERE m.id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  createPrescription,
  recordPharmacyPayment,
  dispensePrescription,
  dispenseMultiplePrescriptions,
  getPrescriptionsQueue,
  getMedications,
  getMedicationById,
  addMedication,
  updateStock,
  getInventoryTransactions,
};

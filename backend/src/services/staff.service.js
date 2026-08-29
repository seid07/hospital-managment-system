const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { validatePasswordStrength, validateEthiopianPhone, normalizeEthiopianPhone } = require("../validators");

async function getRoles() {
  const result = await pool.query(`
    SELECT id, name, description
    FROM roles
    ORDER BY name
  `);

  return result.rows;
}

async function getStaff(query = {}) {
  const role = query.role || null;
  const search = query.search ? query.search.trim() : null;

  const conditions = [];
  const params = [];

  if (role) {
    params.push(role);
    conditions.push(`r.name = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(
      s.first_name ILIKE $${params.length}
      OR s.last_name ILIKE $${params.length}
      OR s.email ILIKE $${params.length}
      OR u.username ILIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      s.id,
      s.first_name,
      s.last_name,
      s.email,
      s.phone,
      s.department,
      s.specialty,
      CASE
        WHEN s.is_active = FALSE AND s.deactivation_end_date IS NOT NULL AND s.deactivation_end_date < CURRENT_DATE THEN TRUE
        ELSE s.is_active
      END AS is_active,
      s.deactivation_reason,
      s.deactivation_start_date,
      s.deactivation_end_date,
      s.created_at,
      r.name AS role,
      u.username
    FROM staff s
    INNER JOIN roles r ON r.id = s.role_id
    LEFT JOIN users u ON u.staff_id = s.id
    ${whereClause}
    ORDER BY s.created_at DESC
    `,
    params
  );

  return result.rows;
}

async function createStaff(data, createdByUserId) {
  // Enforce single role — reject if multiple roles were passed
  if (Array.isArray(data.role)) {
    throw new Error("MULTIPLE_ROLES_NOT_ALLOWED: Each staff member must have exactly one role.");
  }
  if (!data.role || typeof data.role !== "string") {
    throw new Error("ROLE_REQUIRED: A valid role must be specified.");
  }

  const passwordCheck = validatePasswordStrength(data.password);
  if (!passwordCheck.isValid) {
    throw new Error(`WEAK_PASSWORD: ${passwordCheck.message}`);
  }

  let phone = data.phone ? data.phone.trim() : "";
  if (phone) {
    if (!validateEthiopianPhone(phone)) {
      throw new Error("INVALID_PHONE_FORMAT");
    }
    phone = normalizeEthiopianPhone(phone);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const roleResult = await client.query(
      `
        SELECT id, name
        FROM roles
        WHERE name = $1
      `,
      [data.role]
    );

    if (roleResult.rows.length === 0) {
      throw new Error("ROLE_NOT_FOUND");
    }

    const roleId = roleResult.rows[0].id;

    const passwordHash = await bcrypt.hash(data.password, 10);

    const staffResult = await client.query(
      `
        INSERT INTO staff (
          first_name,
          last_name,
          email,
          phone,
          department,
          specialty,
          role_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
      `,
      [
        data.firstName.trim(),
        data.lastName.trim(),
        data.email.trim().toLowerCase(),
        phone,
        data.department ? data.department.trim() : null,
        data.specialty ? data.specialty.trim() : null,
        roleId,
      ]
    );

    const staffId = staffResult.rows[0].id;

    await client.query(
      `
        INSERT INTO users (
          staff_id,
          username,
          password_hash
        )
        VALUES ($1,$2,$3)
      `,
      [staffId, data.username.trim().toLowerCase(), passwordHash]
    );

    await recordAuditLog(client, {
      userId: createdByUserId,
      action: "STAFF_CREATED",
      entity: "staff",
      entityId: staffId,
      details: {
        username: data.username,
        role: data.role,
        name: `${data.firstName} ${data.lastName}`,
      },
    });

    await client.query("COMMIT");

    return {
      staffId,
      username: data.username,
      role: data.role,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      throw new Error("DUPLICATE_STAFF");
    }

    throw error;
  } finally {
    client.release();
  }
}

async function updateStaff(id, data, updatedByUserId) {
  let phone = data.phone ? data.phone.trim() : "";
  if (phone) {
    if (!validateEthiopianPhone(phone)) {
      throw new Error("INVALID_PHONE_FORMAT");
    }
    phone = normalizeEthiopianPhone(phone);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let roleId = null;
    if (data.role) {
      const roleResult = await client.query(
        `SELECT id FROM roles WHERE name = $1`,
        [data.role]
      );

      if (roleResult.rows.length === 0) {
        throw new Error("ROLE_NOT_FOUND");
      }

      roleId = roleResult.rows[0].id;
    }

    const result = await client.query(
      `
        UPDATE staff
        SET
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          department = COALESCE($5, department),
          specialty = COALESCE($6, specialty),
          role_id = COALESCE($7, role_id),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING id, first_name, last_name, email, phone, department, specialty, is_active
      `,
      [
        data.firstName ? data.firstName.trim() : null,
        data.lastName ? data.lastName.trim() : null,
        data.email ? data.email.trim().toLowerCase() : null,
        phone || null,
        data.department !== undefined ? (data.department ? data.department.trim() : "") : null,
        data.specialty !== undefined ? (data.specialty ? data.specialty.trim() : "") : null,
        roleId,
        id,
      ]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    // Update username if provided
    if (data.username && data.username.trim()) {
      const newUsername = data.username.trim().toLowerCase();
      const uCheck = await client.query(
        "SELECT id FROM users WHERE username = $1 AND staff_id != $2",
        [newUsername, id]
      );
      if (uCheck.rows.length > 0) {
        throw new Error("USERNAME_TAKEN");
      }
      await client.query(
        "UPDATE users SET username = $1 WHERE staff_id = $2",
        [newUsername, id]
      );
    }

    const staff = result.rows[0];

    await recordAuditLog(client, {
      userId: updatedByUserId,
      action: "STAFF_UPDATED",
      entity: "staff",
      entityId: id,
      details: { name: `${staff.first_name} ${staff.last_name}`, role: data.role, username: data.username },
    });

    await client.query("COMMIT");

    return staff;
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      throw new Error("DUPLICATE_STAFF");
    }

    throw error;
  } finally {
    client.release();
  }
}

async function deleteStaffPermanently(id, deletedByUserId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get staff info before deletion
    const staffRes = await client.query(
      `SELECT s.id, s.first_name, s.last_name, s.email, r.name as role
       FROM staff s
       JOIN roles r ON s.role_id = r.id
       WHERE s.id = $1`,
      [id]
    );

    if (staffRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const staff = staffRes.rows[0];

    // Prevent deleting the last remaining ADMIN account
    if (staff.role === "ADMIN") {
      const adminCountRes = await client.query(
        `SELECT COUNT(*) as count
         FROM staff s
         JOIN roles r ON s.role_id = r.id
         WHERE r.name = 'ADMIN'`
      );
      if (parseInt(adminCountRes.rows[0].count, 10) <= 1) {
        throw new Error("CANNOT_DELETE_LAST_ADMIN");
      }
    }

    // 2. Delete associated doctor schedules
    await client.query("DELETE FROM doctor_schedules WHERE doctor_id = $1", [id]);

    // 3. Delete referral messages and referrals involving this doctor
    await client.query(
      `DELETE FROM referral_messages
       WHERE sender_id = $1
          OR referral_id IN (SELECT id FROM referrals WHERE referring_doctor_id = $1 OR receiving_doctor_id = $1)`,
      [id]
    );
    await client.query(
      "DELETE FROM referrals WHERE referring_doctor_id = $1 OR receiving_doctor_id = $1",
      [id]
    );

    // 4. Disassociate clinical orders, appointments, encounters, etc. referencing staff
    await client.query("UPDATE appointments SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE service_orders SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE queue_entries SET assigned_staff_id = NULL WHERE assigned_staff_id = $1", [id]);
    await client.query("UPDATE radiology_orders SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE procedure_orders SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE surgery_orders SET surgeon_id = NULL WHERE surgeon_id = $1", [id]);
    await client.query("UPDATE encounters SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE prescriptions SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE lab_orders SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE diagnoses SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE admissions SET doctor_id = NULL WHERE doctor_id = $1", [id]);

    // 5. Delete associated user login account and clean related user records
    const userRes = await client.query("SELECT id FROM users WHERE staff_id = $1", [id]);
    if (userRes.rows.length > 0) {
      const userId = userRes.rows[0].id;
      await client.query("UPDATE invoices SET created_by = NULL WHERE created_by = $1", [userId]);
      await client.query("UPDATE prescriptions SET dispensed_by = NULL WHERE dispensed_by = $1", [userId]);
      await client.query("UPDATE payments SET received_by = NULL WHERE received_by = $1", [userId]);
      await client.query("UPDATE lab_results SET entered_by = NULL WHERE entered_by = $1", [userId]);
      await client.query("UPDATE lab_orders SET specimen_collected_by = NULL WHERE specimen_collected_by = $1", [userId]);
      await client.query("UPDATE lab_orders SET resulted_by = NULL WHERE resulted_by = $1", [userId]);
      await client.query("UPDATE lab_orders SET verified_by = NULL WHERE verified_by = $1", [userId]);
      await client.query("UPDATE encounters SET created_by = NULL WHERE created_by = $1", [userId]);
      await client.query("UPDATE appointments SET created_by = NULL WHERE created_by = $1", [userId]);
      await client.query("UPDATE patients SET created_by = NULL WHERE created_by = $1", [userId]);
      await client.query("UPDATE vitals SET recorded_by = NULL WHERE recorded_by = $1", [userId]);
      await client.query("UPDATE visits SET created_by = NULL WHERE created_by = $1", [userId]);
      await client.query("UPDATE visits SET override_authorized_by = NULL WHERE override_authorized_by = $1", [userId]);
      await client.query("UPDATE admissions SET created_by = NULL WHERE created_by = $1", [userId]);
      await client.query("UPDATE service_orders SET created_by = NULL WHERE created_by = $1", [userId]);
      await client.query("UPDATE service_orders SET authorized_by = NULL WHERE authorized_by = $1", [userId]);
      await client.query("UPDATE service_orders SET cancelled_by = NULL WHERE cancelled_by = $1", [userId]);
      await client.query("UPDATE procedure_orders SET performed_by = NULL WHERE performed_by = $1", [userId]);
      await client.query("UPDATE radiology_orders SET performed_by = NULL WHERE performed_by = $1", [userId]);
      await client.query("UPDATE radiology_orders SET reported_by = NULL WHERE reported_by = $1", [userId]);
      await client.query("UPDATE surgery_orders SET performed_by = NULL WHERE performed_by = $1", [userId]);
      await client.query("UPDATE audit_logs SET user_id = NULL WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    }

    // 6. Delete staff member
    await client.query("DELETE FROM staff WHERE id = $1", [id]);

    // 7. Record audit log with acting admin user
    await recordAuditLog(client, {
      userId: deletedByUserId,
      action: "STAFF_DELETED_PERMANENTLY",
      entity: "staff",
      entityId: id,
      details: { name: `${staff.first_name} ${staff.last_name}`, email: staff.email, role: staff.role },
    });

    await client.query("COMMIT");
    return { success: true, id, name: `${staff.first_name} ${staff.last_name}` };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function updateStaffStatus(id, isActive, options = {}, updatedByUserId) {
  const { reason, startDate, endDate } = options;

  let query = "";
  let params = [];

  if (!isActive) {
    query = `
      UPDATE staff
      SET
        is_active = FALSE,
        deactivation_reason = $1,
        deactivation_start_date = $2,
        deactivation_end_date = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, is_active, first_name, last_name, deactivation_reason, deactivation_start_date, deactivation_end_date
    `;
    params = [reason || null, startDate || null, endDate || null, id];
  } else {
    query = `
      UPDATE staff
      SET
        is_active = TRUE,
        deactivation_reason = NULL,
        deactivation_start_date = NULL,
        deactivation_end_date = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, is_active, first_name, last_name, deactivation_reason, deactivation_start_date, deactivation_end_date
    `;
    params = [id];
  }

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  const staff = result.rows[0];

  await recordAuditLog(pool, {
    userId: updatedByUserId,
    action: isActive ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
    entity: "staff",
    entityId: id,
    details: {
      name: `${staff.first_name} ${staff.last_name}`,
      isActive,
      deactivation_reason: staff.deactivation_reason,
      deactivation_start_date: staff.deactivation_start_date,
      deactivation_end_date: staff.deactivation_end_date,
    },
  });

  return staff;
}

async function getDoctorScheduledAppointments(doctorId, startDate, endDate) {
  const query = `
    SELECT
      a.id,
      a.appointment_number,
      a.appointment_date,
      a.start_time,
      a.end_time,
      a.status,
      a.reason,
      p.id AS patient_id,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.phone AS patient_phone
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    WHERE a.doctor_id = $1
      AND a.status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN')
      AND (
        ($2::date IS NULL OR a.appointment_date >= $2::date)
        AND ($3::date IS NULL OR a.appointment_date <= $3::date)
      )
    ORDER BY a.appointment_date ASC, a.start_time ASC
  `;

  const result = await pool.query(query, [
    doctorId,
    startDate || null,
    endDate || null,
  ]);

  return result.rows;
}

module.exports = {
  getRoles,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaffPermanently,
  updateStaffStatus,
  getDoctorScheduledAppointments,
};

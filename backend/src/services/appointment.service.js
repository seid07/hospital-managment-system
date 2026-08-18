const pool = require("../config/database");
const { generateSlots, timeToMinutes, rangesOverlap } = require("../utils/time");
const { generateAppointmentNumber } = require("../utils/appointment-number");
const { recordAuditLog } = require("../utils/audit");
const { parsePagination } = require("../validators");

const VALID_TRANSITIONS = {
  SCHEDULED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

async function getAvailableSlots(doctorId, appointmentDate) {
  const date = new Date(`${appointmentDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("INVALID_DATE");
  }

  const dayOfWeek = date.getDay();

  const scheduleResult = await pool.query(
    `
      SELECT
        start_time,
        end_time,
        slot_duration_minutes
      FROM doctor_schedules
      WHERE doctor_id = $1
        AND day_of_week = $2
        AND is_active = TRUE
      ORDER BY start_time
    `,
    [doctorId, dayOfWeek]
  );

  const appointmentResult = await pool.query(
    `
      SELECT
        start_time,
        end_time,
        status
      FROM appointments
      WHERE doctor_id = $1
        AND appointment_date = $2
        AND status IN ('SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS')
      ORDER BY start_time
    `,
    [doctorId, appointmentDate]
  );

  const existingAppointments = appointmentResult.rows;
  const slots = [];

  for (const schedule of scheduleResult.rows) {
    const generatedSlots = generateSlots(
      schedule.start_time,
      schedule.end_time,
      schedule.slot_duration_minutes
    );

    for (const slot of generatedSlots) {
      const slotStart = timeToMinutes(slot.startTime);
      const slotEnd = timeToMinutes(slot.endTime);

      const booked = existingAppointments.some((appointment) => {
        const appointmentStart = timeToMinutes(appointment.start_time);
        const appointmentEnd = timeToMinutes(appointment.end_time);

        return rangesOverlap(
          slotStart,
          slotEnd,
          appointmentStart,
          appointmentEnd
        );
      });

      slots.push({
        startTime: slot.startTime,
        endTime: slot.endTime,
        available: !booked,
      });
    }
  }

  return slots;
}

async function createAppointment({
  patientId,
  doctorId,
  appointmentDate,
  startTime,
  endTime,
  reason,
  notes,
  createdBy,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Validate patient
    const patientResult = await client.query(
      `
        SELECT id, first_name, last_name, patient_number
        FROM patients
        WHERE id = $1
          AND is_active = TRUE
      `,
      [patientId]
    );

    if (patientResult.rows.length === 0) {
      throw new Error("PATIENT_NOT_FOUND");
    }

    const patient = patientResult.rows[0];

    // 2. Validate doctor
    const doctorResult = await client.query(
      `
        SELECT
          s.id,
          s.first_name,
          s.last_name
        FROM staff s
        INNER JOIN roles r
          ON r.id = s.role_id
        WHERE s.id = $1
          AND r.name = 'DOCTOR'
          AND s.is_active = TRUE
      `,
      [doctorId]
    );

    if (doctorResult.rows.length === 0) {
      throw new Error("DOCTOR_NOT_FOUND");
    }

    // 3. Validate date
    const selectedDate = new Date(`${appointmentDate}T00:00:00`);

    if (Number.isNaN(selectedDate.getTime())) {
      throw new Error("INVALID_DATE");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      throw new Error("PAST_DATE");
    }

    // 4. Validate time
    if (startTime >= endTime) {
      throw new Error("INVALID_TIME");
    }

    // 5. Validate doctor's schedule
    const dayOfWeek = selectedDate.getDay();

    const scheduleResult = await client.query(
      `
        SELECT
          start_time,
          end_time
        FROM doctor_schedules
        WHERE doctor_id = $1
          AND day_of_week = $2
          AND is_active = TRUE
          AND start_time <= $3
          AND end_time >= $4
        LIMIT 1
      `,
      [doctorId, dayOfWeek, startTime, endTime]
    );

    if (scheduleResult.rows.length === 0) {
      throw new Error("OUTSIDE_DOCTOR_SCHEDULE");
    }

    // 6. Generate appointment number
    const appointmentNumber = await generateAppointmentNumber(client);

    // 7. Insert appointment
    const appointmentResult = await client.query(
      `
        INSERT INTO appointments (
          appointment_number,
          patient_id,
          doctor_id,
          appointment_date,
          start_time,
          end_time,
          status,
          reason,
          notes,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'SCHEDULED',
          $7,
          $8,
          $9
        )
        RETURNING *
      `,
      [
        appointmentNumber,
        patientId,
        doctorId,
        appointmentDate,
        startTime,
        endTime,
        reason || null,
        notes || null,
        createdBy,
      ]
    );

    const appointment = appointmentResult.rows[0];

    // 8. Record audit log
    await recordAuditLog(client, {
      userId: createdBy,
      action: "APPOINTMENT_CREATED",
      entity: "appointments",
      entityId: appointment.id,
      details: {
        appointmentNumber,
        patientNumber: patient.patient_number,
        appointmentDate,
        startTime,
        endTime,
      },
    });

    await client.query("COMMIT");

    return appointment;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getAppointments(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const { date, doctorId, patientId, status, startDate, endDate, search } = query;

  const conditions = [];
  const params = [];

  if (date) {
    params.push(date);
    conditions.push(`a.appointment_date = $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    conditions.push(`a.appointment_date >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    conditions.push(`a.appointment_date <= $${params.length}`);
  }

  if (doctorId) {
    params.push(doctorId);
    conditions.push(`a.doctor_id = $${params.length}`);
  }

  if (patientId) {
    params.push(patientId);
    conditions.push(`a.patient_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(
      a.appointment_number ILIKE $${params.length}
      OR p.first_name ILIKE $${params.length}
      OR p.last_name ILIKE $${params.length}
      OR p.patient_number ILIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    ${whereClause}
    `,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listQuery = `
    SELECT
      a.*,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.phone AS patient_phone,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      s.department AS doctor_department,
      s.specialty AS doctor_specialty
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN staff s ON a.doctor_id = s.id
    ${whereClause}
    ORDER BY a.appointment_date DESC, a.start_time ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(listQuery, params);

  return {
    appointments: result.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function getAppointmentById(id) {
  const result = await pool.query(
    `
    SELECT
      a.*,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.phone AS patient_phone,
      p.email AS patient_email,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      s.department AS doctor_department,
      s.specialty AS doctor_specialty
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN staff s ON a.doctor_id = s.id
    WHERE a.id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function updateAppointmentStatus(id, newStatus, userId, notes = null, userRole = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `
      SELECT id, status, appointment_number, appointment_date, start_time, end_time, doctor_id, patient_id
      FROM appointments
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (currentResult.rows.length === 0) {
      throw new Error("APPOINTMENT_NOT_FOUND");
    }

    const current = currentResult.rows[0];

    // State machine check (admins can override if needed)
    if (userRole !== "ADMIN") {
      const allowedNext = VALID_TRANSITIONS[current.status] || [];
      if (!allowedNext.includes(newStatus)) {
        throw new Error(`INVALID_STATUS_TRANSITION: Cannot transition from ${current.status} to ${newStatus}`);
      }
    }

    const updatedResult = await client.query(
      `
      UPDATE appointments
      SET
        status = $1,
        notes = COALESCE($2, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [newStatus, notes, id]
    );

    const updated = updatedResult.rows[0];

    await recordAuditLog(client, {
      userId,
      action: `APPOINTMENT_STATUS_${newStatus}`,
      entity: "appointments",
      entityId: id,
      details: {
        appointmentNumber: current.appointment_number,
        previousStatus: current.status,
        newStatus,
        notes,
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

async function rescheduleAppointment(id, { appointmentDate, startTime, endTime, reason }, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `
      SELECT *
      FROM appointments
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (currentResult.rows.length === 0) {
      throw new Error("APPOINTMENT_NOT_FOUND");
    }

    const current = currentResult.rows[0];

    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(current.status)) {
      throw new Error(`CANNOT_RESCHEDULE: Appointment is already ${current.status}`);
    }

    const selectedDate = new Date(`${appointmentDate}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) {
      throw new Error("INVALID_DATE");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      throw new Error("PAST_DATE");
    }

    if (startTime >= endTime) {
      throw new Error("INVALID_TIME");
    }

    // Verify doctor schedule
    const dayOfWeek = selectedDate.getDay();
    const scheduleResult = await client.query(
      `
      SELECT start_time, end_time
      FROM doctor_schedules
      WHERE doctor_id = $1
        AND day_of_week = $2
        AND is_active = TRUE
        AND start_time <= $3
        AND end_time >= $4
      LIMIT 1
      `,
      [current.doctor_id, dayOfWeek, startTime, endTime]
    );

    if (scheduleResult.rows.length === 0) {
      throw new Error("OUTSIDE_DOCTOR_SCHEDULE");
    }

    const updatedResult = await client.query(
      `
      UPDATE appointments
      SET
        appointment_date = $1,
        start_time = $2,
        end_time = $3,
        reason = COALESCE($4, reason),
        status = 'SCHEDULED',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
      `,
      [appointmentDate, startTime, endTime, reason || null, id]
    );

    const updated = updatedResult.rows[0];

    await recordAuditLog(client, {
      userId,
      action: "APPOINTMENT_RESCHEDULED",
      entity: "appointments",
      entityId: id,
      details: {
        appointmentNumber: current.appointment_number,
        oldDate: current.appointment_date,
        oldTime: `${current.start_time}-${current.end_time}`,
        newDate: appointmentDate,
        newTime: `${startTime}-${endTime}`,
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
  getAvailableSlots,
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  rescheduleAppointment,
};

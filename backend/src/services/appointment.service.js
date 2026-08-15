const pool = require("../config/database");

const {
  generateSlots,
  timeToMinutes,
  rangesOverlap,
} = require("../utils/time");

const { generateAppointmentNumber } = require("../utils/appointment-number");

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
    [doctorId, dayOfWeek],
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
        AND status = 'SCHEDULED'
      ORDER BY start_time
    `,
    [doctorId, appointmentDate],
  );

  const existingAppointments = appointmentResult.rows;

  const slots = [];

  for (const schedule of scheduleResult.rows) {
    const generatedSlots = generateSlots(
      schedule.start_time,
      schedule.end_time,
      schedule.slot_duration_minutes,
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
          appointmentEnd,
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

async function searchPatients(search) {
  const result = await pool.query(
    `
      SELECT
        id,
        patient_number,
        first_name,
        last_name,
        date_of_birth,
        gender,
        phone,
        email
      FROM patients
      WHERE is_active = TRUE
        AND (
          patient_number ILIKE $1
          OR first_name ILIKE $1
          OR last_name ILIKE $1
          OR phone ILIKE $1
        )
      ORDER BY first_name, last_name
      LIMIT 20
    `,
    [`%${search}%`],
  );

  return result.rows;
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

    // ------------------------------------
    // 1. Validate patient
    // ------------------------------------

    const patientResult = await client.query(
      `
        SELECT id
        FROM patients
        WHERE id = $1
          AND is_active = TRUE
      `,
      [patientId],
    );

    if (patientResult.rows.length === 0) {
      throw new Error("PATIENT_NOT_FOUND");
    }

    // ------------------------------------
    // 2. Validate doctor
    // ------------------------------------

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
      [doctorId],
    );

    if (doctorResult.rows.length === 0) {
      throw new Error("DOCTOR_NOT_FOUND");
    }

    // ------------------------------------
    // 3. Validate date
    // ------------------------------------

    const selectedDate = new Date(`${appointmentDate}T00:00:00`);

    if (Number.isNaN(selectedDate.getTime())) {
      throw new Error("INVALID_DATE");
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      throw new Error("PAST_DATE");
    }

    // ------------------------------------
    // 4. Validate time
    // ------------------------------------

    if (startTime >= endTime) {
      throw new Error("INVALID_TIME");
    }

    // ------------------------------------
    // 5. Validate doctor's schedule
    // ------------------------------------

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
      [doctorId, dayOfWeek, startTime, endTime],
    );

    if (scheduleResult.rows.length === 0) {
      throw new Error("OUTSIDE_DOCTOR_SCHEDULE");
    }

    // ------------------------------------
    // 6. Generate appointment number
    // ------------------------------------

    const appointmentNumber = await generateAppointmentNumber(client);

    // ------------------------------------
    // 7. Insert appointment
    // ------------------------------------

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
          RETURNING
            id,
            appointment_number,
            patient_id,
            doctor_id,
            appointment_date,
            start_time,
            end_time,
            status,
            reason,
            notes,
            created_by,
            created_at
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
      ],
    );

    await client.query("COMMIT");

    return appointmentResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getAvailableSlots,
  searchPatients,
  createAppointment,
};

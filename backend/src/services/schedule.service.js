const pool = require("../config/database");

async function getDoctors() {
  const result = await pool.query(`
    SELECT
      s.id,
      s.first_name,
      s.last_name,
      s.email,
      s.department,
      s.specialty
    FROM staff s
    INNER JOIN roles r
      ON r.id = s.role_id
    WHERE r.name = 'DOCTOR'
      AND s.is_active = TRUE
    ORDER BY s.last_name, s.first_name
  `);

  return result.rows;
}

async function getDoctorSchedules(doctorId) {
  const result = await pool.query(
    `
      SELECT
        id,
        doctor_id,
        day_of_week,
        start_time,
        end_time,
        slot_duration_minutes,
        is_active
      FROM doctor_schedules
      WHERE doctor_id = $1
      ORDER BY day_of_week, start_time
    `,
    [doctorId]
  );

  return result.rows;
}

async function createSchedule(doctorId, data) {
  const doctorResult = await pool.query(
    `
      SELECT s.id
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

  if (data.startTime >= data.endTime) {
    throw new Error("INVALID_TIME_RANGE");
  }

  const result = await pool.query(
    `
      INSERT INTO doctor_schedules (
        doctor_id,
        day_of_week,
        start_time,
        end_time,
        slot_duration_minutes
      )
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `,
    [
      doctorId,
      data.dayOfWeek,
      data.startTime,
      data.endTime,
      data.slotDurationMinutes || 30,
    ]
  );

  return result.rows[0];
}

async function deleteSchedule(scheduleId) {
  const result = await pool.query(
    `
      DELETE FROM doctor_schedules
      WHERE id = $1
      RETURNING id
    `,
    [scheduleId]
  );

  return result.rows[0] || null;
}

module.exports = {
  getDoctors,
  getDoctorSchedules,
  createSchedule,
  deleteSchedule,
};

const pool = require("../config/database");
const { generateSlots, timeToMinutes, rangesOverlap } = require("../utils/time");

async function getDoctors(filters = {}) {
  const { date, specialty, allStaff } = filters;

  let query = `
    SELECT DISTINCT
      s.id,
      s.first_name,
      s.last_name,
      s.email,
      s.phone,
      s.department,
      s.specialty,
      r.name AS role
    FROM staff s
    INNER JOIN roles r
      ON r.id = s.role_id
  `;

  // allStaff=true is used by admin schedule management (any staff member can
  // have a shift/consultation schedule). Without it, callers booking patient
  // consultations continue to only see active DOCTOR role staff.
  const conditions = allStaff
    ? [
        `(s.is_active = TRUE OR (s.deactivation_end_date IS NOT NULL AND s.deactivation_end_date < CURRENT_DATE))`
      ]
    : [
        `UPPER(r.name) IN ('DOCTOR', 'PHYSICIAN', 'SURGEON')`,
        `(s.is_active = TRUE OR (s.deactivation_end_date IS NOT NULL AND s.deactivation_end_date < CURRENT_DATE))`
      ];
  const params = [];

  if (specialty) {
    params.push(specialty);
    conditions.push(`s.specialty = $${params.length}`);
  }

  if (date) {
    const parsedDate = new Date(`${date}T00:00:00`);
    if (!isNaN(parsedDate.getTime())) {
      const dayOfWeek = parsedDate.getDay();
      params.push(dayOfWeek);
      query += `
        INNER JOIN doctor_schedules ds
          ON ds.doctor_id = s.id
          AND ds.day_of_week = $${params.length}
          AND ds.is_active = TRUE
      `;

      // Exclude doctors who are deactivated on this specific date
      params.push(date);
      conditions.push(`NOT (s.deactivation_start_date IS NOT NULL AND s.deactivation_end_date IS NOT NULL AND $${params.length}::date >= s.deactivation_start_date AND $${params.length}::date <= s.deactivation_end_date)`);
    }
  } else if (!allStaff) {
    // If no specific date is passed and not allStaff, ensure doctor is not deactivated today
    conditions.push(`NOT (s.deactivation_start_date IS NOT NULL AND s.deactivation_end_date IS NOT NULL AND CURRENT_DATE >= s.deactivation_start_date AND CURRENT_DATE <= s.deactivation_end_date)`);
  }

  query += ` WHERE ${conditions.join(" AND ")} ORDER BY s.last_name, s.first_name`;

  const result = await pool.query(query, params);
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

async function getDoctorUpcomingAvailability(doctorId, daysAhead = 14) {
  // 1. Verify staff member (any active role — not just DOCTOR — so admins
  // can view upcoming availability for nurses, lab techs, etc. as well).
  const docResult = await pool.query(
    `
    SELECT
      s.id,
      s.first_name,
      s.last_name,
      s.specialty,
      s.department,
      s.is_active,
      s.deactivation_start_date,
      s.deactivation_end_date,
      r.name AS role
    FROM staff s
    JOIN roles r ON s.role_id = r.id
    WHERE s.id = $1
      AND (s.is_active = TRUE OR (s.deactivation_end_date IS NOT NULL AND s.deactivation_end_date < CURRENT_DATE))
    `,
    [doctorId]
  );

  if (docResult.rows.length === 0) {
    throw new Error("DOCTOR_NOT_FOUND");
  }

  const doctor = docResult.rows[0];

  // 2. Get all active schedules for this doctor
  const schedulesResult = await pool.query(
    `
    SELECT day_of_week, start_time, end_time, slot_duration_minutes
    FROM doctor_schedules
    WHERE doctor_id = $1 AND is_active = TRUE
    ORDER BY day_of_week, start_time
    `,
    [doctorId]
  );

  const schedules = schedulesResult.rows;
  if (schedules.length === 0) {
    return { doctor, availableDates: [] };
  }

  const scheduleDays = new Set(schedules.map((s) => s.day_of_week));
  const availableDates = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check each day starting from today up to daysAhead
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const dayOfWeek = d.getDay();
    if (!scheduleDays.has(dayOfWeek)) {
      continue;
    }

    const dateStr = d.toISOString().split("T")[0];

    // Check if doctor is deactivated on this specific date
    if (
      doctor.deactivation_start_date &&
      doctor.deactivation_end_date
    ) {
      const deactStart = new Date(doctor.deactivation_start_date).toISOString().split("T")[0];
      const deactEnd = new Date(doctor.deactivation_end_date).toISOString().split("T")[0];
      if (dateStr >= deactStart && dateStr <= deactEnd) {
        continue; // Skip date during deactivation period
      }
    }
    const daySchedules = schedules.filter((s) => s.day_of_week === dayOfWeek);

    // Get appointments on this date
    const apptsResult = await pool.query(
      `
      SELECT start_time, end_time
      FROM appointments
      WHERE doctor_id = $1
        AND appointment_date = $2
        AND status IN ('SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS')
      `,
      [doctorId, dateStr]
    );
    const existingAppointments = apptsResult.rows;

    const slots = [];
    for (const sch of daySchedules) {
      const generated = generateSlots(sch.start_time, sch.end_time, sch.slot_duration_minutes);
      for (const slot of generated) {
        const slotStart = timeToMinutes(slot.startTime);
        const slotEnd = timeToMinutes(slot.endTime);

        const booked = existingAppointments.some((appt) => {
          const apptStart = timeToMinutes(appt.start_time);
          const apptEnd = timeToMinutes(appt.end_time);
          return rangesOverlap(slotStart, slotEnd, apptStart, apptEnd);
        });

        slots.push({
          startTime: slot.startTime,
          endTime: slot.endTime,
          available: !booked,
        });
      }
    }

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    availableDates.push({
      date: dateStr,
      dayOfWeek,
      dayName: dayNames[dayOfWeek],
      formattedDate: `${dayNames[dayOfWeek]}, ${monthNames[d.getMonth()]} ${d.getDate()}`,
      slots,
      hasAvailableSlots: slots.some((s) => s.available),
    });
  }

  return {
    doctor,
    availableDates,
  };
}

async function createSchedule(doctorId, data) {
  // Any active staff member can have a schedule created for them (not just
  // doctors) — admins manage shifts/consultation slots for the whole team.
  const doctorResult = await pool.query(
    `
      SELECT s.id
      FROM staff s
      WHERE s.id = $1
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
  getDoctorUpcomingAvailability,
  createSchedule,
  deleteSchedule,
};

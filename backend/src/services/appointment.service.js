const pool = require("../config/database");

const {
  generateSlots,
  timeToMinutes,
  rangesOverlap,
} = require("../utils/time");

async function getAvailableSlots(
  doctorId,
  appointmentDate
) {
  const date = new Date(
    `${appointmentDate}T00:00:00`
  );

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
        AND status = 'SCHEDULED'
      ORDER BY start_time
    `,
    [doctorId, appointmentDate]
  );

  const existingAppointments =
    appointmentResult.rows;

  const slots = [];

  for (const schedule of scheduleResult.rows) {
    const generatedSlots = generateSlots(
      schedule.start_time,
      schedule.end_time,
      schedule.slot_duration_minutes
    );

    for (const slot of generatedSlots) {
      const slotStart = timeToMinutes(
        slot.startTime
      );

      const slotEnd = timeToMinutes(
        slot.endTime
      );

      const booked = existingAppointments.some(
        (appointment) => {
          const appointmentStart =
            timeToMinutes(
              appointment.start_time
            );

          const appointmentEnd =
            timeToMinutes(
              appointment.end_time
            );

          return rangesOverlap(
            slotStart,
            slotEnd,
            appointmentStart,
            appointmentEnd
          );
        }
      );

      slots.push({
        startTime: slot.startTime,
        endTime: slot.endTime,
        available: !booked,
      });
    }
  }

  return slots;
}

module.exports = {
  getAvailableSlots,
};

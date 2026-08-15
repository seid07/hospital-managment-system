const pool = require("../config/database");

async function generateAppointmentNumber(client) {
  const year = new Date().getFullYear();

  const result = await client.query(`
    SELECT appointment_number
    FROM appointments
    WHERE appointment_number LIKE $1
    ORDER BY appointment_number DESC
    LIMIT 1
  `, [`APT-${year}-%`]);

  let nextNumber = 1;

  if (result.rows.length > 0) {
    const lastNumber = result.rows[0]
      .appointment_number
      .split("-")
      .pop();

    nextNumber =
      Number(lastNumber) + 1;
  }

  return `APT-${year}-${String(
    nextNumber
  ).padStart(6, "0")}`;
}

module.exports = {
  generateAppointmentNumber,
};

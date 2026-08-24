const { generateWithSequence } = require("./number-generators");

async function generateAppointmentNumber(client) {
  return generateWithSequence(client, "APT", "seq_appointment_num");
}

module.exports = {
  generateAppointmentNumber,
};

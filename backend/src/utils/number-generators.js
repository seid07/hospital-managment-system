async function generateSequentialNumber(client, prefix, table, column) {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const result = await client.query(
    `
    SELECT ${column} AS num
    FROM ${table}
    WHERE ${column} LIKE $1
    ORDER BY ${column} DESC
    LIMIT 1
    `,
    [pattern]
  );

  let nextNumber = 1;
  if (result.rows.length > 0) {
    const lastPart = result.rows[0].num.split("-").pop();
    const parsed = parseInt(lastPart, 10);
    if (!Number.isNaN(parsed)) {
      nextNumber = parsed + 1;
    }
  }

  return `${prefix}-${year}-${String(nextNumber).padStart(6, "0")}`;
}

async function generatePrescriptionNumber(client) {
  return generateSequentialNumber(client, "RX", "prescriptions", "prescription_number");
}

async function generateLabOrderNumber(client) {
  return generateSequentialNumber(client, "LAB", "lab_orders", "order_number");
}

async function generateInvoiceNumber(client) {
  return generateSequentialNumber(client, "INV", "invoices", "invoice_number");
}

async function generatePaymentNumber(client) {
  return generateSequentialNumber(client, "PAY", "payments", "payment_number");
}

async function generatePatientNumber(client) {
  return generateSequentialNumber(client, "PAT", "patients", "patient_number");
}

module.exports = {
  generateSequentialNumber,
  generatePrescriptionNumber,
  generateLabOrderNumber,
  generateInvoiceNumber,
  generatePaymentNumber,
  generatePatientNumber,
};

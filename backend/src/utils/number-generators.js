const pool = require("../config/database");

async function generateWithSequence(clientOrPool, prefix, seqName) {
  const db = clientOrPool || pool;
  const year = new Date().getFullYear();

  try {
    const res = await db.query(`SELECT nextval('${seqName}') AS val`);
    const val = res.rows[0].val;
    return `${prefix}-${year}-${String(val).padStart(6, "0")}`;
  } catch (error) {
    // Fallback in case sequence query fails
    const timePart = Date.now().toString().slice(-4);
    const randPart = Math.floor(10 + Math.random() * 90);
    return `${prefix}-${year}-${timePart}${randPart}`;
  }
}

async function generatePrescriptionNumber(client) {
  return generateWithSequence(client, "RX", "seq_prescription_num");
}

async function generateLabOrderNumber(client) {
  return generateWithSequence(client, "LAB", "seq_lab_order_num");
}

async function generateInvoiceNumber(client) {
  return generateWithSequence(client, "INV", "seq_invoice_num");
}

async function generatePaymentNumber(client) {
  return generateWithSequence(client, "PAY", "seq_payment_num");
}

async function generatePatientNumber(client) {
  return generateWithSequence(client, "PAT", "seq_patient_num");
}

async function generateVisitNumber(client) {
  return generateWithSequence(client, "VIS", "seq_visit_num");
}

async function generateOrderNumber(client) {
  return generateWithSequence(client, "ORD", "seq_order_num");
}

async function generateAdmissionNumber(client) {
  return generateWithSequence(client, "ADM", "seq_admission_num");
}

module.exports = {
  generateWithSequence,
  generatePrescriptionNumber,
  generateLabOrderNumber,
  generateInvoiceNumber,
  generatePaymentNumber,
  generatePatientNumber,
  generateVisitNumber,
  generateOrderNumber,
  generateAdmissionNumber,
};

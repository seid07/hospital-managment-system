-- Migration 008: Missing indexes audit
--
-- Additive only — every statement uses IF NOT EXISTS and nothing is dropped,
-- altered, or renamed. This migration was written by auditing every existing
-- CREATE INDEX across migrations 001-007 against the columns called out for
-- review: patient_id, appointment_date, status columns on
-- appointments/service_orders/prescriptions, payment status, and created_at
-- on high-traffic tables (appointments, service_orders, prescriptions,
-- lab_orders, payments).
--
-- Already indexed and confirmed fine, NOT touched here:
--   * patient_id            -> present on patients, encounters, vitals,
--                              diagnoses, prescriptions, lab_orders,
--                              invoices, payments, visits, service_orders,
--                              radiology_orders, admissions, queue_entries
--                              (see idx_*_patient in migrations 002-004)
--   * appointments.status   -> idx_appointments_status (002)
--   * service_orders.status -> idx_service_orders_status (004)
--   * prescriptions.status  -> idx_prescriptions_status (003)
--   * payment status        -> invoices.status has idx_invoices_status (003);
--                              service_orders.status doubles as the
--                              per-order payment gate and is already indexed
--                              (idx_service_orders_status, plus the
--                              (paid_amount, status) composite idx_srv_orders_paid_status
--                              added in 006)
--   * prescriptions.created_at -> idx_prescriptions_created (003)
--   * lab_orders.created_at    -> idx_lab_orders_created (003)
--   * payments.created_at      -> idx_payments_created (003)
--
-- Genuinely missing (added below):
--   * appointments.appointment_date as a standalone index. It was only ever
--     indexed as the trailing column of the composite idx_appointments_doctor_date
--     (doctor_id, appointment_date), which Postgres can't use efficiently for
--     date-only lookups such as the reception desk's "today's appointments"
--     query (getAppointments({ date: today }) with no doctorId) or the
--     dashboard's day-range filters.
--   * appointments.created_at — no index existed at all; appointments is
--     listed as high-traffic and the list view supports "most recently
--     created" style sorting/filtering via the API layer.
--   * service_orders.created_at — no index existed at all, despite
--     service_orders being explicitly listed as high-traffic and being
--     ordered by created_at in both serviceOrder.service.js
--     (getServiceOrdersByVisit) and billing.service.js (pending cashier
--     orders queue).

CREATE INDEX IF NOT EXISTS idx_appointments_appointment_date
  ON appointments(appointment_date);

CREATE INDEX IF NOT EXISTS idx_appointments_created_at
  ON appointments(created_at);

CREATE INDEX IF NOT EXISTS idx_service_orders_created_at
  ON service_orders(created_at);

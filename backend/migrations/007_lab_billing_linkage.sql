-- Migration 007: Link Laboratory Test Catalog to Master Billable Service Catalog
--
-- Problem being fixed:
-- Doctor-ordered lab tests (lab_test_catalog / lab_orders) were completely
-- disconnected from the billable services catalog (services / service_orders)
-- that drives the Registrar Finance queue and department queue_entries.
-- This meant lab orders never appeared in the cashier payment queue and
-- specimen collection was never gated on payment.
--
-- This migration only ADDS a nullable linkage column and an index.
-- It does not touch, rename, or drop any existing column, table, or data.

ALTER TABLE lab_test_catalog
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_service ON lab_test_catalog(service_id);

-- Note: existing lab_test_catalog rows will have service_id = NULL until an
-- administrator links each one to a billable service via the Laboratory
-- Catalog screen (Admin/Lab Tech > Laboratory > Catalog > Edit Test).
-- Until linked, ordering that test from the Clinical Encounter screen will
-- be blocked with a clear error rather than silently bypassing payment.

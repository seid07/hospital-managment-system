-- Migration 010: Staff Deactivation Tracking & Extended Billing
-- Adds fields for temporary staff deactivation with automated date range tracking.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS deactivation_reason VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS deactivation_start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS deactivation_end_date DATE NULL;

CREATE INDEX IF NOT EXISTS idx_staff_deactivation_dates 
  ON staff (deactivation_start_date, deactivation_end_date);

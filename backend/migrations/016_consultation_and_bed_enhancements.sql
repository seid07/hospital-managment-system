-- Migration: 016_consultation_and_bed_enhancements.sql
-- Adds consultation clinical documentation fields, service order linkage, and inpatient bed attributes

-- 1. Consultation clinical notes fields on encounters
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS history_symptoms TEXT;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS examination_findings TEXT;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS follow_up_instructions TEXT;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'ROUTINE';

-- 2. Link service orders to clinical encounters
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_orders_encounter ON service_orders(encounter_id);

-- 3. Inpatient bed management attributes
ALTER TABLE beds ADD COLUMN IF NOT EXISTS room_number VARCHAR(50);
ALTER TABLE beds ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Unique bed code constraint per ward
CREATE UNIQUE INDEX IF NOT EXISTS idx_beds_ward_bed_number_unique ON beds(ward_name, bed_number);
CREATE INDEX IF NOT EXISTS idx_beds_ward_status ON beds(ward_name, status);


-- Migration: 015_operational_departments_schema.sql
-- Adds operational execution and reporting columns for Radiology, Procedures, Surgery, and Inpatient Ward

-- 1. Procedure Orders Execution Columns
ALTER TABLE procedure_orders ADD COLUMN IF NOT EXISTS findings TEXT;
ALTER TABLE procedure_orders ADD COLUMN IF NOT EXISTS materials_used TEXT;
ALTER TABLE procedure_orders ADD COLUMN IF NOT EXISTS complications TEXT;
ALTER TABLE procedure_orders ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

-- 2. Surgery Orders Operative & Recovery Columns
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS theatre_room VARCHAR(50);
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS assistant_name VARCHAR(100);
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS anesthetist_name VARCHAR(100);
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS specimens TEXT;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS recovery_status VARCHAR(50);
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS recovery_vitals JSONB;

-- 3. Radiology Orders Timing & Reporting
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS report_text TEXT;
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS recommendations TEXT;

-- 4. Admissions Clinical & Discharge Enhancements
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS admission_status VARCHAR(30) DEFAULT 'PENDING';
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_diagnosis TEXT;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_medications TEXT;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_follow_up TEXT;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_instructions TEXT;

-- Migration: 014_nursing_and_clinical_extensions.sql
-- Implements Nursing Tasks, Medication Administration Records (MAR), Nursing Notes, and Ward Transfers

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Nursing Tasks Table
CREATE TABLE IF NOT EXISTS nursing_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    task_type VARCHAR(100) NOT NULL, -- 'VITALS', 'MEDICATION', 'WOUND_CARE', 'HYGIENE', 'OBSERVATION', 'GENERAL'
    priority VARCHAR(20) NOT NULL DEFAULT 'ROUTINE', -- 'ROUTINE', 'URGENT', 'EMERGENCY'
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
    due_time TIMESTAMP,
    completed_at TIMESTAMP,
    assigned_nurse_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nursing_tasks_patient ON nursing_tasks(patient_id);
CREATE INDEX IF NOT EXISTS idx_nursing_tasks_status ON nursing_tasks(status);
CREATE INDEX IF NOT EXISTS idx_nursing_tasks_due ON nursing_tasks(due_time);

-- 2. Medication Administration Records (MAR) Table
CREATE TABLE IF NOT EXISTS medication_administrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    medication_name VARCHAR(150) NOT NULL,
    dose VARCHAR(100) NOT NULL,
    route VARCHAR(50) NOT NULL DEFAULT 'Oral', -- 'Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhalation', 'Other'
    status VARCHAR(30) NOT NULL DEFAULT 'GIVEN', -- 'GIVEN', 'HELD', 'REFUSED', 'MISSED'
    administered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    administered_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    nurse_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    reason_not_administered TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_med_admin_patient ON medication_administrations(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_admin_presc ON medication_administrations(prescription_id);
CREATE INDEX IF NOT EXISTS idx_med_admin_time ON medication_administrations(administered_at);

-- 3. Clinical Nursing Notes Table
CREATE TABLE IF NOT EXISTS nursing_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    nurse_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'GENERAL', -- 'ASSESSMENT', 'PROGRESS', 'HANDOVER', 'INCIDENT', 'DISCHARGE_PLAN'
    note TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nursing_notes_patient ON nursing_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_nursing_notes_created ON nursing_notes(created_at);

-- 4. Inpatient Ward Bed Transfers Table
CREATE TABLE IF NOT EXISTS ward_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    from_bed_id UUID REFERENCES beds(id) ON DELETE SET NULL,
    to_bed_id UUID NOT NULL REFERENCES beds(id) ON DELETE SET NULL,
    transfer_reason TEXT,
    transferred_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ward_transfers_adm ON ward_transfers(admission_id);

-- 5. Enhanced Vitals Fields Check
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS pain_score INT;
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS recorded_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;

-- 6. Enhanced Surgery Checklist & Execution Fields
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS surgical_team JSONB DEFAULT '[]'::jsonb;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS anesthesia_assessment TEXT;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS allergies_reviewed BOOLEAN DEFAULT FALSE;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS site_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS equipment_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS intra_op_findings TEXT;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS complications TEXT;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS blood_loss_ml INT DEFAULT 0;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS implants_used TEXT;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS post_op_instructions TEXT;
ALTER TABLE surgery_orders ADD COLUMN IF NOT EXISTS recovery_destination VARCHAR(50) DEFAULT 'WARD'; -- 'WARD', 'ICU', 'DISCHARGE', 'RECOVERY'

-- 7. Enhanced Radiology Recommendation Field
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS recommendations TEXT;

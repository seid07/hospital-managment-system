-- Migration: 004_service_first_workflow.sql
-- Implements Service-First Payment Workflow, Department Queues, Service Catalog, and Specialized Clinical Modalities

-- 1. Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Standard Hospital Departments
INSERT INTO departments (code, name, description)
VALUES
    ('REGISTRATION', 'Registration & Cashier', 'Front desk patient registration and cashier payments'),
    ('CLINICAL', 'Clinical & Outpatient', 'General and specialist medical consultations'),
    ('LABORATORY', 'Diagnostic Pathology & Laboratory', 'Clinical diagnostic laboratory and pathology tests'),
    ('RADIOLOGY', 'Radiology & Medical Imaging', 'Diagnostic X-Ray and Ultrasound imaging'),
    ('CARDIOLOGY', 'Cardiology & Diagnostic Testing', 'Electrocardiogram (ECG) and cardiac diagnostics'),
    ('PROCEDURE', 'Nursing & Clinical Procedures', 'Minor surgical procedures, dressings, and injections'),
    ('WARD', 'Inpatient Care & Ward', 'Inpatient admission, beds, and daily nursing care'),
    ('SURGERY', 'Operating Theatre & Surgery', 'Surgical procedures and operative care'),
    ('PHARMACY', 'Hospital Pharmacy & Formulary', 'Medication dispensing and pharmaceutical payment')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 3. Additional Roles if not present
INSERT INTO roles (name, description)
VALUES
    ('RADIOLOGIST', 'Radiology technician and imaging specialist'),
    ('SURGEON', 'Surgical specialist and operating theatre staff'),
    ('WARD_STAFF', 'Inpatient ward nurse and bed manager')
ON CONFLICT (name) DO NOTHING;

-- 4. Master Service Catalog Table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
    is_active BOOLEAN DEFAULT TRUE,
    requires_payment BOOLEAN DEFAULT TRUE,
    payment_location VARCHAR(50) DEFAULT 'CASHIER', -- 'CASHIER' or 'PHARMACY'
    queue_enabled BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed the 19 Required Standard Hospital Services
INSERT INTO services (code, name, category, department_id, price, currency, requires_payment, payment_location, queue_enabled, description)
SELECT 
    s.code, s.name, s.category, d.id, s.price, 'ETB', s.requires_payment, s.payment_location, s.queue_enabled, s.description
FROM (
    VALUES
    -- Consultation Services
    ('CONSULT-GENERAL', 'General Consultation', 'Consultation', 'CLINICAL', 300.00, TRUE, 'CASHIER', TRUE, 'General medical consultation with physician'),
    ('CONSULT-SPECIALIST', 'Specialist Consultation', 'Consultation', 'CLINICAL', 500.00, TRUE, 'CASHIER', TRUE, 'Specialized medical consultation (Cardiology, Surgery, Internal Medicine)'),
    ('CONSULT-FOLLOWUP', 'Follow-up Consultation', 'Consultation', 'CLINICAL', 150.00, TRUE, 'CASHIER', TRUE, 'Routine follow-up clinical assessment'),
    ('CONSULT-EMERGENCY', 'Emergency Consultation', 'Consultation', 'CLINICAL', 400.00, TRUE, 'CASHIER', TRUE, 'Urgent emergency physician consultation'),

    -- Administrative Service
    ('ADMIN-REGISTRATION', 'Patient Card / Registration Fee', 'Administrative', 'REGISTRATION', 50.00, TRUE, 'CASHIER', FALSE, 'Standard patient file intake and card registration'),

    -- Laboratory Services
    ('LAB-GENERAL', 'Laboratory General Service', 'Laboratory', 'LABORATORY', 100.00, TRUE, 'CASHIER', TRUE, 'General laboratory intake and specimen handling'),
    ('LAB-CBC', 'Complete Blood Count (CBC)', 'Laboratory', 'LABORATORY', 150.00, TRUE, 'CASHIER', TRUE, 'Full hemogram blood test panel'),
    ('LAB-URINE', 'Urinalysis Test', 'Laboratory', 'LABORATORY', 80.00, TRUE, 'CASHIER', TRUE, 'Standard physical and chemical urine examination'),
    ('LAB-MALARIA', 'Malaria Rapid & Microscopy Test', 'Laboratory', 'LABORATORY', 120.00, TRUE, 'CASHIER', TRUE, 'Malaria blood smear and rapid antigen diagnostic'),
    ('LAB-CHEMISTRY', 'Blood Chemistry Panel', 'Laboratory', 'LABORATORY', 250.00, TRUE, 'CASHIER', TRUE, 'Comprehensive metabolic and blood chemistry panel'),

    -- Imaging / Diagnostics
    ('IMG-XRAY', 'X-Ray Diagnostic Imaging', 'Imaging', 'RADIOLOGY', 300.00, TRUE, 'CASHIER', TRUE, 'Digital diagnostic radiography examination'),
    ('IMG-ULTRASOUND', 'Ultrasound Sonogram Scan', 'Imaging', 'RADIOLOGY', 350.00, TRUE, 'CASHIER', TRUE, 'Diagnostic abdominal/pelvic sonogram imaging'),
    ('DIAG-ECG', 'Electrocardiogram (ECG)', 'Diagnostic', 'CARDIOLOGY', 200.00, TRUE, 'CASHIER', TRUE, '12-lead diagnostic electrocardiography trace'),

    -- Procedures
    ('PROC-GENERAL', 'Minor Clinical Procedure', 'Procedure', 'PROCEDURE', 250.00, TRUE, 'CASHIER', TRUE, 'Standard minor outpatient procedure or suture'),
    ('PROC-DRESSING', 'Wound Dressing & Care', 'Procedure', 'PROCEDURE', 100.00, TRUE, 'CASHIER', TRUE, 'Surgical and traumatic wound cleaning and dressing'),
    ('PROC-INJECTION', 'Clinical Injection Administration', 'Procedure', 'PROCEDURE', 50.00, TRUE, 'CASHIER', TRUE, 'Intramuscular or intravenous therapeutic injection'),

    -- Inpatient Services
    ('WARD-BED-DAY', 'Inpatient Bed / Daily Care', 'Inpatient', 'WARD', 400.00, TRUE, 'CASHIER', TRUE, 'Daily inpatient room accommodation and nursing support'),
    ('SURG-GENERAL', 'Surgical Operation & OT', 'Surgery', 'SURGERY', 3500.00, TRUE, 'CASHIER', TRUE, 'Major/minor operating theatre surgical procedure'),

    -- Pharmacy Service
    ('PHARM-MEDICATION', 'Prescription Medicines & Pharmaceuticals', 'Pharmacy', 'PHARMACY', 0.00, TRUE, 'PHARMACY', TRUE, 'Dispensed medications billed directly at pharmacy counter')
) AS s(code, name, category, dept_code, price, requires_payment, payment_location, queue_enabled, description)
JOIN departments d ON d.code = s.dept_code
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    payment_location = EXCLUDED.payment_location,
    queue_enabled = EXCLUDED.queue_enabled,
    description = EXCLUDED.description;

-- 5. Visits / Encounters Table
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'COMPLETED', 'CANCELLED'
    visit_type VARCHAR(50) DEFAULT 'OUTPATIENT', -- 'OUTPATIENT', 'EMERGENCY', 'INPATIENT'
    emergency_override BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    override_authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
    override_authorized_at TIMESTAMP,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);

-- 6. Service Orders Table (Central Lifecycle Object)
CREATE TABLE IF NOT EXISTS service_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(40) NOT NULL DEFAULT 'ORDERED', 
    -- 'ORDERED', 'WAITING_PAYMENT', 'PAID', 'AUTHORIZED', 'QUEUED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'EXPIRED'
    emergency_override BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    authorized_at TIMESTAMP,
    authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
    authorization_source VARCHAR(40), -- 'PAYMENT', 'EMERGENCY_OVERRIDE', 'ADMIN_OVERRIDE', 'ZERO_FEE'
    clinical_notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_orders_visit ON service_orders(visit_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_patient ON service_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_dept ON service_orders(department_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_orders_auth ON service_orders(authorized_at);

-- 7. Payment Allocations (Mapping Payments to Service Orders)
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_order ON payment_allocations(service_order_id);

-- 8. Department Queues Table
CREATE TABLE IF NOT EXISTS queue_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    queue_number VARCHAR(30) NOT NULL, -- e.g. 'LAB-001', 'XRAY-001', 'DOC-001'
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL', -- 'NORMAL', 'URGENT', 'EMERGENCY'
    status VARCHAR(30) NOT NULL DEFAULT 'WAITING', -- 'WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'
    authorized_at TIMESTAMP NOT NULL,
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    called_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    assigned_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_queue_dept_status ON queue_entries(department_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_order_sorting ON queue_entries(department_id, priority DESC, authorized_at ASC);
CREATE INDEX IF NOT EXISTS idx_queue_patient ON queue_entries(patient_id);

-- 9. Radiology / Imaging Modality Tables
CREATE TABLE IF NOT EXISTS radiology_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    modality VARCHAR(50) NOT NULL, -- 'X_RAY', 'ULTRASOUND'
    clinical_indication TEXT,
    technician_notes TEXT,
    findings TEXT,
    impression TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ORDERED', -- 'ORDERED', 'PERFORMED', 'REPORTED', 'VERIFIED'
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    performed_at TIMESTAMP,
    reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reported_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radiology_orders_patient ON radiology_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_radiology_orders_status ON radiology_orders(status);

-- 10. Inpatient Ward & Bed Management Tables
CREATE TABLE IF NOT EXISTS beds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bed_number VARCHAR(30) UNIQUE NOT NULL,
    ward_name VARCHAR(100) NOT NULL DEFAULT 'General Ward',
    bed_type VARCHAR(50) DEFAULT 'STANDARD', -- 'STANDARD', 'ICU', 'ISOLATION', 'PEDIATRIC'
    status VARCHAR(30) DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE'
    daily_rate NUMERIC(10, 2) DEFAULT 400.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default beds if empty
INSERT INTO beds (bed_number, ward_name, bed_type, daily_rate)
VALUES
    ('BED-101', 'General Male Ward', 'STANDARD', 400.00),
    ('BED-102', 'General Male Ward', 'STANDARD', 400.00),
    ('BED-201', 'General Female Ward', 'STANDARD', 400.00),
    ('BED-202', 'General Female Ward', 'STANDARD', 400.00),
    ('BED-ICU-01', 'Intensive Care Unit (ICU)', 'ICU', 1200.00),
    ('BED-PED-01', 'Pediatric Ward', 'PEDIATRIC', 350.00)
ON CONFLICT (bed_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS admissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admission_number VARCHAR(50) UNIQUE NOT NULL,
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    bed_id UUID REFERENCES beds(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    admission_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    discharge_date TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'ADMITTED', -- 'ADMITTED', 'DISCHARGED', 'TRANSFERRED'
    admission_reason TEXT,
    discharge_summary TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);

-- 11. Procedures & Minor Nursing Orders
CREATE TABLE IF NOT EXISTS procedure_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    procedure_type VARCHAR(50) NOT NULL, -- 'DRESSING', 'INJECTION', 'GENERAL'
    procedure_name VARCHAR(150) NOT NULL,
    clinical_instructions TEXT,
    procedure_notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ORDERED', -- 'ORDERED', 'PERFORMED', 'COMPLETED'
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    performed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Operating Theatre & Surgery Orders
CREATE TABLE IF NOT EXISTS surgery_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    surgeon_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    surgery_name VARCHAR(150) NOT NULL,
    pre_op_diagnosis TEXT,
    post_op_diagnosis TEXT,
    pre_op_checklist_complete BOOLEAN DEFAULT FALSE,
    anesthesia_type VARCHAR(50),
    operation_notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'IN_THEATRE', 'RECOVERY', 'COMPLETED', 'CANCELLED'
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Ensure visits column on encounters and invoices if not already present
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id) ON DELETE SET NULL;

-- 14. Modernize payment methods and invoice item categories
ALTER TABLE payments ALTER COLUMN invoice_id DROP NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check 
  CHECK (payment_method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'INSURANCE', 'BANK_TRANSFER', 'TELEBIRR', 'CBE_BIRR', 'BANK', 'OTHER'));

ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_item_type_check;

ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_status_check;
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_status_check 
  CHECK (status IN ('ACTIVE', 'PAID', 'DISPENSED', 'PARTIALLY_DISPENSED', 'CANCELLED'));

-- 15. Create Atomic Sequences for Document & Entity Numbers
CREATE SEQUENCE IF NOT EXISTS seq_payment_num START 100;
CREATE SEQUENCE IF NOT EXISTS seq_invoice_num START 100;
CREATE SEQUENCE IF NOT EXISTS seq_prescription_num START 100;
CREATE SEQUENCE IF NOT EXISTS seq_lab_order_num START 100;
CREATE SEQUENCE IF NOT EXISTS seq_patient_num START 100;
CREATE SEQUENCE IF NOT EXISTS seq_visit_num START 100;
CREATE SEQUENCE IF NOT EXISTS seq_order_num START 100;
CREATE SEQUENCE IF NOT EXISTS seq_admission_num START 100;



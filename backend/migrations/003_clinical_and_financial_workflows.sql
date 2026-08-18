-- =====================================================
-- Hospital Management System
-- Migration 003
-- Clinical Encounters, Vitals, Diagnoses, Prescriptions,
-- Pharmacy Inventory, Laboratory Orders & Results,
-- Billing, Invoices, Payments, Notifications
-- =====================================================

-- -------------------------
-- 1. EXTEND ROLES
-- -------------------------
INSERT INTO roles (name, description)
VALUES
    ('NURSE', 'Nursing and triage staff'),
    ('LAB_TECH', 'Laboratory technician and diagnostics staff')
ON CONFLICT (name) DO NOTHING;

-- -------------------------
-- 2. UPDATE APPOINTMENTS STATUS CONSTRAINT
-- -------------------------
ALTER TABLE appointments
    DROP CONSTRAINT IF EXISTS valid_appointment_status;

ALTER TABLE appointments
    ADD CONSTRAINT valid_appointment_status
    CHECK (
        status IN (
            'SCHEDULED',
            'CHECKED_IN',
            'IN_PROGRESS',
            'COMPLETED',
            'CANCELLED',
            'NO_SHOW'
        )
    );

-- -------------------------
-- 3. CLINICAL ENCOUNTERS
-- -------------------------
CREATE TABLE IF NOT EXISTS encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    doctor_id UUID NOT NULL REFERENCES staff(id),
    appointment_id UUID REFERENCES appointments(id),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'CANCELLED')),
    visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    chief_complaint TEXT,
    clinical_notes TEXT,
    treatment_plan TEXT,
    follow_up_date DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_doctor ON encounters(doctor_id);
CREATE INDEX IF NOT EXISTS idx_encounters_appointment ON encounters(appointment_id);
CREATE INDEX IF NOT EXISTS idx_encounters_date ON encounters(visit_date);
CREATE INDEX IF NOT EXISTS idx_encounters_status ON encounters(status);

-- -------------------------
-- 4. VITAL SIGNS & TRIAGE
-- -------------------------
CREATE TABLE IF NOT EXISTS vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    encounter_id UUID REFERENCES encounters(id),
    appointment_id UUID REFERENCES appointments(id),
    recorded_by UUID REFERENCES users(id),
    temperature NUMERIC(4,1) CHECK (temperature IS NULL OR (temperature >= 30.0 AND temperature <= 45.0)),
    heart_rate INTEGER CHECK (heart_rate IS NULL OR (heart_rate >= 20 AND heart_rate <= 300)),
    respiratory_rate INTEGER CHECK (respiratory_rate IS NULL OR (respiratory_rate >= 5 AND respiratory_rate <= 100)),
    systolic_bp INTEGER CHECK (systolic_bp IS NULL OR (systolic_bp >= 40 AND systolic_bp <= 300)),
    diastolic_bp INTEGER CHECK (diastolic_bp IS NULL OR (diastolic_bp >= 20 AND diastolic_bp <= 200)),
    oxygen_saturation NUMERIC(4,1) CHECK (oxygen_saturation IS NULL OR (oxygen_saturation >= 40.0 AND oxygen_saturation <= 100.0)),
    weight NUMERIC(5,2) CHECK (weight IS NULL OR (weight >= 0.5 AND weight <= 500.0)),
    height NUMERIC(5,2) CHECK (height IS NULL OR (height >= 20.0 AND height <= 280.0)),
    bmi NUMERIC(4,1),
    triage_category VARCHAR(30) DEFAULT 'NORMAL' CHECK (triage_category IN ('EMERGENCY', 'URGENT', 'NORMAL', 'NON_URGENT')),
    notes TEXT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_encounter ON vitals(encounter_id);
CREATE INDEX IF NOT EXISTS idx_vitals_recorded_at ON vitals(recorded_at);

-- -------------------------
-- 5. DIAGNOSES
-- -------------------------
CREATE TABLE IF NOT EXISTS diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    doctor_id UUID NOT NULL REFERENCES staff(id),
    code VARCHAR(50),
    description TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    severity VARCHAR(30) DEFAULT 'MODERATE' CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE', 'CRITICAL')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_encounter ON diagnoses(encounter_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(patient_id);

-- -------------------------
-- 6. MEDICATIONS & INVENTORY
-- -------------------------
CREATE TABLE IF NOT EXISTS medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    form VARCHAR(50) NOT NULL DEFAULT 'Tablet',
    strength VARCHAR(50),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 10 CHECK (reorder_level >= 0),
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_medications_code ON medications(code);
CREATE INDEX IF NOT EXISTS idx_medications_name ON medications(name);

-- -------------------------
-- 7. PRESCRIPTIONS
-- -------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_number VARCHAR(40) UNIQUE NOT NULL,
    encounter_id UUID REFERENCES encounters(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    doctor_id UUID NOT NULL REFERENCES staff(id),
    medication_id UUID REFERENCES medications(id),
    medication_name VARCHAR(200) NOT NULL,
    dosage VARCHAR(100) NOT NULL,
    frequency VARCHAR(100) NOT NULL,
    route VARCHAR(50) NOT NULL DEFAULT 'Oral',
    duration VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    instructions TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISPENSED', 'PARTIALLY_DISPENSED', 'CANCELLED')),
    dispensed_by UUID REFERENCES users(id),
    dispensed_at TIMESTAMP,
    dispensed_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter ON prescriptions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_created ON prescriptions(created_at);

-- -------------------------
-- 8. LABORATORY TEST CATALOG
-- -------------------------
CREATE TABLE IF NOT EXISTS lab_test_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    reference_range TEXT,
    unit VARCHAR(50),
    price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    turnaround_time_hours INTEGER DEFAULT 24,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lab_catalog_code ON lab_test_catalog(code);
CREATE INDEX IF NOT EXISTS idx_lab_catalog_category ON lab_test_catalog(category);

-- -------------------------
-- 9. LABORATORY ORDERS
-- -------------------------
CREATE TABLE IF NOT EXISTS lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(40) UNIQUE NOT NULL,
    encounter_id UUID REFERENCES encounters(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    doctor_id UUID NOT NULL REFERENCES staff(id),
    test_id UUID NOT NULL REFERENCES lab_test_catalog(id),
    clinical_indication TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE', 'URGENT', 'STAT')),
    status VARCHAR(30) NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'SPECIMEN_COLLECTED', 'PROCESSING', 'RESULTED', 'VERIFIED', 'CANCELLED')),
    specimen_collected_at TIMESTAMP,
    specimen_collected_by UUID REFERENCES users(id),
    resulted_at TIMESTAMP,
    resulted_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_doctor ON lab_orders(doctor_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_test ON lab_orders(test_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_created ON lab_orders(created_at);

-- -------------------------
-- 10. LABORATORY RESULTS
-- -------------------------
CREATE TABLE IF NOT EXISTS lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_order_id UUID NOT NULL UNIQUE REFERENCES lab_orders(id) ON DELETE CASCADE,
    result_value TEXT NOT NULL,
    unit VARCHAR(50),
    reference_range TEXT,
    is_abnormal BOOLEAN DEFAULT FALSE,
    comments TEXT,
    entered_by UUID NOT NULL REFERENCES users(id),
    entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lab_results_order ON lab_results(lab_order_id);

-- -------------------------
-- 11. BILLABLE SERVICES CATALOG
-- -------------------------
CREATE TABLE IF NOT EXISTS billable_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    standard_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (standard_fee >= 0),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billable_services_code ON billable_services(code);

-- -------------------------
-- 12. INVOICES
-- -------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(40) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id),
    encounter_id UUID REFERENCES encounters(id),
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    balance_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
    due_date DATE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_encounter ON invoices(encounter_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);

-- -------------------------
-- 13. INVOICE ITEMS
-- -------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('CONSULTATION', 'LAB_TEST', 'MEDICATION', 'PROCEDURE', 'SERVICE', 'OTHER')),
    reference_id UUID,
    description VARCHAR(255) NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- -------------------------
-- 14. PAYMENTS
-- -------------------------
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_number VARCHAR(40) UNIQUE NOT NULL,
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'INSURANCE', 'BANK_TRANSFER')),
    transaction_reference VARCHAR(100),
    notes TEXT,
    received_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);

-- -------------------------
-- 15. NOTIFICATIONS
-- -------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    target_role VARCHAR(30),
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'INFO' CHECK (type IN ('INFO', 'WARNING', 'ALERT', 'SUCCESS')),
    link VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(target_role);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

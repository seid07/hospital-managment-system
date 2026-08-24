-- Migration 006: Selective Payments, Inventory Transactions, Price History, and Lab Turnaround Times

-- 1. Inventory Transactions Table (Real Pharmacy Inventory Accounting)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID NOT NULL REFERENCES medications(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(50) NOT NULL, -- 'DISPENSE', 'RESTOCK', 'ADJUSTMENT', 'RETURN'
    previous_quantity INTEGER NOT NULL,
    quantity_changed INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_med ON inventory_transactions(medicine_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON inventory_transactions(created_at);

-- 2. Service Price History Table (Admin Service Pricing Audit)
CREATE TABLE IF NOT EXISTS service_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    old_price NUMERIC(10, 2) NOT NULL,
    new_price NUMERIC(10, 2) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_srv_price_hist_srv ON service_price_history(service_id);

-- 3. Medicine Price History Table (Pharmacy Medicine Pricing Audit)
CREATE TABLE IF NOT EXISTS medicine_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    old_price NUMERIC(10, 2) NOT NULL,
    new_price NUMERIC(10, 2) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_med_price_hist_med ON medicine_price_history(medicine_id);

-- 4. Enhance Service Orders with payment tracking & cancellation metadata
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 5. Enhance Lab Orders for Real Turnaround Time Tracking
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS sample_collected_at TIMESTAMP;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS result_completed_at TIMESTAMP;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS result_verified_at TIMESTAMP;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS released_at TIMESTAMP;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS actual_turnaround_time_seconds INTEGER;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES service_orders(id) ON DELETE SET NULL;

-- 6. Add Indexes for live search and fast querying
CREATE INDEX IF NOT EXISTS idx_patients_name_search ON patients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_number ON patients(patient_number);
CREATE INDEX IF NOT EXISTS idx_srv_orders_paid_status ON service_orders(paid_amount, status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_tat ON lab_orders(actual_turnaround_time_seconds);

-- 7. Sequence for Appointment Numbers
CREATE SEQUENCE IF NOT EXISTS seq_appointment_num START 100;

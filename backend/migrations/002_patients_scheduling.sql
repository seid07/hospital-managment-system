-- =====================================================
-- Hospital Management System
-- Migration 002
-- Patients + Doctor Scheduling + Appointments
-- =====================================================

-- -------------------------
-- PATIENTS
-- -------------------------

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    patient_number VARCHAR(30) UNIQUE NOT NULL,

    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,

    date_of_birth DATE NOT NULL,

    gender VARCHAR(20) NOT NULL,

    phone VARCHAR(30) NOT NULL,
    email VARCHAR(150),

    address TEXT,

    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(30),

    created_by UUID REFERENCES users(id),

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- DOCTOR SCHEDULES
-- -------------------------

CREATE TABLE doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    doctor_id UUID NOT NULL REFERENCES staff(id),

    day_of_week SMALLINT NOT NULL,

    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    slot_duration_minutes INTEGER NOT NULL DEFAULT 30,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_day_of_week
        CHECK (day_of_week BETWEEN 0 AND 6),

    CONSTRAINT valid_schedule_time
        CHECK (start_time < end_time),

    CONSTRAINT valid_slot_duration
        CHECK (slot_duration_minutes > 0)
);

-- -------------------------
-- APPOINTMENTS
-- -------------------------

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    appointment_number VARCHAR(30) UNIQUE NOT NULL,

    patient_id UUID NOT NULL REFERENCES patients(id),

    doctor_id UUID NOT NULL REFERENCES staff(id),

    appointment_date DATE NOT NULL,

    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',

    reason TEXT,

    notes TEXT,

    created_by UUID REFERENCES users(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_appointment_time
        CHECK (start_time < end_time),

    CONSTRAINT valid_appointment_status
        CHECK (
            status IN (
                'SCHEDULED',
                'COMPLETED',
                'CANCELLED',
                'NO_SHOW'
            )
        )
);

-- -------------------------
-- INDEXES
-- -------------------------

CREATE INDEX idx_patients_patient_number
ON patients(patient_number);

CREATE INDEX idx_patients_name
ON patients(last_name, first_name);

CREATE INDEX idx_patients_phone
ON patients(phone);

CREATE INDEX idx_doctor_schedules_doctor
ON doctor_schedules(doctor_id);

CREATE INDEX idx_appointments_patient
ON appointments(patient_id);

CREATE INDEX idx_appointments_doctor_date
ON appointments(doctor_id, appointment_date);

CREATE INDEX idx_appointments_status
ON appointments(status);

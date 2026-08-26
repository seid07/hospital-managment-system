-- =====================================================
-- Hospital Management System
-- Migration 009: Doctor-to-Doctor Referral System
-- =====================================================

-- 1. REFERRALS TABLE
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,

    referring_doctor_id UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    receiving_doctor_id UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,

    referral_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    urgency VARCHAR(20) NOT NULL DEFAULT 'ROUTINE'
        CHECK (urgency IN ('ROUTINE', 'URGENT', 'EMERGENCY')),

    -- Clinical content
    symptoms            TEXT,
    findings            TEXT,
    diagnosis           TEXT,
    investigation_info  TEXT,
    treatment_provided  TEXT,
    case_note           TEXT NOT NULL,

    -- Status workflow: PENDING -> VIEWED -> RESPONDED
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'VIEWED', 'RESPONDED')),

    -- Response fields (populated when receiving doctor responds)
    response_assessment     TEXT,
    response_recommendation TEXT,
    response_next_step      TEXT,
    response_treatment      TEXT,
    response_followup       TEXT,

    -- Timestamps
    viewed_at    TIMESTAMP,
    responded_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- A doctor cannot refer a patient to themselves
    CONSTRAINT referral_no_self_referral
        CHECK (referring_doctor_id <> receiving_doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_patient        ON referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referring      ON referrals(referring_doctor_id);
CREATE INDEX IF NOT EXISTS idx_referrals_receiving      ON referrals(receiving_doctor_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status         ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_urgency_date   ON referrals(urgency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_created_at     ON referrals(created_at DESC);

-- 2. REFERRAL MESSAGES TABLE (per-referral message thread)
CREATE TABLE IF NOT EXISTS referral_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    message     TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ref_msg_referral ON referral_messages(referral_id);
CREATE INDEX IF NOT EXISTS idx_ref_msg_sender   ON referral_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ref_msg_created  ON referral_messages(created_at);

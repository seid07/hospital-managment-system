-- =====================================================
-- Hospital Management System
-- Migration 013: Staff Real Email Verification System
-- =====================================================

-- 1. Add email verification columns to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Create staff_email_verifications table for pre-creation email ownership verification
CREATE TABLE IF NOT EXISTS staff_email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    token_hash VARCHAR(255) DEFAULT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    last_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Indexes for fast lookup and expiration checks
CREATE INDEX IF NOT EXISTS idx_staff_email_verified ON staff(email_verified);
CREATE INDEX IF NOT EXISTS idx_staff_email_verifications_email ON staff_email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_staff_email_verifications_expires ON staff_email_verifications(expires_at);

-- 4. Mark existing active staff and initial seeds as verified to prevent breaking existing workflows
UPDATE staff 
SET email_verified = TRUE, 
    email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP)
WHERE email_verified IS NULL OR email_verified = FALSE;

-- Ensure seeded email verification records exist for existing staff
INSERT INTO staff_email_verifications (email, verified, verified_at)
SELECT email, TRUE, COALESCE(created_at, CURRENT_TIMESTAMP)
FROM staff
ON CONFLICT (email) DO UPDATE 
SET verified = TRUE, 
    verified_at = EXCLUDED.verified_at;

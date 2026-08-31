-- =====================================================
-- Hospital Management System
-- Migration 012: Security, Authentication, OTP and Change Password
-- =====================================================

-- 1. Add security and password management columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_otp_hash VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_otp_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_last_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Indexes for OTP and password management
CREATE INDEX IF NOT EXISTS idx_users_must_change_password ON users(must_change_password);
CREATE INDEX IF NOT EXISTS idx_users_otp_expires ON users(password_reset_otp_expires_at);

-- =====================================================
-- Hospital Management System
-- Migration 001 : Foundation Schema
-- PostgreSQL 18+
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------
-- ROLES
-- -------------------------
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(30) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- STAFF
-- -------------------------
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,

    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(30) UNIQUE NOT NULL,

    department VARCHAR(100),
    specialty VARCHAR(100),

    role_id UUID NOT NULL REFERENCES roles(id),

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- USERS
-- -------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    staff_id UUID UNIQUE NOT NULL REFERENCES staff(id) ON DELETE CASCADE,

    username VARCHAR(80) UNIQUE NOT NULL,

    password_hash TEXT NOT NULL,

    last_login TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- AUDIT LOGS
-- -------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES users(id),

    action VARCHAR(120) NOT NULL,

    entity VARCHAR(80),

    entity_id UUID,

    details JSONB,

    ip_address INET,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- INDEXES
-- -------------------------

CREATE INDEX idx_staff_email
ON staff(email);

CREATE INDEX idx_staff_role
ON staff(role_id);

CREATE INDEX idx_users_username
ON users(username);

CREATE INDEX idx_audit_user
ON audit_logs(user_id);

CREATE INDEX idx_audit_action
ON audit_logs(action);

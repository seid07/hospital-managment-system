# Hospital Management Information System (HMIS)

A full-stack, enterprise-grade Hospital Information and Clinical Management System built with a Node.js/Express PostgreSQL backend and a React + Vite responsive frontend.

---

## 1. System Architecture & Capabilities

```
+-------------------------------------------------------------------------------+
|                           HOSPITAL CLINICAL WORKFLOW                          |
|                                                                               |
|  [ Patient Registration ]                                                     |
|            │                                                                  |
|            ▼                                                                  |
|  [ Appointment Availability & Booking ] (Double-booking Prevention Engine)    |
|            │                                                                  |
|            ▼                                                                  |
|  [ Front Desk Reception Queue & Check-In ]                                    |
|            │                                                                  |
|            ▼                                                                  |
|  [ Nursing Triage & Physiological Vital Signs Recording ]                     |
|            │                                                                  |
|            ▼                                                                  |
|  [ Physician Clinical Consultation & Diagnoses (ICD) ]                        |
|            │                                  │                               |
|            ▼                                  ▼                               |
|  [ Pharmacy Queue & Dispense ]     [ Diagnostic Lab Orders & Results ]        |
|            │                                  │                               |
|            └────────────────┬─────────────────┘                               |
|                             ▼                                                 |
|  [ Itemized Billing, Chargemaster Invoicing & Cashier Receipts ]              |
|                             │                                                 |
|                             ▼                                                 |
|  [ Hospital Analytics & Tamper-Evident System Audit Trail ]                   |
+-------------------------------------------------------------------------------+
```

### Core Architecture Highlights
- **PostgreSQL Database Engine**: Native transactions, schema constraints, and PostgreSQL exclusion constraints (`EXCLUDE USING gist`) preventing double-booking and overlapping schedules.
- **Node.js / Express REST API**: Multi-tier architecture (Routes -> Middlewares -> Controllers -> Services -> Database Queries) with JWT token verification and centralized exception handling.
- **Role-Based Access Control (RBAC)**: Fine-grained middleware authorization across 7 hospital roles (`ADMIN`, `REGISTRAR`, `DOCTOR`, `NURSE`, `PHARMACIST`, `LAB_TECH`, `FINANCE`).
- **React Single-Page Application (SPA)**: Custom component design system, dark-navy sidebar layout, notification center, modal wizards, live queue polling, and print-ready medical documents.

---

## 2. Role-Based Access Control Matrix

| Role | Responsibilities & Access Scope | Default Seed Username | Default Password |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Full system administration, staff provisioning, schedules, audit logs, reports, clinical & financial overrides. | `admin` | `Admin@12345` |
| **REGISTRAR** | Patient registration, directory search, appointment scheduling, front desk reception check-in. | `registrar` | `Hospital@12345` |
| **DOCTOR** | Patient medical charts, daily consultation queue, clinical notes, ICD diagnoses, prescribing, lab orders. | `doctor_smith`<br>`doctor_jones` | `Hospital@12345` |
| **NURSE** | Outpatient triage queue, physiological vitals intake, triage prioritization (Normal, Urgent, Emergency). | `nurse_emily` | `Hospital@12345` |
| **PHARMACIST** | Prescription order queue, drug dispensing verification, hospital formulary & inventory management. | `pharmacist_david` | `Hospital@12345` |
| **LAB_TECH** | Specimen collection, laboratory testing queue, result value entry, pathology result verification. | `labtech_kevin` | `Hospital@12345` |
| **FINANCE** | Hospital chargemaster, patient invoicing, itemized charge generation, cashier payment receipts. | `finance_clara` | `Hospital@12345` |

---

## 3. Database Schema & Migration History

Database migrations are located in `backend/migrations/`:
1. `001_initial_schema.sql`: Roles, users, staff profiles, patient registry, and doctor weekly recurring schedules.
2. `002_appointments_schema.sql`: Appointments table with exclusion constraint `prevent_doctor_double_booking` ensuring no overlapping appointments for the same physician.
3. `003_clinical_and_financial_workflows.sql`:
   - `vitals`: Patient physiological measurements with computed BMI support.
   - `encounters` & `encounter_diagnoses`: Clinical consultations, notes, ICD-10 diagnoses, and primary condition flags.
   - `medications` & `prescriptions`: Formulary catalog, batch tracking, stock quantity, and dispensing logs.
   - `lab_test_catalog` & `lab_orders`: Diagnostic lab catalog, specimen collection logs, test findings, and pathologist verification.
   - `invoices`, `invoice_items`, `payments`: Hospital invoicing, chargemaster lines, discounts, taxes, and transaction receipts.
   - `notifications`: User-targeted notification alerts.
   - `audit_logs`: Tamper-evident system activity and clinical access log.

---

## 4. API Endpoints Reference

### Authentication & Staff Management
- `POST /api/auth/login` — User authentication and JWT issuance.
- `GET /api/auth/me` — Retrieve active session profile.
- `GET /api/staff` — List staff directory.
- `POST /api/staff` — Create staff account and login (Admin only).
- `PATCH /api/staff/:id/status` — Toggle staff active status.

### Patients & Medical Records
- `GET /api/patients` — Paginated patient directory search (query by name, phone, patient number).
- `POST /api/patients` — Register new patient.
- `GET /api/patients/:id` — Retrieve patient demographics.
- `PUT /api/patients/:id` — Update patient record.
- `GET /api/patients/:id/record` — Comprehensive patient medical chart with full clinical history.

### Scheduling & Doctor Availability
- `GET /api/schedules/doctors` — List practicing physicians.
- `GET /api/schedules/doctor/:doctorId` — Physician weekly schedule rules.
- `POST /api/schedules/doctor/:doctorId` — Create schedule shift.
- `DELETE /api/schedules/:id` — Remove schedule shift.
- `GET /api/appointments` — List appointments with filter criteria.
- `POST /api/appointments` — Book new appointment slot.
- `GET /api/appointments/availability` — Generate available time slots based on doctor shift and existing bookings.
- `PATCH /api/appointments/:id/status` — Update appointment status (`SCHEDULED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
- `POST /api/appointments/:id/reschedule` — Reschedule appointment to a new date/time slot.

### Nursing & Vital Signs
- `GET /api/vitals/queue` — Triage queue of checked-in patients awaiting intake.
- `POST /api/vitals` — Record patient vital signs.
- `GET /api/vitals/patient/:patientId` — Patient vitals timeline.

### Clinical Encounters & Consultations
- `GET /api/encounters/queue/doctor/:doctorId` — Doctor daily consultation queue.
- `POST /api/encounters` — Initiate clinical consultation encounter.
- `GET /api/encounters/:id` — View consultation details.
- `PUT /api/encounters/:id` — Update clinical notes and diagnoses.
- `POST /api/encounters/:id/complete` — Finalize consultation and lock encounter notes.

### Pharmacy & Medication Inventory
- `GET /api/pharmacy/prescriptions` — Pharmacy prescription dispensing queue.
- `POST /api/pharmacy/prescriptions` — Prescribe medication.
- `POST /api/pharmacy/prescriptions/:id/dispense` — Dispense medication and deduct inventory stock.
- `GET /api/pharmacy/medications` — Formulary catalog and stock balance.
- `POST /api/pharmacy/medications` — Add medication to formulary.
- `POST /api/pharmacy/medications/:id/stock` — Adjust drug inventory count.

### Diagnostic Laboratory
- `GET /api/laboratory/orders` — Laboratory test orders queue.
- `POST /api/laboratory/orders` — Order diagnostic lab test.
- `PATCH /api/laboratory/orders/:id/collect` — Mark specimen as collected.
- `POST /api/laboratory/orders/:id/results` — Record test findings and reference range.
- `POST /api/laboratory/orders/:id/verify` — Verify and release lab report.
- `GET /api/laboratory/catalog` — Diagnostic test catalog.
- `POST /api/laboratory/catalog` — Add test panel to catalog.

### Invoicing & Financial Transactions
- `GET /api/billing/invoices` — List patient invoices.
- `POST /api/billing/invoices` — Generate itemized invoice.
- `GET /api/billing/invoices/:id` — Invoice breakdown with line items and payment history.
- `POST /api/billing/payments` — Record payment transaction and issue receipt.
- `GET /api/billing/services` — Hospital standard chargemaster fee schedule.

### Reporting, Notifications & Audit Logs
- `GET /api/reports/kpis` — Real-time operational KPI metrics.
- `GET /api/reports/analytics` — Statistical analytics reports (`APPOINTMENTS`, `REVENUE`, `CLINICAL`).
- `GET /api/notifications` — Notification list for authenticated user.
- `PATCH /api/notifications/read-all` — Mark notifications as read.
- `GET /api/audit-logs` — Tamper-evident institutional audit trail (Admin only).

---

## 5. Local Setup & Execution Guide

### Prerequisites
- Node.js (v18+ or v20+)
- PostgreSQL (v14+) running locally on port `5432`

### Database Setup
1. Create database user and database:
```bash
psql -U postgres -c "CREATE USER hospital_app WITH PASSWORD 'A1Z9b@d$';"
psql -U postgres -c "CREATE DATABASE hospital_management_db OWNER hospital_app;"
psql -U postgres -d hospital_management_db -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
```

2. Run migrations:
```bash
cd backend
npm run migrate
```

3. Seed database:
```bash
node seeds/seed-all.js
```

### Backend Configuration (`backend/.env`)
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://hospital_app:A1Z9b@d$@localhost:5432/hospital_management_db
JWT_SECRET=your_production_jwt_secret_key_here
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173
```

### Running Backend
```bash
cd backend
npm run dev
# Server runs on http://localhost:5000
```

### Running Frontend
```bash
cd frontend
npm install
npm run dev
# Application UI runs on http://localhost:5173
```

---

## 6. Testing & Quality Verification

### Run Backend Integration & Automated Test Suite
```bash
cd backend
npm test
```
*Executes all 14 integration test suites covering authentication, role verification, double booking prevention, patient registration, vitals intake, consultation encounters, laboratory resulting, pharmacy dispensing, billing invoicing, and audit logging.*

### Run Frontend Linting and Production Build Verification
```bash
cd frontend
npm run lint
npm run build
```
*Verifies 0 ESLint warnings/errors and builds production bundle.*

---

## 7. License
Proprietary Hospital Information System. All Rights Reserved.

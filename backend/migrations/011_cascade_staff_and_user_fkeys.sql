-- Migration 011: Fix foreign key constraints on staff and users deletion
-- Ensure that deleting a staff member or user account cascades or sets null rather than blocking with foreign key violations.

-- 1. Invoices
ALTER TABLE invoices ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- 2. Prescriptions
ALTER TABLE prescriptions ALTER COLUMN dispensed_by DROP NOT NULL;
ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_dispensed_by_fkey;
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_dispensed_by_fkey 
  FOREIGN KEY (dispensed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE prescriptions ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_doctor_id_fkey;
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_doctor_id_fkey 
  FOREIGN KEY (doctor_id) REFERENCES staff(id) ON DELETE SET NULL;

-- 3. Payments
ALTER TABLE payments ALTER COLUMN received_by DROP NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_received_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_received_by_fkey 
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL;

-- 4. Lab Results & Orders
ALTER TABLE lab_results ALTER COLUMN entered_by DROP NOT NULL;
ALTER TABLE lab_results DROP CONSTRAINT IF EXISTS lab_results_entered_by_fkey;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_entered_by_fkey 
  FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE lab_orders ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE lab_orders DROP CONSTRAINT IF EXISTS lab_orders_doctor_id_fkey;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_doctor_id_fkey 
  FOREIGN KEY (doctor_id) REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE lab_orders ALTER COLUMN specimen_collected_by DROP NOT NULL;
ALTER TABLE lab_orders DROP CONSTRAINT IF EXISTS lab_orders_specimen_collected_by_fkey;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_specimen_collected_by_fkey 
  FOREIGN KEY (specimen_collected_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE lab_orders ALTER COLUMN resulted_by DROP NOT NULL;
ALTER TABLE lab_orders DROP CONSTRAINT IF EXISTS lab_orders_resulted_by_fkey;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_resulted_by_fkey 
  FOREIGN KEY (resulted_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE lab_orders ALTER COLUMN verified_by DROP NOT NULL;
ALTER TABLE lab_orders DROP CONSTRAINT IF EXISTS lab_orders_verified_by_fkey;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_verified_by_fkey 
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;

-- 5. Encounters & Diagnoses
ALTER TABLE encounters ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE encounters DROP CONSTRAINT IF EXISTS encounters_doctor_id_fkey;
ALTER TABLE encounters ADD CONSTRAINT encounters_doctor_id_fkey 
  FOREIGN KEY (doctor_id) REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE encounters ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE encounters DROP CONSTRAINT IF EXISTS encounters_created_by_fkey;
ALTER TABLE encounters ADD CONSTRAINT encounters_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_notes') THEN
    ALTER TABLE consultation_notes ALTER COLUMN doctor_id DROP NOT NULL;
    ALTER TABLE consultation_notes DROP CONSTRAINT IF EXISTS consultation_notes_doctor_id_fkey;
    ALTER TABLE consultation_notes ADD CONSTRAINT consultation_notes_doctor_id_fkey 
      FOREIGN KEY (doctor_id) REFERENCES staff(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'diagnoses') THEN
    ALTER TABLE diagnoses ALTER COLUMN doctor_id DROP NOT NULL;
    ALTER TABLE diagnoses DROP CONSTRAINT IF EXISTS diagnoses_doctor_id_fkey;
    ALTER TABLE diagnoses ADD CONSTRAINT diagnoses_doctor_id_fkey 
      FOREIGN KEY (doctor_id) REFERENCES staff(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Appointments & Patients
ALTER TABLE appointments ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_doctor_id_fkey 
  FOREIGN KEY (doctor_id) REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE appointments ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_created_by_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE patients ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_created_by_fkey;
ALTER TABLE patients ADD CONSTRAINT patients_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- 7. Vitals
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vitals') THEN
    ALTER TABLE vitals ALTER COLUMN recorded_by DROP NOT NULL;
    ALTER TABLE vitals DROP CONSTRAINT IF EXISTS vitals_recorded_by_fkey;
    ALTER TABLE vitals ADD CONSTRAINT vitals_recorded_by_fkey 
      FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vital_signs') THEN
    ALTER TABLE vital_signs ALTER COLUMN recorded_by DROP NOT NULL;
    ALTER TABLE vital_signs DROP CONSTRAINT IF EXISTS vital_signs_recorded_by_fkey;
    ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_recorded_by_fkey 
      FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 8. Notifications & Audit Logs
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
    ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
    ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_schedules') THEN
    ALTER TABLE doctor_schedules DROP CONSTRAINT IF EXISTS doctor_schedules_doctor_id_fkey;
    ALTER TABLE doctor_schedules ADD CONSTRAINT doctor_schedules_doctor_id_fkey 
      FOREIGN KEY (doctor_id) REFERENCES staff(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referrals') THEN
    ALTER TABLE referrals ALTER COLUMN referring_doctor_id DROP NOT NULL;
    ALTER TABLE referrals ALTER COLUMN receiving_doctor_id DROP NOT NULL;
    ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referring_doctor_id_fkey;
    ALTER TABLE referrals ADD CONSTRAINT referrals_referring_doctor_id_fkey 
      FOREIGN KEY (referring_doctor_id) REFERENCES staff(id) ON DELETE SET NULL;
    ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_receiving_doctor_id_fkey;
    ALTER TABLE referrals ADD CONSTRAINT referrals_receiving_doctor_id_fkey 
      FOREIGN KEY (receiving_doctor_id) REFERENCES staff(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_messages') THEN
    ALTER TABLE referral_messages ALTER COLUMN sender_id DROP NOT NULL;
    ALTER TABLE referral_messages DROP CONSTRAINT IF EXISTS referral_messages_sender_id_fkey;
    ALTER TABLE referral_messages ADD CONSTRAINT referral_messages_sender_id_fkey 
      FOREIGN KEY (sender_id) REFERENCES staff(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_assignments') THEN
    ALTER TABLE patient_assignments ALTER COLUMN doctor_id DROP NOT NULL;
    ALTER TABLE patient_assignments DROP CONSTRAINT IF EXISTS patient_assignments_doctor_id_fkey;
    ALTER TABLE patient_assignments ADD CONSTRAINT patient_assignments_doctor_id_fkey 
      FOREIGN KEY (doctor_id) REFERENCES staff(id) ON DELETE CASCADE;
  END IF;
END $$;

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";

import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import RegistrarVisitDesk from "./pages/RegistrarVisitDesk";
import Patients from "./pages/Patients";
import PatientNew from "./pages/PatientNew";
import PatientDetail from "./pages/PatientDetail";
import AppointmentsList from "./pages/AppointmentsList";
import AppointmentAvailability from "./pages/AppointmentAvailability";
import ReceptionQueue from "./pages/ReceptionQueue";
import NurseTriage from "./pages/NurseTriage";
import DoctorQueue from "./pages/DoctorQueue";
import ClinicalEncounter from "./pages/ClinicalEncounter";
import PrescriptionsList from "./pages/PrescriptionsList";
import PharmacyInventory from "./pages/PharmacyInventory";
import LaboratoryOrders from "./pages/LaboratoryOrders";
import LaboratoryCatalog from "./pages/LaboratoryCatalog";
import RadiologyQueue from "./pages/RadiologyQueue";
import ProcedureQueue from "./pages/ProcedureQueue";
import WardInpatient from "./pages/WardInpatient";
import SurgeryQueue from "./pages/SurgeryQueue";
import BillingInvoices from "./pages/BillingInvoices";
import AdminStaff from "./pages/AdminStaff";
import AdminServicePricing from "./pages/AdminServicePricing";
import DoctorSchedules from "./pages/DoctorSchedules";
import AdminAuditLogs from "./pages/AdminAuditLogs";
import Reports from "./pages/Reports";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<ProtectedRoute />}>
            {/* Dashboards */}
            <Route path="/dashboard/:role" element={<Dashboard />} />

            {/* Service-First Registrar Workspace */}
            <Route path="/registrar/desk" element={<RegistrarVisitDesk />} />

            {/* Patient Workflow */}
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/new" element={<PatientNew />} />
            <Route path="/patients/:id" element={<PatientDetail />} />

            {/* Appointments & Scheduling */}
            <Route path="/appointments" element={<AppointmentsList />} />
            <Route path="/appointments/availability" element={<AppointmentAvailability />} />
            <Route path="/reception/queue" element={<ReceptionQueue />} />

            {/* Nursing & Triage */}
            <Route path="/nurse/triage" element={<NurseTriage />} />
            <Route path="/triage" element={<NurseTriage />} />

            {/* Doctor Clinical Workspace */}
            <Route path="/doctor/queue" element={<DoctorQueue />} />
            <Route path="/doctor/my-schedule" element={<DoctorSchedules isDoctorSelfView={true} />} />
            <Route path="/encounters/new" element={<ClinicalEncounter />} />
            <Route path="/encounters/:id" element={<ClinicalEncounter />} />

            {/* Specialized Clinical Department Queues */}
            <Route path="/radiology/queue" element={<RadiologyQueue />} />
            <Route path="/procedures/queue" element={<ProcedureQueue />} />
            <Route path="/ward/inpatient" element={<WardInpatient />} />
            <Route path="/surgery/queue" element={<SurgeryQueue />} />

            {/* Pharmacy & Formulary */}
            <Route path="/prescriptions" element={<PrescriptionsList />} />
            <Route path="/pharmacy/inventory" element={<PharmacyInventory />} />

            {/* Diagnostics & Laboratory */}
            <Route path="/laboratory" element={<LaboratoryOrders />} />
            <Route path="/laboratory/catalog" element={<LaboratoryCatalog />} />

            {/* Billing, Invoices & Payments */}
            <Route path="/billing" element={<BillingInvoices />} />

            {/* Administration, Pricing & Audit */}
            <Route path="/admin/staff" element={<AdminStaff />} />
            <Route path="/admin/pricing" element={<AdminServicePricing />} />
            <Route path="/admin/schedules" element={<DoctorSchedules />} />
            <Route path="/admin/audit" element={<AdminAuditLogs />} />

            {/* Reports & Analytics */}
            <Route path="/reports" element={<Reports />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

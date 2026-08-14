import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./routes/ProtectedRoute";
import AdminStaff from "./pages/AdminStaff";
import DoctorSchedules from "./pages/DoctorSchedules";
import AppointmentAvailability from "./pages/AppointmentAvailability";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard/:role" element={<Dashboard />} />
            <Route path="/admin/staff" element={<AdminStaff />} />
            <Route path="/admin/schedules" element={<DoctorSchedules />} />
            <Route
              path="/appointments/availability"
              element={<AppointmentAvailability />}
            />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

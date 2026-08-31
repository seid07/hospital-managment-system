import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../context/useAuth";

function ProtectedRoute() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Requirement 4: First Login Mandatory Password Change
  // If user has must_change_password flag set, restrict all navigation to /change-password
  if (user?.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;


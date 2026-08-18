import { useState } from "react";
import { useAuth } from "../../context/useAuth";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

function AppShell({ children }) {
  const { user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      <div className="app-main">
        <Topbar
          user={user}
          logout={logout}
          onToggleSidebar={() => setMobileNavOpen((prev) => !prev)}
        />

        <div className="app-page">{children}</div>
      </div>
    </div>
  );
}

export default AppShell;

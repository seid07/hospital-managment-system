import { NavLink } from "react-router-dom";
import { getNavigation } from "../../constants/navigation";

function formatRole(role) {
  if (!role) return "User";
  return role
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Sidebar({ user, isOpen, onClose }) {
  const navigation = getNavigation(user?.role);

  return (
    <aside className={`app-sidebar ${isOpen ? "sidebar-mobile-open" : ""}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">+</div>
        <div className="sidebar-brand-text">
          <p className="sidebar-brand-title">Hospital Information</p>
          <p className="sidebar-brand-subtitle">Clinical & Management System</p>
        </div>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-section">
          <p className="sidebar-section-title">Navigation</p>
          <nav className="sidebar-nav">
            {navigation.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end ?? true}
                onClick={onClose}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "active" : ""}`
                }
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span className="sidebar-link-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-name">
          {user?.first_name} {user?.last_name}
        </div>
        <div className="sidebar-user-role">{formatRole(user?.role)}</div>
      </div>
    </aside>
  );
}

export default Sidebar;

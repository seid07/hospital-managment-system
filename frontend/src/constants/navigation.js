export function getNavigation(role) {
  const common = [
    {
      label: "Dashboard",
      path: `/dashboard/${role?.toLowerCase() || "user"}`,
      icon: "⌂",
    },
  ];

  if (role === "ADMIN") {
    return [
      ...common,
      { label: "Patients", path: "/patients", icon: "♙" },
      { label: "Appointments", path: "/appointments", icon: "□" },
      { label: "Book Appointment", path: "/appointments/availability", icon: "+" },
      { label: "Staff", path: "/admin/staff", icon: "👥" },
      { label: "Doctor Schedules", path: "/admin/schedules", icon: "◷" },
      { label: "Prescriptions", path: "/prescriptions", icon: "💊" },
      { label: "Pharmacy Stock", path: "/pharmacy/inventory", icon: "📦" },
      { label: "Laboratory", path: "/laboratory", icon: "🔬" },
      { label: "Billing & Invoices", path: "/billing", icon: "💳" },
      { label: "Reports", path: "/reports", icon: "📊" },
      { label: "Audit Logs", path: "/admin/audit", icon: "📋" },
    ];
  }

  if (role === "REGISTRAR") {
    return [
      ...common,
      { label: "Patients List", path: "/patients", icon: "♙" },
      { label: "Register Patient", path: "/patients/new", icon: "+" },
      { label: "Appointments", path: "/appointments", icon: "□" },
      { label: "Book Appointment", path: "/appointments/availability", icon: "◷" },
      { label: "Reception Queue", path: "/reception/queue", icon: "🚶" },
      { label: "Billing", path: "/billing", icon: "💳" },
    ];
  }

  if (role === "DOCTOR") {
    return [
      ...common,
      { label: "Consultation Queue", path: "/doctor/queue", icon: "🩺" },
      { label: "Appointments", path: "/appointments", icon: "□" },
      { label: "Patients", path: "/patients", icon: "♙" },
      { label: "Prescriptions", path: "/prescriptions", icon: "💊" },
      { label: "Laboratory", path: "/laboratory", icon: "🔬" },
      { label: "My Schedule", path: "/admin/schedules", icon: "◷" },
    ];
  }

  if (role === "NURSE") {
    return [
      ...common,
      { label: "Triage & Vitals", path: "/nurse/triage", icon: "💓" },
      { label: "Appointments", path: "/appointments", icon: "□" },
      { label: "Patients", path: "/patients", icon: "♙" },
    ];
  }

  if (role === "PHARMACIST") {
    return [
      ...common,
      { label: "Prescriptions Queue", path: "/prescriptions", icon: "💊" },
      { label: "Medication Inventory", path: "/pharmacy/inventory", icon: "📦" },
    ];
  }

  if (role === "LAB_TECH") {
    return [
      ...common,
      { label: "Lab Orders Queue", path: "/laboratory", icon: "🔬" },
      { label: "Test Catalog", path: "/laboratory/catalog", icon: "🧪" },
    ];
  }

  if (role === "FINANCE") {
    return [
      ...common,
      { label: "Invoices & Billing", path: "/billing", icon: "💳" },
      { label: "Financial Reports", path: "/reports", icon: "📊" },
    ];
  }

  return common;
}

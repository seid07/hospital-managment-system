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
      { label: "Registrar Service Desk", path: "/registrar/desk", icon: "📋" },
      { label: "Patients", path: "/patients", icon: "♙" },
      { label: "Doctor Queue", path: "/doctor/queue", icon: "🩺" },
      { label: "Laboratory", path: "/laboratory", icon: "🔬" },
      { label: "Radiology (X-Ray/US)", path: "/radiology/queue", icon: "🩻" },
      { label: "Nursing & Procedures", path: "/procedures/queue", icon: "💉" },
      { label: "Inpatient Ward", path: "/ward/inpatient", icon: "🛏️" },
      { label: "Operating Theatre", path: "/surgery/queue", icon: "🔪" },
      { label: "Pharmacy & Cashier", path: "/prescriptions", icon: "💊" },
      { label: "Appointments", path: "/appointments", icon: "□" },
      { label: "Staff & Schedules", path: "/admin/staff", icon: "👥" },
      { label: "Billing & Invoices", path: "/billing", icon: "💳" },
      { label: "Reports", path: "/reports", icon: "📊" },
      { label: "Audit Logs", path: "/admin/audit", icon: "📋" },
    ];
  }

  if (role === "REGISTRAR") {
    return [
      ...common,
      { label: "Registrar Service Desk", path: "/registrar/desk", icon: "📋" },
      { label: "Patients List", path: "/patients", icon: "♙" },
      { label: "Register Patient", path: "/patients/new", icon: "+" },
      { label: "Appointments", path: "/appointments", icon: "□" },
      { label: "Book Appointment", path: "/appointments/availability", icon: "◷" },
      { label: "Cashier & Invoices", path: "/billing", icon: "💳" },
    ];
  }

  if (role === "DOCTOR") {
    return [
      ...common,
      { label: "Consultation Queue", path: "/doctor/queue", icon: "🩺" },
      { label: "Appointments", path: "/appointments", icon: "□" },
      { label: "Patients", path: "/patients", icon: "♙" },
      { label: "Radiology Results", path: "/radiology/queue", icon: "🩻" },
      { label: "Procedures", path: "/procedures/queue", icon: "💉" },
      { label: "Inpatient Ward", path: "/ward/inpatient", icon: "🛏️" },
      { label: "Surgery Theatre", path: "/surgery/queue", icon: "🔪" },
      { label: "Prescriptions", path: "/prescriptions", icon: "💊" },
      { label: "Laboratory", path: "/laboratory", icon: "🔬" },
      { label: "My Schedule", path: "/doctor/my-schedule", icon: "◷" },
    ];
  }

  if (role === "NURSE") {
    return [
      ...common,
      { label: "Triage & Vitals", path: "/nurse/triage", icon: "💓" },
      { label: "Clinical Procedures", path: "/procedures/queue", icon: "💉" },
      { label: "Inpatient Ward", path: "/ward/inpatient", icon: "🛏️" },
      { label: "Patients", path: "/patients", icon: "♙" },
      { label: "Appointments", path: "/appointments", icon: "□" },
    ];
  }

  if (role === "RADIOLOGIST") {
    return [
      ...common,
      { label: "Radiology Queue", path: "/radiology/queue", icon: "🩻" },
      { label: "Patients", path: "/patients", icon: "♙" },
    ];
  }

  if (role === "SURGEON") {
    return [
      ...common,
      { label: "Operating Theatre", path: "/surgery/queue", icon: "🔪" },
      { label: "Inpatient Ward", path: "/ward/inpatient", icon: "🛏️" },
      { label: "Patients", path: "/patients", icon: "♙" },
    ];
  }

  if (role === "WARD_STAFF") {
    return [
      ...common,
      { label: "Inpatient Ward", path: "/ward/inpatient", icon: "🛏️" },
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
      { label: "Invoices & Cashier", path: "/billing", icon: "💳" },
      { label: "Financial Reports", path: "/reports", icon: "📊" },
    ];
  }

  return common;
}

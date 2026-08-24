import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import AppShell from "../components/layout/AppShell";
import StatCard from "../components/common/StatCard";
import StatusBadge from "../components/common/StatusBadge";
import { getDashboardKPIs } from "../services/reportService";
import { getNavigation } from "../constants/navigation";
import { formatCurrency } from "../utils/currency";

function formatRole(role) {
  if (!role) return "User";
  return role
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Dashboard() {
  const { user } = useAuth();
  const role = user?.role;
  const navigation = getNavigation(role);

  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadKPIs() {
      try {
        setLoading(true);
        setError("");
        const res = await getDashboardKPIs();
        if (!cancelled && res.data) {
          setKpis(res.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load dashboard data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadKPIs();
    return () => {
      cancelled = true;
    };
  }, [role]);

  return (
    <AppShell>
      <section className="dashboard-welcome">
        <h1>Welcome back, {user?.first_name || "Staff Member"}</h1>
        <p>
          You are signed in as <strong>{formatRole(role)}</strong> (
          {user?.department || "Hospital Operations"}).
        </p>
      </section>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {/* Role-tailored Clickable KPI Grid */}
      <section className="dashboard-grid">
        {role === "ADMIN" && (
          <>
            <StatCard
              label="Total Staff"
              value={loading ? "..." : kpis?.totalStaff}
              icon="👥"
              description="Active hospital employees"
              to="/admin/staff"
            />
            <StatCard
              label="Active Doctors"
              value={loading ? "..." : kpis?.activeDoctors}
              icon="🩺"
              description="Available for appointments"
              to="/admin/schedules"
            />
            <StatCard
              label="Total Patients"
              value={loading ? "..." : kpis?.registeredPatients}
              icon="♙"
              description="Total patient records"
              to="/patients"
            />
            <StatCard
              label="Today's Appointments"
              value={loading ? "..." : kpis?.todayAppointments}
              icon="□"
              description="Scheduled for today"
              to="/appointments?date=today"
            />
            <StatCard
              label="Pending Doctor Orders"
              value={loading ? "..." : kpis?.pendingDoctorOrders}
              icon="⏳"
              description="Orders awaiting cashier"
              to="/billing"
            />
            <StatCard
              label="Total Revenue"
              value={loading ? "..." : formatCurrency(kpis?.totalRevenue || 0)}
              icon="💳"
              description="All-time payments collected"
              to="/billing"
            />
            <StatCard
              label="Unpaid Invoices"
              value={loading ? "..." : formatCurrency(kpis?.unpaidInvoicesBalance || 0)}
              icon="⏳"
              description="Outstanding balances"
              to="/billing"
            />
            <StatCard
              label="Lab Workload"
              value={loading ? "..." : kpis?.labWorkload}
              icon="🔬"
              description="Pending / processing orders"
              to="/laboratory"
            />
            <StatCard
              label="Active Prescriptions"
              value={loading ? "..." : kpis?.pharmacyWorkload}
              icon="💊"
              description="Pending pharmacy dispensing"
              to="/prescriptions"
            />
          </>
        )}

        {role === "REGISTRAR" && (
          <>
            <StatCard
              label="Today's Appointments"
              value={loading ? "..." : kpis?.todayAppointments}
              icon="□"
              description="Total booked for today"
              to="/appointments?date=today"
            />
            <StatCard
              label="Checked In"
              value={loading ? "..." : kpis?.checkedInPatients}
              icon="🚶"
              description="Patients waiting for triage / doctor"
              to="/reception/queue"
            />
            <StatCard
              label="Registered Today"
              value={loading ? "..." : kpis?.registeredToday}
              icon="+"
              description="New patient intakes today"
              to="/patients?registered=today"
            />
            <StatCard
              label="Total Patients"
              value={loading ? "..." : kpis?.totalPatients}
              icon="♙"
              description="Active patient database"
              to="/patients"
            />
            <StatCard
              label="Pending Doctor Orders"
              value={loading ? "..." : kpis?.pendingDoctorOrders}
              icon="⏳"
              description="Doctor orders awaiting cashier"
              to="/registrar/desk?tab=PENDING_ORDERS"
            />
            <StatCard
              label="Registrar Visit Desk"
              value="ACTIVE"
              icon="📋"
              description="Intake, Cashier & Routing Hub"
              to="/registrar/desk"
            />
          </>
        )}

        {role === "DOCTOR" && (
          <>
            <StatCard
              label="Today's Appointments"
              value={loading ? "..." : kpis?.todayAppointments}
              icon="□"
              description="Consultations scheduled today"
              to="/appointments"
            />
            <StatCard
              label="Patient Queue"
              value={loading ? "..." : kpis?.patientQueue}
              icon="🩺"
              description="Authorized patients in doctor queue"
              to="/doctor/queue"
            />
            <StatCard
              label="Pending Lab Orders"
              value={loading ? "..." : kpis?.pendingLabOrders}
              icon="🔬"
              description="Awaiting laboratory processing"
              to="/laboratory"
            />
            <StatCard
              label="My Clinic Schedule"
              value="VIEW"
              icon="◷"
              description="Weekly consultation hours"
              to="/doctor/my-schedule"
            />
          </>
        )}

        {role === "NURSE" && (
          <>
            <StatCard
              label="Triage Queue"
              value={loading ? "..." : kpis?.triageQueue}
              icon="💓"
              description="Patients waiting for triage"
              to="/nurse/triage"
            />
            <StatCard
              label="Vitals Recorded Today"
              value={loading ? "..." : kpis?.vitalsRecordedToday}
              icon="📈"
              description="Completed nursing intake"
              to="/nurse/triage"
            />
            <StatCard
              label="Clinical Procedures"
              value="QUEUE"
              icon="💉"
              description="Dressings and minor procedures"
              to="/procedures/queue"
            />
            <StatCard
              label="Inpatient Ward"
              value="BEDS"
              icon="🛏️"
              description="Ward census and admissions"
              to="/ward/inpatient"
            />
          </>
        )}

        {role === "PHARMACIST" && (
          <>
            <StatCard
              label="Pending Prescriptions"
              value={loading ? "..." : kpis?.pendingPrescriptions}
              icon="💊"
              description="Awaiting payment & dispensing"
              to="/prescriptions"
            />
            <StatCard
              label="Dispensed Today"
              value={loading ? "..." : kpis?.dispensedToday}
              icon="✓"
              description="Prescriptions processed today"
              to="/prescriptions"
            />
            <StatCard
              label="Low Stock Alerts"
              value={loading ? "..." : kpis?.lowStockAlerts}
              icon="⚠️"
              description="Items below reorder level"
              to="/pharmacy/inventory"
            />
            <StatCard
              label="Total Catalog Items"
              value={loading ? "..." : kpis?.totalMedications}
              icon="📦"
              description="Active medication types"
              to="/pharmacy/inventory"
            />
          </>
        )}

        {role === "LAB_TECH" && (
          <>
            <StatCard
              label="Pending Lab Orders"
              value={loading ? "..." : kpis?.pendingOrders}
              icon="🔬"
              description="Awaiting processing"
              to="/laboratory"
            />
            <StatCard
              label="Specimens Collected"
              value={loading ? "..." : kpis?.specimensCollected}
              icon="🧪"
              description="Ready for testing"
              to="/laboratory"
            />
            <StatCard
              label="Verified Today"
              value={loading ? "..." : kpis?.verifiedToday}
              icon="✓"
              description="Reports released to doctors"
              to="/laboratory"
            />
            <StatCard
              label="Test Catalog"
              value="CATALOG"
              icon="📋"
              description="Laboratory diagnostic panels"
              to="/laboratory/catalog"
            />
          </>
        )}

        {role === "RADIOLOGIST" && (
          <>
            <StatCard
              label="Radiology Queue"
              value="ACTIVE"
              icon="🩻"
              description="Authorized X-Ray and Ultrasound scans"
              to="/radiology/queue"
            />
            <StatCard
              label="Patient Directory"
              value="SEARCH"
              icon="♙"
              description="View authorized patient charts"
              to="/patients"
            />
          </>
        )}

        {role === "SURGEON" && (
          <>
            <StatCard
              label="Operating Theatre"
              value="ACTIVE"
              icon="🔪"
              description="Authorized surgical procedures"
              to="/surgery/queue"
            />
            <StatCard
              label="Inpatient Ward"
              value="BEDS"
              icon="🛏️"
              description="Post-op inpatient care & beds"
              to="/ward/inpatient"
            />
            <StatCard
              label="Patient Directory"
              value="SEARCH"
              icon="♙"
              description="View surgical patients"
              to="/patients"
            />
          </>
        )}

        {role === "WARD_STAFF" && (
          <>
            <StatCard
              label="Inpatient Ward"
              value="ACTIVE"
              icon="🛏️"
              description="Bed occupancy and admissions"
              to="/ward/inpatient"
            />
            <StatCard
              label="Patient Directory"
              value="SEARCH"
              icon="♙"
              description="Inpatient medical records"
              to="/patients"
            />
          </>
        )}

        {role === "FINANCE" && (
          <>
            <StatCard
              label="Today's Revenue"
              value={loading ? "..." : formatCurrency(kpis?.todayRevenue || 0)}
              icon="💳"
              description="Payments received today"
              to="/billing"
            />
            <StatCard
              label="Unpaid Invoices"
              value={loading ? "..." : kpis?.unpaidInvoicesCount}
              icon="⏳"
              description="Invoices with balance > 0"
              to="/billing"
            />
            <StatCard
              label="Transactions Today"
              value={loading ? "..." : kpis?.paymentsRecordedToday}
              icon="🧾"
              description="Receipts issued today"
              to="/billing"
            />
            <StatCard
              label="Outstanding Total"
              value={loading ? "..." : formatCurrency(kpis?.totalOutstandingBalance || 0)}
              icon="📊"
              description="Total hospital receivables"
              to="/billing"
            />
          </>
        )}
      </section>

      {/* Quick Actions */}
      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <h2>Quick Actions</h2>
          <span>Shortcuts for your role</span>
        </div>

        <div className="dashboard-section-body">
          <div className="page-actions" style={{ flexWrap: "wrap" }}>
            {navigation
              .filter((item) => item.label !== "Dashboard")
              .map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="button button-primary"
                >
                  <span style={{ marginRight: "6px" }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
          </div>
        </div>
      </section>

      {/* Admin Recent Audit Logs */}
      {role === "ADMIN" && kpis?.recentAuditLogs && (
        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <h2>Recent System Audit Trail</h2>
            <NavLink to="/admin/audit" style={{ color: "var(--primary)", fontSize: "12px", fontWeight: 600 }}>
              View All Logs →
            </NavLink>
          </div>

          <div className="dashboard-section-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>User</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.recentAuditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <StatusBadge status={log.action} />
                      </td>
                      <td>{log.entity || "—"}</td>
                      <td>{log.username || "System"}</td>
                      <td>{new Date(log.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  );
}

export default Dashboard;

import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import AppShell from "../components/layout/AppShell";
import StatCard from "../components/common/StatCard";
import StatusBadge from "../components/common/StatusBadge";
import { getDashboardKPIs } from "../services/reportService";
import { getNavigation } from "../constants/navigation";

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

      {/* Role-tailored KPI Grid */}
      <section className="dashboard-grid">
        {role === "ADMIN" && (
          <>
            <StatCard
              label="Total Staff"
              value={loading ? "..." : kpis?.totalStaff}
              icon="👥"
              description="Active hospital employees"
            />
            <StatCard
              label="Active Doctors"
              value={loading ? "..." : kpis?.activeDoctors}
              icon="🩺"
              description="Available for appointments"
            />
            <StatCard
              label="Registered Patients"
              value={loading ? "..." : kpis?.registeredPatients}
              icon="♙"
              description="Total patient records"
            />
            <StatCard
              label="Today's Appointments"
              value={loading ? "..." : kpis?.todayAppointments}
              icon="□"
              description="Scheduled for today"
            />
            <StatCard
              label="Total Revenue"
              value={loading ? "..." : `$${(kpis?.totalRevenue || 0).toLocaleString()}`}
              icon="💳"
              description="All-time payments collected"
            />
            <StatCard
              label="Unpaid Invoices"
              value={loading ? "..." : `$${(kpis?.unpaidInvoicesBalance || 0).toLocaleString()}`}
              icon="⏳"
              description="Outstanding balances"
            />
            <StatCard
              label="Lab Workload"
              value={loading ? "..." : kpis?.labWorkload}
              icon="🔬"
              description="Pending / processing orders"
            />
            <StatCard
              label="Active Prescriptions"
              value={loading ? "..." : kpis?.pharmacyWorkload}
              icon="💊"
              description="Pending pharmacy dispensing"
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
            />
            <StatCard
              label="Checked In"
              value={loading ? "..." : kpis?.checkedInPatients}
              icon="🚶"
              description="Patients waiting for triage / doctor"
            />
            <StatCard
              label="Registered Today"
              value={loading ? "..." : kpis?.registeredToday}
              icon="+"
              description="New patients created today"
            />
            <StatCard
              label="Total Patients"
              value={loading ? "..." : kpis?.totalPatients}
              icon="♙"
              description="Active patient database"
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
            />
            <StatCard
              label="Patient Queue"
              value={loading ? "..." : kpis?.patientQueue}
              icon="🩺"
              description="Checked-in and in consultation"
            />
            <StatCard
              label="Completed Visits Today"
              value={loading ? "..." : kpis?.completedVisitsToday}
              icon="✓"
              description="Encounters finalized"
            />
            <StatCard
              label="Pending Lab Orders"
              value={loading ? "..." : kpis?.pendingLabOrders}
              icon="🔬"
              description="Awaiting laboratory processing"
            />
          </>
        )}

        {role === "NURSE" && (
          <>
            <StatCard
              label="Triage Queue"
              value={loading ? "..." : kpis?.triageQueue}
              icon="💓"
              description="Patients checked in"
            />
            <StatCard
              label="Vitals Recorded Today"
              value={loading ? "..." : kpis?.vitalsRecordedToday}
              icon="📈"
              description="Completed nursing intake"
            />
            <StatCard
              label="Awaiting Triage"
              value={loading ? "..." : kpis?.waitingForTriage}
              icon="⏳"
              description="Patients in waiting room"
            />
            <StatCard
              label="Status"
              value="ACTIVE"
              icon="●"
              description="Inpatient & triage services"
            />
          </>
        )}

        {role === "PHARMACIST" && (
          <>
            <StatCard
              label="Pending Prescriptions"
              value={loading ? "..." : kpis?.pendingPrescriptions}
              icon="💊"
              description="Awaiting dispensing"
            />
            <StatCard
              label="Dispensed Today"
              value={loading ? "..." : kpis?.dispensedToday}
              icon="✓"
              description="Prescriptions processed today"
            />
            <StatCard
              label="Low Stock Alerts"
              value={loading ? "..." : kpis?.lowStockAlerts}
              icon="⚠️"
              description="Items below reorder level"
            />
            <StatCard
              label="Total Catalog Items"
              value={loading ? "..." : kpis?.totalMedications}
              icon="📦"
              description="Active medication types"
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
            />
            <StatCard
              label="Specimens Collected"
              value={loading ? "..." : kpis?.specimensCollected}
              icon="🧪"
              description="Ready for testing"
            />
            <StatCard
              label="Verified Today"
              value={loading ? "..." : kpis?.verifiedToday}
              icon="✓"
              description="Reports released to doctors"
            />
            <StatCard
              label="STAT / Urgent Orders"
              value={loading ? "..." : kpis?.statOrdersCount}
              icon="🚨"
              description="High priority tests"
            />
          </>
        )}

        {role === "FINANCE" && (
          <>
            <StatCard
              label="Today's Revenue"
              value={loading ? "..." : `$${(kpis?.todayRevenue || 0).toLocaleString()}`}
              icon="💳"
              description="Payments received today"
            />
            <StatCard
              label="Unpaid Invoices"
              value={loading ? "..." : kpis?.unpaidInvoicesCount}
              icon="⏳"
              description="Invoices with balance > 0"
            />
            <StatCard
              label="Transactions Today"
              value={loading ? "..." : kpis?.paymentsRecordedToday}
              icon="🧾"
              description="Receipts issued today"
            />
            <StatCard
              label="Outstanding Total"
              value={loading ? "..." : `$${(kpis?.totalOutstandingBalance || 0).toLocaleString()}`}
              icon="📊"
              description="Total hospital receivables"
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

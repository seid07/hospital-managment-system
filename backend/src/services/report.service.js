const pool = require("../config/database");

async function getDashboardKPIs(role, staffId) {
  const today = new Date().toISOString().split("T")[0];

  // Base metrics that can be queried in parallel
  if (role === "ADMIN") {
    const [staffRes, docRes, patRes, aptTodayRes, aptSchedRes, revRes, unpRes, labRes, rxRes, auditRes] =
      await Promise.all([
        pool.query("SELECT COUNT(*) AS count FROM staff WHERE is_active = TRUE"),
        pool.query(
          "SELECT COUNT(*) AS count FROM staff s JOIN roles r ON s.role_id = r.id WHERE r.name = 'DOCTOR' AND s.is_active = TRUE"
        ),
        pool.query("SELECT COUNT(*) AS count FROM patients WHERE is_active = TRUE"),
        pool.query("SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = $1", [today]),
        pool.query("SELECT COUNT(*) AS count FROM appointments WHERE status = 'SCHEDULED'"),
        pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments"),
        pool.query("SELECT COALESCE(SUM(balance_amount), 0) AS total FROM invoices WHERE status IN ('PENDING', 'PARTIALLY_PAID')"),
        pool.query("SELECT COUNT(*) AS count FROM lab_orders WHERE status IN ('ORDERED', 'SPECIMEN_COLLECTED', 'PROCESSING')"),
        pool.query("SELECT COUNT(*) AS count FROM prescriptions WHERE status = 'ACTIVE'"),
        pool.query(
          `SELECT a.*, u.username
           FROM audit_logs a
           LEFT JOIN users u ON a.user_id = u.id
           ORDER BY a.created_at DESC
           LIMIT 8`
        ),
      ]);

    return {
      totalStaff: parseInt(staffRes.rows[0].count, 10),
      activeDoctors: parseInt(docRes.rows[0].count, 10),
      registeredPatients: parseInt(patRes.rows[0].count, 10),
      todayAppointments: parseInt(aptTodayRes.rows[0].count, 10),
      pendingAppointments: parseInt(aptSchedRes.rows[0].count, 10),
      totalRevenue: parseFloat(revRes.rows[0].total),
      unpaidInvoicesBalance: parseFloat(unpRes.rows[0].total),
      labWorkload: parseInt(labRes.rows[0].count, 10),
      pharmacyWorkload: parseInt(rxRes.rows[0].count, 10),
      recentAuditLogs: auditRes.rows,
    };
  }

  if (role === "REGISTRAR") {
    const [todayApts, checkedInApts, totalPats, regToday, noShows] = await Promise.all([
      pool.query("SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = $1", [today]),
      pool.query("SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = $1 AND status = 'CHECKED_IN'", [today]),
      pool.query("SELECT COUNT(*) AS count FROM patients WHERE is_active = TRUE"),
      pool.query("SELECT COUNT(*) AS count FROM patients WHERE DATE(created_at) = $1", [today]),
      pool.query("SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = $1 AND status = 'NO_SHOW'", [today]),
    ]);

    return {
      todayAppointments: parseInt(todayApts.rows[0].count, 10),
      checkedInPatients: parseInt(checkedInApts.rows[0].count, 10),
      totalPatients: parseInt(totalPats.rows[0].count, 10),
      registeredToday: parseInt(regToday.rows[0].count, 10),
      todayNoShows: parseInt(noShows.rows[0].count, 10),
    };
  }

  if (role === "DOCTOR") {
    const [myToday, myQueue, myCompleted, myPendingLabs] = await Promise.all([
      pool.query("SELECT COUNT(*) AS count FROM appointments WHERE doctor_id = $1 AND appointment_date = $2", [staffId, today]),
      pool.query("SELECT COUNT(*) AS count FROM appointments WHERE doctor_id = $1 AND appointment_date = $2 AND status IN ('CHECKED_IN', 'IN_PROGRESS')", [staffId, today]),
      pool.query("SELECT COUNT(*) AS count FROM encounters WHERE doctor_id = $1 AND visit_date = $2 AND status = 'COMPLETED'", [staffId, today]),
      pool.query("SELECT COUNT(*) AS count FROM lab_orders WHERE doctor_id = $1 AND status IN ('ORDERED', 'PROCESSING')", [staffId]),
    ]);

    return {
      todayAppointments: parseInt(myToday.rows[0].count, 10),
      patientQueue: parseInt(myQueue.rows[0].count, 10),
      completedVisitsToday: parseInt(myCompleted.rows[0].count, 10),
      pendingLabOrders: parseInt(myPendingLabs.rows[0].count, 10),
    };
  }

  if (role === "NURSE") {
    const [triageQueue, vitalsToday, checkedIn] = await Promise.all([
      pool.query("SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = $1 AND status IN ('CHECKED_IN', 'IN_PROGRESS')", [today]),
      pool.query("SELECT COUNT(*) AS count FROM vitals WHERE DATE(recorded_at) = $1", [today]),
      pool.query("SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = $1 AND status = 'CHECKED_IN'", [today]),
    ]);

    return {
      triageQueue: parseInt(triageQueue.rows[0].count, 10),
      vitalsRecordedToday: parseInt(vitalsToday.rows[0].count, 10),
      waitingForTriage: parseInt(checkedIn.rows[0].count, 10),
    };
  }

  if (role === "PHARMACIST") {
    const [pendingRx, dispensedToday, lowStock, totalMeds] = await Promise.all([
      pool.query("SELECT COUNT(*) AS count FROM prescriptions WHERE status = 'ACTIVE'"),
      pool.query("SELECT COUNT(*) AS count FROM prescriptions WHERE status = 'DISPENSED' AND DATE(dispensed_at) = $1", [today]),
      pool.query("SELECT COUNT(*) AS count FROM medications WHERE stock_quantity <= reorder_level AND is_active = TRUE"),
      pool.query("SELECT COUNT(*) AS count FROM medications WHERE is_active = TRUE"),
    ]);

    return {
      pendingPrescriptions: parseInt(pendingRx.rows[0].count, 10),
      dispensedToday: parseInt(dispensedToday.rows[0].count, 10),
      lowStockAlerts: parseInt(lowStock.rows[0].count, 10),
      totalMedications: parseInt(totalMeds.rows[0].count, 10),
    };
  }

  if (role === "LAB_TECH") {
    const [pendingOrders, specimensCollected, resultedToday, statOrders] = await Promise.all([
      pool.query("SELECT COUNT(*) AS count FROM lab_orders WHERE status IN ('ORDERED', 'SPECIMEN_COLLECTED', 'PROCESSING')"),
      pool.query("SELECT COUNT(*) AS count FROM lab_orders WHERE status = 'SPECIMEN_COLLECTED'"),
      pool.query("SELECT COUNT(*) AS count FROM lab_orders WHERE status = 'VERIFIED' AND DATE(verified_at) = $1", [today]),
      pool.query("SELECT COUNT(*) AS count FROM lab_orders WHERE priority = 'STAT' AND status != 'VERIFIED'"),
    ]);

    return {
      pendingOrders: parseInt(pendingOrders.rows[0].count, 10),
      specimensCollected: parseInt(specimensCollected.rows[0].count, 10),
      verifiedToday: parseInt(resultedToday.rows[0].count, 10),
      statOrdersCount: parseInt(statOrders.rows[0].count, 10),
    };
  }

  if (role === "FINANCE") {
    const [revToday, unpInvoices, paidToday, totalOutstanding] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE DATE(created_at) = $1", [today]),
      pool.query("SELECT COUNT(*) AS count FROM invoices WHERE status IN ('PENDING', 'PARTIALLY_PAID')"),
      pool.query("SELECT COUNT(*) AS count FROM payments WHERE DATE(created_at) = $1", [today]),
      pool.query("SELECT COALESCE(SUM(balance_amount), 0) AS total FROM invoices WHERE status IN ('PENDING', 'PARTIALLY_PAID')"),
    ]);

    return {
      todayRevenue: parseFloat(revToday.rows[0].total),
      unpaidInvoicesCount: parseInt(unpInvoices.rows[0].count, 10),
      paymentsRecordedToday: parseInt(paidToday.rows[0].count, 10),
      totalOutstandingBalance: parseFloat(totalOutstanding.rows[0].total),
    };
  }

  return {};
}

async function getAnalyticsReport(type, { startDate, endDate, doctorId }) {
  const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const end = endDate || new Date().toISOString().split("T")[0];

  if (type === "APPOINTMENTS") {
    const statusBreakdown = await pool.query(
      `
      SELECT status, COUNT(*) AS count
      FROM appointments
      WHERE appointment_date BETWEEN $1 AND $2
      GROUP BY status
      `,
      [start, end]
    );

    const doctorUtilization = await pool.query(
      `
      SELECT
        s.id AS doctor_id,
        s.first_name,
        s.last_name,
        s.department,
        COUNT(a.id) AS total_appointments,
        SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN a.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
        SUM(CASE WHEN a.status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_show_count
      FROM staff s
      JOIN roles r ON s.role_id = r.id
      LEFT JOIN appointments a ON a.doctor_id = s.id AND a.appointment_date BETWEEN $1 AND $2
      WHERE r.name = 'DOCTOR' AND s.is_active = TRUE
      GROUP BY s.id, s.first_name, s.last_name, s.department
      ORDER BY total_appointments DESC
      `,
      [start, end]
    );

    const dailyTrends = await pool.query(
      `
      SELECT
        appointment_date AS date,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
      FROM appointments
      WHERE appointment_date BETWEEN $1 AND $2
      GROUP BY appointment_date
      ORDER BY appointment_date ASC
      `,
      [start, end]
    );

    return {
      type,
      dateRange: { startDate: start, endDate: end },
      statusBreakdown: statusBreakdown.rows,
      doctorUtilization: doctorUtilization.rows,
      dailyTrends: dailyTrends.rows,
    };
  }

  if (type === "REVENUE") {
    const revenueSummary = await pool.query(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS total_collected,
        COUNT(*) AS payment_count
      FROM payments
      WHERE DATE(created_at) BETWEEN $1 AND $2
      `,
      [start, end]
    );

    const methodBreakdown = await pool.query(
      `
      SELECT payment_method, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
      FROM payments
      WHERE DATE(created_at) BETWEEN $1 AND $2
      GROUP BY payment_method
      ORDER BY total DESC
      `,
      [start, end]
    );

    const dailyRevenue = await pool.query(
      `
      SELECT
        DATE(created_at) AS date,
        COALESCE(SUM(amount), 0) AS daily_total,
        COUNT(*) AS transactions
      FROM payments
      WHERE DATE(created_at) BETWEEN $1 AND $2
      GROUP BY DATE(created_at)
      ORDER BY date ASC
      `,
      [start, end]
    );

    const invoiceStatus = await pool.query(
      `
      SELECT
        status,
        COUNT(*) AS count,
        COALESCE(SUM(total_amount), 0) AS total_invoiced,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(SUM(balance_amount), 0) AS total_balance
      FROM invoices
      WHERE DATE(created_at) BETWEEN $1 AND $2
      GROUP BY status
      `,
      [start, end]
    );

    return {
      type,
      dateRange: { startDate: start, endDate: end },
      summary: revenueSummary.rows[0],
      methodBreakdown: methodBreakdown.rows,
      dailyRevenue: dailyRevenue.rows,
      invoiceStatus: invoiceStatus.rows,
    };
  }

  if (type === "CLINICAL") {
    const topDiagnoses = await pool.query(
      `
      SELECT description, code, COUNT(*) AS frequency
      FROM diagnoses
      WHERE DATE(created_at) BETWEEN $1 AND $2
      GROUP BY description, code
      ORDER BY frequency DESC
      LIMIT 10
      `,
      [start, end]
    );

    const labVolume = await pool.query(
      `
      SELECT t.name AS test_name, t.category, COUNT(o.id) AS order_count
      FROM lab_orders o
      JOIN lab_test_catalog t ON o.test_id = t.id
      WHERE DATE(o.created_at) BETWEEN $1 AND $2
      GROUP BY t.name, t.category
      ORDER BY order_count DESC
      LIMIT 10
      `,
      [start, end]
    );

    const prescriptionVolume = await pool.query(
      `
      SELECT medication_name, COUNT(*) AS prescribed_count, SUM(quantity) AS total_quantity
      FROM prescriptions
      WHERE DATE(created_at) BETWEEN $1 AND $2
      GROUP BY medication_name
      ORDER BY prescribed_count DESC
      LIMIT 10
      `,
      [start, end]
    );

    return {
      type,
      dateRange: { startDate: start, endDate: end },
      topDiagnoses: topDiagnoses.rows,
      labVolume: labVolume.rows,
      prescriptionVolume: prescriptionVolume.rows,
    };
  }

  return { type, message: "Unknown report type." };
}

module.exports = {
  getDashboardKPIs,
  getAnalyticsReport,
};

const pool = require("../config/database");

async function getDashboardKPIs(role, staffId) {
  const today = new Date().toISOString().split("T")[0];

  // Base metrics that can be queried in parallel
  if (role === "ADMIN") {
    const [staffRes, docRes, patRes, aptTodayRes, aptSchedRes, revRes, unpRes, labRes, rxRes, pendingOrdersRes, auditRes] =
      await Promise.all([
        pool.query("SELECT COUNT(*) AS count FROM staff WHERE is_active = TRUE"),
        pool.query(
          "SELECT COUNT(*) AS count FROM staff s JOIN roles r ON s.role_id = r.id WHERE r.name = 'DOCTOR' AND s.is_active = TRUE"
        ),
        pool.query("SELECT COUNT(*) AS count FROM patients WHERE is_active = TRUE"),
        pool.query(
          `SELECT COUNT(*) AS count
           FROM appointments a
           JOIN patients p ON a.patient_id = p.id
           WHERE a.appointment_date = $1 AND p.is_active = TRUE`,
          [today]
        ),
        pool.query(
          `SELECT COUNT(*) AS count
           FROM appointments a
           JOIN patients p ON a.patient_id = p.id
           WHERE a.status = 'SCHEDULED' AND p.is_active = TRUE`
        ),
        pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments"),
        pool.query(
          `SELECT COALESCE(SUM(i.balance_amount), 0) AS total
           FROM invoices i
           JOIN patients p ON i.patient_id = p.id
           WHERE i.status IN ('PENDING', 'PARTIALLY_PAID') AND p.is_active = TRUE`
        ),
        pool.query(
          `SELECT COUNT(*) AS count
           FROM lab_orders l
           JOIN patients p ON l.patient_id = p.id
           WHERE l.status IN ('ORDERED', 'SPECIMEN_COLLECTED', 'PROCESSING') AND p.is_active = TRUE`
        ),
        pool.query(
          `SELECT COUNT(*) AS count
           FROM prescriptions rx
           JOIN patients p ON rx.patient_id = p.id
           WHERE rx.status = 'ACTIVE' AND p.is_active = TRUE`
        ),
        pool.query(
          `SELECT COUNT(*) AS count
           FROM service_orders so
           JOIN patients p ON so.patient_id = p.id
           JOIN services s ON so.service_id = s.id
           WHERE so.status = 'WAITING_PAYMENT' AND s.payment_location != 'PHARMACY' AND p.is_active = TRUE`
        ),
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
      pendingDoctorOrders: parseInt(pendingOrdersRes.rows[0].count, 10),
      recentAuditLogs: auditRes.rows,
    };
  }

  if (role === "REGISTRAR") {
    const [todayApts, checkedInApts, totalPats, regToday, noShows, pendingOrders] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.appointment_date = $1 AND p.is_active = TRUE`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.appointment_date = $1 AND a.status = 'CHECKED_IN' AND p.is_active = TRUE`,
        [today]
      ),
      pool.query("SELECT COUNT(*) AS count FROM patients WHERE is_active = TRUE"),
      pool.query("SELECT COUNT(*) AS count FROM patients WHERE DATE(created_at) = $1 AND is_active = TRUE", [today]),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.appointment_date = $1 AND a.status = 'NO_SHOW' AND p.is_active = TRUE`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM service_orders so
         JOIN patients p ON so.patient_id = p.id
         JOIN services s ON so.service_id = s.id
         WHERE so.status = 'WAITING_PAYMENT' AND s.payment_location != 'PHARMACY' AND p.is_active = TRUE`
      ),
    ]);

    return {
      todayAppointments: parseInt(todayApts.rows[0].count, 10),
      checkedInPatients: parseInt(checkedInApts.rows[0].count, 10),
      totalPatients: parseInt(totalPats.rows[0].count, 10),
      registeredToday: parseInt(regToday.rows[0].count, 10),
      todayNoShows: parseInt(noShows.rows[0].count, 10),
      pendingDoctorOrders: parseInt(pendingOrders.rows[0].count, 10),
    };
  }

  if (role === "DOCTOR") {
    const [myToday, myQueue, myCompleted, myPendingLabs, myPendingReferrals] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE (
           a.doctor_id = $1
           OR a.patient_id IN (SELECT patient_id FROM referrals WHERE receiving_doctor_id = $1 OR referring_doctor_id = $1)
         ) AND a.appointment_date = $2 AND p.is_active = TRUE`,
        [staffId, today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE (
           a.doctor_id = $1
           OR a.patient_id IN (SELECT patient_id FROM referrals WHERE receiving_doctor_id = $1 OR referring_doctor_id = $1)
         ) AND a.appointment_date = $2 AND a.status IN ('CHECKED_IN', 'IN_PROGRESS') AND p.is_active = TRUE`,
        [staffId, today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM encounters e
         JOIN patients p ON e.patient_id = p.id
         WHERE e.doctor_id = $1 AND e.visit_date = $2 AND e.status = 'COMPLETED' AND p.is_active = TRUE`,
        [staffId, today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM lab_orders l
         JOIN patients p ON l.patient_id = p.id
         WHERE (
           l.doctor_id = $1
           OR l.patient_id IN (
             SELECT a.patient_id FROM appointments a WHERE a.doctor_id = $1
             UNION
             SELECT r.patient_id FROM referrals r WHERE r.receiving_doctor_id = $1 OR r.referring_doctor_id = $1
             UNION
             SELECT ce.patient_id FROM encounters ce WHERE ce.doctor_id = $1
           )
         ) AND l.status IN ('ORDERED', 'PROCESSING', 'SPECIMEN_COLLECTED') AND p.is_active = TRUE`,
        [staffId]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM referrals r
         JOIN patients p ON r.patient_id = p.id
         WHERE r.receiving_doctor_id = $1 AND r.status = 'PENDING' AND p.is_active = TRUE`,
        [staffId]
      ),
    ]);

    return {
      todayAppointments: parseInt(myToday.rows[0].count, 10),
      patientQueue: parseInt(myQueue.rows[0].count, 10),
      completedVisitsToday: parseInt(myCompleted.rows[0].count, 10),
      pendingLabOrders: parseInt(myPendingLabs.rows[0].count, 10),
      pendingReferrals: parseInt(myPendingReferrals.rows[0].count, 10),
    };
  }

  if (role === "NURSE") {
    const [triageQueue, vitalsToday, checkedIn] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.appointment_date = $1 AND a.status IN ('CHECKED_IN', 'IN_PROGRESS') AND p.is_active = TRUE`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM vitals v
         JOIN patients p ON v.patient_id = p.id
         WHERE DATE(v.recorded_at) = $1 AND p.is_active = TRUE`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.appointment_date = $1 AND a.status = 'CHECKED_IN' AND p.is_active = TRUE`,
        [today]
      ),
    ]);

    return {
      triageQueue: parseInt(triageQueue.rows[0].count, 10),
      vitalsRecordedToday: parseInt(vitalsToday.rows[0].count, 10),
      waitingForTriage: parseInt(checkedIn.rows[0].count, 10),
    };
  }

  if (role === "PHARMACIST") {
    const [pendingRx, dispensedToday, lowStock, totalMeds] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count
         FROM prescriptions rx
         JOIN patients p ON rx.patient_id = p.id
         WHERE rx.status = 'ACTIVE' AND p.is_active = TRUE`
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM prescriptions rx
         JOIN patients p ON rx.patient_id = p.id
         WHERE rx.status = 'DISPENSED' AND DATE(rx.dispensed_at) = $1 AND p.is_active = TRUE`,
        [today]
      ),
      pool.query("SELECT COUNT(*) AS count FROM medications WHERE stock_quantity < 15 AND is_active = TRUE"),
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
      pool.query(
        `SELECT COUNT(*) AS count
         FROM lab_orders l
         JOIN patients p ON l.patient_id = p.id
         WHERE l.status IN ('ORDERED', 'SPECIMEN_COLLECTED', 'PROCESSING') AND p.is_active = TRUE`
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM lab_orders l
         JOIN patients p ON l.patient_id = p.id
         WHERE l.status = 'SPECIMEN_COLLECTED' AND p.is_active = TRUE`
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM lab_orders l
         JOIN patients p ON l.patient_id = p.id
         WHERE l.status = 'VERIFIED' AND DATE(l.verified_at) = $1 AND p.is_active = TRUE`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM lab_orders l
         JOIN patients p ON l.patient_id = p.id
         WHERE l.priority = 'STAT' AND l.status != 'VERIFIED' AND p.is_active = TRUE`
      ),
    ]);

    return {
      pendingOrders: parseInt(pendingOrders.rows[0].count, 10),
      specimensCollected: parseInt(specimensCollected.rows[0].count, 10),
      verifiedToday: parseInt(resultedToday.rows[0].count, 10),
      statOrdersCount: parseInt(statOrders.rows[0].count, 10),
    };
  }

  if (role === "FINANCE") {
    const [revToday, unpInvoices, paidToday, totalOutstanding, pendingOrders] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(pm.amount), 0) AS total
         FROM payments pm
         JOIN patients p ON pm.patient_id = p.id
         WHERE DATE(pm.created_at) = $1 AND p.is_active = TRUE`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM invoices i
         JOIN patients p ON i.patient_id = p.id
         WHERE i.status IN ('PENDING', 'PARTIALLY_PAID') AND p.is_active = TRUE`
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM payments pm
         JOIN patients p ON pm.patient_id = p.id
         WHERE DATE(pm.created_at) = $1 AND p.is_active = TRUE`,
        [today]
      ),
      pool.query(
        `SELECT COALESCE(SUM(i.balance_amount), 0) AS total
         FROM invoices i
         JOIN patients p ON i.patient_id = p.id
         WHERE i.status IN ('PENDING', 'PARTIALLY_PAID') AND p.is_active = TRUE`
      ),
      pool.query(
        `SELECT COUNT(*) AS count
         FROM service_orders so
         JOIN patients p ON so.patient_id = p.id
         JOIN services s ON so.service_id = s.id
         WHERE so.status = 'WAITING_PAYMENT' AND s.payment_location != 'PHARMACY' AND p.is_active = TRUE`
      ),
    ]);

    return {
      todayRevenue: parseFloat(revToday.rows[0].total),
      unpaidInvoicesCount: parseInt(unpInvoices.rows[0].count, 10),
      paymentsRecordedToday: parseInt(paidToday.rows[0].count, 10),
      totalOutstandingBalance: parseFloat(totalOutstanding.rows[0].total),
      pendingDoctorOrders: parseInt(pendingOrders.rows[0].count, 10),
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

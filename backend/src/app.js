const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/auth.routes");
const testRoutes = require("./routes/test.routes");
const patientRoutes = require("./routes/patient.routes");
const staffRoutes = require("./routes/staff.routes");
const scheduleRoutes = require("./routes/schedule.routes");
const appointmentRoutes = require("./routes/appointment.routes");
const vitalsRoutes = require("./routes/vitals.routes");
const encounterRoutes = require("./routes/encounter.routes");
const pharmacyRoutes = require("./routes/pharmacy.routes");
const laboratoryRoutes = require("./routes/laboratory.routes");
const billingRoutes = require("./routes/billing.routes");
const reportRoutes = require("./routes/report.routes");
const notificationRoutes = require("./routes/notification.routes");
const auditRoutes = require("./routes/audit.routes");

// Service-first workflow routes
const serviceCatalogRoutes = require("./routes/serviceCatalog.routes");
const visitRoutes = require("./routes/visit.routes");
const serviceOrderRoutes = require("./routes/serviceOrder.routes");
const queueRoutes = require("./routes/queue.routes");
const radiologyRoutes = require("./routes/radiology.routes");
const procedureRoutes = require("./routes/procedure.routes");
const wardRoutes = require("./routes/ward.routes");
const surgeryRoutes = require("./routes/surgery.routes");
const referralRoutes = require("./routes/referral.routes");
const nursingRoutes = require("./routes/nursing.routes");

const { errorHandler } = require("./middleware/error.middleware");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Hospital Management API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/vitals", vitalsRoutes);
app.use("/api/encounters", encounterRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/laboratory", laboratoryRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit-logs", auditRoutes);

// Mount Service-First Workflow routes
app.use("/api/services", serviceCatalogRoutes);
app.use("/api/visits", visitRoutes);
app.use("/api/service-orders", serviceOrderRoutes);
app.use("/api/queues", queueRoutes);
app.use("/api/radiology", radiologyRoutes);
app.use("/api/procedures", procedureRoutes);
app.use("/api/ward", wardRoutes);
app.use("/api/surgery", surgeryRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/nursing", nursingRoutes);

app.use(errorHandler);

module.exports = app;

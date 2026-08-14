const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/auth.routes");
const testRoutes = require("./routes/test.routes");
const patientRoutes = require("./routes/patient.routes");
const staffRoutes = require("./routes/staff.routes");
const scheduleRoutes = require("./routes/schedule.routes");
const appointmentRoutes = require("./routes/appointment.routes");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
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

module.exports = app;

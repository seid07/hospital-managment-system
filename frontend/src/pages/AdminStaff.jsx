import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import ToastPrompt from "../components/common/ToastPrompt";
import {
  getStaff,
  getRoles,
  createStaff,
  updateStaff,
  deleteStaffPermanently,
  updateStaffStatus,
  getDoctorScheduledAppointments,
  checkEmailAvailability,
  resendStaffCredentials,
} from "../services/staffService";
import { createSchedule } from "../services/scheduleService";

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function checkPasswordStrength(password) {
  if (!password) {
    return { score: 0, label: "Empty", color: "#94a3b8", isValid: false, feedback: "Enter a password" };
  }
  let score = 0;
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  if (hasMinLength) score++;
  if (hasUpper) score++;
  if (hasLower) score++;
  if (hasDigit) score++;
  if (hasSpecial) score++;

  const isValid = hasMinLength && hasUpper && hasLower && hasDigit && hasSpecial;

  if (score <= 2) {
    return { score, label: "Weak", color: "#ef4444", isValid, feedback: "Requires min 8 chars with upper, lower, digit & special symbol." };
  }
  if (score <= 4) {
    return { score, label: "Medium", color: "#f59e0b", isValid, feedback: "Add missing uppercase, digit, or special character." };
  }
  return { score, label: "Strong", color: "#10b981", isValid, feedback: "Complies with hospital security policy." };
}

function generateSecurePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*";
  const allChars = upper + lower + digits + special;

  const cryptoObj = window.crypto || window.msCrypto;
  const getRandomByte = () => {
    const arr = new Uint8Array(1);
    cryptoObj.getRandomValues(arr);
    return arr[0];
  };

  let passwordChars = [
    upper[getRandomByte() % upper.length],
    lower[getRandomByte() % lower.length],
    digits[getRandomByte() % digits.length],
    special[getRandomByte() % special.length],
  ];

  for (let i = passwordChars.length; i < 12; i++) {
    passwordChars.push(allChars[getRandomByte() % allChars.length]);
  }


  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = getRandomByte() % (i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join("");
}

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const INITIAL_SLOT = {
  dayOfWeek: 1,
  startTime: "08:00",
  endTime: "16:00",
  slotDurationMinutes: 30,
};

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "DOCTOR",
  department: "",
  specialty: "",
  username: "",
  password: "",
};

function AdminStaff() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    password: generateSecurePassword(),
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [emailValidation, setEmailValidation] = useState({ checking: false, available: null, reason: null, message: "" });
  const [resendingCredentials, setResendingCredentials] = useState({});
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const debouncedEmail = useDebounce(form.email, 400);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Available Work Date / Consultation Slot builder — multi-day selection
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [newSlot, setNewSlot] = useState(INITIAL_SLOT);
  const [slotSelectedDays, setSlotSelectedDays] = useState([1, 2, 3, 4, 5]); // default Mon-Fri

  // Edit Staff Modal State
  const [editingMember, setEditingMember] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Permanent Delete Modal State
  const [deletingMember, setDeletingMember] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Deactivation Modal State (Requirement 7)
  const [deactivatingMember, setDeactivatingMember] = useState(null);
  const [deactivationForm, setDeactivationForm] = useState(() => {
    const start = new Date().toISOString().split("T")[0];
    const end = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    return {
      reason: "Annual / Sick Leave",
      startDate: start,
      endDate: end,
    };
  });
  const [scheduledAppointments, setScheduledAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [deactivationSubmitting, setDeactivationSubmitting] = useState(false);
  const [deactivationError, setDeactivationError] = useState("");

  const passwordStrength = checkPasswordStrength(form.password);

  const refreshData = useCallback(() => {
    setReloadTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setError("");
        const [staffRes, rolesRes] = await Promise.all([
          getStaff({ search: debouncedSearch.trim() }),
          getRoles(),
        ]);
        if (!cancelled) {
          setStaff(staffRes.data || []);
          setRoles(rolesRes.data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load staff data.");
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, reloadTrigger]);

  // Auto-dismiss success & error notifications after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (editError) {
      const timer = setTimeout(() => {
        setEditError("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [editError]);

  useEffect(() => {
    if (deleteError) {
      const timer = setTimeout(() => {
        setDeleteError("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [deleteError]);

  useEffect(() => {
    if (deactivationError) {
      const timer = setTimeout(() => {
        setDeactivationError("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [deactivationError]);

  // Real-time email validation and duplicate check
  useEffect(() => {
    let cancelled = false;
    async function validateEmailLive() {
      const emailVal = debouncedEmail ? debouncedEmail.trim() : "";
      if (!emailVal) {
        setEmailValidation({ checking: false, available: null, reason: null, message: "" });
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVal)) {
        setEmailValidation({
          checking: false,
          available: false,
          reason: "INVALID_FORMAT",
          message: "✕ Enter a valid email address",
        });
        return;
      }

      setEmailValidation((prev) => ({ ...prev, checking: true }));
      try {
        const res = await checkEmailAvailability(emailVal);
        if (!cancelled) {
          if (res.available) {
            setEmailValidation({
              checking: false,
              available: true,
              reason: null,
              message: "✓ Valid email format",
            });
          } else {
            setEmailValidation({
              checking: false,
              available: false,
              reason: res.reason,
              message: res.reason === "DUPLICATE" ? "✕ Email already registered" : "✕ Enter a valid email address",
            });
          }
        }
      } catch {
        if (!cancelled) {
          setEmailValidation({ checking: false, available: null, reason: null, message: "" });
        }
      }
    }

    validateEmailLive();
    return () => {
      cancelled = true;
    };
  }, [debouncedEmail]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };

      // Auto-suggest username if firstName or lastName changes
      if (name === "firstName" || name === "lastName") {
        const fn = (name === "firstName" ? value : prev.firstName).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const ln = (name === "lastName" ? value : prev.lastName).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const prefix = prev.role === "DOCTOR" ? "dr_" : "";
        if (fn && ln) {
          updated.username = `${prefix}${fn}_${ln}`;
        } else if (fn) {
          updated.username = `${prefix}${fn}`;
        }
      }

      if (name === "role" && prev.firstName) {
        const fn = prev.firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const ln = prev.lastName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const prefix = value === "DOCTOR" ? "dr_" : "";
        if (fn && ln) {
          updated.username = `${prefix}${fn}_${ln}`;
        }
      }

      return updated;
    });
  }

  function handleGeneratePassword() {
    const newPass = generateSecurePassword();
    setForm((prev) => ({ ...prev, password: newPass }));
    setCopiedPassword(false);
  }

  function handleCopyPassword() {
    if (!form.password) return;
    navigator.clipboard.writeText(form.password).then(() => {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    });
  }

  function toggleSlotDay(dayVal) {
    setSlotSelectedDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort((a, b) => a - b)
    );
  }

  function selectAllSlotWeekdays() {
    setSlotSelectedDays([1, 2, 3, 4, 5]);
  }

  function selectAllSlotDays() {
    setSlotSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  }

  function clearSlotDays() {
    setSlotSelectedDays([]);
  }

  function handleAddSlots() {
    if (slotSelectedDays.length === 0) {
      setError("Please select at least one day of the week (e.g. Mon-Fri).");
      return;
    }
    if (newSlot.startTime >= newSlot.endTime) {
      setError("Start time must be before end time.");
      return;
    }
    setError("");

    const newEntries = slotSelectedDays.map((dayVal) => ({
      dayOfWeek: dayVal,
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
      slotDurationMinutes: Number(newSlot.slotDurationMinutes || 30),
    }));

    setScheduleSlots((prev) => {
      const existing = prev.filter(
        (s) => !slotSelectedDays.includes(s.dayOfWeek) || s.startTime !== newSlot.startTime
      );
      return [...existing, ...newEntries].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    });
  }

  function handleRemoveSlot(index) {
    setScheduleSlots((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!passwordStrength.isValid) {
      setError("Password does not meet complexity requirements. Use Generate Password for a compliant password.");
      return;
    }

    if (emailValidation.available === false) {
      setError(emailValidation.message || "Please provide a valid and available email address.");
      return;
    }

    try {
      setSubmitting(true);

      const staffPayload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        department: form.department.trim(),
        specialty: form.specialty ? form.specialty.trim() : undefined,
        username: form.username.trim(),
        password: form.password,
      };

      const res = await createStaff(staffPayload);
      const createdStaffId = res?.data?.staffId || res?.data?.id || res?.staffId || res?.id;

      // Determine all consultation slots to create: explicitly added table slots + any active day selection
      let slotsToCreate = [...scheduleSlots];
      if (slotsToCreate.length === 0 && slotSelectedDays.length > 0 && newSlot.startTime && newSlot.endTime) {
        if (newSlot.startTime < newSlot.endTime) {
          slotsToCreate = slotSelectedDays.map((dayVal) => ({
            dayOfWeek: dayVal,
            startTime: newSlot.startTime,
            endTime: newSlot.endTime,
            slotDurationMinutes: Number(newSlot.slotDurationMinutes || 30),
          }));
        }
      }

      if (createdStaffId && slotsToCreate.length > 0) {
        try {
          // Group by identical time window for efficient batch schedule insertion
          const grouped = {};
          for (const s of slotsToCreate) {
            const key = `${s.startTime}_${s.endTime}_${s.slotDurationMinutes}`;
            if (!grouped[key]) {
              grouped[key] = {
                daysOfWeek: [],
                startTime: s.startTime,
                endTime: s.endTime,
                slotDurationMinutes: s.slotDurationMinutes,
              };
            }
            if (!grouped[key].daysOfWeek.includes(s.dayOfWeek)) {
              grouped[key].daysOfWeek.push(s.dayOfWeek);
            }
          }

          for (const key of Object.keys(grouped)) {
            const config = grouped[key];
            await createSchedule(createdStaffId, {
              daysOfWeek: config.daysOfWeek,
              startTime: config.startTime,
              endTime: config.endTime,
              slotDurationMinutes: config.slotDurationMinutes,
            });
          }
        } catch (schedErr) {
          console.warn("Schedule save error:", schedErr);
        }
      }

      setSuccess(
        `✓ Staff account for ${form.firstName} ${form.lastName} created successfully! Temporary login credentials have been sent directly to ${form.email}.`
      );

      setForm({
        ...INITIAL_FORM,
        password: generateSecurePassword(),
      });
      setScheduleSlots([]);
      setSlotSelectedDays([1, 2, 3, 4, 5]);
      setEmailValidation({ checking: false, available: null, reason: null, message: "" });
      refreshData();
    } catch (err) {
      setError(err.message || "Unable to create staff member.");
    } finally {
      setSubmitting(false);
    }
  }


  // Resend Credentials Action
  async function handleResendCredentials(member) {
    if (resendingCredentials[member.id]) return;
    try {
      setResendingCredentials((prev) => ({ ...prev, [member.id]: true }));
      setError("");
      await resendStaffCredentials(member.id);
      setSuccess(`✓ Temporary credentials regenerated and emailed to ${member.email} for ${member.first_name} ${member.last_name}.`);
    } catch (err) {

      setError(err.message || "Unable to resend staff credentials.");
    } finally {
      setResendingCredentials((prev) => ({ ...prev, [member.id]: false }));
    }
  }

  function handleOpenEdit(member) {
    setEditingMember(member);
    setEditForm({
      firstName: member.first_name || "",
      lastName: member.last_name || "",
      email: member.email || "",
      phone: member.phone || "",
      role: member.role || "DOCTOR",
      department: member.department || "",
      specialty: member.specialty || "",
      username: member.username || "",
    });
    setEditError("");
  }

  function handleEditChange(e) {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editingMember) return;
    setEditError("");
    try {
      setEditSubmitting(true);
      await updateStaff(editingMember.id, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        role: editForm.role,
        department: editForm.department ? editForm.department.trim() : null,
        specialty: editForm.specialty ? editForm.specialty.trim() : null,
        username: editForm.username ? editForm.username.trim() : undefined,
      });
      setSuccess(`Staff member ${editForm.firstName} ${editForm.lastName} updated successfully.`);
      setEditingMember(null);
      setEditForm(null);
      refreshData();
    } catch (err) {
      setEditError(err.message || "Unable to update staff member.");
    } finally {
      setEditSubmitting(false);
    }
  }

  function handleOpenDeactivate(member) {
    setDeactivatingMember(member);
    setDeactivationError("");
    setScheduledAppointments([]);
    const start = new Date().toISOString().split("T")[0];
    const end = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    setDeactivationForm({
      reason: "Annual / Sick Leave",
      startDate: start,
      endDate: end,
    });

    if (member.role === "DOCTOR") {
      setLoadingAppointments(true);
      getDoctorScheduledAppointments(member.id, start, end)
        .then((res) => {
          setScheduledAppointments(res.data || []);
        })
        .catch(() => {})
        .finally(() => setLoadingAppointments(false));
    }
  }

  function handleDeactivationDatesChange(e) {
    const { name, value } = e.target;
    const updated = { ...deactivationForm, [name]: value };
    setDeactivationForm(updated);

    if (deactivatingMember?.role === "DOCTOR" && updated.startDate && updated.endDate) {
      setLoadingAppointments(true);
      getDoctorScheduledAppointments(deactivatingMember.id, updated.startDate, updated.endDate)
        .then((res) => {
          setScheduledAppointments(res.data || []);
        })
        .catch(() => {})
        .finally(() => setLoadingAppointments(false));
    }
  }

  async function handleDeactivateSubmit(e) {
    e.preventDefault();
    if (!deactivatingMember) return;
    setDeactivationError("");
    try {
      setDeactivationSubmitting(true);
      await updateStaffStatus(deactivatingMember.id, {
        isActive: false,
        deactivationReason: deactivationForm.reason,
        deactivationStartDate: deactivationForm.startDate,
        deactivationEndDate: deactivationForm.endDate,
      });
      setSuccess(`Staff member ${deactivatingMember.first_name} ${deactivatingMember.last_name} deactivated successfully.`);
      setDeactivatingMember(null);
      refreshData();
    } catch (err) {
      setDeactivationError(err.message || "Unable to deactivate staff member.");
    } finally {
      setDeactivationSubmitting(false);
    }
  }

  async function handleDirectActivate(member) {
    try {
      setError("");
      await updateStaffStatus(member.id, { isActive: true });
      setSuccess(`Staff member ${member.first_name} ${member.last_name} activated successfully.`);
      refreshData();
    } catch (err) {
      setError(err.message || "Unable to activate staff member.");
    }
  }

  async function handleDeletePermanently() {
    if (!deletingMember) return;
    setDeleteError("");
    try {
      setDeleteSubmitting(true);
      await deleteStaffPermanently(deletingMember.id);
      setSuccess(`Staff member ${deletingMember.first_name} ${deletingMember.last_name} deleted permanently.`);
      setDeletingMember(null);
      refreshData();
    } catch (err) {
      setDeleteError(err.message || "Unable to delete staff member.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Administration & User Access</p>
          <h1>Staff & Provider Directory</h1>
          <p className="page-description">
            Register hospital personnel, assign roles and departments, manage temporary login credentials, and configure consultation availability.
          </p>
        </div>
      </div>

      {error && (
        <ToastPrompt message={error} type="error" onClose={() => setError("")} />
      )}
      {success && (
        <ToastPrompt message={success} type="success" onClose={() => setSuccess("")} />
      )}

      {/* Staff Registration Form */}
      <section className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header">
          <h2>Create New Staff Member</h2>
          <p>
            Enter provider credentials. The system will automatically email a secure temporary password to the entered email address.
          </p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="firstName">First name *</label>
            <input
              id="firstName"
              name="firstName"
              placeholder="e.g. Dawit"
              value={form.firstName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="lastName">Last name *</label>
            <input
              id="lastName"
              name="lastName"
              placeholder="e.g. Tadesse"
              value={form.lastName}
              onChange={handleChange}
              required
            />
          </div>

          {/* Email field with real-time format and duplicate validation */}
          <div className="form-field">
            <label htmlFor="email">Email Address *</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="e.g. doctor@hospital.local"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="off"
              style={{
                borderColor:
                  emailValidation.available === true
                    ? "var(--success)"
                    : emailValidation.available === false
                    ? "var(--danger)"
                    : undefined,
              }}
            />
            {emailValidation.message && (
              <p
                style={{
                  margin: "4px 0 0 0",
                  fontSize: "12px",
                  color:
                    emailValidation.available === true
                      ? "var(--success)"
                      : "var(--danger)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontWeight: 500,
                }}
              >
                {emailValidation.message}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="phone">Phone Number (Ethiopian Format) *</label>
            <input
              id="phone"
              name="phone"
              placeholder="09XXXXXXXX or +2519XXXXXXXX"
              value={form.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="role">System Role * (One Role Only)</label>
            <select
              id="role"
              name="role"
              value={form.role}
              onChange={handleChange}
              required
            >
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name} — {role.description}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="department">Department *</label>
            <input
              id="department"
              name="department"
              placeholder="e.g. Cardiology, Outpatient, Lab"
              value={form.department}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="specialty">Specialty</label>
            <input
              id="specialty"
              name="specialty"
              placeholder="e.g. Internal Medicine, Radiography"
              value={form.specialty}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label htmlFor="username">Username *</label>
            <input
              id="username"
              name="username"
              placeholder="e.g. dr_dawit"
              value={form.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Temporary Password *</label>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 200px" }}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 chars with upper, lower, digit, symbol"
                  value={form.password}
                  onChange={handleChange}
                  required
                  style={{ paddingRight: "42px", width: "100%" }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "13px",
                    padding: "4px",
                    lineHeight: 1,
                  }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <button
                type="button"
                className="button button-secondary"
                style={{ whiteSpace: "nowrap", fontSize: "12px", padding: "8px 12px" }}
                onClick={handleGeneratePassword}
                title="Generate cryptographically secure compliant password"
              >
                ⚡ Generate Password
              </button>

              <button
                type="button"
                className="button button-secondary"
                style={{
                  whiteSpace: "nowrap",
                  fontSize: "12px",
                  padding: "8px 12px",
                  background: copiedPassword ? "var(--success-light)" : undefined,
                  color: copiedPassword ? "var(--success)" : undefined,
                  borderColor: copiedPassword ? "var(--success)" : undefined,
                }}
                onClick={handleCopyPassword}
                disabled={!form.password}
                title="Copy password to clipboard"
              >
                {copiedPassword ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>

            {/* Live Strength Feedback */}
            {form.password && (
              <div style={{ marginTop: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                  <span>Policy Strength: <strong style={{ color: passwordStrength.color }}>{passwordStrength.label}</strong></span>
                  <span style={{ color: passwordStrength.isValid ? "var(--success)" : "var(--text-muted)" }}>
                    {passwordStrength.isValid ? "✓ Policy Compliant" : "Requirements Incomplete"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "4px", height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        background: i <= passwordStrength.score ? passwordStrength.color : "transparent",
                        transition: "all 150ms ease",
                      }}
                    />
                  ))}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  {passwordStrength.feedback}
                </div>
              </div>
            )}
          </div>

          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label>Available Work Dates & Consultation Slots (optional)</label>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 10px" }}>
              Set up a recurring weekly schedule for this staff member now, or skip and add it later from{" "}
              <strong>Manage Schedule</strong>.
            </p>

            {/* Multi-Day of Week Checkbox Selector */}
            <div style={{ marginBottom: "12px", background: "var(--surface-muted)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Select Days of Week:</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={selectAllSlotWeekdays}
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    Weekdays (Mon-Fri)
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={selectAllSlotDays}
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    All 7 Days
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={clearSlotDays}
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {DAYS.map((day) => {
                  const isChecked = slotSelectedDays.includes(day.value);
                  return (
                    <label
                      key={day.value}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: isChecked ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                        background: isChecked ? "rgba(2, 132, 199, 0.08)" : "var(--surface)",
                        cursor: "pointer",
                        fontWeight: isChecked ? 700 : 500,
                        fontSize: "12px",
                        color: isChecked ? "var(--primary)" : "var(--text-primary)",
                        transition: "all 150ms ease",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSlotDay(day.value)}
                        style={{ cursor: "pointer" }}
                      />
                      {day.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "10px",
                alignItems: "end",
                marginBottom: "8px",
              }}
            >
              <div>
                <label style={{ fontSize: "12px" }}>Start Time</label>
                <input
                  type="time"
                  value={newSlot.startTime}
                  onChange={(e) => setNewSlot((prev) => ({ ...prev, startTime: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px" }}>End Time</label>
                <input
                  type="time"
                  value={newSlot.endTime}
                  onChange={(e) => setNewSlot((prev) => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px" }}>Slot Duration</label>
                <select
                  value={newSlot.slotDurationMinutes}
                  onChange={(e) =>
                    setNewSlot((prev) => ({ ...prev, slotDurationMinutes: Number(e.target.value) }))
                  }
                >
                  <option value={15}>15 min</option>
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
              <div>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ width: "100%", whiteSpace: "nowrap" }}
                  onClick={handleAddSlots}
                >
                  + Add Days ({slotSelectedDays.length})
                </button>
              </div>
            </div>

            {scheduleSlots.length > 0 && (
              <div className="table-wrapper" style={{ marginBottom: "4px" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Slot Length</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleSlots.map((slot, index) => (
                      <tr key={`${slot.dayOfWeek}-${slot.startTime}-${index}`}>
                        <td>{DAYS.find((d) => d.value === slot.dayOfWeek)?.label}</td>
                        <td>{slot.startTime}</td>
                        <td>{slot.endTime}</td>
                        <td>{slot.slotDurationMinutes} min</td>
                        <td>
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            onClick={() => handleRemoveSlot(index)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="form-actions" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button
              className="button button-primary button-large"
              type="submit"
              disabled={submitting || !passwordStrength.isValid || emailValidation.available === false}
            >
              {submitting ? "Creating account..." : "Create Staff Member →"}
            </button>
          </div>
        </form>
      </section>

      {/* Staff Directory Table */}
      <section className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Active Hospital Personnel ({staff.length})</h2>
            <p>Current registered staff members and their active status.</p>
          </div>
          <div style={{ width: "240px" }}>
            <input
              type="search"
              placeholder="Live filter staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: "6px 10px", fontSize: "12px" }}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading staff...</div>
        ) : staff.length === 0 ? (
          <div className="empty-state">No staff members match criteria.</div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Department / Specialty</th>
                  <th>Username</th>
                  <th>Email & Phone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>
                        {member.first_name} {member.last_name}
                      </strong>
                    </td>
                    <td>
                      <span className="badge badge-info">{member.role}</span>
                    </td>
                    <td>
                      {member.department || "General"}
                      {member.specialty && ` (${member.specialty})`}
                    </td>
                    <td>
                      <code style={{ fontFamily: "monospace" }}>{member.username || "—"}</code>
                    </td>
                    <td>
                      {member.email}
                      <br />
                      <small style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>{member.phone}</small>
                    </td>
                    <td>
                      <div>
                        <span
                          className={`status ${
                            member.is_active ? "status-active" : "status-inactive"
                          }`}
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </span>
                        {!member.is_active && member.deactivation_end_date && (
                          <div style={{ fontSize: "11px", color: "var(--danger)", marginTop: "4px" }}>
                            {member.deactivation_reason || "On Leave"}
                            <br />
                            <small style={{ color: "var(--text-muted)" }}>
                              Until {new Date(member.deactivation_end_date).toLocaleDateString()}
                            </small>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => handleOpenEdit(member)}
                        >
                          Edit
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => navigate(`/admin/schedules?staffId=${member.id}`)}
                        >
                          Schedule
                        </button>
                        {member.is_active && (
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => handleResendCredentials(member)}
                            disabled={resendingCredentials[member.id]}
                            title="Generate and email new temporary password to staff email"
                            style={{ fontSize: "12px" }}
                          >
                            {resendingCredentials[member.id] ? "Sending..." : "🔑 Resend Temporary Password"}
                          </button>
                        )}
                        {member.is_active ? (
                          <button
                            className="button button-secondary"
                            type="button"
                            style={{ color: "var(--danger)" }}
                            onClick={() => handleOpenDeactivate(member)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="button button-primary"
                            type="button"
                            onClick={() => handleDirectActivate(member)}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}


              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Edit Staff Member Modal */}
      {editingMember && editForm && (
        <Modal
          isOpen={true}
          onClose={() => {
            setEditingMember(null);
            setEditForm(null);
          }}
          title={`Edit Staff Member — ${editingMember.first_name} ${editingMember.last_name}`}
        >
          <form onSubmit={handleEditSubmit}>
            {editError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: "12px" }}>
                {editError}
              </div>
            )}

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="editFirstName">First name *</label>
                <input
                  id="editFirstName"
                  name="firstName"
                  value={editForm.firstName}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editLastName">Last name *</label>
                <input
                  id="editLastName"
                  name="lastName"
                  value={editForm.lastName}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editUsername">Username (Login ID) *</label>
                <input
                  id="editUsername"
                  name="username"
                  value={editForm.username}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editEmail">Email Address *</label>
                <input
                  id="editEmail"
                  name="email"
                  type="email"
                  value={editForm.email}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editPhone">Phone Number (Ethiopian Format) *</label>
                <input
                  id="editPhone"
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editRole">System Role *</label>
                <select
                  id="editRole"
                  name="role"
                  value={editForm.role}
                  onChange={handleEditChange}
                  required
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name} — {role.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="editDepartment">Department</label>
                <input
                  id="editDepartment"
                  name="department"
                  value={editForm.department}
                  onChange={handleEditChange}
                />
              </div>

              <div className="form-field">
                <label htmlFor="editSpecialty">Specialty</label>
                <input
                  id="editSpecialty"
                  name="specialty"
                  value={editForm.specialty}
                  onChange={handleEditChange}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setEditingMember(null);
                  setEditForm(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Permanent Delete Modal */}
      {deletingMember && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingMember(null)}
          title="⚠️ Delete Staff Member Permanently"
        >
          <div>
            {deleteError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: "14px" }}>
                {deleteError}
              </div>
            )}

            <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "14px", borderRadius: "var(--radius-sm)", marginBottom: "16px" }}>
              <p style={{ margin: "0 0 8px 0", fontWeight: 700, color: "#dc2626" }}>
                Are you sure you want to permanently delete this staff member?
              </p>
              <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                <strong>Name:</strong> {deletingMember.first_name} {deletingMember.last_name}<br />
                <strong>Role:</strong> {deletingMember.role}<br />
                <strong>Username:</strong> {deletingMember.username || "—"}<br />
                <strong>Email:</strong> {deletingMember.email}
              </div>
              <p style={{ margin: "10px 0 0 0", fontSize: "12px", color: "#dc2626" }}>
                ⚠️ Warning: This will permanently remove their user credentials, clinic schedules, and staff profile from the hospital database. This action cannot be undone.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeletingMember(null)}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                style={{ background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
                onClick={handleDeletePermanently}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Deleting..." : "🗑 Yes, Delete Permanently"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Staff Deactivation Modal (Requirement 7) */}
      {deactivatingMember && (
        <Modal
          isOpen={true}
          onClose={() => setDeactivatingMember(null)}
          title={`Deactivate Staff — ${deactivatingMember.first_name} ${deactivatingMember.last_name} (${deactivatingMember.role})`}
        >
          <form onSubmit={handleDeactivateSubmit}>
            {deactivationError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: "14px" }}>
                {deactivationError}
              </div>
            )}

            <div style={{ background: "var(--surface-muted)", padding: "12px 14px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "13px" }}>
              <strong>Staff Profile:</strong> {deactivatingMember.first_name} {deactivatingMember.last_name} • {deactivatingMember.role} • {deactivatingMember.specialty || deactivatingMember.department || "General"}
              <div style={{ marginTop: "4px", color: "var(--text-secondary)" }}>
                Staff member will be marked inactive between the specified dates and automatically reactivated after the end date.
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="deactivateReason">Deactivation Reason *</label>
                <input
                  id="deactivateReason"
                  name="reason"
                  value={deactivationForm.reason}
                  onChange={handleDeactivationDatesChange}
                  placeholder="e.g. Annual Leave, Medical Leave"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="deactivateStart">Start Date *</label>
                <input
                  id="deactivateStart"
                  name="startDate"
                  type="date"
                  value={deactivationForm.startDate}
                  onChange={handleDeactivationDatesChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="deactivateEnd">End Date (Auto-Reactivation) *</label>
                <input
                  id="deactivateEnd"
                  name="endDate"
                  type="date"
                  value={deactivationForm.endDate}
                  onChange={handleDeactivationDatesChange}
                  required
                />
              </div>
            </div>

            {/* Scheduled Appointments Preview during Leave Period */}
            {deactivatingMember.role === "DOCTOR" && (
              <div style={{ marginTop: "16px", marginBottom: "16px" }}>
                <h4 style={{ fontSize: "13px", margin: "0 0 6px 0" }}>
                  Scheduled Patient Appointments During Leave Period ({scheduledAppointments.length})
                </h4>
                {loadingAppointments ? (
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Checking doctor's appointments...</p>
                ) : scheduledAppointments.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "var(--success)" }}>
                    ✓ No patient appointments booked for this doctor during the selected period.
                  </p>
                ) : (
                  <div className="table-wrapper" style={{ maxHeight: "160px", overflowY: "auto" }}>
                    <table className="data-table" style={{ fontSize: "12px" }}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Patient</th>
                          <th>Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduledAppointments.map((apt) => (
                          <tr key={apt.id}>
                            <td>{new Date(apt.appointment_date).toLocaleDateString()}</td>
                            <td>{apt.start_time} - {apt.end_time}</td>
                            <td>{apt.patient_first_name} {apt.patient_last_name}</td>
                            <td>{apt.patient_phone}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "20px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border)",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <button
                type="button"
                className="button button-danger"
                style={{ background: "#dc2626", color: "#fff", borderColor: "#dc2626", fontSize: "12px", padding: "6px 12px" }}
                onClick={() => {
                  const member = deactivatingMember;
                  setDeactivatingMember(null);
                  setDeletingMember(member);
                }}
                disabled={deactivationSubmitting}
                title="Permanently remove staff record and credentials"
              >
                🗑 Delete Permanently
              </button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setDeactivatingMember(null)}
                  disabled={deactivationSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button"
                  style={{ background: "#f59e0b", color: "#fff", borderColor: "#f59e0b" }}
                  disabled={deactivationSubmitting}
                >
                  {deactivationSubmitting ? "Deactivating..." : "Confirm Deactivation"}
                </button>
              </div>
            </div>

          </form>
        </Modal>
      )}
    </AppShell>
  );
}

export default AdminStaff;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(uuid) {
  return typeof uuid === "string" && UUID_REGEX.test(uuid);
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Validates Ethiopian phone number format:
 * Accepts:
 * - 09XXXXXXXX (10 digits)
 * - 07XXXXXXXX (10 digits)
 * - +2519XXXXXXXX (13 chars)
 * - +2517XXXXXXXX (13 chars)
 * - 2519XXXXXXXX (12 digits)
 * - 2517XXXXXXXX (12 digits)
 */
function validateEthiopianPhone(phone) {
  if (!phone || typeof phone !== "string") {
    return false;
  }
  const clean = phone.trim().replace(/[\s-]/g, "");
  const ethiopianRegex = /^(?:\+251[97]\d{8}|251[97]\d{8}|0[97]\d{8})$/;
  return ethiopianRegex.test(clean);
}

function normalizeEthiopianPhone(phone) {
  if (!phone || typeof phone !== "string") return "";
  const clean = phone.trim().replace(/[\s-]/g, "");
  if (clean.startsWith("+251")) {
    return clean;
  }
  if (clean.startsWith("251")) {
    return `+${clean}`;
  }
  if (clean.startsWith("0")) {
    return `+251${clean.slice(1)}`;
  }
  return clean;
}

/**
 * Validates strong password requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== "string") {
    return {
      isValid: false,
      message: "Password is required.",
    };
  }

  if (password.length < 8) {
    return {
      isValid: false,
      message: "Password must be at least 8 characters long.",
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      message: "Password must contain at least one uppercase letter.",
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      message: "Password must contain at least one lowercase letter.",
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      isValid: false,
      message: "Password must contain at least one number.",
    };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return {
      isValid: false,
      message: "Password must contain at least one special character (!@#$%^&*...).",
    };
  }

  return {
    isValid: true,
  };
}

function calculateDobFromAge(age) {
  const numericAge = parseInt(age, 10);
  if (isNaN(numericAge) || numericAge < 0 || numericAge > 130) {
    return null;
  }
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - numericAge;
  return `${birthYear}-01-01`;
}

function validateVitals(data) {
  const errors = [];

  const temperature = data.temperature ? parseFloat(data.temperature) : null;
  const heartRate = data.heartRate ? parseInt(data.heartRate, 10) : null;
  const respiratoryRate = data.respiratoryRate ? parseInt(data.respiratoryRate, 10) : null;
  const systolicBp = data.systolicBp ? parseInt(data.systolicBp, 10) : null;
  const diastolicBp = data.diastolicBp ? parseInt(data.diastolicBp, 10) : null;
  const oxygenSaturation = data.oxygenSaturation ? parseFloat(data.oxygenSaturation) : null;
  const weight = data.weight ? parseFloat(data.weight) : null;
  const height = data.height ? parseFloat(data.height) : null;

  if (temperature !== null && (temperature < 30 || temperature > 45)) {
    errors.push("Temperature must be between 30°C and 45°C.");
  }
  if (heartRate !== null && (heartRate < 20 || heartRate > 300)) {
    errors.push("Heart rate must be between 20 and 300 bpm.");
  }
  if (respiratoryRate !== null && (respiratoryRate < 5 || respiratoryRate > 100)) {
    errors.push("Respiratory rate must be between 5 and 100 breaths/min.");
  }
  if (systolicBp !== null && (systolicBp < 40 || systolicBp > 300)) {
    errors.push("Systolic blood pressure must be between 40 and 300 mmHg.");
  }
  if (diastolicBp !== null && (diastolicBp < 20 || diastolicBp > 200)) {
    errors.push("Diastolic blood pressure must be between 20 and 200 mmHg.");
  }
  if (oxygenSaturation !== null && (oxygenSaturation < 40 || oxygenSaturation > 100)) {
    errors.push("Oxygen saturation must be between 40% and 100%.");
  }
  if (weight !== null && (weight < 0.5 || weight > 500)) {
    errors.push("Weight must be between 0.5 kg and 500 kg.");
  }
  if (height !== null && (height < 20 || height > 280)) {
    errors.push("Height must be between 20 cm and 280 cm.");
  }

  let bmi = null;
  if (weight && height) {
    const heightInMeters = height / 100;
    bmi = parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(1));
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      temperature,
      heartRate,
      respiratoryRate,
      systolicBp,
      diastolicBp,
      oxygenSaturation,
      weight,
      height,
      bmi,
      triageCategory: data.triageCategory || "NORMAL",
      notes: data.notes ? data.notes.trim() : null,
    },
  };
}

function validateEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

function validateOtp(otp) {
  if (!otp || typeof otp !== "string") return false;
  return /^\d{6}$/.test(otp.trim());
}

module.exports = {
  isValidUUID,
  parsePagination,
  validateEthiopianPhone,
  normalizeEthiopianPhone,
  validatePasswordStrength,
  validateEmail,
  validateOtp,
  calculateDobFromAge,
  validateVitals,
};


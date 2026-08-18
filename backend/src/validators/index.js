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

module.exports = {
  isValidUUID,
  parsePagination,
  validateVitals,
};

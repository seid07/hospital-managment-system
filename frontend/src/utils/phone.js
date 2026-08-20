/**
 * Validates Ethiopian phone number format:
 * 09XXXXXXXX, 07XXXXXXXX, +2519XXXXXXXX, +2517XXXXXXXX, 2519XXXXXXXX, 2517XXXXXXXX
 */
export function validateEthiopianPhone(phone) {
  if (!phone || typeof phone !== "string") {
    return false;
  }
  const clean = phone.trim().replace(/[\s-]/g, "");
  const ethiopianRegex = /^(?:\+251[97]\d{8}|251[97]\d{8}|0[97]\d{8})$/;
  return ethiopianRegex.test(clean);
}

export function normalizeEthiopianPhone(phone) {
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

export function formatEthiopianPhoneDisplay(phone) {
  if (!phone) return "—";
  const clean = phone.trim();
  if (clean.startsWith("+251") && clean.length === 13) {
    // e.g. +251 91 123 4567
    return `${clean.slice(0, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`;
  }
  return clean;
}

/**
 * Password strength evaluation and feedback
 */
export function checkPasswordStrength(password) {
  if (!password) {
    return {
      score: 0,
      label: "None",
      color: "#94a3b8",
      isValid: false,
      feedback: "Enter at least 8 characters with upper, lower, number, and special symbol.",
    };
  }

  let score = 0;
  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password),
  };

  if (checks.length) score += 1;
  if (checks.upper) score += 1;
  if (checks.lower) score += 1;
  if (checks.number) score += 1;
  if (checks.special) score += 1;

  const isValid = checks.length && checks.upper && checks.lower && checks.number && checks.special;

  if (score <= 2) {
    return {
      score,
      label: "Weak",
      color: "#ef4444",
      isValid,
      feedback: "Weak: Must include 8+ chars, uppercase, lowercase, number, and symbol (!@#$).",
    };
  }

  if (score === 3 || score === 4) {
    return {
      score,
      label: "Fair",
      color: "#f59e0b",
      isValid,
      feedback: "Fair: Add missing character types (upper, lower, number, or special symbol).",
    };
  }

  return {
    score,
    label: "Strong",
    color: "#10b981",
    isValid: true,
    feedback: "Strong: Meets all security policy requirements.",
  };
}

/**
 * Generate a cryptographically secure random password.
 * Guarantees at least 2 uppercase, 2 lowercase, 2 digits, and 2 special symbols.
 * Total length: exactly 8 characters.
 */
export function generateSecurePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*_+-=?";

  const getChar = (charset) => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return charset[arr[0] % charset.length];
  };

  // Ensure 2 of each required type -> 2 + 2 + 2 + 2 = exactly 8 characters
  const combined = [
    getChar(upper),
    getChar(upper),
    getChar(lower),
    getChar(lower),
    getChar(digits),
    getChar(digits),
    getChar(special),
    getChar(special),
  ];

  // Shuffle combined array using Fisher-Yates with crypto random
  for (let i = combined.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join("");
}

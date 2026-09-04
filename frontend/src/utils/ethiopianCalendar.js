/**
 * Ethiopian (Ge'ez) Calendar Conversion & Formatting Engine
 *
 * Implements precise astronomical Julian Day Number (JDN) conversions
 * between Gregorian Calendar (GC) and Ethiopian Calendar (EC / ዓመተ ምሕረት).
 */

export const ETHIOPIAN_MONTHS = [
  { id: 1, name: "መስከረም", amharic: "መስከረም", shortName: "መስከረም" },
  { id: 2, name: "ጥቅምት", amharic: "ጥቅምት", shortName: "ጥቅምት" },
  { id: 3, name: "ኅዳር", amharic: "ኅዳር", shortName: "ኅዳር" },
  { id: 4, name: "ታኅሣሥ", amharic: "ታኅሣሥ", shortName: "ታኅሣሥ" },
  { id: 5, name: "ጥር", amharic: "ጥር", shortName: "ጥር" },
  { id: 6, name: "የካቲት", amharic: "የካቲት", shortName: "የካቲት" },
  { id: 7, name: "መጋቢት", amharic: "መጋቢት", shortName: "መጋቢት" },
  { id: 8, name: "ሚያዝያ", amharic: "ሚያዝያ", shortName: "ሚያዝያ" },
  { id: 9, name: "ግንቦት", amharic: "ግንቦት", shortName: "ግንቦት" },
  { id: 10, name: "ሰኔ", amharic: "ሰኔ", shortName: "ሰኔ" },
  { id: 11, name: "ሐምሌ", amharic: "ሐምሌ", shortName: "ሐምሌ" },
  { id: 12, name: "ነሐሴ", amharic: "ነሐሴ", shortName: "ነሐሴ" },
  { id: 13, name: "ጳጉሜ", amharic: "ጳጉሜ", shortName: "ጳጉሜ" },
];

const ETHIOPIC_ERA = 1723856;

/**
 * Converts a Gregorian Date to Julian Day Number (JDN)
 */
export function gregorianToJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * Converts Julian Day Number (JDN) to Gregorian Date { year, month, day }
 */
export function jdnToGregorian(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

/**
 * Converts Julian Day Number (JDN) to Ethiopian Date { year, month, day }
 */
export function jdnToEthiopian(jdn) {
  const r = (jdn - ETHIOPIC_ERA) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year =
    4 * Math.floor((jdn - ETHIOPIC_ERA) / 1461) +
    Math.floor(r / 365) -
    Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

/**
 * Converts Ethiopian Date to Julian Day Number (JDN)
 */
export function ethiopianToJDN(year, month, day) {
  return (
    ETHIOPIC_ERA +
    365 * (year - 1) +
    Math.floor(year / 4) +
    30 * (month - 1) +
    day -
    1
  );
}

/**
 * Converts Gregorian Date / Date object / ISO string to Ethiopian Date
 * @param {Date|string|number} inputDate
 * @returns {{ year: number, month: number, day: number, monthName: string, amharicMonth: string, formatted: string }}
 */
export function toEthiopian(inputDate) {
  if (!inputDate) return null;
  const d = inputDate instanceof Date ? inputDate : new Date(inputDate);
  if (isNaN(d.getTime())) return null;

  const gYear = d.getFullYear();
  const gMonth = d.getMonth() + 1;
  const gDay = d.getDate();

  const jdn = gregorianToJDN(gYear, gMonth, gDay);
  const { year, month, day } = jdnToEthiopian(jdn);

  const monthObj = ETHIOPIAN_MONTHS[month - 1] || {
    name: `Month ${month}`,
    amharic: `ወር ${month}`,
    shortName: `M${month}`,
  };

  const formatted = `${monthObj.name} ${day}, ${year} E.C.`;
  const formattedAmharic = `${monthObj.amharic} ${day}, ${year} ዓ.ም.`;
  const formattedIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} E.C.`;

  return {
    year,
    month,
    day,
    monthName: monthObj.name,
    amharicMonth: monthObj.amharic,
    shortMonth: monthObj.shortName,
    formatted,
    formattedAmharic,
    formattedIso,
  };
}

/**
 * Converts Ethiopian Date { year, month, day } to Gregorian Date object
 */
export function toGregorian(year, month, day) {
  const jdn = ethiopianToJDN(Number(year), Number(month), Number(day));
  const { year: gYear, month: gMonth, day: gDay } = jdnToGregorian(jdn);
  return new Date(gYear, gMonth - 1, gDay);
}

export function getActiveCalendarSystem() {
  try {
    return localStorage.getItem("hospital_calendar_system") || "GC";
  } catch {
    return "GC";
  }
}

/**
 * Universal Date Formatter for Hospital System
 * Supports both GC (Gregorian Calendar) and EC (Ethiopian Calendar)
 *
 * @param {Date|string|number} dateVal - Target date to format
 * @param {"GC"|"EC"} [calendarSystem] - Active calendar system (defaults to active preference)
 * @param {object} [options] - Formatting options
 * @returns {string}
 */
export function formatHospitalDate(dateVal, calendarSystem = null, options = {}) {
  if (!dateVal) return "—";
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return "—";

  const activeSys = calendarSystem || getActiveCalendarSystem();

  if (activeSys === "EC") {
    const eth = toEthiopian(d);
    if (!eth) return "—";

    if (options.amharic) {
      return eth.formattedAmharic;
    }
    if (options.short) {
      return `${eth.shortMonth} ${eth.day}, ${eth.year} E.C.`;
    }
    if (options.iso) {
      return eth.formattedIso;
    }
    return eth.formatted;
  }

  // Default Gregorian (GC)
  if (options.short) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  if (options.iso) {
    return d.toISOString().split("T")[0];
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Universal DateTime Formatter
 *
 * @param {Date|string|number} dateVal
 * @param {"GC"|"EC"} [calendarSystem]
 * @returns {string}
 */
export function formatHospitalDateTime(dateVal, calendarSystem = null) {
  if (!dateVal) return "—";
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return "—";

  const activeSys = calendarSystem || getActiveCalendarSystem();
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = formatHospitalDate(d, activeSys, { short: true });

  return `${dateStr} ${timeStr}`;
}

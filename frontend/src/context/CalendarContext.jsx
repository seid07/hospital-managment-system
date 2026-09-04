import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarContext } from "./calendar-context";
import {
  formatHospitalDate,
  formatHospitalDateTime,
  toEthiopian,
  toGregorian,
  ETHIOPIAN_MONTHS,
} from "../utils/ethiopianCalendar";

const STORAGE_KEY = "hospital_calendar_system";

export function CalendarProvider({ children }) {
  const [calendarSystem, setCalendarSystemState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "GC";
    } catch {
      return "GC";
    }
  });

  const setCalendarSystem = useCallback((newSystem) => {
    const validSystem = newSystem === "EC" ? "EC" : "GC";
    setCalendarSystemState(validSystem);
    try {
      localStorage.setItem(STORAGE_KEY, validSystem);
      window.dispatchEvent(new CustomEvent("hospital_calendar_changed", { detail: validSystem }));
    } catch {
      // ignore
    }
  }, []);

  // Listen to changes across tabs or window events
  useEffect(() => {
    function handleStorage(e) {
      if (e.key === STORAGE_KEY && e.newValue) {
        setCalendarSystemState(e.newValue);
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const formatDate = useCallback(
    (dateVal, options = {}) => {
      return formatHospitalDate(dateVal, calendarSystem, options);
    },
    [calendarSystem]
  );

  const formatDateTime = useCallback(
    (dateVal) => {
      return formatHospitalDateTime(dateVal, calendarSystem);
    },
    [calendarSystem]
  );

  const isEthiopian = calendarSystem === "EC";
  const isGregorian = calendarSystem === "GC";
  const todayFormatted = useMemo(() => formatHospitalDate(new Date(), calendarSystem), [calendarSystem]);

  const value = useMemo(
    () => ({
      calendarSystem,
      setCalendarSystem,
      isEthiopian,
      isGregorian,
      formatDate,
      formatDateTime,
      todayFormatted,
      toEthiopian,
      toGregorian,
      ethiopianMonths: ETHIOPIAN_MONTHS,
    }),
    [calendarSystem, setCalendarSystem, isEthiopian, isGregorian, formatDate, formatDateTime, todayFormatted]
  );

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}

export default CalendarProvider;

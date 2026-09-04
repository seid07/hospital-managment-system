import { useContext } from "react";
import { CalendarContext } from "./calendar-context";
import { formatHospitalDate, formatHospitalDateTime, toEthiopian, toGregorian } from "../utils/ethiopianCalendar";

export function useCalendar() {
  const context = useContext(CalendarContext);

  if (!context) {
    // Fallback if rendered outside provider
    return {
      calendarSystem: "GC",
      setCalendarSystem: () => {},
      isEthiopian: false,
      isGregorian: true,
      formatDate: (d, opt) => formatHospitalDate(d, "GC", opt),
      formatDateTime: (d) => formatHospitalDateTime(d, "GC"),
      toEthiopian,
      toGregorian,
      todayFormatted: formatHospitalDate(new Date(), "GC"),
    };
  }

  return context;
}

export default useCalendar;

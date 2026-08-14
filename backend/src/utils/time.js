function timeToMinutes(time) {
  const [hours, minutes] = time
    .slice(0, 5)
    .split(":")
    .map(Number);

  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(
    minutes
  ).padStart(2, "0")}`;
}

function generateSlots(
  startTime,
  endTime,
  slotDurationMinutes
) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  const slots = [];

  for (
    let current = start;
    current + slotDurationMinutes <= end;
    current += slotDurationMinutes
  ) {
    slots.push({
      startTime: minutesToTime(current),
      endTime: minutesToTime(
        current + slotDurationMinutes
      ),
    });
  }

  return slots;
}

function rangesOverlap(
  startA,
  endA,
  startB,
  endB
) {
  return (
    startA < endB &&
    endA > startB
  );
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  generateSlots,
  rangesOverlap,
};

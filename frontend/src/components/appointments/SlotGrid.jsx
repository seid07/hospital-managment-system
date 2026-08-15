function SlotGrid({
  slots,
  selectedSlot,
  onSelect,
  loading,
  hasDate,
}) {
  if (!hasDate) {
    return (
      <div className="empty-state">
        Select a date to view
        available appointment times.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-state">
        Loading available times...
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="empty-state">
        No schedule is available for
        this doctor on the selected
        date.
      </div>
    );
  }

  return (
    <div className="slot-grid">
      {slots.map((slot) => {
        const isSelected =
          selectedSlot?.startTime ===
            slot.startTime &&
          selectedSlot?.endTime ===
            slot.endTime;

        return (
          <button
            key={`${slot.startTime}-${slot.endTime}`}
            type="button"
            disabled={!slot.available}
            className={`slot-button ${
              isSelected
                ? "slot-button-selected"
                : ""
            } ${
              !slot.available
                ? "slot-button-booked"
                : ""
            }`}
            onClick={() =>
              slot.available &&
              onSelect(slot)
            }
          >
            <strong>
              {slot.startTime}
            </strong>

            <span>
              {slot.endTime}
            </span>

            {!slot.available && (
              <small>
                Booked
              </small>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SlotGrid;

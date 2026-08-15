function AppointmentForm({
  reason,
  notes,
  onReasonChange,
  onNotesChange,
}) {
  return (
    <>
      <div className="form-field">
        <label htmlFor="reason">
          Reason for Visit
        </label>

        <input
          id="reason"
          type="text"
          value={reason}
          onChange={(event) =>
            onReasonChange(
              event.target.value
            )
          }
          placeholder="e.g. General consultation"
          maxLength={500}
        />
      </div>

      <div className="form-field">
        <label htmlFor="notes">
          Notes
        </label>

        <textarea
          id="notes"
          value={notes}
          onChange={(event) =>
            onNotesChange(
              event.target.value
            )
          }
          placeholder="Additional information..."
          rows="4"
          maxLength={2000}
        />
      </div>
    </>
  );
}

export default AppointmentForm;

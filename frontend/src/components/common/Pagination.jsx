function Pagination({ page, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: "16px",
        padding: "12px 0",
        borderTop: "1px solid var(--border)",
        fontSize: "13px",
        color: "var(--text-secondary)",
      }}
    >
      <div>
        Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total records)
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          className="button button-secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous Page"
        >
          Previous
        </button>

        <button
          type="button"
          className="button button-secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next Page"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Pagination;

function errorHandler(err, req, res, next) {
  console.error("Unhandled API error:", err);

  if (res.headersSent) {
    return next(err);
  }

  // Handle PostgreSQL specific error codes safely
  if (err.code === "23505") {
    return res.status(409).json({
      success: false,
      message: "A record with this information already exists.",
    });
  }

  if (err.code === "23503") {
    return res.status(400).json({
      success: false,
      message: "Referenced record does not exist.",
    });
  }

  if (err.code === "23P01") {
    return res.status(409).json({
      success: false,
      message: "Conflict: This resource or time slot is already occupied.",
    });
  }

  const statusCode = err.statusCode || (err.status && typeof err.status === "number" ? err.status : 500);

  return res.status(statusCode).json({
    success: false,
    message: err.message || "An internal server error occurred.",
  });
}

module.exports = {
  errorHandler,
};

export const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
};

export const errorHandler = (error, _req, res, _next) => {
  console.error(error);

  if (error?.code === 11000) {
    const fields = Object.keys(error.keyPattern || {});
    return res.status(409).json({
      success: false,
      message: `Duplicate value for: ${fields.join(", ")}.`
    });
  }

  if (error?.name === "ValidationError") {
    const errors = Object.fromEntries(
      Object.entries(error.errors).map(([key, value]) => [key, value.message])
    );

    return res.status(400).json({
      success: false,
      message: "Validation failed.",
      errors
    });
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Internal server error."
  });
};

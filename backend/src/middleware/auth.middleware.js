const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization header.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      ...decoded,
      id: decoded.id || decoded.userId,
      userId: decoded.userId || decoded.id,
      staff_id: decoded.staff_id || decoded.staffId,
      staffId: decoded.staffId || decoded.staff_id,
      must_change_password: Boolean(decoded.must_change_password),
    };

    // Enforce backend-level restriction for first-time login mandatory password change
    if (req.user.must_change_password) {
      const allowedPaths = [
        "/api/auth/change-password",
        "/api/auth/verify-password",
        "/api/auth/status",
        "/change-password",
        "/verify-password",
      ];
      const isAllowed = allowedPaths.some(
        (p) => req.originalUrl?.startsWith(p) || req.baseUrl?.startsWith(p) || req.path?.startsWith(p)
      );

      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          code: "PASSWORD_CHANGE_REQUIRED",
          message: "Password change is mandatory on first login before accessing hospital services.",
        });
      }
    }

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }
}

module.exports = {
  authenticateToken,
};

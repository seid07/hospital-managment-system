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
    };

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

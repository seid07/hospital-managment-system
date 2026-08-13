const authService = require("../services/auth.service");

async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    const result = await authService.login(username, password);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.message === "ACCOUNT_INACTIVE") {
      return res.status(403).json({
        success: false,
        message: "This staff account is inactive.",
      });
    }

    if (error.message === "INVALID_CREDENTIALS") {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process login.",
    });
  }
}

module.exports = {
  login,
};

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

async function forgotPassword(req, res) {
  try {
    const { username } = req.body;
    const result = await authService.requestPasswordReset(username);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to process password reset request.",
    });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Reset token and new password are required.",
      });
    }

    const result = await authService.resetPassword(token, newPassword);
    return res.status(200).json(result);
  } catch (error) {
    if (error.message?.startsWith("WEAK_PASSWORD")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace("WEAK_PASSWORD: ", ""),
      });
    }
    if (error.message === "INVALID_OR_EXPIRED_TOKEN") {
      return res.status(400).json({
        success: false,
        message: "Password reset token is invalid or has expired. Please request a new one.",
      });
    }
    console.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to reset password.",
    });
  }
}

module.exports = {
  login,
  forgotPassword,
  resetPassword,
};

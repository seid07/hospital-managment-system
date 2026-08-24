const authService = require("../services/auth.service");

async function getSystemStatus(req, res) {
  try {
    const status = await authService.checkSystemStatus();
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("System status check error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to check system status.",
    });
  }
}

async function setupAdmin(req, res) {
  try {
    const { firstName, lastName, email, phone, username, password } = req.body;

    if (!firstName || !lastName || !email || !phone || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required for initial administrator setup.",
      });
    }

    const result = await authService.setupInitialAdmin(req.body);
    return res.status(201).json(result);
  } catch (error) {
    console.error("Setup admin error:", error);
    if (error.message?.startsWith("SYSTEM_ALREADY_INITIALIZED") || error.message?.startsWith("WEAK_PASSWORD")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace(/^[^:]+:\s*/, ""),
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to setup initial administrator.",
    });
  }
}

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
    const { username, lastName, email, phone, department } = req.body;
    const result = await authService.requestPasswordReset({
      username,
      lastName,
      email,
      phone,
      department,
    });
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
  getSystemStatus,
  setupAdmin,
  login,
  forgotPassword,
  resetPassword,
};

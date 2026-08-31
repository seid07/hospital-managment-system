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
      token: result.token,
      user: result.user,
      data: result,
    });
  } catch (error) {
    if (error.message === "ACCOUNT_INACTIVE") {
      return res.status(403).json({
        success: false,
        message: "This staff account is inactive. Please contact the administrator.",
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
      message: "Unable to sign in.",
    });
  }
}

/**
 * Change Password Step 1: Verify current password
 */
async function verifyCurrentPassword(req, res) {
  try {
    const { currentPassword } = req.body;
    const userId = req.user?.userId || req.user?.id;

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required.",
      });
    }

    const result = await authService.verifyCurrentPassword(userId, currentPassword);
    return res.status(200).json({
      success: true,
      valid: result.valid,
      message: result.message,
      data: result,
    });
  } catch (error) {
    if (
      error.message?.startsWith("INVALID_CURRENT_PASSWORD") ||
      error.message?.startsWith("CURRENT_PASSWORD_REQUIRED")
    ) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: error.message.replace(/^[^:]+:\s*/, ""),
      });
    }

    console.error("Verify password error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify current password.",
    });
  }
}

/**
 * Change Password Step 2: Set new password
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.user?.userId || req.user?.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    const result = await authService.changePassword(
      userId,
      currentPassword,
      newPassword,
      confirmNewPassword
    );

    return res.status(200).json({
      success: true,
      token: result.token,
      user: result.user,
      data: result,
    });
  } catch (error) {
    if (
      error.message?.startsWith("INVALID_CURRENT_PASSWORD") ||
      error.message?.startsWith("SAME_PASSWORD") ||
      error.message?.startsWith("PASSWORD_MISMATCH") ||
      error.message?.startsWith("WEAK_PASSWORD") ||
      error.message?.startsWith("CURRENT_PASSWORD_REQUIRED") ||
      error.message?.startsWith("NEW_PASSWORD_REQUIRED")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message.replace(/^[^:]+:\s*/, ""),
      });
    }

    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to change password.",
    });
  }
}

/**
 * Forgot Password Step 1: Request 6-digit OTP
 */
async function requestResetOtp(req, res) {
  try {
    const { username, email, lastName, phone, department } = req.body;

    if (!username || !email) {
      return res.status(400).json({
        success: false,
        message: "Username and email are required.",
      });
    }

    const result = await authService.requestPasswordResetOtp({
      username,
      email,
      lastName,
      phone,
      department,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error.message?.startsWith("COOLDOWN_ACTIVE")) {
      return res.status(429).json({
        success: false,
        message: error.message.replace(/^[^:]+:\s*/, ""),
      });
    }
    console.error("Request reset OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to process verification code request.",
    });
  }
}

/**
 * Forgot Password Step 2: Verify 6-digit OTP
 */
async function verifyResetOtp(req, res) {
  try {
    const { username, email, otp } = req.body;

    if (!username || !email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and 6-digit verification code are required.",
      });
    }

    const result = await authService.verifyPasswordResetOtp({
      username,
      email,
      otp,
    });

    return res.status(200).json({
      success: true,
      resetToken: result.resetToken,
      message: result.message,
      data: result,
    });
  } catch (error) {

    if (
      error.message?.startsWith("INVALID_OTP") ||
      error.message?.startsWith("INVALID_OTP_FORMAT") ||
      error.message?.startsWith("OTP_EXPIRED") ||
      error.message?.startsWith("MAX_ATTEMPTS_EXCEEDED") ||
      error.message?.startsWith("INVALID_OR_EXPIRED_CODE")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message.replace(/^[^:]+:\s*/, ""),
      });
    }

    console.error("Verify reset OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify verification code.",
    });
  }
}

/**
 * Forgot Password Step 3: Set new password
 */
async function resetPassword(req, res) {
  try {
    const { token, resetToken, newPassword, confirmPassword } = req.body;
    const effectiveToken = resetToken || token;

    if (!effectiveToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Reset token and new password are required.",
      });
    }

    const result = await authService.resetPassword(effectiveToken, newPassword, confirmPassword);
    return res.status(200).json(result);
  } catch (error) {
    if (
      error.message?.startsWith("WEAK_PASSWORD") ||
      error.message?.startsWith("PASSWORD_MISMATCH") ||
      error.message?.startsWith("INVALID_OR_EXPIRED_TOKEN")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message.replace(/^[^:]+:\s*/, ""),
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
  verifyPassword: verifyCurrentPassword,
  verifyCurrentPassword,
  changePassword,
  requestResetOtp,
  verifyResetOtp,
  resetPassword,
  forgotPassword: requestResetOtp,
};


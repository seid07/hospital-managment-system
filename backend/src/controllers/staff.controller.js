const staffService = require("../services/staff.service");
const { isValidUUID } = require("../validators");

async function getRoles(req, res) {
  try {
    const roles = await staffService.getRoles();

    return res.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    console.error("Get roles error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve roles.",
    });
  }
}

async function getStaff(req, res) {
  try {
    const staff = await staffService.getStaff(req.query);

    return res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error("Get staff error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve staff.",
    });
  }
}

async function checkEmail(req, res) {
  try {
    const { email, excludeStaffId } = req.query;
    const result = await staffService.checkEmailAvailability(email, excludeStaffId);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Check email error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to check email availability.",
    });
  }
}

async function resendCredentials(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID format.",
      });
    }

    const result = await staffService.resendStaffCredentials(
      id,
      req.user?.userId || req.user?.id
    );

    return res.status(200).json(result);
  } catch (error) {
    if (error.message === "STAFF_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }
    if (error.message?.startsWith("CANNOT_RESEND")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace(/^[^:]+:\s*/, ""),
      });
    }
    if (error.message?.startsWith("EMAIL_DELIVERY_FAILED")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace(/^[^:]+:\s*/, ""),
      });
    }
    console.error("Resend credentials error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to resend staff credentials.",
    });
  }
}

async function createStaff(req, res) {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      username,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !role ||
      !username
    ) {
      return res.status(400).json({
        success: false,
        message:
          "First name, last name, email, phone, role, and username are required.",
      });
    }

    const staff = await staffService.createStaff(req.body, req.user?.userId || req.user?.id);

    return res.status(201).json({
      success: true,
      message: "Staff member created successfully. Temporary credentials have been sent to their email.",
      data: staff,
    });
  } catch (error) {
    if (error.message?.startsWith("FIELD_REQUIRED")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace("FIELD_REQUIRED: ", ""),
      });
    }

    if (error.message?.startsWith("MULTIPLE_ROLES_NOT_ALLOWED")) {
      return res.status(400).json({
        success: false,
        message: "Each staff member can have only ONE role.",
      });
    }

    if (error.message?.startsWith("INVALID_EMAIL_FORMAT")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace("INVALID_EMAIL_FORMAT: ", ""),
      });
    }

    if (error.message?.startsWith("WEAK_PASSWORD")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace("WEAK_PASSWORD: ", ""),
      });
    }

    if (error.message === "INVALID_PHONE_FORMAT") {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Ethiopian phone number starting with 09, 07, or +251.",
      });
    }

    if (error.message === "ROLE_NOT_FOUND") {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified.",
      });
    }

    if (error.message?.startsWith("EMAIL_DELIVERY_FAILED")) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_DELIVERY_FAILED",
        message: error.message.replace("EMAIL_DELIVERY_FAILED: ", ""),
      });
    }

    if (error.message === "DUPLICATE_EMAIL" || error.message?.startsWith("DUPLICATE_EMAIL")) {
      return res.status(409).json({
        success: false,
        message: "A staff account with this email already exists.",
      });
    }

    if (error.message === "DUPLICATE_USERNAME" || error.message?.startsWith("DUPLICATE_USERNAME")) {
      return res.status(409).json({
        success: false,
        message: "A staff account with this username already exists.",
      });
    }

    if (error.message === "DUPLICATE_STAFF" || error.message?.startsWith("DUPLICATE_STAFF")) {
      return res.status(409).json({
        success: false,
        message: "A staff account with this email, phone, or username already exists.",
      });
    }

    console.error("Create staff error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create staff.",
    });
  }
}

async function updateStaff(req, res) {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID format.",
      });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      department,
      specialty,
      username,
    } = req.body;

    if (
      !firstName &&
      !lastName &&
      !email &&
      !phone &&
      !role &&
      department === undefined &&
      specialty === undefined &&
      !username
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one field is required for update.",
      });
    }

    const updated = await staffService.updateStaff(id, req.body, req.user?.userId || req.user?.id);

    return res.json({
      success: true,
      message: "Staff member updated successfully.",
      data: updated,
    });
  } catch (error) {
    if (error.message === "STAFF_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    if (error.message?.startsWith("MULTIPLE_ROLES_NOT_ALLOWED")) {
      return res.status(400).json({
        success: false,
        message: "Each staff member can have only ONE role.",
      });
    }

    if (error.message === "INVALID_EMAIL_FORMAT") {
      return res.status(400).json({
        success: false,
        message: "Invalid email format.",
      });
    }

    if (error.message === "INVALID_PHONE_FORMAT") {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Ethiopian phone number starting with 09, 07, or +251.",
      });
    }

    if (error.message === "ROLE_NOT_FOUND") {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified.",
      });
    }

    if (error.message === "DUPLICATE_EMAIL") {
      return res.status(409).json({
        success: false,
        message: "A staff member with this email already exists.",
      });
    }

    if (error.message === "DUPLICATE_USERNAME") {
      return res.status(409).json({
        success: false,
        message: "A staff account with this username already exists.",
      });
    }

    console.error("Update staff error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update staff member.",
    });
  }
}

async function deleteStaffPermanently(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID format.",
      });
    }

    const result = await staffService.deleteStaffPermanently(id, req.user?.userId || req.user?.id);
    return res.json(result);
  } catch (error) {
    if (error.message === "STAFF_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }
    console.error("Delete staff permanently error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete staff member.",
    });
  }
}

async function updateStatus(req, res) {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID format.",
      });
    }

    let { isActive, deactivationReason, deactivationStartDate, deactivationEndDate } = req.body;
    if (typeof isActive !== "boolean" && (isActive === "true" || isActive === "false")) {
      isActive = isActive === "true";
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive boolean is required.",
      });
    }


    const updated = await staffService.updateStaffStatus(
      id,
      {
        isActive,
        deactivationReason,
        deactivationStartDate,
        deactivationEndDate,
      },
      req.user?.userId || req.user?.id
    );

    return res.json({
      success: true,
      message: `Staff member ${isActive ? "activated" : "deactivated"} successfully.`,
      data: updated,
    });
  } catch (error) {
    if (error.message === "STAFF_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    console.error("Update staff status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update staff status.",
    });
  }
}

async function getDoctorScheduledAppointments(req, res) {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID format.",
      });
    }

    const appointments = await staffService.getDoctorScheduledAppointments(id, startDate, endDate);
    return res.json({
      success: true,
      data: appointments,
    });
  } catch (error) {
    console.error("Get doctor scheduled appointments error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve scheduled appointments.",
    });
  }
}

module.exports = {
  getRoles,
  getStaff,
  checkEmail,
  resendCredentials,
  createStaff,
  updateStaff,
  deleteStaffPermanently,
  updateStatus,
  getDoctorScheduledAppointments,
};

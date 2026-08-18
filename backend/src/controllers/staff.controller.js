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

async function createStaff(req, res) {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      username,
      password,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !role ||
      !username ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "First name, last name, email, phone, role, username and password are required.",
      });
    }

    const staff = await staffService.createStaff(req.body, req.user?.userId);

    return res.status(201).json({
      success: true,
      message: "Staff member created successfully.",
      data: staff,
    });
  } catch (error) {
    if (error.message === "ROLE_NOT_FOUND") {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified.",
      });
    }

    if (error.message === "DUPLICATE_STAFF") {
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

async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID format.",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false.",
      });
    }

    const staff = await staffService.updateStaffStatus(id, isActive, req.user?.userId);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    return res.json({
      success: true,
      message: `Staff member ${isActive ? "activated" : "deactivated"}.`,
      data: staff,
    });
  } catch (error) {
    console.error("Update staff status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update staff status.",
    });
  }
}

module.exports = {
  getRoles,
  getStaff,
  createStaff,
  updateStatus,
};

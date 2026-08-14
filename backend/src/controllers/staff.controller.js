const staffService = require("../services/staff.service");

async function getRoles(req, res) {
  try {
    const roles = await staffService.getRoles();

    res.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve roles.",
    });
  }
}

async function getStaff(req, res) {
  try {
    const staff = await staffService.getStaff();

    res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
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
      department,
      specialty,
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

    const staff = await staffService.createStaff(
      req.body
    );

    res.status(201).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    if (error.message === "ROLE_NOT_FOUND") {
      return res.status(400).json({
        success: false,
        message: "Invalid role.",
      });
    }

    if (error.message === "DUPLICATE_STAFF") {
      return res.status(409).json({
        success: false,
        message:
          "Username or staff information already exists.",
      });
    }

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to create staff.",
    });
  }
}

async function updateStatus(req, res) {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false.",
      });
    }

    const staff =
      await staffService.updateStaffStatus(
        req.params.id,
        isActive
      );

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
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

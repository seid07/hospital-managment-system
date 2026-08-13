async function getProtectedData(req, res) {
  return res.status(200).json({
    success: true,
    message: "You successfully accessed a protected resource.",
    user: req.user,
  });
}

async function getAdminData(req, res) {
  return res.status(200).json({
    success: true,
    message: "You successfully accessed an ADMIN-only resource.",
    user: req.user,
  });
}

module.exports = {
  getProtectedData,
  getAdminData,
};

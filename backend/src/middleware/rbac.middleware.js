// Normalize a role value so comparisons aren't broken by case differences
// or stray whitespace coming from the DB/JWT (e.g. "Admin", " ADMIN ", "admin").
function normalizeRole(role) {
  return typeof role === "string" ? role.trim().toUpperCase() : role;
}

function authorizeRoles(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const userRole = normalizeRole(req.user.role);

    // ADMIN is a superuser role: it must always be able to reach every
    // route in the system, regardless of which roles a given route lists.
    // This guarantees "admin can access all" even if a route's allowed-role
    // list is later edited and someone forgets to include ADMIN.
    if (userRole === "ADMIN") {
      return next();
    }

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
}

module.exports = {
  authorizeRoles,
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // Role check
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // Status check
    if (req.user.status !== "active") {
      return res.status(403).json({ message: "User is not active" });
    }

    next();
  };
};

module.exports = authorizeRoles;

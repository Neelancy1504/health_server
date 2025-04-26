const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      return res
        .status(403)
        .json({ message: "Access denied: insufficient permissions" });
    }
  };
};

module.exports = verifyRole;

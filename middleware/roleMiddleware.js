const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ message: "Access denied" });
    }
  };
};

const adminOnly = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Admin privileges required.",
        userRole: req.user.role,
      });
    }

    next();
  } catch (error) {
    console.error("Admin role check error:", error);
    res.status(500).json({ message: "Role verification failed" });
  }
};

// Export both functions
module.exports = { verifyRole, adminOnly };

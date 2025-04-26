const verifyRole = (allowedRoles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
  
      const userRole = req.user.role; // we'll pass role in token later
  
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: "Access denied: insufficient permissions" });
      }
  
      next();
    };
  };
  
  module.exports = verifyRole;
  
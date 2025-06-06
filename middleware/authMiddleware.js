const jwt = require("jsonwebtoken");
const { supabase } = require("../config/supabase");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("No valid authorization header found");
    return res.status(401).json({
      message: "No token provided",
      tokenExpired: false,
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token verified for user:", decoded.id, "role:", decoded.role);

    // Set the user info in the request
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);

    // Check if the error is specifically about token expiration
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Token expired. Please log in again.",
        tokenExpired: true,
        needsRefresh: true,
      });
    }

    // Handle other JWT errors
    return res.status(401).json({
      message: "Invalid token. Please log in again.",
      tokenExpired: false,
    });
  }
};

module.exports = verifyToken;

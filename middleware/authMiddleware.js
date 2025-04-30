const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Set the user info in the request
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = verifyToken;
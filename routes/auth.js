// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");

// Signup Route
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role, degree, achievements, company, department } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      degree: role === 'doctor' ? degree : undefined,
      achievements: role === 'doctor' ? achievements : undefined,
      company: role === 'pharma' ? company : undefined,
      department: role === 'admin' ? department : undefined,
    });

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/protected", verifyToken, (req, res) => {
    res.json({
      message: "You are authorized",
      userId: req.user.id,
    });
  });

// Only logged-in doctors can access this route
router.get("/doctor-only", verifyToken, verifyRole(["doctor"]), (req, res) => {
    res.json({
      message: "Welcome Doctor!",
      userId: req.user.id,
      role: req.user.role
    });
  });
  
  // Only logged-in admins can access this route
  router.get("/admin-only", verifyToken, verifyRole(["admin", "doctor", "pharma"]), (req, res) => {
    res.json({
      message: "Welcome Admin!",
      userId: req.user.id,
      role: req.user.role
    });
  });
  
  // Both doctor and pharma can access this
  router.get("/pharma-only", verifyToken, verifyRole(["pharma"]), (req, res) => {
    res.json({
      message: "Pharma Representative can access this!",
      userId: req.user.id,
      role: req.user.role
    });
  });


module.exports = router;

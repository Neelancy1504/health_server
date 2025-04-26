// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: { 
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: { 
    type: String, 
    enum: ['doctor', 'pharma', 'admin'], 
    required: true 
  },
  degree: { // Only for doctors
    type: String,
  },
  achievements: [String], // List of achievements/certifications
  company: { // For pharma reps
    type: String,
  },
  department: { // For admin
    type: String,
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

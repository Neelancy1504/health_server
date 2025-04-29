// models/User.js
const mongoose = require("mongoose");

// Update the documentSchema

const documentSchema = new mongoose.Schema({
  name: String,
  type: String,
  size: Number,
  url: String, // Cloudinary URL
  public_id: String, // Cloudinary public ID for managing assets
  resource_type: String,
  uploadDate: Date,
  verified: {
    type: Boolean,
    default: false,
  },
  verificationNotes: String,
});

const userSchema = new mongoose.Schema(
  {
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
      enum: ["doctor", "pharma", "admin"],
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    degree: {
      // Only for doctors
      type: String,
    },
    achievements: [String], // List of achievements/certifications
    documents: [documentSchema], // For doctor certifications
    company: {
      // For pharma reps
      type: String,
    },
    department: {
      // For admin
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

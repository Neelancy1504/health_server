// Create this file if it doesn't exist

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const verifyToken = require("../middleware/authMiddleware");

// Get current user's documents
router.get("/my-documents", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("documents");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user.documents || []);
  } catch (error) {
    console.error("Error fetching user documents:", error);
    res.status(500).json({ message: error.message });
  }
});

// Upload new documents
router.post("/documents", verifyToken, async (req, res) => {
  try {
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: "No valid documents provided" });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Add the new documents to the user's document array
    user.documents = [...(user.documents || []), ...documents];

    await user.save();

    res.status(201).json({
      message: "Documents uploaded successfully",
      count: documents.length,
    });
  } catch (error) {
    console.error("Error uploading documents:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");

// Admin-only middleware
const adminOnly = verifyRole(["admin"]);

// Get all doctors
router.get("/doctors", verifyToken, adminOnly, async (req, res) => {
  try {
    const doctors = await User.find({ role: "doctor" }).select("-password");

    const formattedDoctors = doctors.map((doctor) => ({
      id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      specialty: doctor.degree || "Not specified",
      verified: doctor.verified || false,
      joinedDate: doctor.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    }));

    res.json(formattedDoctors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify a doctor
router.put("/doctors/:id/verify", verifyToken, adminOnly, async (req, res) => {
  try {
    const doctor = await User.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    if (doctor.role !== "doctor") {
      return res.status(400).json({ message: "User is not a doctor" });
    }

    doctor.verified = true;
    await doctor.save();

    res.json({
      message: "Doctor verified successfully",
      doctor: {
        id: doctor._id,
        name: doctor.name,
        verified: doctor.verified,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a doctor
router.delete("/doctors/:id", verifyToken, adminOnly, async (req, res) => {
  try {
    const result = await User.findOneAndDelete({
      _id: req.params.id,
      role: "doctor",
    });

    if (!result) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.json({ message: "Doctor deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get doctor details
router.get("/doctors/:id", verifyToken, adminOnly, async (req, res) => {
  try {
    const doctor = await User.findById(req.params.id).select("-password");

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    if (doctor.role !== "doctor") {
      return res.status(400).json({ message: "User is not a doctor" });
    }

    res.json({
      id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      specialty: doctor.degree || "Not specified",
      verified: doctor.verified || false,
      achievements: doctor.achievements || [],
      joinedDate: doctor.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get doctor documents
router.get(
  "/doctors/:id/documents",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const doctor = await User.findById(req.params.id).select("documents");

      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }

      res.json(doctor.documents || []);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Verify a document
router.put(
  "/doctors/:id/documents/:docId/verify",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const { notes } = req.body;

      // Find the doctor
      const doctor = await User.findById(req.params.id);

      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }

      // Find the document
      const document = doctor.documents.id(req.params.docId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Update document verification status
      document.verified = true;
      document.verificationNotes = notes;

      // If at least one document is verified, verify the doctor
      doctor.verified = doctor.documents.some((doc) => doc.verified);

      await doctor.save();

      res.json({
        message: "Document verified successfully",
        document,
        doctorVerified: doctor.verified,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Reject a document
router.put(
  "/doctors/:id/documents/:docId/reject",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const { notes } = req.body;

      // Find the doctor
      const doctor = await User.findById(req.params.id);

      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }

      // Find the document
      const document = doctor.documents.id(req.params.docId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Update document verification status
      document.verified = false;
      document.verificationNotes = notes;

      await doctor.save();

      res.json({
        message: "Document rejected successfully",
        document,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;

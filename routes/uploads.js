const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");
const path = require("path");
const verifyToken = require("../middleware/authMiddleware");

// Debug Cloudinary configuration
console.log("Cloudinary config loaded:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? "Set" : "Not set",
  api_key: process.env.CLOUDINARY_API_KEY ? "Set" : "Not set",
  api_secret: process.env.CLOUDINARY_API_SECRET ? "Set" : "Not set",
});

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`);
  },
});

const upload = multer({ storage });

// Upload route
router.post(
  "/document",
  verifyToken,
  upload.single("document"),
  async (req, res) => {
    try {
      // Check if file exists
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("File received:", {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      });

      if (!fs.existsSync(req.file.path)) {
        return res
          .status(500)
          .json({
            message: "File saved but not found at path: " + req.file.path,
          });
      }

      try {
        // Upload to cloudinary with full path
        const fullPath = path.resolve(req.file.path);
        console.log("Uploading to Cloudinary with path:", fullPath);
        const result = await cloudinary.uploader.upload(fullPath, {
          folder: "doctor-documents",
          resource_type: "auto",
        });

        console.log("Cloudinary upload successful:", {
          public_id: result.public_id,
          url: result.secure_url,
          format: result.format,
        });

        // Remove the temp file after upload
        try {
          fs.unlinkSync(req.file.path);
          console.log("Temp file deleted successfully");
        } catch (err) {
          console.error("Error deleting temp file:", err);
        }

        // Return cloudinary details
        res.status(200).json({
          url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format,
        });
      } catch (cloudinaryError) {
        console.error("Cloudinary upload error:", cloudinaryError);
        res.status(500).json({
          message: "Cloudinary upload failed",
          error: cloudinaryError.message,
          stack: cloudinaryError.stack,
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;

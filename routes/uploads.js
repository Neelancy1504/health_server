const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const verifyToken = require("../middleware/authMiddleware");
const { supabase, supabaseAdmin } = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");

// Configure storage for temporary file uploads
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

// Upload document to Supabase Storage
router.post(
  "/document",
  verifyToken,
  upload.single("document"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("File received:", req.file);

      // Generate a unique filename for storage
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `documents/${req.user.id}/${fileName}`;

      // Upload to Supabase Storage
      const fileBuffer = fs.readFileSync(req.file.path);

      // Then in your upload route:
      const { data, error } = await supabaseAdmin.storage
        .from("medevents")
        .upload(filePath, fileBuffer, {
          contentType: req.file.mimetype,
          cacheControl: "3600",
          upsert: true,
        });

      if (error) {
        console.error("Supabase storage error:", error);
        return res
          .status(500)
          .json({
            message: "Failed to upload to storage",
            error: error.message,
          });
      }

      // Get the public URL
      const { data: publicUrlData } = supabase.storage
        .from("medevents")
        .getPublicUrl(filePath);

      const url = publicUrlData.publicUrl;

      // Remove the temp file
      fs.unlinkSync(req.file.path);

      res.status(200).json({
        url,
        storage_path: filePath,
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;

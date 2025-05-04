const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { supabase, supabaseAdmin } = require("../config/supabase"); // Add this line

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

      // Check that supabaseAdmin is properly initialized
      if (!supabaseAdmin || !supabaseAdmin.storage) {
        console.error("Supabase Admin client not properly initialized");
        return res.status(500).json({
          message: "Storage service unavailable",
          details: "Supabase storage client not initialized",
        });
      }

      // Upload file to Supabase
      const { data, error } = await supabaseAdmin.storage
        .from("medevents")
        .upload(filePath, fileBuffer, {
          contentType: req.file.mimetype,
          cacheControl: "3600",
          upsert: true,
        });

      if (error) {
        console.error("Supabase storage error:", error);
        return res.status(500).json({
          message: "Failed to upload to storage",
          error: error.message,
        });
      }

      // Get the public URL
      const { data: publicUrlData } = supabaseAdmin.storage
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

// Upload event brochure to Supabase Storage and link to event
router.post(
  "/brochure",
  verifyToken,
  upload.single("document"),
  async (req, res) => {
    try {
      // Verify the user is an admin
      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Unauthorized. Only admins can upload event brochures.",
        });
      }

      // Check if the event_id was provided in the request body
      if (!req.body.event_id) {
        return res.status(400).json({
          message: "event_id is required for brochure upload",
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No brochure uploaded" });
      }

      console.log("Brochure received:", req.file);

      // Check if it's a PDF
      if (req.file.mimetype !== "application/pdf") {
        // Clean up the temp file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message:
            "Invalid file format. Only PDF files are accepted for brochures.",
        });
      }

      // Verify the event exists
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("id")
        .eq("id", req.body.event_id)
        .single();

      if (eventError || !eventData) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({
          message: "Event not found",
        });
      }

      // Generate a unique filename for storage
      const fileName = `brochure-${uuidv4()}.pdf`;
      const filePath = `brochures/${fileName}`;

      // Upload to Supabase Storage
      const fileBuffer = fs.readFileSync(req.file.path);

      // Check that supabaseAdmin is properly initialized
      if (!supabaseAdmin || !supabaseAdmin.storage) {
        console.error("Supabase Admin client not properly initialized");
        return res.status(500).json({
          message: "Storage service unavailable",
          details: "Supabase storage client not initialized",
        });
      }

      // Upload file to Supabase
      const { data, error } = await supabaseAdmin.storage
        .from("medevents")
        .upload(filePath, fileBuffer, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: true,
        });

      if (error) {
        console.error("Supabase storage error:", error);
        return res.status(500).json({
          message: "Failed to upload brochure to storage",
          error: error.message,
        });
      }

      // Get the public URL
      const { data: publicUrlData } = supabaseAdmin.storage
        .from("medevents")
        .getPublicUrl(filePath);

      const url = publicUrlData.publicUrl;

      // Save brochure details to the brochures table
      const { data: brochureData, error: brochureError } = await supabase
        .from("brochures")
        .insert({
          name: req.file.originalname,
          url: url,
          storage_path: filePath,
          type: req.file.mimetype,
          size: req.file.size,
          event_id: req.body.event_id,
          upload_date: new Date().toISOString(),
          is_public: true,
        })
        .select()
        .single();

      if (brochureError) {
        console.error("Error saving brochure to database:", brochureError);
        return res.status(500).json({
          message: "Failed to link brochure to event",
          error: brochureError.message,
        });
      }

      // Remove the temp file
      fs.unlinkSync(req.file.path);

      res.status(200).json(brochureData);
    } catch (error) {
      console.error("Brochure upload error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Add this new route to get PDF page
router.get(
  "/brochure/:path/page/:pageNumber",
  verifyToken,
  async (req, res) => {
    try {
      const storagePath = req.params.path;
      const pageNumber = parseInt(req.params.pageNumber);

      if (isNaN(pageNumber) || pageNumber < 1) {
        return res.status(400).json({ message: "Invalid page number" });
      }

      // Get the file from storage
      const { data, error } = await supabaseAdmin.storage
        .from("medevents")
        .download(`brochures/${storagePath}`);

      if (error) {
        console.error("Error downloading PDF:", error);
        return res.status(404).json({ message: "PDF not found" });
      }

      // Set appropriate headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="page-${pageNumber}.pdf"`
      );

      // Return the file buffer
      // Note: In a production environment, you'd want to use a PDF library
      // to extract just the specific page instead of sending the entire PDF
      res.send(data);
    } catch (error) {
      console.error("Error serving PDF page:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Add PDF metadata endpoint (page count)
router.get("/brochure/:path/metadata", async (req, res) => {
  try {
    const storagePath = req.params.path;

    // Get the file from storage
    const { data, error } = await supabaseAdmin.storage
      .from("medevents")
      .download(`brochures/${storagePath}`);

    if (error) {
      console.error("Error downloading PDF:", error);
      return res.status(404).json({ message: "PDF not found" });
    }

    // In a real implementation, you'd use a PDF library like pdf-lib or pdf.js
    // to extract metadata. For this example, we'll just return a response:
    res.json({
      success: true,
      metadata: {
        url: supabaseAdmin.storage
          .from("medevents")
          .getPublicUrl(`brochures/${storagePath}`).data.publicUrl,
        // In a real implementation, you'd determine this from the PDF
        pageCount: 10,
        contentType: "application/pdf",
        fileSize: data.length,
      },
    });
  } catch (error) {
    console.error("Error getting PDF metadata:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add a direct PDF serving route with range support
router.get("/pdf/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = `brochures/${filename}`;

    // Get file metadata first
    const { data: metadata, error: metadataError } = await supabaseAdmin.storage
      .from("medevents")
      .getPublicUrl(filePath);

    if (metadataError) {
      console.error("Error getting PDF metadata:", metadataError);
      return res.status(404).json({ message: "PDF not found" });
    }

    // Redirect to the public URL with proper cache headers
    const publicUrl = metadata.publicUrl;
    res.redirect(publicUrl);
  } catch (error) {
    console.error("Error serving PDF:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

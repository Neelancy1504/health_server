const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { supabase, supabaseAdmin } = require("../config/supabase"); // Add this line

// Configure storage for temporary file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (process.env.NODE_ENV === "production") {
      // In production (Vercel), use memory storage
      cb(null, "/tmp"); // Vercel allows writing to /tmp
    } else {
      // In development, use disk storage
      const uploadDir = path.join(__dirname, "../uploads");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    }
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

// Course video upload route - More robust error handling
router.post(
  "/course-video",
  verifyToken,
  verifyRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      console.log(
        "Video upload request received from user:",
        req.user.id,
        req.user.role
      );

      if (!req.files || !req.files.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.files.file;

      // Log detailed information about the received file
      console.log("Video file received:", {
        name: file.name,
        size: file.size,
        mimetype: file.mimetype,
        md5: file.md5,
        tempFilePath: file.tempFilePath || "none",
      });

      const userId = req.user.id;
      const fileExtension = path.extname(file.name);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `courses/videos/${userId}/${fileName}`;

      // Upload to Supabase Storage using file path instead of buffer
      let fileData;
      if (file.tempFilePath) {
        // If express-fileupload stored it as a temp file
        fileData = fs.readFileSync(file.tempFilePath);
      } else {
        // If express-fileupload has it in memory
        fileData = file.data;
      }

      // Check data size
      console.log("File data size:", fileData?.length || 0);
      if (!fileData || fileData.length === 0) {
        return res.status(400).json({ message: "File data is empty" });
      }

      // Upload to Supabase
      const { data, error } = await supabaseAdmin.storage
        .from("medevents")
        .upload(filePath, fileData, {
          contentType: file.mimetype || "video/mp4",
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

      // Clean up temp file if it exists
      if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
        fs.unlinkSync(file.tempFilePath);
      }

      res.status(200).json({
        success: true,
        url,
        fileName: file.name,
        fileType: file.mimetype,
        size: file.size,
      });
    } catch (error) {
      console.error("Course video upload error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Course thumbnail upload route
router.post(
  "/course-thumbnail",
  verifyToken,
  verifyRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      console.log("Thumbnail upload request received", {
        userId: req.user.id,
        role: req.user.role,
        hasFiles: !!req.files,
        contentType: req.headers["content-type"],
      });

      // Make sure files were uploaded
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ message: "No files were uploaded" });
      }

      // Get the file with key 'file'
      const file = req.files.file;
      if (!file) {
        return res
          .status(400)
          .json({ message: "File must be provided with the key 'file'" });
      }

      // Log detailed file information for debugging
      console.log("Thumbnail file received:", {
        name: file.name,
        size: file.size,
        mimetype: file.mimetype,
        tempFilePath: file.tempFilePath || "N/A",
        md5: file.md5,
      });

      const userId = req.user.id;
      const fileExtension = path.extname(file.name) || ".jpg";
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `courses/thumbnails/${userId}/${fileName}`;

      // Create parent directory structure if it doesn't exist
      const dirPath = path.dirname(filePath);

      // Get file data from tempFilePath if available, otherwise use data property
      let fileData;
      if (file.tempFilePath) {
        fileData = fs.readFileSync(file.tempFilePath);
      } else {
        fileData = file.data;
      }

      // Check file data is present
      if (!fileData || fileData.length === 0) {
        return res.status(400).json({ message: "File data is empty" });
      }

      // Upload to Supabase
      const { data, error } = await supabaseAdmin.storage
        .from("medevents")
        .upload(filePath, fileData, {
          contentType: file.mimetype || "image/jpeg",
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

      // Get public URL
      const { data: publicUrlData } = supabaseAdmin.storage
        .from("medevents")
        .getPublicUrl(filePath);

      // Clean up temp file if it exists
      if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
        fs.unlinkSync(file.tempFilePath);
      }

      res.status(200).json({
        success: true,
        url: publicUrlData.publicUrl,
        fileName: file.name,
        fileType: file.mimetype,
        size: file.size,
      });
    } catch (error) {
      console.error("Course thumbnail upload error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Profile image upload route
router.post("/profile-image", verifyToken, async (req, res) => {
  try {
    // Make sure files were uploaded
    if (!req.files || !req.files.profile_image) {
      return res.status(400).json({ message: "No profile image uploaded" });
    }

    const file = req.files.profile_image;
    const userId = req.user.id;
    
    // First, get the current user to find existing avatar_url
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("avatar_url")
      .eq("id", userId)
      .single();
      
    if (!userError && userData?.avatar_url) {
      // Extract storage path from the URL
      try {
        const url = new URL(userData.avatar_url);
        const pathParts = url.pathname.split('/');
        const storagePath = pathParts.slice(pathParts.indexOf('medevents') + 1).join('/');
        
        if (storagePath) {
          // Delete the old image from storage
          console.log(`Deleting old profile image: ${storagePath}`);
          await supabaseAdmin.storage
            .from("medevents")
            .remove([storagePath]);
        }
      } catch (deleteError) {
        console.error("Error deleting old profile image:", deleteError);
        // Continue with upload even if delete fails
      }
    }
    
    // Generate unique filename
    const fileExtension = path.extname(file.name) || ".jpg";
    const fileName = `profile-${Date.now()}${fileExtension}`;
    const filePath = `profiles/${userId}/${fileName}`;

    // Get file data
    let fileData;
    if (file.tempFilePath) {
      fileData = fs.readFileSync(file.tempFilePath);
    } else {
      fileData = file.data;
    }

    // Upload to storage
    const { data, error } = await supabaseAdmin.storage
      .from("medevents")
      .upload(filePath, fileData, {
        contentType: file.mimetype || "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      return res.status(500).json({
        message: "Failed to upload profile image",
        error: error.message,
      });
    }

    // Get the public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("medevents")
      .getPublicUrl(filePath);

    const avatarUrl = publicUrlData.publicUrl;

    // Update user record with avatar URL
    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId);

    if (updateError) {
      return res.status(500).json({
        message: "Failed to update user profile",
        error: updateError.message,
      });
    }

    // Return success response
    res.status(200).json({
      success: true,
      avatar_url: avatarUrl,
    });
  } catch (error) {
    console.error("Profile image upload error:", error);
    res.status(500).json({ message: error.message });
  }
});


// Chat document upload endpoint - using express-fileupload
router.post("/chat-document", verifyToken, async (req, res) => {
  try {
    console.log("Chat file upload request received", {
      userId: req.user.id,
      hasFiles: !!req.files,
      contentType: req.headers["content-type"],
    });

    // Make sure files were uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files were uploaded" });
    }

    // Get the file with key 'document'
    const file = req.files.document;
    if (!file) {
      return res.status(400).json({
        message: "File must be provided with the key 'document'",
      });
    }

    // Log detailed file information for debugging
    console.log("Chat file received:", {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      tempFilePath: file.tempFilePath || "N/A",
      md5: file.md5,
    });

    const userId = req.user.id;
    const fileExtension =
      path.extname(file.name) || `.${file.mimetype.split("/")[1]}`;
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = `chat/${userId}/${fileName}`;

    // Get file data from tempFilePath if available, otherwise use data property
    let fileData;
    if (file.tempFilePath) {
      fileData = fs.readFileSync(file.tempFilePath);
    } else {
      fileData = file.data;
    }

    // Check file data is present
    if (!fileData || fileData.length === 0) {
      return res.status(400).json({ message: "File data is empty" });
    }

    // Upload to Supabase
    const { data, error } = await supabaseAdmin.storage
      .from("medevents")
      .upload(filePath, fileData, {
        contentType: file.mimetype || "application/octet-stream",
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

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("medevents")
      .getPublicUrl(filePath);

    // Clean up temp file if it exists
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fs.unlinkSync(file.tempFilePath);
    }

    res.status(200).json({
      success: true,
      url: publicUrlData.publicUrl,
      fileName: file.name,
      fileType: file.mimetype,
      size: file.size,
      storage_path: filePath,
    });
  } catch (error) {
    console.error("Chat file upload error:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

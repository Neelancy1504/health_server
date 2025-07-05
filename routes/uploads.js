const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { verifyRole } = require("../middleware/roleMiddleware");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { supabase, supabaseAdmin } = require("../config/supabase");

// FIXED: Document upload endpoint with better error handling
router.post("/document", verifyToken, async (req, res) => {
  try {
    console.log("Document upload request received", {
      hasFiles: !!req.files,
      contentType: req.headers["content-type"],
      fileCount: req.files ? Object.keys(req.files).length : 0,
    });

    // Make sure files were uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      console.log("❌ No files in request");
      return res.status(400).json({ 
        success: false, 
        message: "No files were uploaded" 
      });
    }

    // Get the file with key 'document'
    const file = req.files.document;
    if (!file) {
      console.log("❌ No 'document' key found in files");
      console.log("Available keys:", Object.keys(req.files));
      return res.status(400).json({
        success: false,
        message: "File must be provided with the key 'document'",
      });
    }

    // Log detailed file information for debugging
    console.log("✅ Document file received:", {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      tempFilePath: file.tempFilePath || "N/A",
      md5: file.md5,
      truncated: file.truncated || false, // Check if file was truncated
    });

    // Check if file was truncated (incomplete upload)
    if (file.truncated) {
      console.log("❌ File was truncated during upload");
      return res.status(400).json({
        success: false,
        message: "File upload was incomplete. Please try again.",
      });
    }

    // Validate file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "File size exceeds 50MB limit",
      });
    }

    // Validate minimum file size (avoid empty files)
    if (file.size < 100) {
      return res.status(400).json({
        success: false,
        message: "File is too small or corrupted",
      });
    }

    // Use userId from authenticated user
    const userId = req.user.id;

    const fileExtension = path.extname(file.name) || `.${file.mimetype.split("/")[1]}`;
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}${fileExtension}`;
    const filePath = `documents/${userId}/${fileName}`;

    // Get file data with improved error handling
    let fileData;
    try {
      if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
        console.log("📁 Reading from temp file:", file.tempFilePath);
        fileData = fs.readFileSync(file.tempFilePath);
        console.log("✅ Read", fileData.length, "bytes from temp file");
      } else if (file.data) {
        console.log("📦 Using data buffer, size:", file.data.length);
        fileData = file.data;
      } else {
        console.log("❌ No file data available");
        return res.status(400).json({ 
          success: false, 
          message: "File data not found" 
        });
      }
    } catch (readError) {
      console.error("❌ Error reading file data:", readError);
      return res.status(500).json({
        success: false,
        message: "Failed to read uploaded file",
        error: readError.message,
      });
    }

    // Check file data is present and matches expected size
    if (!fileData || fileData.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "File data is empty" 
      });
    }

    // Verify file size matches
    if (fileData.length !== file.size) {
      console.log(`⚠️ Size mismatch: expected ${file.size}, got ${fileData.length}`);
      // Don't fail for small differences, but log it
    }

    console.log("🚀 Uploading to Supabase storage...");

    // Upload to Supabase with retry logic
    let uploadError;
    let uploadData;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 Upload attempt ${attempt}/${maxRetries}`);
        
        const result = await supabaseAdmin.storage
          .from("medevents")
          .upload(filePath, fileData, {
            contentType: file.mimetype || "application/octet-stream",
            cacheControl: "3600",
            upsert: true,
          });

        if (result.error) {
          uploadError = result.error;
          console.log(`❌ Attempt ${attempt} failed:`, uploadError.message);
          
          // If it's the last attempt, break
          if (attempt === maxRetries) break;
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        uploadData = result.data;
        uploadError = null;
        console.log("✅ Upload successful on attempt", attempt);
        break;

      } catch (error) {
        uploadError = error;
        console.log(`❌ Attempt ${attempt} exception:`, error.message);
        
        if (attempt === maxRetries) break;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (uploadError) {
      console.error("❌ All upload attempts failed:", uploadError);
      return res.status(500).json({
        success: false,
        message: "Failed to upload to storage after multiple attempts",
        error: uploadError.message,
      });
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("medevents")
      .getPublicUrl(filePath);

    console.log("✅ File uploaded successfully:", {
      originalName: file.name,
      storagePath: filePath,
      publicUrl: publicUrlData.publicUrl,
      fileSize: fileData.length,
    });

    // Clean up temp file if it exists
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      try {
        fs.unlinkSync(file.tempFilePath);
        console.log("🧹 Temp file cleaned up");
      } catch (cleanupError) {
        console.error("⚠️ Error cleaning up temp file:", cleanupError);
        // Don't fail the request for cleanup errors
      }
    }

    res.status(200).json({
      success: true,
      message: "Document uploaded successfully",
      url: publicUrlData.publicUrl,
      fileName: file.name,
      fileType: file.mimetype,
      size: file.size,
      storage_path: filePath,
    });

  } catch (error) {
    console.error("❌ Document upload error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error during upload", 
      error: error.message 
    });
  }
});

// FIXED: Temp document upload endpoint (for signup process)
router.post("/temp-document", async (req, res) => {
  try {
    console.log("Temp document upload request received", {
      hasFiles: !!req.files,
      contentType: req.headers["content-type"],
    });

    // Make sure files were uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No files were uploaded" 
      });
    }

    // Get the file with key 'document'
    const file = req.files.document;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "File must be provided with the key 'document'",
      });
    }

    // Log file info
    console.log("Temp document file received:", {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
    });

    // Validate file size
    if (file.size > 50 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "File size exceeds 50MB limit",
      });
    }

    const fileExtension = path.extname(file.name) || `.${file.mimetype.split("/")[1]}`;
    const fileName = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}${fileExtension}`;
    const filePath = `temp-documents/${fileName}`;

    // Get file data
    let fileData;
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fileData = fs.readFileSync(file.tempFilePath);
    } else if (file.data) {
      fileData = file.data;
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "File data not found" 
      });
    }

    // Upload to Supabase
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("medevents")
      .upload(filePath, fileData, {
        contentType: file.mimetype || "application/octet-stream",
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase storage error:", uploadError);
      return res.status(500).json({
        success: false,
        message: "Failed to upload to storage",
        error: uploadError.message,
      });
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("medevents")
      .getPublicUrl(filePath);

    // Clean up temp file
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      try {
        fs.unlinkSync(file.tempFilePath);
      } catch (cleanupError) {
        console.error("Error cleaning up temp file:", cleanupError);
      }
    }

    res.status(200).json({
      success: true,
      message: "Temp document uploaded successfully",
      url: publicUrlData.publicUrl,
      fileName: file.name,
      fileType: file.mimetype,
      size: file.size,
      storage_path: filePath,
    });

  } catch (error) {
    console.error("Temp document upload error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error during upload", 
      error: error.message 
    });
  }
});

// FIXED: Upload event brochure - Remove multer middleware
router.post("/brochure", verifyToken, async (req, res) => {
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

    // Check if file was uploaded using express-fileupload
    if (!req.files || !req.files.document) {
      return res.status(400).json({ message: "No brochure uploaded" });
    }

    const file = req.files.document;

    console.log("Brochure received:", {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
    });

    // Check if it's a PDF
    if (file.mimetype !== "application/pdf") {
      return res.status(400).json({
        message: "Invalid file format. Only PDF files are accepted for brochures.",
      });
    }

    // Verify the event exists
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("id")
      .eq("id", req.body.event_id)
      .single();

    if (eventError || !eventData) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    // Generate a unique filename for storage
    const fileName = `brochure-${uuidv4()}.pdf`;
    const filePath = `brochures/${fileName}`;

    // Get file data
    let fileData;
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fileData = fs.readFileSync(file.tempFilePath);
    } else if (file.data) {
      fileData = file.data;
    } else {
      return res.status(400).json({ message: "File data not found" });
    }

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
      .upload(filePath, fileData, {
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
        name: file.name,
        url: url,
        storage_path: filePath,
        type: file.mimetype,
        size: file.size,
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

    // Clean up temp file
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fs.unlinkSync(file.tempFilePath);
    }

    res.status(200).json(brochureData);
  } catch (error) {
    console.error("Brochure upload error:", error);
    res.status(500).json({ message: error.message });
  }
});

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
    const filePath = `brochers/${filename}`;

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
        const pathParts = url.pathname.split("/");
        const storagePath = pathParts
          .slice(pathParts.indexOf("medevents") + 1)
          .join("/");

        if (storagePath) {
          // Delete the old image from storage
          console.log(`Deleting old profile image: ${storagePath}`);
          await supabaseAdmin.storage.from("medevents").remove([storagePath]);
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

const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { supabase } = require("../config/supabase");

// Get current user's documents
router.get("/my-documents", verifyToken, async (req, res) => {
  try {
    const { data: documents, error } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", req.user.id);

    if (error) {
      throw new Error(error.message);
    }

    res.json(documents || []);
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

    // Map the documents to include user_id
    const documentsToInsert = documents.map((doc) => ({
      ...doc,
      user_id: req.user.id,
    }));

    const { data, error } = await supabase
      .from("documents")
      .insert(documentsToInsert);

    if (error) {
      throw new Error(error.message);
    }

    res.status(201).json({
      message: "Documents uploaded successfully",
      count: documents.length,
    });
  } catch (error) {
    console.error("Error uploading documents:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get the current user's profile
router.get("/profile-image", verifyToken, async (req, res) => {
  // This route will forward the request to the correct endpoint
  const userId = req.user.id;

  try {
    // Get current user from database
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add a route that forwards the profile image upload
router.post("/profile-image", verifyToken, async (req, res) => {
  // Forward to the correct endpoint
  try {
    // Forward the request to the uploads router
    // You would need to implement proper forwarding here
    // This is a simplified example
    res.redirect(307, "/api/uploads/profile-image");
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add a new endpoint for user search
router.get("/search-users", verifyToken, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 3) {
      return res.json([]);
    }

    // Update select to include avatar_url
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, phone, role, degree, company, avatar_url") // Include avatar_url
      .or(`email.ilike.%${query}%,phone.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(10);

    if (error) {
      console.error("Error searching users:", error);
      throw error;
    }

    res.json(data || []);
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({ message: "Failed to search users" });
  }
});

// Remove the extra "/api" prefix since it's already added in index.js
router.post("/fcm-token", verifyToken, async (req, res) => {
  try {
    console.log("🔔 FCM token registration request received");
    console.log("👤 User ID:", req.user.id);
    console.log("📱 Request body:", req.body);

    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      console.log("❌ No token provided in request");
      return res.status(400).json({ error: "Token is required" });
    }

    console.log("💾 Storing token in database...");
    console.log("👤 User ID:", userId);
    console.log(
      "🎯 FCM Token (first 30 chars):",
      token.substring(0, 30) + "..."
    );

    // Store in database - use your Supabase instance
    const { data, error } = await supabase.from("user_fcm_tokens").upsert(
      [
        {
          user_id: userId,
          fcm_token: token,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      {
        onConflict: "user_id,fcm_token",
      }
    );

    if (error) {
      console.error("❌ Database error:", error);
      throw error;
    }

    console.log("✅ FCM token stored successfully:", data);
    res
      .status(200)
      .json({ message: "FCM token registered successfully", data });
  } catch (error) {
    console.error("❌ Error registering FCM token:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add this route for token removal
router.delete("/fcm-token", verifyToken, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Remove the token from database
    const { error } = await supabase
      .from("user_fcm_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("fcm_token", token);

    if (error) throw error;

    res.status(200).json({ message: "FCM token removed successfully" });
  } catch (error) {
    console.error("Error removing FCM token:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

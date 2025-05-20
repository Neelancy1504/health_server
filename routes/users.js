const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { supabase } = require('../config/supabase');

// Get current user's documents
router.get('/my-documents', verifyToken, async (req, res) => {
  try {
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', req.user.id);
      
    if (error) {
      throw new Error(error.message);
    }
    
    res.json(documents || []);
  } catch (error) {
    console.error('Error fetching user documents:', error);
    res.status(500).json({ message: error.message });
  }
});

// Upload new documents
router.post('/documents', verifyToken, async (req, res) => {
  try {
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: 'No valid documents provided' });
    }

    // Map the documents to include user_id
    const documentsToInsert = documents.map(doc => ({
      ...doc,
      user_id: req.user.id
    }));
    
    const { data, error } = await supabase
      .from('documents')
      .insert(documentsToInsert);
    
    if (error) {
      throw new Error(error.message);
    }
    
    res.status(201).json({ 
      message: 'Documents uploaded successfully',
      count: documents.length
    });
  } catch (error) {
    console.error('Error uploading documents:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add this to your users.js routes file

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

module.exports = router;
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

module.exports = router;
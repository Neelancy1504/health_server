const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyRole = require('../middleware/roleMiddleware');
const { supabase } = require('../config/supabase');
const { validate: isUuid } = require('uuid'); // Import UUID validation library

// Admin-only middleware
const adminOnly = verifyRole(['admin']);

// Get all doctors
router.get('/doctors', verifyToken, adminOnly, async (req, res) => {
  try {
    const { data: doctors, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'doctor');
      
    if (error) {
      throw new Error(error.message);
    }

    // Format the response
    const formattedDoctors = doctors.map(doctor => ({
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      specialty: doctor.degree || 'Not specified',
      verified: doctor.verified || false,
      joinedDate: new Date(doctor.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    }));

    res.json(formattedDoctors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify a doctor
router.put('/doctors/:id/verify', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Begin a transaction to update both user and documents
    // 1. Update the doctor's verification status
    const { data, error } = await supabase
      .from('users')
      .update({ 
        verified: true,
        verification_notes: notes || "Verified by admin",
        // verified_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('role', 'doctor')
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // 2. Update all documents for this doctor to be verified as well
    const { data: documentsData, error: documentsError } = await supabase
      .from('documents')
      .update({ 
        verified: true,
        verification_notes: notes || "Verified automatically when doctor was verified",
        verified_at: new Date().toISOString()
      })
      .eq('user_id', id)
      .select();

    if (documentsError) {
      console.error("Error updating documents:", documentsError);
      // Don't throw error here, we still verified the doctor
    }

    const docsUpdated = documentsData ? documentsData.length : 0;
    res.json({ 
      message: `Doctor verified successfully. ${docsUpdated} document(s) were also verified.` 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get doctor documents
router.get('/doctors/:id/documents', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', id);

    if (error) {
      throw new Error(error.message);
    }

    res.json(documents || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify a document
router.put('/doctors/:id/documents/:docId/verify', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { notes } = req.body;

    // Update the document verification status
    const { data, error } = await supabase
      .from('documents')
      .update({ 
        verified: true,
        verification_notes: notes 
      })
      .eq('id', docId)
      .eq('user_id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({ message: 'Document verified successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reject a document
router.put('/doctors/:id/documents/:docId/reject', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { notes } = req.body;

    // Update the document verification status
    const { data, error } = await supabase
      .from('documents')
      .update({ 
        verified: false,
        verification_notes: notes 
      })
      .eq('id', docId)
      .eq('user_id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({ message: 'Document rejected successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Approve event (admin only)
router.put('/events/:id/approve', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    console.log("Approving event with ID:", id); // Debug log
    
    // Validate the ID
    if (!id || id === 'undefined' || !isUuid(id)) {
      console.error("Invalid event ID:", id);
      return res.status(400).json({ message: 'Invalid event ID' });
    }

    // Update the event status
    const { data, error } = await supabase
      .from('events')
      .update({
        status: 'approved',
        verification_notes: notes || '',
        verified_by: req.user.id,
        verified_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({ message: 'Event approved successfully', event: data });
  } catch (error) {
    console.error("Error in approve event route:", error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/doctors/pending', verifyToken, adminOnly, async (req, res) => {
  try {
    const { data: doctors, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'doctor')
      .eq('verified', false);
      
    if (error) {
      throw new Error(error.message);
    }

    // Format the response
    const formattedDoctors = doctors.map(doctor => ({
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      specialty: doctor.degree || 'Not specified',
      verified: doctor.verified || false,
      joinedDate: doctor.created_at,
    }));

    res.json(formattedDoctors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reject a doctor
router.put('/doctors/:id/reject', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({ message: 'Rejection notes are required' });
    }

    // Update the doctor's verification status
    const { data, error } = await supabase
      .from('users')
      .update({ 
        verification_status: 'rejected',
        verification_notes: notes 
      })
      .eq('id', id)
      .eq('role', 'doctor')
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    res.json({ message: 'Doctor verification rejected' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
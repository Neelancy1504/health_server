const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyRole = require('../middleware/roleMiddleware');
const { supabase } = require('../config/supabase');
const { validate: isUuid } = require('uuid'); // Import UUID validation library

// Admin-only middleware
const adminOnly = verifyRole(['admin']);
// In your health_server/routes/admin.js file:

// Get all pharma representatives
router.get('/pharma', verifyToken, adminOnly, async (req, res) => {
  try {
    const { data: pharmaReps, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'pharma');
      
    if (error) {
      throw new Error(error.message);
    }

    // Format the response
    const formattedPharmaReps = pharmaReps.map(pharma => ({
      id: pharma.id,
      name: pharma.name,
      email: pharma.email,
      company: pharma.company || 'Not specified',
      verified: pharma.verified || false,
      joinedDate: new Date(pharma.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    }));

    res.json(formattedPharmaReps);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get pharma representative by ID
router.get('/pharma/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!id || id === 'undefined') {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    
    // Query for pharma representative data
    const { data: pharma, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .eq('role', 'pharma')
      .single();
      
    if (error) {
      console.error("Error fetching pharma:", error);
      return res.status(500).json({ message: error.message });
    }
    
    if (!pharma) {
      return res.status(404).json({ message: 'Pharmaceutical representative not found' });
    }
    
    // Get pharma documents if any
    const { data: documents, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', id);
      
    if (documentsError) {
      console.error("Error fetching documents:", documentsError);
      // Continue with the pharma data even if documents fail
    }
    
    // Format the response
    const formattedPharma = {
      id: pharma.id,
      name: pharma.name,
      email: pharma.email,
      company: pharma.company || 'Not specified',
      position: pharma.position,
      verified: pharma.verified || false,
      joinedDate: new Date(pharma.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      documents: documents || [],
    };
    
    res.json(formattedPharma);
  } catch (error) {
    console.error("Error fetching pharma details:", error);
    res.status(500).json({ message: error.message });
  }
});

// Verify a pharma representative
router.put('/pharma/:id/verify', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Update the pharma representative's verification status
    const { data, error } = await supabase
      .from('users')
      .update({ 
        verified: true,
        verification_notes: notes || "Verified by admin",
      })
      .eq('id', id)
      .eq('role', 'pharma')
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: 'Pharmaceutical representative not found' });
    }

    // Update all documents for this pharma rep to be verified as well
    const { error: documentsError } = await supabase
      .from('documents')
      .update({ 
        verified: true,
        verification_notes: notes || "Verified automatically when representative was verified",
        verified_at: new Date().toISOString()
      })
      .eq('user_id', id);
      
    if (documentsError) {
      console.error("Error updating documents:", documentsError);
      // Don't throw error here, we still verified the user
    }

    res.json({ message: 'Pharmaceutical representative verified successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a pharma representative
router.delete('/pharma/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the pharma representative
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id)
      .eq('role', 'pharma');

    if (error) {
      throw new Error(error.message);
    }

    res.json({ message: 'Pharmaceutical representative deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

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

// Get admin dashboard statistics
router.get('/dashboard', verifyToken, adminOnly, async (req, res) => {
  try {
    // Get count of doctors
    const { count: totalDoctors, error: doctorsError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'doctor');

    if (doctorsError) {
      console.error("Error counting doctors:", doctorsError);
      return res.status(500).json({ message: doctorsError.message });
    }

    // Get count of pharma reps
    const { count: totalPharma, error: pharmaError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'pharma');

    if (pharmaError) {
      console.error("Error counting pharma reps:", pharmaError);
      return res.status(500).json({ message: pharmaError.message });
    }

    // Get count of pending events
    const { count: pendingEvents, error: eventsError } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (eventsError) {
      console.error("Error counting pending events:", eventsError);
      return res.status(500).json({ message: eventsError.message });
    }

    // Return all stats
    res.json({
      totalDoctors,
      totalPharma,
      pendingEvents
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
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

// Add this after the '/doctors' route but before other routes

// Get doctor by ID
router.get('/doctors/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, get the doctor's basic information
    const { data: doctor, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .eq('role', 'doctor')
      .single();
      
    if (error) {
      throw new Error(error.message);
    }
    
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    // Then, get the doctor's documents
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', id);
      
    if (docsError) {
      console.error("Error fetching documents:", docsError);
      // Continue even with document error
    }
    
    // Format the response
    const formattedDoctor = {
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
      // Add other fields you want to include
      documents: documents || [],
    };
    
    res.json(formattedDoctor);
  } catch (error) {
    console.error("Error fetching doctor details:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
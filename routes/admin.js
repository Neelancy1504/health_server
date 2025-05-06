const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");
const { supabase } = require("../config/supabase");
const { validate: isUuid } = require("uuid"); // Import UUID validation library

// Admin-only middleware
const adminOnly = verifyRole(["admin"]);
// In your health_server/routes/admin.js file:

// Get all pharma representatives
router.get("/pharma", verifyToken, adminOnly, async (req, res) => {
  try {
    const { data: pharmaReps, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", "pharma");

    if (error) {
      throw new Error(error.message);
    }

    // Format the response
    const formattedPharmaReps = pharmaReps.map((pharma) => ({
      id: pharma.id,
      name: pharma.name,
      email: pharma.email,
      company: pharma.company || "Not specified",
      verified: pharma.verified || false,
      joinedDate: new Date(pharma.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    }));

    res.json(formattedPharmaReps);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get pharma representative by ID
router.get("/pharma/:id", verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || id === "undefined") {
      return res.status(400).json({ message: "Invalid ID" });
    }

    // Query for pharma representative data
    const { data: pharma, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .eq("role", "pharma")
      .single();

    if (error) {
      console.error("Error fetching pharma:", error);
      return res.status(500).json({ message: error.message });
    }

    if (!pharma) {
      return res
        .status(404)
        .json({ message: "Pharmaceutical representative not found" });
    }

    // Get pharma documents if any
    const { data: documents, error: documentsError } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", id);

    if (documentsError) {
      console.error("Error fetching documents:", documentsError);
      // Continue with the pharma data even if documents fail
    }

    // Format the response
    const formattedPharma = {
      id: pharma.id,
      name: pharma.name,
      email: pharma.email,
      company: pharma.company || "Not specified",
      position: pharma.position,
      verified: pharma.verified || false,
      joinedDate: new Date(pharma.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
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
router.put("/pharma/:id/verify", verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Update the pharma representative's verification status
    const { data, error } = await supabase
      .from("users")
      .update({
        verified: true,
        verification_notes: notes || "Verified by admin",
      })
      .eq("id", id)
      .eq("role", "pharma")
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res
        .status(404)
        .json({ message: "Pharmaceutical representative not found" });
    }

    // Update all documents for this pharma rep to be verified as well
    const { error: documentsError } = await supabase
      .from("documents")
      .update({
        verified: true,
        verification_notes:
          notes || "Verified automatically when representative was verified",
        verified_at: new Date().toISOString(),
      })
      .eq("user_id", id);

    if (documentsError) {
      console.error("Error updating documents:", documentsError);
      // Don't throw error here, we still verified the user
    }

    res.json({
      message: "Pharmaceutical representative verified successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a pharma representative
router.delete("/pharma/:id", verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the pharma representative
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id)
      .eq("role", "pharma");

    if (error) {
      throw new Error(error.message);
    }

    res.json({ message: "Pharmaceutical representative deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all doctors
router.get("/doctors", verifyToken, adminOnly, async (req, res) => {
  try {
    const { data: doctors, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", "doctor");

    if (error) {
      throw new Error(error.message);
    }

    // Format the response
    const formattedDoctors = doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      specialty: doctor.degree || "Not specified",
      verified: doctor.verified || false,
      joinedDate: new Date(doctor.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    }));

    res.json(formattedDoctors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get admin dashboard statistics
router.get("/dashboard", verifyToken, adminOnly, async (req, res) => {
  try {
    // Get count of doctors
    const { count: totalDoctors, error: doctorsError } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "doctor");

    if (doctorsError) {
      console.error("Error counting doctors:", doctorsError);
      return res.status(500).json({ message: doctorsError.message });
    }

    // Get count of pharma reps
    const { count: totalPharma, error: pharmaError } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "pharma");

    if (pharmaError) {
      console.error("Error counting pharma reps:", pharmaError);
      return res.status(500).json({ message: pharmaError.message });
    }

    // Get count of pending events
    const { count: pendingEvents, error: eventsError } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if (eventsError) {
      console.error("Error counting pending events:", eventsError);
      return res.status(500).json({ message: eventsError.message });
    }

    // Return all stats
    res.json({
      totalDoctors,
      totalPharma,
      pendingEvents,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: error.message });
  }
});

// Verify a doctor
router.put("/doctors/:id/verify", verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Begin a transaction to update both user and documents
    // 1. Update the doctor's verification status
    const { data, error } = await supabase
      .from("users")
      .update({
        verified: true,
        verification_notes: notes || "Verified by admin",
        // verified_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("role", "doctor")
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // 2. Update all documents for this doctor to be verified as well
    const { data: documentsData, error: documentsError } = await supabase
      .from("documents")
      .update({
        verified: true,
        verification_notes:
          notes || "Verified automatically when doctor was verified",
        verified_at: new Date().toISOString(),
      })
      .eq("user_id", id)
      .select();

    if (documentsError) {
      console.error("Error updating documents:", documentsError);
      // Don't throw error here, we still verified the doctor
    }

    const docsUpdated = documentsData ? documentsData.length : 0;
    res.json({
      message: `Doctor verified successfully. ${docsUpdated} document(s) were also verified.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get doctor documents
router.get(
  "/doctors/:id/documents",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data: documents, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", id);

      if (error) {
        throw new Error(error.message);
      }

      res.json(documents || []);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Verify a document
router.put(
  "/doctors/:id/documents/:docId/verify",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const { id, docId } = req.params;
      const { notes } = req.body;

      // Update the document verification status
      const { data, error } = await supabase
        .from("documents")
        .update({
          verified: true,
          verification_notes: notes,
        })
        .eq("id", docId)
        .eq("user_id", id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json({ message: "Document verified successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Reject a document
router.put(
  "/doctors/:id/documents/:docId/reject",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const { id, docId } = req.params;
      const { notes } = req.body;

      // Update the document verification status
      const { data, error } = await supabase
        .from("documents")
        .update({
          verified: false,
          verification_notes: notes,
        })
        .eq("id", docId)
        .eq("user_id", id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json({ message: "Document rejected successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Approve event (admin only)
router.put("/events/:id/approve", verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    console.log("Approving event with ID:", id); // Debug log

    // Validate the ID
    if (!id || id === "undefined" || !isUuid(id)) {
      console.error("Invalid event ID:", id);
      return res.status(400).json({ message: "Invalid event ID" });
    }

    // Update the event status
    const { data, error } = await supabase
      .from("events")
      .update({
        status: "approved",
        verification_notes: notes || "",
        verified_by: req.user.id,
        verified_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.json({ message: "Event approved successfully", event: data });
  } catch (error) {
    console.error("Error in approve event route:", error);
    res.status(500).json({ message: error.message });
  }
});

router.get("/doctors/pending", verifyToken, adminOnly, async (req, res) => {
  try {
    const { data: doctors, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", "doctor")
      .eq("verified", false);

    if (error) {
      throw new Error(error.message);
    }

    // Format the response
    const formattedDoctors = doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      specialty: doctor.degree || "Not specified",
      verified: doctor.verified || false,
      joinedDate: doctor.created_at,
    }));

    res.json(formattedDoctors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reject a doctor
router.put("/doctors/:id/reject", verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({ message: "Rejection notes are required" });
    }

    // Update the doctor's verification status
    const { data, error } = await supabase
      .from("users")
      .update({
        verification_status: "rejected",
        verification_notes: notes,
      })
      .eq("id", id)
      .eq("role", "doctor")
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.json({ message: "Doctor verification rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add this after the '/doctors' route but before other routes

// Get doctor by ID
router.get("/doctors/:id", verifyToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // First, get the doctor's basic information
    const { data: doctor, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .eq("role", "doctor")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Then, get the doctor's documents
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", id);

    if (docsError) {
      console.error("Error fetching documents:", docsError);
      // Continue even with document error
    }

    // Format the response
    const formattedDoctor = {
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      specialty: doctor.degree || "Not specified",
      verified: doctor.verified || false,
      joinedDate: new Date(doctor.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
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

// Add these routes to the end of admin.js file, before module.exports = router;

// Get all events with registration counts for admin
router.get("/events", verifyToken, adminOnly, async (req, res) => {
  try {
    // Get all events
    const { data: events, error } = await supabase
      .from("events")
      .select(
        `
        *,
        users:organizer_id(name, email, role)
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Get registration counts for each event using a different approach
    const eventIds = events.map((event) => event.id);

    let registrationCounts = {};
    if (eventIds.length > 0) {
      // Instead of using group, we'll count each event's registrations separately
      const { data: registrations, error: regError } = await supabase
        .from("event_registrations")
        .select("event_id");

      if (regError) throw regError;

      // Count occurrences manually
      if (registrations && registrations.length > 0) {
        registrationCounts = registrations.reduce((acc, reg) => {
          acc[reg.event_id] = (acc[reg.event_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    // Rest of the function remains the same...
    const formattedEvents = events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      type: event.type,
      mode: event.mode,
      venue: event.venue,
      startDate: event.start_date,
      endDate: event.end_date,
      start_time: event.start_time,
      end_time: event.end_time,
      organizerName: event.organizer_name,
      organizerEmail: event.organizer_email,
      organizerPhone: event.organizer_phone,
      organizer_id: event.organizer_id,
      status: event.status,
      capacity: event.capacity,
      website: event.website,
      registrationFee: event.registration_fee,
      createdBy: event.users
        ? {
            id: event.organizer_id,
            name: event.users.name,
            email: event.users.email,
            role: event.users.role,
          }
        : null,
      registrationsCount: registrationCounts[event.id] || 0,
      admin_edited: event.admin_edited,
      admin_edited_at: event.admin_edited_at,
    }));

    res.json(formattedEvents);
  } catch (error) {
    console.error("Error fetching all events:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get registrations for an event
router.get(
  "/events/:id/registrations",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const eventId = req.params.id;

      // Get event details first
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (eventError) throw eventError;

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Get registrations with user details - REMOVE phone from selection
      const { data: registrations, error: regError } = await supabase
        .from("event_registrations")
        .select(
          `
          *,
          user:user_id(id, name, email, role, degree, company)
        `
        )
        .eq("event_id", eventId);

      if (regError) throw regError;

      // Add phone property with default value for compatibility with frontend
      const formattedRegistrations = registrations.map((reg) => ({
        ...reg,
        user: {
          ...reg.user,
          phone: reg.user.phone || "Not provided", // Set default value
        },
      }));

      res.json(formattedRegistrations);
    } catch (error) {
      console.error("Error fetching event registrations:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Cancel a registration (admin only)
router.delete(
  "/events/:eventId/registrations/:userId",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const { eventId, userId } = req.params;

      // Delete the registration
      const { error } = await supabase
        .from("event_registrations")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);

      if (error) throw error;

      res.json({ message: "Registration cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling registration:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Export registrations for an event (generates CSV data)
router.get(
  "/events/:id/registrations/export",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const eventId = req.params.id;

      // Get event details
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("title, organizer_name")
        .eq("id", eventId)
        .single();

      if (eventError) throw eventError;

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Get registrations with user details - REMOVE phone from selection
      const { data: registrations, error: regError } = await supabase
        .from("event_registrations")
        .select(
          `
          registered_at,
          user:user_id(id, name, email, role, degree, company, specialization)
        `
        )
        .eq("event_id", eventId);

      if (regError) throw regError;

      // Format the data for export
      const exportData = {
        eventTitle: event.title,
        organizerName: event.organizer_name,
        registrationsCount: registrations.length,
        exportDate: new Date().toISOString(),
        registrations: registrations.map((reg) => ({
          name: reg.user.name,
          email: reg.user.email,
          phone: "N/A", // Default value since phone doesn't exist
          role: reg.user.role,
          specialization: reg.user.specialization || "N/A",
          degree: reg.user.degree || "N/A",
          company: reg.user.company || "N/A",
          registeredAt: reg.registered_at,
        })),
      };

      res.json(exportData);
    } catch (error) {
      console.error("Error exporting registrations:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Admin update event (even after approval)
router.put("/events/:id/update", verifyToken, adminOnly, async (req, res) => {
  try {
    const eventId = req.params.id;
    const eventData = req.body;

    // Update all event fields as admin
    const updateData = {
      title: eventData.title,
      description: eventData.description,
      type: eventData.type,
      mode: eventData.mode,
      start_date: eventData.startDate,
      end_date: eventData.endDate,
      start_time: eventData.start_time,
      end_time: eventData.end_time,
      venue: eventData.venue,
      organizer_name: eventData.organizerName,
      organizer_email: eventData.organizerEmail,
      organizer_phone: eventData.organizerPhone || null,
      capacity: eventData.capacity || null,
      website: eventData.website || null,
      registration_fee: eventData.registrationFee || "0",
      tags: eventData.tags || [],
      speakers: eventData.speakers || [],
      sponsors: eventData.sponsors || [],
      terms_and_conditions: eventData.termsAndConditions || "",
      // Add brochure if provided
      ...(eventData.brochure !== undefined
        ? { brochure: eventData.brochure }
        : {}),
      // Mark as edited by admin
      admin_edited: true,
      admin_edited_at: new Date().toISOString(),
      admin_editor: req.user.id,
      // Add notes if provided
      ...(eventData.notes ? { admin_notes: eventData.notes } : {}),
    };

    // Update the event
    const { data, error } = await supabase
      .from("events")
      .update(updateData)
      .eq("id", eventId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.json({
      message: "Event updated successfully",
      event: data[0],
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add this route before module.exports = router

// Get a single event by ID (admin endpoint)
router.get("/events/:id", verifyToken, adminOnly, async (req, res) => {
  try {
    const eventId = req.params.id;

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select(
        `
        *,
        users:organizer_id(name, email, role)
      `
      )
      .eq("id", eventId)
      .single();

    if (eventError) throw eventError;

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Format the event object to match frontend expectations
    const formattedEvent = {
      id: event.id,
      title: event.title,
      description: event.description,
      type: event.type,
      mode: event.mode,
      venue: event.venue,
      startDate: event.start_date,
      endDate: event.end_date,
      start_time: event.start_time,
      end_time: event.end_time,
      organizerName: event.organizer_name,
      organizerEmail: event.organizer_email,
      organizerPhone: event.organizer_phone,
      organizer_id: event.organizer_id,
      status: event.status,
      capacity: event.capacity,
      website: event.website,
      registrationFee: event.registration_fee,
      tags: event.tags || [],
      speakers: event.speakers || [],
      sponsors: event.sponsors || [],
      terms_and_conditions: event.terms_and_conditions || "",
      created_at: event.created_at,
      verified_at: event.verified_at,
      admin_edited: event.admin_edited,
      admin_edited_at: event.admin_edited_at,
      createdBy: event.users
        ? {
            id: event.organizer_id,
            name: event.users.name,
            email: event.users.email,
            role: event.users.role,
          }
        : null,
    };

    res.json(formattedEvent);
  } catch (error) {
    console.error("Error fetching event details:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

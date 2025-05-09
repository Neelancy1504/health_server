const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");
const { supabase } = require("../config/supabase");

// Get registered events for the current user
router.get("/registered", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get registrations for this user
    const { data: registrations, error: regError } = await supabase
      .from("event_registrations")
      .select("event_id")
      .eq("user_id", userId);

    if (regError) throw regError;

    if (!registrations || registrations.length === 0) {
      return res.json([]);
    }

    // Get the event IDs the user is registered for
    const eventIds = registrations.map((reg) => reg.event_id);

    // Get the events with those IDs that are approved
    const { data: events, error } = await supabase
      .from("events")
      .select("*, users:organizer_id(name)")
      .in("id", eventIds)
      .eq("status", "approved")
      .order("start_date", { ascending: true });

    if (error) throw error;

    // Format to match frontend expectations
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
      organizer_id: event.organizer_id, // Add this
      status: event.status,
      capacity: event.capacity,
      website: event.website,
      registrationFee: event.registration_fee,
      createdBy: event.users ? { name: event.users.name } : null,
    }));

    res.json(formattedEvents);
  } catch (error) {
    console.error("Error fetching registered events:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get pending events (admin only)
router.get("/pending", verifyToken, verifyRole(["admin"]), async (req, res) => {
  try {
    console.log("Fetching pending events");

    // Get pending events with creator details
    const { data: pendingEvents, error } = await supabase
      .from("events")
      .select("*, users:organizer_id(name, email, role)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    console.log(`Found ${pendingEvents.length} pending events`);

    // Format to match frontend expectations
    const formattedEvents = pendingEvents.map((event) => ({
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
      organizer_id: event.organizer_id, // Add this
      status: event.status,
      capacity: event.capacity,
      website: event.website,
      registrationFee: event.registration_fee,
      createdBy: event.users
        ? {
            name: event.users.name,
            email: event.users.email,
            role: event.users.role,
          }
        : null,
    }));

    res.json(formattedEvents);
  } catch (error) {
    console.error("Error in /pending route:", error);
    res.status(500).json({ message: error.message });
  }
});

// Create event
router.post("/", verifyToken, async (req, res) => {
  try {
    const eventData = req.body;

    // Convert the user ID from JWT to a string
    const organizerId = req.user.id.toString();

    console.log("Creating event with user ID:", organizerId);
    console.log("Event data:", eventData);

    // Insert to Supabase
    const { data, error } = await supabase
      .from("events")
      .insert({
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
        organizer_phone: eventData.organizerPhone,
        organizer_id: organizerId,
        status: req.user.role === "admin" ? "approved" : "pending",
        capacity: eventData.capacity || null,
        website: eventData.website || null,
        registration_fee: eventData.registrationFee || "0",
        tags: eventData.tags || [],
        speakers: eventData.speakers || [],
        sponsors: eventData.sponsors || [],
        terms_and_conditions: eventData.termsAndConditions || "",
        brochure: eventData.brochure || null, // Add brochure field
      })
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      throw new Error(error.message);
    }

    res.status(201).json({
      message:
        req.user.role === "admin"
          ? "Event created successfully"
          : "Event submitted for approval",
      event: data[0],
      requiresApproval: req.user.role !== "admin",
    });
  } catch (error) {
    console.error("Event creation error:", error);
    res.status(500).json({ message: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "approved") // Fetch only approved events
      .order("start_date", { ascending: true });

    if (error) throw error;

    res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: error.message });
  }
});
// Get my events (created by current user)
router.get("/my-events", verifyToken, async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("organizer_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Format to match frontend expectations
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
      organizer_id: event.organizer_id, // Add this
      status: event.status,
      capacity: event.capacity,
      website: event.website,
      registrationFee: event.registration_fee,
    }));

    res.json(formattedEvents);
  } catch (error) {
    console.error("Error fetching my events:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get ongoing events
router.get("/ongoing", async (req, res) => {
  try {
    const now = new Date().toISOString();

    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "approved")
      .lt("start_date", now)
      .gt("end_date", now)
      .order("start_date", { ascending: true });

    if (error) throw error;

    // Format to match frontend expectations
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
      organizer_id: event.organizer_id, // Add this
      status: event.status,
      capacity: event.capacity,
    }));

    res.json(formattedEvents);
  } catch (error) {
    console.error("Error fetching ongoing events:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get event by ID
router.get("/:id", async (req, res) => {
  try {
    const eventId = req.params.id;

    // Query for the event with all fields, including brochure
    const { data: event, error } = await supabase
      .from("events")
      .select("*, brochure")
      .eq("id", eventId)
      .single();

    if (error) throw error;

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Format to match frontend expectations
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
      organizer_id: event.organizer_id, // Add this
      status: event.status,
      capacity: event.capacity,
      website: event.website,
      registrationFee: event.registration_fee,
      tags: event.tags,
      speakers: event.speakers,
      sponsors: event.sponsors,
      terms_and_conditions: event.terms_and_conditions,
      createdBy: event.users
        ? {
            name: event.users.name,
            email: event.users.email,
          }
        : null,
    };

    res.json(formattedEvent);
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Approve event (admin only)
router.put(
  "/:id/approve",
  verifyToken,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const { notes } = req.body;

      const { data: event, error } = await supabase
        .from("events")
        .update({
          status: "approved",
          verification_notes: notes,
          verified_by: req.user.id,
          verified_at: new Date().toISOString(),
        })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) throw error;

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json({ message: "Event approved successfully", event });
    } catch (error) {
      console.error("Error approving event:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Reject event (admin only)
router.put(
  "/:id/reject",
  verifyToken,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const { notes } = req.body;

      const { data: event, error } = await supabase
        .from("events")
        .update({
          status: "rejected",
          verification_notes: notes,
          verified_by: req.user.id,
          verified_at: new Date().toISOString(),
        })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) throw error;

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json({ message: "Event rejected successfully", event });
    } catch (error) {
      console.error("Error rejecting event:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete event
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    // Check if user is admin or the event creator
    const { data: event, error: fetchError } = await supabase
      .from("events")
      .select("organizer_id")
      .eq("id", req.params.id)
      .single();

    if (fetchError) throw fetchError;

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Only allow deletion by admin or event creator
    if (req.user.role !== "admin" && event.organizer_id !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this event" });
    }

    // Delete the event
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", req.params.id);

    if (deleteError) throw deleteError;

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: error.message });
  }
});

// Register for event
router.post("/:id/register", verifyToken, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;
    const registrationData = req.body || {};

    console.log("Registration data received:", registrationData);

    // Check if event exists
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();
    console.log(
      "Registration data received:",
      JSON.stringify(registrationData)
    );
    console.log("isCompanySponsor value:", registrationData.isCompanySponsor);
    console.log(
      "Type of isCompanySponsor:",
      typeof registrationData.isCompanySponsor
    );
    if (eventError) throw eventError;
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Handle company sponsorship registration - use optional chaining to prevent errors
if (registrationData.isCompanySponsor === true || registrationData.isCompanySponsor === "true") {
  // Validate required fields
  if (
    !registrationData.companyName ||
    !registrationData.contactPerson ||
    !registrationData.email
  ) {
    return res.status(400).json({
      message:
        "Missing required sponsor information. Please provide company name, contact person, and email.",
    });
  }

  // Add the company as a sponsor to the event
  const newSponsor = {
    id: Date.now().toString(),
    name: registrationData.companyName,
    level: registrationData.sponsorshipLevel || "Standard",
    contactPerson: registrationData.contactPerson,
    contactEmail: registrationData.email,
    contactPhone: registrationData.phone || null,
    website: registrationData.companyWebsite || null,
    additionalNotes: registrationData.additionalNotes || null,
    registered_at: new Date().toISOString(),
    registered_by: userId,
  };

  // Get current sponsors array and add the new one
  let currentSponsors = event.sponsors || [];
  currentSponsors = [...currentSponsors, newSponsor];

  // Update the event with the new sponsor
  const { error: updateError } = await supabase
    .from("events")
    .update({
      sponsors: currentSponsors,
    })
    .eq("id", eventId);

  if (updateError) throw updateError;

  // Also create a registration record to track attendance
  // Only use fields that exist in the schema
  const registrationRecord = {
    event_id: eventId,
    user_id: userId,
    registered_at: new Date().toISOString(),
    is_sponsor: true,  // Explicitly set to boolean true
    company_name: registrationData.companyName,
    sponsorship_level: registrationData.sponsorshipLevel || "Standard",
  };
  
  console.log("Inserting registration with is_sponsor:", registrationRecord.is_sponsor);
  
  const { error: regError } = await supabase
    .from("event_registrations")
    .insert(registrationRecord);

  if (regError) throw regError;

  return res.status(200).json({
    message: "Company registered as sponsor successfully",
    sponsor: newSponsor,
  });
}

    // Handle regular individual registration
    else {
      // Check if already registered
      const { data: existingReg, error: checkError } = await supabase
        .from("event_registrations")
        .select("*")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .limit(1);

      if (checkError) throw checkError;

      if (existingReg && existingReg.length > 0) {
        return res
          .status(400)
          .json({ message: "You have already registered for this event" });
      }

      // Only use fields that exist in the schema
      const { error: regError } = await supabase
        .from("event_registrations")
        .insert({
          event_id: eventId,
          user_id: userId,
          registered_at: new Date().toISOString(),
          is_sponsor: false,
        });

      if (regError) throw regError;

      return res.status(200).json({ message: "Registration successful" });
    }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Update the existing PUT /:id route to better handle admin editing of pending events
// Update the existing PUT /:id route in events.js to properly handle brochure data
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const eventId = req.params.id;
    const eventData = req.body;

    console.log(
      "Received update request with brochure:",
      JSON.stringify(eventData.brochure)
    );

    // Check if user is authorized to edit this event
    const { data: event, error: fetchError } = await supabase
      .from("events")
      .select("organizer_id, status")
      .eq("id", eventId)
      .single();

    if (fetchError) throw fetchError;

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Only allow editing by event creator or admin
    if (req.user.role !== "admin" && event.organizer_id !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Not authorized to edit this event" });
    }

    // For regular users, restrict editing of approved events
    if (req.user.role !== "admin" && event.status === "approved") {
      return res.status(403).json({
        message: "Cannot edit an event that has already been approved",
      });
    }

    // Base fields that anyone can update
    const baseUpdateData = {
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
      website: eventData.website,
    };

    // Fields only admins can modify
    let updateData = { ...baseUpdateData };

    if (req.user.role === "admin") {
      updateData = {
        ...updateData,
        organizer_phone: eventData.organizerPhone || null,
        capacity: eventData.capacity || null,
        registration_fee: eventData.registrationFee || "0",
        tags: eventData.tags || [],
        speakers: eventData.speakers || [],
        sponsors: eventData.sponsors || [],
        terms_and_conditions: eventData.termsAndConditions || "",
      };

      // Track that admin has edited this event
      updateData.admin_edited = true;
      updateData.admin_edited_at = new Date().toISOString();
      updateData.admin_editor = req.user.id;
    }

    // Always include brochure in update if it's provided
    if (eventData.brochure !== undefined) {
      updateData.brochure = eventData.brochure;
    }

    console.log(
      "Final updateData with brochure:",
      JSON.stringify(updateData.brochure)
    );

    // Update the event
    const { data, error } = await supabase
      .from("events")
      .update(updateData)
      .eq("id", eventId)
      .select();

    if (error) {
      console.error("Update error:", error);
      throw error;
    }

    res.json({
      message: "Event updated successfully",
      event: data[0],
      isAdmin: req.user.role === "admin",
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add a new combined route for admins to update and approve an event in one step
router.put(
  "/:id/update-and-approve",
  verifyToken,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const eventId = req.params.id;
      const eventData = req.body;
      const { notes } = req.body;

      console.log("Updating and approving with brochure:", eventData.brochure);

      // First update the event with all details
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
        // Add brochure field - make sure we're setting it properly
        brochure: eventData.brochure,
        // Set approval fields
        status: "approved",
        verification_notes: notes || "Event updated and approved by admin",
        verified_by: req.user.id,
        verified_at: new Date().toISOString(),
        admin_edited: true,
        admin_edited_at: new Date().toISOString(),
        admin_editor: req.user.id,
      };

      console.log(
        "Update data for combined route:",
        JSON.stringify(updateData)
      );

      // Update the event with all details and approve in one step
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
        message: "Event updated and approved successfully",
        event: data[0],
      });
    } catch (error) {
      console.error("Error updating and approving event:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get brochure for an event
router.get("/:id/brochure", async (req, res) => {
  try {
    const eventId = req.params.id;

    const { data: brochureData, error } = await supabase
      .from("brochures")
      .select("*")
      .eq("event_id", eventId)
      .order("upload_date", { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    if (!brochureData || brochureData.length === 0) {
      return res
        .status(404)
        .json({ message: "No brochure found for this event" });
    }

    res.json(brochureData[0]);
  } catch (error) {
    console.error("Error fetching event brochure:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

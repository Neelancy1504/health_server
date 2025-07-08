const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { verifyRole } = require("../middleware/roleMiddleware"); // Fixed import - add destructuring
const { supabase } = require("../config/supabase");
const notificationService = require("../services/notificationService");

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
        brochure: eventData.brochure || null,
        // Add multi-day fields
        number_of_days: eventData.numberOfDays || 1,
        is_multi_day: eventData.isMultiDay || false,
      })
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      throw new Error(error.message);
    }

    // If multi-day event, create initial day records
    if (eventData.isMultiDay && eventData.numberOfDays > 1) {
      const eventDays = [];
      const startDate = new Date(eventData.startDate);

      for (let i = 0; i < eventData.numberOfDays; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(startDate.getDate() + i);

        eventDays.push({
          event_id: data[0].id,
          day_number: i + 1,
          date: dayDate.toISOString().split("T")[0], // YYYY-MM-DD format
          start_time: eventData.start_time,
          end_time: eventData.end_time,
          venue: eventData.venue,
          description: `Day ${i + 1}`,
        });
      }

      const { error: daysError } = await supabase
        .from("event_days")
        .insert(eventDays);

      if (daysError) {
        console.error("Error creating event days:", daysError);
        // Don't fail the event creation, admin can add days later
      }
    }

    // Notify admins about new event request
    await notificationService.sendToRole(
      "admin",
      "New Event Request",
      `A new event "${eventData.title}" requires approval`,
      {
        type: "pending_event",
        id: data[0].id,
        action: "approval",
      }
    );

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

// Add endpoint to get pharma's sponsorship requests
router.get("/sponsorship-requests", verifyToken, async (req, res) => {
  try {
    // Different query based on user role
    if (req.user.role === "pharma") {
      // Get requests for this pharma user
      const { data, error } = await supabase
        .from("sponsorship_requests")
        .select(
          `
          *,
          events(id, title, description, start_date, end_date, mode, venue, organizer_name)
        `
        )
        .eq("pharma_id", req.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      res.json(data);
    } else if (req.user.role === "doctor") {
      // Get requests created by this doctor
      const { data: events, error: eventsError } = await supabase
        .from("events")
        .select("id")
        .eq("organizer_id", req.user.id);

      if (eventsError) throw eventsError;

      if (events.length === 0) {
        return res.json([]);
      }

      const eventIds = events.map((e) => e.id);

      const { data, error } = await supabase
        .from("sponsorship_requests")
        .select(
          `
          *,
          events(id, title),
          pharma:pharma_id(id, name, company, email)
        `
        )
        .in("event_id", eventIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      res.json(data);
    } else {
      return res.status(403).json({ message: "Unauthorized" });
    }
  } catch (error) {
    console.error("Error fetching sponsorship requests:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add this new endpoint to fetch pharma companies
router.get("/pharma-companies", verifyToken, async (req, res) => {
  try {
    // Get all verified pharma users
    const { data, error } = await supabase
      .from("users")
      .select("id, name, company")
      .eq("role", "pharma")
      .eq("verified", true);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error("Error fetching pharma companies:", error);
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

      // Notify event creator
      await notificationService.sendToUser(
        event.created_by,
        "Event Approved",
        `Your event "${event.title}" has been approved!`,
        {
          type: "event_approval",
          id: event.id,
          action: "view",
        }
      );

      // Notify all users about new event
      await notificationService.sendToAll(
        "New Event Available",
        `Check out the new event: ${event.title}`,
        {
          type: "new_event",
          id: event.id,
          action: "view",
        }
      );

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

      // Notify event creator
      await notificationService.sendToUser(
        event.created_by,
        "Event Rejected",
        `Your event "${event.title}" was not approved. Reason: ${
          notes || "Not specified"
        }`,
        {
          type: "event_rejection",
          id: event.id,
          action: "view",
        }
      );

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
    if (
      registrationData.isCompanySponsor === true ||
      registrationData.isCompanySponsor === "true"
    ) {
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
        is_sponsor: true, // Explicitly set to boolean true
        company_name: registrationData.companyName,
        sponsorship_level: registrationData.sponsorshipLevel || "Standard",
      };

      console.log(
        "Inserting registration with is_sponsor:",
        registrationRecord.is_sponsor
      );

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

// Update the existing PUT /:id route

router.put("/:id", verifyToken, async (req, res) => {
  try {
    const eventId = req.params.id; // This is the correct variable name
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

    // Add multi-day fields
    updateData.number_of_days = eventData.numberOfDays || 1;
    updateData.is_multi_day = eventData.isMultiDay || false;

    console.log(
      "Final updateData with brochure:",
      JSON.stringify(updateData.brochure)
    );

    // Update the event
    const { data, error } = await supabase
      .from("events")
      .update(updateData)
      .eq("id", eventId) // Use eventId consistently
      .select();

    if (error) {
      console.error("Update error:", error);
      throw error;
    }

    // Handle multi-day event logic with correct variable name
    // If changing from single to multi-day, create initial event days
    if (eventData.isMultiDay && eventData.numberOfDays > 1) {
      // Check if event days already exist
      const { data: existingDays } = await supabase
        .from("event_days")
        .select("*")
        .eq("event_id", eventId); // Fixed: use eventId instead of id

      // Only create days if they don't exist
      if (!existingDays || existingDays.length === 0) {
        const eventDays = [];
        const startDate = new Date(eventData.startDate);

        for (let i = 0; i < eventData.numberOfDays; i++) {
          const dayDate = new Date(startDate);
          dayDate.setDate(startDate.getDate() + i);

          eventDays.push({
            event_id: eventId, // Fixed: use eventId instead of id
            day_number: i + 1,
            date: dayDate.toISOString().split("T")[0], // YYYY-MM-DD format
            start_time: eventData.start_time,
            end_time: eventData.end_time,
            venue: eventData.venue,
            description: `Day ${i + 1}`,
          });
        }

        await supabase.from("event_days").insert(eventDays);
      }
    }

    // If changing from multi-day to single-day, remove event days
    if (!eventData.isMultiDay || eventData.numberOfDays === 1) {
      await supabase.from("event_days").delete().eq("event_id", eventId); // Fixed: use eventId instead of id
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

// Get event days
router.get("/:id/days", async (req, res) => {
  try {
    const eventId = req.params.id;

    const { data: eventDays, error } = await supabase
      .from("event_days")
      .select("*")
      .eq("event_id", eventId)
      .order("day_number", { ascending: true });

    if (error) throw error;

    res.json(eventDays);
  } catch (error) {
    console.error("Error fetching event days:", error);
    res.status(500).json({ message: error.message });
  }
});

// Register for specific event days
router.post("/:id/register-days", verifyToken, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;
    const { registrationType, selectedDays } = req.body;

    // Check if event exists
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError) throw eventError;
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user is already registered
    const { data: existingReg, error: checkError } = await supabase
      .from("event_registrations")
      .select("*")
      .eq("event_id", eventId)
      .eq("user_id", userId);

    if (checkError) throw checkError;

    if (existingReg && existingReg.length > 0) {
      return res.status(400).json({
        message: "You are already registered for this event",
      });
    }

    // Create registration record
    const registrationRecord = {
      event_id: eventId,
      user_id: userId,
      registered_at: new Date().toISOString(),
      registration_type: registrationType,
      selected_days: registrationType === "specific_days" ? selectedDays : null,
    };

    const { error: regError } = await supabase
      .from("event_registrations")
      .insert(registrationRecord);

    if (regError) throw regError;

    res.status(200).json({
      message: "Registration successful",
      registrationType,
      selectedDays: registrationType === "specific_days" ? selectedDays : null,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add sponsorship request table in your database
// Run this SQL in your Supabase SQL editor
/*
CREATE TABLE IF NOT EXISTS sponsorship_requests (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  pharma_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_sponsorship_request UNIQUE(event_id, pharma_id)
);
*/

// Add this endpoint to create sponsorship requests
router.post("/:id/sponsorship-requests", verifyToken, async (req, res) => {
  try {
    const eventId = req.params.id;
    const { pharmaIds } = req.body;

    if (!Array.isArray(pharmaIds) || pharmaIds.length === 0) {
      return res.status(400).json({ message: "No pharma companies selected" });
    }

    // Check if event exists and belongs to the user
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .eq("organizer_id", req.user.id)
      .single();

    if (eventError || !event) {
      return res
        .status(404)
        .json({ message: "Event not found or unauthorized" });
    }

    // Create sponsorship requests
    const requests = pharmaIds.map((pharmaId) => ({
      event_id: eventId,
      pharma_id: pharmaId,
      status: "pending",
    }));

    const { data, error } = await supabase
      .from("sponsorship_requests")
      .upsert(requests, { onConflict: "event_id,pharma_id" });

    if (error) throw error;

    // Send notifications to pharma companies
    for (const pharmaId of pharmaIds) {
      await notificationService.sendToUser(
        pharmaId,
        "Sponsorship Request",
        `You've been invited to sponsor the event: ${event.title}`,
        {
          type: "sponsorship_request",
          id: eventId,
          action: "respond",
        }
      );
    }

    res.status(201).json({
      message: "Sponsorship requests sent successfully",
      requests: data,
    });
  } catch (error) {
    console.error("Error creating sponsorship requests:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add endpoint for pharma to respond to sponsorship requests
router.put(
  "/sponsorship-requests/:requestId",
  verifyToken,
  async (req, res) => {
    try {
      const { requestId } = req.params;
      const { status } = req.body;

      if (!status || !["accepted", "declined"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      // Check if request exists and belongs to the pharma user
      const { data: request, error: requestError } = await supabase
        .from("sponsorship_requests")
        .select("*, events(title, organizer_id, organizer_name)")
        .eq("id", requestId)
        .eq("pharma_id", req.user.id)
        .single();

      if (requestError || !request) {
        return res
          .status(404)
          .json({ message: "Sponsorship request not found" });
      }

      // Update request status
      const { data, error } = await supabase
        .from("sponsorship_requests")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select();

      if (error) throw error;

      // If accepted, add pharma as sponsor to the event
      if (status === "accepted") {
        // Get current event data
        const { data: eventData, error: eventError } = await supabase
          .from("events")
          .select("sponsors")
          .eq("id", request.event_id)
          .single();

        if (eventError) throw eventError;

        // Add pharma to sponsors list
        const currentSponsors = eventData.sponsors || [];
        const newSponsor = {
          id: Date.now().toString(),
          name: req.user.company || req.user.name, // Add name property with company or user name
          level: "Standard",
          contactPerson: req.user.name,
          contactEmail: req.user.email,
          contactPhone: req.user.phone || null,
          pharma_id: req.user.id,
          approved: true,
        };

        // Update event with new sponsor
        await supabase
          .from("events")
          .update({
            sponsors: [...currentSponsors, newSponsor],
          })
          .eq("id", request.event_id);

        // Notify event organizer
        await notificationService.sendToUser(
          request.events.organizer_id,
          "Sponsorship Accepted",
          `${
            req.user.company || req.user.name
          } has accepted your sponsorship request for ${request.events.title}`,
          {
            type: "sponsorship_response",
            id: request.event_id,
            action: "view",
            status: "accepted",
          }
        );
      } else {
        // Notify event organizer of declined sponsorship
        await notificationService.sendToUser(
          request.events.organizer_id,
          "Sponsorship Declined",
          `${
            req.user.company || req.user.name
          } has declined your sponsorship request for ${request.events.title}`,
          {
            type: "sponsorship_response",
            id: request.event_id,
            action: "view",
            status: "declined",
          }
        );
      }

      res.json({
        message: `Sponsorship request ${status} successfully`,
        request: data[0],
      });
    } catch (error) {
      console.error("Error responding to sponsorship request:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;

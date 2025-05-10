const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");
const { supabase } = require("../config/supabase");

// Create a new private meeting (pharma only)
router.post("/", verifyToken, verifyRole(["pharma"]), async (req, res) => {
  try {
    const {
      title,
      description,
      startDate,
      endDate,
      startTime,
      endTime,
      venue,
      mode,
      meetingLink,
      invitedDoctors,
      organizerName, // Now explicitly accepting this from frontend
    } = req.body;

    // Log the received data for debugging
    console.log("Creating meeting with data:", {
      title,
      startDate,
      endDate,
      startTime,
      endTime,
      venue,
      mode,
      organizerName,
    });

    // Validate required fields
    if (
      !title ||
      !startDate ||
      !endDate ||
      !startTime ||
      !endTime ||
      !venue ||
      !mode
    ) {
      return res.status(400).json({
        message: "Missing required fields",
        received: {
          title,
          startDate,
          endDate,
          startTime,
          endTime,
          venue,
          mode,
        },
      });
    }

    if (!Array.isArray(invitedDoctors) || invitedDoctors.length === 0) {
      return res
        .status(400)
        .json({ message: "You must invite at least one doctor" });
    }

    // Create the private meeting with fallback for organizer_name
    const { data: meeting, error: meetingError } = await supabase
      .from("private_meetings")
      .insert({
        title,
        description,
        organizer_id: req.user.id,
        // Use provided organizerName or fall back to user context name or a default
        organizer_name:
          organizerName || req.user.name || "Pharmaceutical Representative",
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        venue,
        mode,
        meeting_link: meetingLink || null,
      })
      .select();

    if (meetingError) {
      console.error("Error creating private meeting:", meetingError);
      throw meetingError;
    }

    // Continue with invitation processing...
    const meetingId = meeting[0].id;
    const invitationRecords = invitedDoctors.map((doctor) => ({
      meeting_id: meetingId,
      doctor_id: doctor.id,
      doctor_name: doctor.name,
      doctor_email: doctor.email,
    }));

    // Create invitations
    const { error: invitationError } = await supabase
      .from("meeting_invitations")
      .insert(invitationRecords);

    if (invitationError) {
      console.error("Error creating invitations:", invitationError);
      throw invitationError;
    }

    res.status(201).json({
      message: "Private meeting created and invitations sent successfully",
      meeting: meeting[0],
      invitedDoctors: invitedDoctors.length,
    });
  } catch (error) {
    console.error("Private meeting creation error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get my organized meetings (pharma only)
router.get(
  "/organized",
  verifyToken,
  verifyRole(["pharma"]),
  async (req, res) => {
    try {
      const { data: meetings, error } = await supabase
        .from("private_meetings")
        .select(
          `
        *,
        invitations:meeting_invitations(
          id,
          doctor_id,
          doctor_name,
          doctor_email,
          status
        )
      `
        )
        .eq("organizer_id", req.user.id)
        .order("start_date", { ascending: false });

      if (error) throw error;

      res.json(meetings);
    } catch (error) {
      console.error("Error fetching organized meetings:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get my invited meetings (doctor only)
router.get(
  "/invited",
  verifyToken,
  verifyRole(["doctor"]),
  async (req, res) => {
    try {
      const { data: invitations, error } = await supabase
        .from("meeting_invitations")
        .select(
          `
        *,
        meeting:meeting_id(*)
      `
        )
        .eq("doctor_id", req.user.id);

      if (error) throw error;

      const meetings = invitations.map((invite) => ({
        ...invite.meeting,
        invitationStatus: invite.status,
        invitationId: invite.id,
      }));

      res.json(meetings);
    } catch (error) {
      console.error("Error fetching invited meetings:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get meetings visible to admin
router.get("/all", verifyToken, verifyRole(["admin"]), async (req, res) => {
  try {
    const { data: meetings, error } = await supabase
      .from("private_meetings")
      .select(
        `
        *,
        invitations:meeting_invitations(
          id,
          doctor_id,
          doctor_name,
          doctor_email,
          status
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(meetings);
  } catch (error) {
    console.error("Error fetching all meetings:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get a specific meeting by ID with access control
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the meeting with its invitations
    const { data: meeting, error } = await supabase
      .from("private_meetings")
      .select(
        `
        *,
        invitations:meeting_invitations(
          id,
          doctor_id,
          doctor_name,
          doctor_email,
          status,
          response_date
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    // Check access permissions
    const isOrganizer = meeting.organizer_id === req.user.id;
    const isAdmin = req.user.role === "admin";
    const isInvited =
      req.user.role === "doctor" &&
      meeting.invitations.some((invite) => invite.doctor_id === req.user.id);

    if (!isOrganizer && !isAdmin && !isInvited) {
      return res
        .status(403)
        .json({ message: "You don't have access to this meeting" });
    }

    res.json(meeting);
  } catch (error) {
    console.error("Error fetching meeting:", error);
    res.status(500).json({ message: error.message });
  }
});

// Update meeting invitation status (doctor only)
router.put(
  "/invitation/:invitationId",
  verifyToken,
  verifyRole(["doctor"]),
  async (req, res) => {
    try {
      const { invitationId } = req.params;
      const { status } = req.body;

      if (!status || !["accepted", "declined"].includes(status)) {
        return res.status(400).json({ message: "Invalid status provided" });
      }

      // Check if invitation belongs to this doctor
      const { data: invitation, error: fetchError } = await supabase
        .from("meeting_invitations")
        .select("*")
        .eq("id", invitationId)
        .eq("doctor_id", req.user.id)
        .single();

      if (fetchError || !invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Update the invitation status
      const { data, error } = await supabase
        .from("meeting_invitations")
        .update({
          status,
          response_date: new Date().toISOString(),
        })
        .eq("id", invitationId)
        .select();

      if (error) throw error;

      res.json({
        message: `Meeting invitation ${status}`,
        invitation: data[0],
      });
    } catch (error) {
      console.error("Error updating invitation status:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Cancel a meeting (pharma only - meeting organizer)
router.put(
  "/:id/cancel",
  verifyToken,
  verifyRole(["pharma"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check if meeting exists and belongs to this pharma rep
      const { data: meeting, error: fetchError } = await supabase
        .from("private_meetings")
        .select("*")
        .eq("id", id)
        .eq("organizer_id", req.user.id)
        .single();

      if (fetchError || !meeting) {
        return res
          .status(404)
          .json({ message: "Meeting not found or you don't have permission" });
      }

      // Update the meeting status to cancelled
      const { data, error } = await supabase
        .from("private_meetings")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select();

      if (error) throw error;

      res.json({
        message: "Meeting cancelled successfully",
        meeting: data[0],
      });
    } catch (error) {
      console.error("Error cancelling meeting:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get doctors for invitation selection (pharma or admin)
router.get("/doctors/available", verifyToken, async (req, res) => {
  try {
    if (!["pharma", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Get verified doctors
    const { data: doctors, error } = await supabase
      .from("users")
      .select("id, name, email, role, degree, company, verified")
      .eq("role", "doctor")
      .eq("verified", true);

    if (error) throw error;

    res.json(doctors);
  } catch (error) {
    console.error("Error fetching available doctors:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

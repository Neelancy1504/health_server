const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { verifyRole } = require("../middleware/roleMiddleware"); // Fixed import
const { supabase } = require("../config/supabase");
const notificationService = require('../services/notificationService');

// Create a new private meeting (pharma only)
router.post("/", verifyToken, verifyRole(["pharma", "admin", "doctor"]), async (req, res) => {
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
      invitedMembers, // Accept invitedMembers from frontend
      invitedDoctors, // Keep for backward compatibility
      organizerName,
    } = req.body;

    // Use invitedMembers if available, otherwise fall back to invitedDoctors
    const membersToInvite = invitedMembers || invitedDoctors || [];

    // Validate required fields
    if (!title || !startDate || !endDate || !startTime || !endTime || !venue || !mode) {
      return res.status(400).json({
        message: "Missing required fields",
        received: { title, startDate, endDate, startTime, endTime, venue, mode },
      });
    }

    if (!Array.isArray(membersToInvite) || membersToInvite.length === 0) {
      return res.status(400).json({ 
        message: "You must invite at least one member",
        received: { invitedMembers, invitedDoctors, membersToInvite }
      });
    }

    // Create the private meeting
    const { data: meeting, error: meetingError } = await supabase
      .from("private_meetings")
      .insert({
        title,
        description,
        organizer_id: req.user.id,
        organizer_name: organizerName || req.user.name || "Organizer",
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        venue,
        mode,
        meeting_link: meetingLink || null,
      })
      .select()
      .single();

    if (meetingError) {
      console.error("Error creating private meeting:", meetingError);
      throw meetingError;
    }

    // Insert invitations for all invited members
    const invitations = membersToInvite.map(user => ({
      meeting_id: meeting.id,
      doctor_id: user.id, // keep this field name for compatibility
      doctor_name: user.name,
      doctor_email: user.email,
      status: 'pending',
    }));

    const { error: invitationsError } = await supabase
      .from("meeting_invitations")
      .insert(invitations);

    if (invitationsError) {
      console.error("Error inserting meeting invitations:", invitationsError);
    }

    // Send notification to each invited member
    for (const user of membersToInvite) {
      try {
        await notificationService.sendToUser(
          user.id,
          'New Meeting Invitation',
          `You've been invited to a meeting: ${meeting.title}`,
          {
            type: 'meeting_invitation',
            id: meeting.id,
            action: 'view_invitation'
          }
        );
        console.log(`📧 Sent meeting invitation notification to ${user.name} (${user.email})`);
      } catch (notificationError) {
        console.error(`❌ Failed to send notification to ${user.name}:`, notificationError);
      }
    }

    // Notify admins about new private meeting
    await notificationService.sendToRole(
      "admin",
      "New Private Meeting Created",
      `A new private meeting "${title}" has been created by ${req.user.name}`,
      {
        type: "private_meeting_created",
        id: meeting.id,
        action: "view",
      }
    );

    res.status(201).json({
      message: "Private meeting created and invitations sent successfully",
      meeting,
      invitedMembers: membersToInvite.length,
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
  verifyRole(["pharma", "doctor"]),
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
  verifyRole(["doctor", "pharma"]),
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
      const { data: updatedInvitation, error } = await supabase
        .from("meeting_invitations")
        .update({
          status,
          response_date: new Date().toISOString(),
        })
        .eq("id", invitationId)
        .select();

      if (error) throw error;

      // Notify meeting organizer
      const meeting = invitation.meeting_id; // Get meeting details from invitation
      //const status = req.body.status; // 'accepted' or 'declined'
    
      await notificationService.sendToUser(meeting.organizer_id, 
        `Meeting Invitation ${status === 'accepted' ? 'Accepted' : 'Declined'}`, 
        `Dr. ${req.user.name} has ${status} your invitation to "${meeting.title}"`, 
        {
          type: 'invitation_response',
          id: meeting.id,
          action: 'view_meeting',
          status: status
        }
      );
    
      res.json({ message: `Invitation ${status} successfully`, invitation: updatedInvitation });
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

// Get doctors for invitation selection (allow all authenticated users)
router.get("/doctors/available", verifyToken, async (req, res) => {
  try {
    // Remove the role check so any logged-in user can fetch doctors
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

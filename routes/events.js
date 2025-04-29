const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const User = require("../models/User");
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");

router.get("/registered", verifyToken, async (req, res) => {
  try {
    // Find events where the user is a participant
    const events = await Event.find({
      "participants.user": req.user.id,
      status: "approved"
    })
    .sort({ startDate: 1 })
    .populate("createdBy", "name");

    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Get pending events (admin only)
router.get("/pending", verifyToken, verifyRole(["admin"]), async (req, res) => {
  try {
    console.log("Fetching pending events");
    const pendingEvents = await Event.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email role");

    console.log(`Found ${pendingEvents.length} pending events`);
    res.json(pendingEvents);
  } catch (error) {
    console.error("Error in /pending route:", error);
    res.status(500).json({ message: error.message });
  }
});
// Create a new event (requires authentication)
router.post("/", verifyToken, async (req, res) => {
  try {
    const eventData = req.body;

    // Create a new event with the user as creator and pending status
    // Events created by admins are automatically approved
    const newEvent = new Event({
      ...eventData,
      createdBy: req.user.id,
      status: req.user.role === "admin" ? "approved" : "pending",
    });

    await newEvent.save();
    res.status(201).json({
      message:
        req.user.role === "admin"
          ? "Event created successfully"
          : "Event submitted for approval",
      event: newEvent,
      requiresApproval: req.user.role !== "admin",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all events (public)
router.get("/", async (req, res) => {
  try {
    // Only return approved events or events created by the requesting user
    let query = { status: "approved" };

    if (req.user && req.user.id) {
      query = {
        $or: [{ status: "approved" }, { createdBy: req.user.id }],
      };
    }

    const events = await Event.find(query)
      .sort({ startDate: 1 })
      .populate("createdBy", "name");

    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



// Get my events (doctor only)
router.get("/my-events", verifyToken, async (req, res) => {
  try {
    const myEvents = await Event.find({ createdBy: req.user.id }).sort({
      createdAt: -1,
    });

    res.json(myEvents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Approve an event (admin only)
router.put(
  "/:id/approve",
  verifyToken,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (event.status === "approved") {
        return res.status(400).json({ message: "Event is already approved" });
      }

      // Update event status
      event.status = "approved";
      event.verifiedBy = req.user.id;
      event.verifiedAt = new Date();
      event.verificationNotes = req.body.notes || "Approved";

      await event.save();

      res.json({
        message: "Event approved successfully",
        event: {
          id: event._id,
          title: event.title,
          status: event.status,
        },
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Reject an event (admin only)
router.put(
  "/:id/reject",
  verifyToken,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (event.status === "rejected") {
        return res.status(400).json({ message: "Event is already rejected" });
      }

      // Update event status
      event.status = "rejected";
      event.verifiedBy = req.user.id;
      event.verifiedAt = new Date();
      event.verificationNotes = req.body.notes || "Rejected";

      await event.save();

      res.json({
        message: "Event rejected successfully",
        event: {
          id: event._id,
          title: event.title,
          status: event.status,
        },
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete an event (admin or owner)
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user is admin or event creator
    if (
      req.user.role !== "admin" &&
      event.createdBy.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this event" });
    }

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Register for an event
router.post("/:id/register", verifyToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if event is approved
    if (event.status !== "approved") {
      return res
        .status(400)
        .json({ message: "Cannot register for an unapproved event" });
    }

    // Check if user is already registered
    const alreadyRegistered = event.participants.some(
      (participant) => participant.user.toString() === req.user.id
    );

    if (alreadyRegistered) {
      return res
        .status(400)
        .json({ message: "You are already registered for this event" });
    }

    // Add user to participants
    event.participants.push({ user: req.user.id });
    await event.save();

    res.json({ message: "Successfully registered for event" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get event details
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate("createdBy", "name")
      .populate("participants.user", "name email role");

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // If event is not approved, only admin or creator can view it
    if (event.status !== "approved") {
      if (
        !req.user ||
        (req.user.role !== "admin" &&
          event.createdBy._id.toString() !== req.user.id)
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this event" });
      }
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


module.exports = router;

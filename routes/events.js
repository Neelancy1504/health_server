const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const User = require('../models/User');
const verifyToken = require('../middleware/authMiddleware');
const verifyRole = require('../middleware/roleMiddleware');

// Create a new event (requires authentication)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      mode,
      startDate,
      endDate,
      venue,
      organizerName,
    } = req.body;

    const newEvent = new Event({
      title,
      description,
      type,
      mode,
      startDate,
      endDate,
      venue,
      organizerName,
      createdBy: req.user.id,
      // Events created by admins are automatically approved
      approved: req.user.role === 'admin'
    });

    await newEvent.save();
    res.status(201).json({ 
      message: 'Event created successfully',
      event: newEvent,
      requiresApproval: req.user.role !== 'admin'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all events (public)
router.get('/', async (req, res) => {
  try {
    // Only return approved events or events created by the requesting user
    const query = { approved: true };
    
    if (req.user && req.user.id) {
      query.$or = [{ approved: true }, { createdBy: req.user.id }];
    }
    
    const events = await Event.find(query)
      .sort({ startDate: 1 })
      .populate('createdBy', 'name');
      
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get pending events (admin only)
router.get('/pending', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    const events = await Event.find({ approved: false })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email role');
      
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Approve an event (admin only)
router.put('/:id/approve', verifyToken, verifyRole(['admin']), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    event.approved = true;
    await event.save();
    
    res.json({ 
      message: 'Event approved successfully',
      event: {
        id: event._id,
        title: event.title,
        approved: event.approved
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reject/delete an event (admin or owner)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check if user is admin or event creator
    if (req.user.role !== 'admin' && event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this event' });
    }
    
    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Register for an event
router.post('/:id/register', verifyToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check if event is approved
    if (!event.approved) {
      return res.status(400).json({ message: 'Cannot register for an unapproved event' });
    }
    
    // Check if user is already registered
    const alreadyRegistered = event.participants.some(
      participant => participant.user.toString() === req.user.id
    );
    
    if (alreadyRegistered) {
      return res.status(400).json({ message: 'You are already registered for this event' });
    }
    
    // Add user to participants
    event.participants.push({ user: req.user.id });
    await event.save();
    
    res.json({ message: 'Successfully registered for event' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get event details
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('participants.user', 'name email role');
      
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // If event is not approved, only admin or creator can view it
    if (!event.approved) {
      if (!req.user || (req.user.role !== 'admin' && event.createdBy._id.toString() !== req.user.id)) {
        return res.status(403).json({ message: 'Not authorized to view this event' });
      }
    }
    
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
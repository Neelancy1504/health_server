// models/Event.js
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['Conference', 'Meeting'],
    required: true
  },
  mode: {
    type: String,
    enum: ['Virtual', 'In-Person'],
    required: true
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  venue: {
    type: String,
    required: true,
  },
  organizerName: {
    type: String,
    required: true,
  },
  organizerEmail: {
    type: String,
    required: true,
  },
  organizerPhone: {
    type: String,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  verificationNotes: {
    type: String,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  verifiedAt: {
    type: Date,
  },
  capacity: {
    type: Number,
  },
  website: {
    type: String,
  },
  registrationFee: {
    type: String,
  },
  tags: [{
    type: String,
  }],
  speakers: [{
    name: String,
    title: String,
    bio: String
  }],
  verificationNotes: {
    type: String
  },
  sponsors: [{
    name: String,
    level: String
  }],
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    registeredAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  text: { type: String, required: true },
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  receiverId: { type: String, required: true },
  roomId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, enum: ['NSS', 'Tech', 'Non-Tech', 'Sports', 'Robotics'], required: true },
  date: { type: String, required: true },
  venue: { type: String, required: true },
  fee: { type: Number, default: 0 },
  maxTeamSize: { type: Number, default: 1 },
  budget: { type: Number, required: true },
  description: { type: String },
  image: { type: String },
  facultyStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  hodStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  isLive: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
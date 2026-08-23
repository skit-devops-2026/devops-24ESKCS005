const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  eventName: { type: String, required: true },
  category: { type: String, required: true },
  leaderName: { type: String, required: true },
  leaderRoll: { type: String, required: true },
  branch: { type: String, required: true },
  year: { type: String, required: true },
  teamName: { type: String, default: 'Solo' },
  members: [{ name: String, roll: String }],
  fee: { type: Number, default: 0 },
  passId: { type: String, required: true, unique: true },
  mentorStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model('Registration', registrationSchema);
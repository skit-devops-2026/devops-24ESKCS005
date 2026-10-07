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
  facultyStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'PENDING', 'APPROVED', 'REJECTED'], default: 'Pending' },
  hodStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'PENDING', 'APPROVED', 'REJECTED'], default: 'Pending' },
  isLive: { type: Boolean, default: false },
  status: { type: String, enum: ['Created', 'Approved', 'Conducted', 'Completed', 'CREATED', 'APPROVED', 'CONDUCTED', 'COMPLETED'], default: 'Created' },
  coordinator: {
    name: { type: String, default: 'Student / Club Lead' },
    email: { type: String, default: 'coordinator@college.edu' },
    phone: { type: String, default: '+91 98765 43210' }
  },
  photos: [{ type: String }],
  conductedAt: { type: Date },
  finalReport: {
    summary: { type: String, default: '' },
    highlights: { type: String, default: '' },
    winners: { type: String, default: '' },
    runnerUp: { type: String, default: '' },
    photos: [{ type: String }],
    submittedBy: { type: String, default: '' },
    submittedAt: { type: Date },
    status: { type: String, enum: ['Pending', 'Submitted', 'Under Review', 'Approved', 'Completed', 'PENDING', 'SUBMITTED', 'APPROVED', 'COMPLETED'], default: 'Pending' },
    hodComments: { type: String, default: '' },
    hodReviewedAt: { type: Date }
  },
  budgetRequest: {
    requestedAmount: { type: Number, default: 0 },
    approvedAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'PENDING', 'APPROVED', 'REJECTED'], default: 'Pending' },
    purpose: { type: String, default: '' },
    approvedBy: { type: String, default: '' },
    reviewedAt: { type: Date }
  }
}, { timestamps: true });

eventSchema.pre('save', function (next) {
  if (this.status) {
    const s = this.status.toLowerCase();
    if (s === 'completed') this.status = 'Completed';
    else if (s === 'conducted') this.status = 'Conducted';
    else if (s === 'approved') this.status = 'Approved';
    else if (s === 'created') this.status = 'Created';
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);
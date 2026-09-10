const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Event = require('./models/Event');
const Registration = require('./models/Registration');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventhive')
    .then(() => {
      console.log('✅ Connected to MongoDB EventHive Database');
      seedDefaultSystemData();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));
}

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, uniqueId, domain, year } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, role, uniqueId, domain, year });
    await user.save();
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const user = await User.findOne({ email, role });
    if (!user) return res.status(400).json({ error: 'Invalid Email or Role!' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid Password!' });

    res.json({ message: 'Login Success', user: { name: user.name, email: user.email, role: user.role, domain: user.domain, uniqueId: user.uniqueId } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EVENT MANAGEMENT ROUTES ---
app.get('/api/events/live', async (req, res) => {
  try {
    const events = await Event.find({ isLive: true }).sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/propose', async (req, res) => {
  try {
    const event = new Event(req.body);
    await event.save();
    res.status(201).json({ message: 'Event proposed successfully!', event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/club/all', async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/faculty/:domain', async (req, res) => {
  try {
    const events = await Event.find({ category: req.params.domain }).sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/events/:id/faculty-status', async (req, res) => {
  try {
    const { status } = req.body;
    const event = await Event.findByIdAndUpdate(req.params.id, { facultyStatus: status }, { new: true });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/hod/proposals', async (req, res) => {
  try {
    const events = await Event.find({ facultyStatus: 'Approved' }).sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/events/:id/hod-status', async (req, res) => {
  try {
    const { status, venue } = req.body;
    const updateData = { hodStatus: status };
    if (status === 'Approved') updateData.isLive = true;
    if (venue) updateData.venue = venue;

    const event = await Event.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- REGISTRATION & PARTICIPATION ROUTES ---
app.post('/api/registrations/register', async (req, res) => {
  try {
    const passId = 'PASS-' + Math.floor(100000 + Math.random() * 900000);
    const reg = new Registration({ ...req.body, passId });
    await reg.save();
    res.status(201).json({ message: 'Registered Successfully!', reg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/registrations/student/:roll', async (req, res) => {
  try {
    const regs = await Registration.find({ leaderRoll: req.params.roll }).sort({ createdAt: -1 });
    res.json(regs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/registrations/faculty/:domain', async (req, res) => {
  try {
    const regs = await Registration.find({ category: req.params.domain }).sort({ createdAt: -1 });
    res.json(regs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/registrations/all', async (req, res) => {
  try {
    const regs = await Registration.find().sort({ createdAt: -1 });
    res.json(regs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SEED SYSTEM ACCOUNTS & EVENTS ---
async function seedDefaultSystemData() {
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    const passSports = await bcrypt.hash('sports@123', 10);
    const passTech = await bcrypt.hash('tech@123', 10);
    const passCultural = await bcrypt.hash('cultural@123', 10);
    const passNSS = await bcrypt.hash('nss@123', 10);
    const passRobotics = await bcrypt.hash('robotics@123', 10);
    const passHOD = await bcrypt.hash('hod@123', 10);

    await User.insertMany([
      { name: 'Dr. Meenakshi', email: 'nss.faculty@college.edu', password: passNSS, role: 'faculty', domain: 'NSS', uniqueId: 'EMP-NSS-01' },
      { name: 'Coach Rakesh', email: 'sports.faculty@college.edu', password: passSports, role: 'faculty', domain: 'Sports', uniqueId: 'EMP-SPT-02' },
      { name: 'Dr. A.K. Verma', email: 'tech.faculty@college.edu', password: passTech, role: 'faculty', domain: 'Tech', uniqueId: 'EMP-TCH-03' },
      { name: 'Prof. Priya Sen', email: 'cultural.faculty@college.edu', password: passCultural, role: 'faculty', domain: 'Non-Tech', uniqueId: 'EMP-CUL-04' },
      { name: 'Prof. Vikram Malhotra', email: 'robotics.faculty@college.edu', password: passRobotics, role: 'faculty', domain: 'Robotics', uniqueId: 'EMP-ROB-05' },
      { name: 'Head of Department', email: 'hod@college.edu', password: passHOD, role: 'hod', domain: 'Authority', uniqueId: 'HOD-MAIN-01' }
    ]);
    console.log('🌱 Seeded 5 Faculty Mentors and 1 HOD Authority accounts.');
  }

  const eventCount = await Event.countDocuments();
  if (eventCount === 0) {
    await Event.insertMany([
      {
        title: "Annual Blood Donation & Health Camp",
        category: "NSS",
        date: "2026-10-12",
        venue: "Campus Medical Center",
        fee: 0,
        maxTeamSize: 1,
        budget: 5000,
        description: "Community welfare blood donation camp organized with certified healthcare unit.",
        image: "https://images.unsplash.com/photo-1615461066841-6116e61058f4?auto=format&fit=crop&w=600&q=80",
        facultyStatus: "Approved",
        hodStatus: "Approved",
        isLive: true
      },
      {
        title: "ICI 24-Hr Smart Hack-Sprint",
        category: "Tech",
        date: "2026-10-18",
        venue: "CS Innovation Lab",
        fee: 0,
        maxTeamSize: 4,
        budget: 15000,
        description: "24-hour sprint developing AI, Web3, and IoT campus automation prototypes.",
        image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=600&q=80",
        facultyStatus: "Approved",
        hodStatus: "Approved",
        isLive: true
      },
      {
        title: "Pravah: Battle of the Bands",
        category: "Non-Tech",
        date: "2026-10-20",
        venue: "Main Ground Stage",
        fee: 500,
        maxTeamSize: 6,
        budget: 22000,
        description: "Live musical rock band competition on the main annual fest stage.",
        image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=600&q=80",
        facultyStatus: "Approved",
        hodStatus: "Approved",
        isLive: true
      },
      {
        title: "ICI Robowars & Circuit Clash",
        category: "Robotics",
        date: "2026-10-15",
        venue: "Mech Workshop Arena",
        fee: 300,
        maxTeamSize: 4,
        budget: 18000,
        description: "15kg combat robot battle arena with cash prize sanctions.",
        image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=600&q=80",
        facultyStatus: "Approved",
        hodStatus: "Approved",
        isLive: true
      },
      {
        title: "Inter-Branch Basketball Cup",
        category: "Sports",
        date: "2026-10-25",
        venue: "Sports Complex Court 1",
        fee: 300,
        maxTeamSize: 5,
        budget: 8000,
        description: "5v5 full-court knockout tournament with rolling substitutions.",
        image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=600&q=80",
        facultyStatus: "Approved",
        hodStatus: "Approved",
        isLive: true
      }
    ]);
    console.log('🌱 Seeded 5 Initial Live Campus Events.');
  }
}

if (require.main === module) {
  seedDefaultSystemData();
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 EventHive Full-Stack Server running on http://localhost:${PORT}`));
}

module.exports = app;

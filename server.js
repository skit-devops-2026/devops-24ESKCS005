const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'eventhive-secret-college-key-2026';

const User = require('./models/User');
const Event = require('./models/Event');
const Registration = require('./models/Registration');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- PROMETHEUS METRICS TRACKING ---
const httpMetrics = {
  totalRequests: 0,
  requestsByMethodStatus: {},
  totalDurationMs: 0
};

app.use((req, res, next) => {
  const startHr = process.hrtime();
  res.on('finish', () => {
    httpMetrics.totalRequests++;
    const key = `method="${req.method}",status="${res.statusCode}"`;
    httpMetrics.requestsByMethodStatus[key] = (httpMetrics.requestsByMethodStatus[key] || 0) + 1;
    const diff = process.hrtime(startHr);
    const durationMs = (diff[0] * 1e3) + (diff[1] * 1e-6);
    httpMetrics.totalDurationMs += durationMs;
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const isHealthy = process.env.NODE_ENV === 'test' || dbState === 1;
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: states[dbState] || 'unknown'
  });
});


// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const uptimeSeconds = process.uptime();
  const dbState = mongoose.connection.readyState === 1 ? 1 : 0;

  let metrics = '';
  metrics += '# HELP http_requests_total Total number of HTTP requests handled\n';
  metrics += '# TYPE http_requests_total counter\n';
  if (Object.keys(httpMetrics.requestsByMethodStatus).length === 0) {
    metrics += 'http_requests_total 0\n';
  } else {
    for (const [labels, count] of Object.entries(httpMetrics.requestsByMethodStatus)) {
      metrics += `http_requests_total{${labels}} ${count}\n`;
    }
  }

  metrics += '# HELP http_request_duration_seconds_total Total duration of HTTP requests in seconds\n';
  metrics += '# TYPE http_request_duration_seconds_total counter\n';
  metrics += `http_request_duration_seconds_total ${(httpMetrics.totalDurationMs / 1000).toFixed(6)}\n`;

  metrics += '# HELP nodejs_process_uptime_seconds Process uptime in seconds\n';
  metrics += '# TYPE nodejs_process_uptime_seconds gauge\n';
  metrics += `nodejs_process_uptime_seconds ${uptimeSeconds.toFixed(2)}\n`;

  metrics += '# HELP nodejs_process_resident_memory_bytes Resident memory size in bytes\n';
  metrics += '# TYPE nodejs_process_resident_memory_bytes gauge\n';
  metrics += `nodejs_process_resident_memory_bytes ${mem.rss}\n`;

  metrics += '# HELP nodejs_process_heap_used_bytes Heap memory used in bytes\n';
  metrics += '# TYPE nodejs_process_heap_used_bytes gauge\n';
  metrics += `nodejs_process_heap_used_bytes ${mem.heapUsed}\n`;

  metrics += '# HELP nodejs_process_heap_total_bytes Total heap allocated in bytes\n';
  metrics += '# TYPE nodejs_process_heap_total_bytes gauge\n';
  metrics += `nodejs_process_heap_total_bytes ${mem.heapTotal}\n`;

  metrics += '# HELP nodejs_process_cpu_user_seconds_total Total user CPU time spent in seconds\n';
  metrics += '# TYPE nodejs_process_cpu_user_seconds_total counter\n';
  metrics += `nodejs_process_cpu_user_seconds_total ${(cpu.user / 1e6).toFixed(6)}\n`;

  metrics += '# HELP nodejs_process_cpu_system_seconds_total Total system CPU time spent in seconds\n';
  metrics += '# TYPE nodejs_process_cpu_system_seconds_total counter\n';
  metrics += `nodejs_process_cpu_system_seconds_total ${(cpu.system / 1e6).toFixed(6)}\n`;

  metrics += '# HELP eventhive_db_connection_status Database connection status (1 for connected, 0 for disconnected)\n';
  metrics += '# TYPE eventhive_db_connection_status gauge\n';
  metrics += `eventhive_db_connection_status ${dbState}\n`;

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics);
});

// Connect to MongoDB with automated retry
function connectWithRetry() {
  if (process.env.NODE_ENV !== 'test' && mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventhive';
    mongoose.connect(mongoUri)
      .then(() => {
        console.log('✅ Connected to MongoDB EventHive Database');
        seedDefaultSystemData();
      })
      .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message || err);
        console.log('⏳ Retrying MongoDB connection in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      });
  }
}
connectWithRetry();


// --- AUTHENTICATION & TOKEN UTILITIES ---
function generateToken(user) {
  const payload = {
    id: user._id ? user._id.toString() : user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    domain: user.domain,
    uniqueId: user.uniqueId,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function extractToken(req) {
  if (req.headers && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
  }
  if (req.headers && req.headers['x-auth-token']) {
    return req.headers['x-auth-token'];
  }
  if (req.headers && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const c of cookies) {
      const [key, val] = c.trim().split('=');
      if (key === 'token') return decodeURIComponent(val);
    }
  }
  if (req.query && req.query.token) {
    return req.query.token;
  }
  return null;
}

function authenticateUser(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
  req.user = payload;
  next();
}

function requireRole(allowedRoles) {
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  const normalized = rolesArray.map(r => r.toLowerCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const userRole = (req.user.role || '').toLowerCase();
    if (!normalized.includes(userRole)) {
      return res.status(403).json({
        error: `Access denied. Role '${req.user.role}' is not authorized for this resource.`
      });
    }
    next();
  };
}

function dashboardAuthGuard(allowedRoles, relativeFilePath) {
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  const normalized = rolesArray.map(r => r.toLowerCase());
  return (req, res) => {
    const token = extractToken(req);
    if (!token) {
      return res.redirect('/login.html?error=auth_required');
    }
    const payload = verifyToken(token);
    if (!payload) {
      return res.redirect('/login.html?error=session_expired');
    }
    const userRole = (payload.role || '').toLowerCase();
    if (!normalized.includes(userRole)) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>403 Forbidden - Access Denied</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
          <style>
            body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; font-family: system-ui, sans-serif; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; max-width: 500px; width: 100%; text-align: center; padding: 32px; }
          </style>
        </head>
        <body>
          <div class="card shadow-lg">
            <div class="text-danger mb-3" style="font-size: 3rem;">⚠️</div>
            <h3 class="fw-bold text-danger mb-2">403 - Access Denied</h3>
            <p class="text-secondary mb-3">Your role (<strong>${payload.role}</strong>) does not have permission to access this dashboard.</p>
            <a href="/login.html" class="btn btn-primary btn-sm">Return to Login</a>
          </div>
        </body>
        </html>
      `);
    }
    res.sendFile(path.join(__dirname, relativeFilePath));
  };
}

// --- ROLE-BASED DASHBOARD ACCESS ROUTES ---
app.get('/student/dashboard', dashboardAuthGuard(['student'], 'public/pages/student/dashboard.html'));
app.get(['/coordinator/dashboard', '/club/dashboard'], dashboardAuthGuard(['coordinator', 'club', 'admin'], 'public/pages/club/dashboard.html'));
app.get(['/faculty/dashboard', '/teacher/dashboard'], dashboardAuthGuard(['faculty', 'admin'], 'public/pages/faculty/dashboard.html'));
app.get('/hod/dashboard', dashboardAuthGuard(['hod', 'admin'], 'public/pages/hod/dashboard.html'));
app.get('/admin/dashboard', dashboardAuthGuard(['admin'], 'public/pages/admin/dashboard.html'));
app.get('/hr/dashboard', dashboardAuthGuard(['hr', 'admin'], 'public/pages/hr/dashboard.html'));

// Public Home Page (Root Route)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// --- AUTH API ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, uniqueId, domain, year } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email: cleanEmail,
      password: hashedPassword,
      role: role || 'student',
      uniqueId: uniqueId || 'STU-' + Math.floor(1000 + Math.random() * 9000),
      domain: domain || 'General',
      year: year || ''
    });
    await user.save();
    res.status(201).json({ success: true, message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user);
    res.setHeader('Set-Cookie', `token=${token}; Path=/; SameSite=Lax; Max-Age=86400`);

    res.json({
      success: true,
      message: 'Login Success',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        domain: user.domain,
        uniqueId: user.uniqueId,
        year: user.year
      },
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticateUser, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.json({ success: true, message: 'Logged out successfully.' });
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
    if (status === 'Approved') {
      updateData.isLive = true;
      updateData.status = 'Approved';
    }
    if (venue) updateData.venue = venue;

    const event = await Event.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EVENT DETAILS API ---
app.get('/api/events/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EVENT LIFECYCLE & WORKFLOW APIS ---
app.patch('/api/events/:id/conducted', authenticateUser, requireRole(['coordinator', 'club', 'faculty', 'admin', 'hod']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    event.status = 'Conducted';
    event.conductedAt = new Date();
    if (!event.finalReport) event.finalReport = {};
    if (!event.finalReport.status || event.finalReport.status === 'Pending') {
      event.finalReport.status = 'Pending';
    }
    await event.save();
    res.json({ success: true, message: 'Event status updated to Conducted. Final report workflow initiated.', event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/:id/report', authenticateUser, requireRole(['coordinator', 'club', 'faculty', 'admin']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    const { summary, highlights, winners, runnerUp, photos } = req.body;
    if (!summary || summary.trim().length === 0) {
      return res.status(400).json({ error: 'Event report summary is required.' });
    }
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!event.finalReport) event.finalReport = {};
    event.finalReport.summary = summary.trim();
    event.finalReport.highlights = (highlights || '').trim();
    event.finalReport.winners = (winners || '').trim();
    event.finalReport.runnerUp = (runnerUp || '').trim();
    if (Array.isArray(photos) && photos.length > 0) {
      event.finalReport.photos = photos;
    }
    event.finalReport.submittedBy = `${req.user.name} (${req.user.role})`;
    event.finalReport.submittedAt = new Date();
    event.finalReport.status = 'Submitted';
    await event.save();
    res.json({ success: true, message: 'Final report submitted successfully for HOD review.', event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/events/:id/hod-report-approval', authenticateUser, requireRole(['hod', 'admin']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    const { action, comments, status, hodComments } = req.body;
    const isApprove = action === 'Approve' || status === 'Approved';
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!event.finalReport) event.finalReport = {};

    if (isApprove) {
      event.finalReport.status = 'Approved';
      event.status = 'Completed';
    } else {
      event.finalReport.status = 'Under Review';
    }
    event.finalReport.hodComments = comments || hodComments || '';
    event.finalReport.hodReviewedAt = new Date();
    await event.save();
    res.json({
      success: true,
      message: isApprove ? 'Final report approved and event marked as Completed.' : 'Final report sent back for revision.',
      event
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- BUDGET MANAGEMENT APIS ---
let collegeMaxBudgetLimit = Number(process.env.MAX_BUDGET_LIMIT) || 100000;

app.post('/api/events/:id/budget-request', authenticateUser, requireRole(['coordinator', 'club', 'faculty', 'admin']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    const { requestedAmount, purpose } = req.body;
    const amt = Number(requestedAmount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Please enter a valid positive budget amount.' });
    }
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!event.budgetRequest) event.budgetRequest = {};
    event.budgetRequest.requestedAmount = amt;
    event.budgetRequest.purpose = (purpose || 'Event operations and logistics').trim();
    event.budgetRequest.status = 'Pending';
    await event.save();
    res.json({ success: true, message: `Budget request of ₹${amt} submitted successfully.`, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/events/:id/budget-approval', authenticateUser, requireRole(['hod', 'admin', 'faculty']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    const { status, approvedAmount } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Approved or Rejected.' });
    }
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!event.budgetRequest) event.budgetRequest = {};

    if (status === 'Approved') {
      const amt = Number(approvedAmount !== undefined ? approvedAmount : event.budgetRequest.requestedAmount);
      if (isNaN(amt) || amt < 0) {
        return res.status(400).json({ error: 'Please enter a valid approved budget amount.' });
      }
      if (amt > collegeMaxBudgetLimit) {
        return res.status(400).json({ error: `Approved amount ₹${amt} exceeds maximum college approval limit of ₹${collegeMaxBudgetLimit}.` });
      }
      event.budgetRequest.approvedAmount = amt;
      event.budget = amt;
    } else {
      event.budgetRequest.approvedAmount = 0;
    }
    event.budgetRequest.status = status;
    event.budgetRequest.approvedBy = `${req.user.name} (${req.user.role})`;
    event.budgetRequest.reviewedAt = new Date();
    await event.save();
    res.json({ success: true, message: `Budget request marked as ${status}.`, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/budget-limit', (req, res) => {
  res.json({ success: true, maxLimit: collegeMaxBudgetLimit });
});

app.put('/api/config/budget-limit', authenticateUser, requireRole(['admin', 'hod']), (req, res) => {
  const { maxLimit } = req.body;
  const num = Number(maxLimit);
  if (isNaN(num) || num <= 0) {
    return res.status(400).json({ error: 'Please enter a valid positive budget limit.' });
  }
  collegeMaxBudgetLimit = num;
  res.json({ success: true, message: 'College maximum budget approval limit updated.', maxLimit: collegeMaxBudgetLimit });
});

// --- REMINDER SYSTEM API ---
app.get('/api/reminders', authenticateUser, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 0) {
      return res.json({ success: true, count: 0, totalPending: 0, reminders: [] });
    }
    const reminders = [];
    const role = (req.user.role || '').toLowerCase();

    // 1. Pending Event Proposals (for Faculty review)
    if (['faculty', 'admin'].includes(role)) {
      const pendingFac = await Event.find({ facultyStatus: 'Pending' });
      pendingFac.forEach(e => {
        reminders.push({
          id: 'prop-fac-' + e._id,
          type: 'Proposal Verification',
          severity: 'warning',
          title: `Proposal Verification Pending: ${e.title}`,
          description: `Event in '${e.category}' submitted by Club awaits your Stage 1 verification.`,
          eventId: e._id,
          actionUrl: '/faculty/dashboard'
        });
      });
    }

    // 2. Verified Proposals awaiting HOD Sanction
    if (['hod', 'admin'].includes(role)) {
      const pendingHod = await Event.find({ facultyStatus: 'Approved', hodStatus: 'Pending' });
      pendingHod.forEach(e => {
        reminders.push({
          id: 'prop-hod-' + e._id,
          type: 'HOD Sanction',
          severity: 'danger',
          title: `HOD Sanction Pending: ${e.title}`,
          description: `Faculty-verified event proposal requires final central sanction.`,
          eventId: e._id,
          actionUrl: '/hod/dashboard'
        });
      });
    }

    // 3. Pending Budget Requests
    if (['hod', 'admin', 'faculty'].includes(role)) {
      const pendingBudget = await Event.find({ 'budgetRequest.status': 'Pending', 'budgetRequest.requestedAmount': { $gt: 0 } });
      pendingBudget.forEach(e => {
        reminders.push({
          id: 'bud-' + e._id,
          type: 'Budget Approval',
          severity: 'info',
          title: `Budget Approval Pending: ${e.title} (₹${e.budgetRequest.requestedAmount})`,
          description: `Budget request of ₹${e.budgetRequest.requestedAmount} for '${e.budgetRequest.purpose || 'Operations'}' is pending review.`,
          eventId: e._id,
          actionUrl: '/hod/dashboard'
        });
      });
    }

    // 4. Conducted Events requiring Final Report Submission
    if (['coordinator', 'club', 'faculty', 'admin'].includes(role)) {
      const pendingReports = await Event.find({
        status: 'Conducted',
        $or: [
          { 'finalReport.status': 'Pending' },
          { 'finalReport.status': { $exists: false } }
        ]
      });
      pendingReports.forEach(e => {
        reminders.push({
          id: 'rep-sub-' + e._id,
          type: 'Report Submission',
          severity: 'warning',
          title: `Final Report Pending Submission: ${e.title}`,
          description: `Event has been conducted. Please prepare and submit the formal closure report.`,
          eventId: e._id,
          actionUrl: '/coordinator/dashboard'
        });
      });
    }

    // 5. Submitted Reports awaiting HOD Review & Clearance
    if (['hod', 'admin'].includes(role)) {
      const submittedReports = await Event.find({ 'finalReport.status': 'Submitted' });
      submittedReports.forEach(e => {
        reminders.push({
          id: 'rep-hod-' + e._id,
          type: 'HOD Report Clearance',
          severity: 'primary',
          title: `Final Report Awaiting HOD Clearance: ${e.title}`,
          description: `Closure report submitted by coordinator requires HOD evaluation and sign-off.`,
          eventId: e._id,
          actionUrl: '/hod/dashboard'
        });
      });
    }

    res.json({ success: true, count: reminders.length, totalPending: reminders.length, reminders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- HR ROSTER & EVENT STAFFING API ---
app.get('/api/hr/overview', authenticateUser, requireRole(['hr', 'admin']), async (req, res) => {
  try {
    if (mongoose.connection.readyState === 0) {
      return res.json({
        success: true,
        totalEvents: 0,
        activeCoordinators: 0,
        coordinators: [],
        facultyList: [],
        events: []
      });
    }
    const coordinators = await User.find({ role: { $in: ['coordinator', 'club'] } }, 'name email uniqueId domain createdAt');
    const facultyList = await User.find({ role: 'faculty' }, 'name email uniqueId domain');
    const events = await Event.find({}, 'title category coordinator date venue');
    const totalEvents = events.length;
    const activeCoordinators = coordinators.length;
    res.json({
      success: true,
      totalEvents,
      activeCoordinators,
      coordinators,
      facultyList,
      events
    });
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

// --- ADMIN METRICS & MANAGEMENT API ---
app.get('/api/admin/stats', authenticateUser, requireRole(['admin', 'hod']), async (req, res) => {
  try {
    const [totalUsers, totalEvents, totalRegistrations] = await Promise.all([
      User.countDocuments(),
      Event.countDocuments(),
      Registration.countDocuments()
    ]);
    const users = await User.find({}, 'name email role domain uniqueId createdAt').sort({ createdAt: -1 });
    const events = await Event.find().sort({ createdAt: -1 });
    res.json({ success: true, totalUsers, totalEvents, totalRegistrations, users, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SEED SYSTEM ACCOUNTS & EVENTS ---
async function seedDefaultSystemData() {
  try {
    const defaultUsers = [
      { name: 'Aashish Kumawat', email: 'student@college.edu', plainPass: 'student@123', role: 'student', domain: 'CSE', uniqueId: '24ESKCS005', year: '3rd Year' },
      { name: 'Tech Club Coordinator', email: 'coordinator@college.edu', plainPass: 'coordinator@123', role: 'coordinator', domain: 'Tech', uniqueId: 'CLUB-TECH-01' },
      { name: 'Dr. A.K. Verma', email: 'faculty@college.edu', plainPass: 'faculty@123', role: 'faculty', domain: 'Tech', uniqueId: 'EMP-TCH-03' },
      { name: 'Head of Department', email: 'hod@college.edu', plainPass: 'hod@123', role: 'hod', domain: 'Authority', uniqueId: 'HOD-MAIN-01' },
      { name: 'System Administrator', email: 'admin@college.edu', plainPass: 'admin@123', role: 'admin', domain: 'Administration', uniqueId: 'ADM-MAIN-01' },
      { name: 'HR Manager', email: 'hr@college.edu', plainPass: 'hr@123', role: 'hr', domain: 'HR', uniqueId: 'EMP-HR-01' },
      { name: 'Dr. Meenakshi', email: 'nss.faculty@college.edu', plainPass: 'nss@123', role: 'faculty', domain: 'NSS', uniqueId: 'EMP-NSS-01' },
      { name: 'Coach Rakesh', email: 'sports.faculty@college.edu', plainPass: 'sports@123', role: 'faculty', domain: 'Sports', uniqueId: 'EMP-SPT-02' },
      { name: 'Dr. A.K. Verma (Tech)', email: 'tech.faculty@college.edu', plainPass: 'tech@123', role: 'faculty', domain: 'Tech', uniqueId: 'EMP-TCH-03' },
      { name: 'Prof. Priya Sen', email: 'cultural.faculty@college.edu', plainPass: 'cultural@123', role: 'faculty', domain: 'Non-Tech', uniqueId: 'EMP-CUL-04' },
      { name: 'Prof. Vikram Malhotra', email: 'robotics.faculty@college.edu', plainPass: 'robotics@123', role: 'faculty', domain: 'Robotics', uniqueId: 'EMP-ROB-05' }
    ];

    for (const u of defaultUsers) {
      try {
        const existing = await User.findOne({ email: u.email });
        if (!existing) {
          const hashedPassword = await bcrypt.hash(u.plainPass, 10);
          const doc = new User({
            name: u.name,
            email: u.email,
            password: hashedPassword,
            role: u.role,
            domain: u.domain,
            uniqueId: u.uniqueId,
            year: u.year
          });
          await doc.save();
        } else {
          const isMatch = await bcrypt.compare(u.plainPass, existing.password);
          if (!isMatch || existing.role !== u.role) {
            existing.password = await bcrypt.hash(u.plainPass, 10);
            existing.role = u.role;
            await existing.save();
          }
        }
      } catch (err) {
        if (err.code !== 11000) {
          console.error(`Error seeding user ${u.email}:`, err.message);
        }
      }
    }
    console.log('🌱 Verified and seeded default system accounts with bcrypt hashes.');
  } catch (seedErr) {
    console.error('Error seeding default users:', seedErr.message);
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
  const server = app.listen(PORT, () => console.log(`🚀 EventHive Full-Stack Server running on port ${PORT}`));

  const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}. Initiating graceful shutdown...`);
    server.close(() => {
      console.log('HTTP server closed.');
      if (mongoose.connection.readyState !== 0) {
        mongoose.connection.close(false).then(() => {
          console.log('MongoDB connection closed.');
          process.exit(0);
        }).catch(() => process.exit(0));
      } else {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

app.seedDefaultSystemData = seedDefaultSystemData;
module.exports = app;

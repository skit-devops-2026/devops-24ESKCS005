process.env.NODE_ENV = 'test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../server');
const User = require('../models/User');
const Event = require('../models/Event');
const Registration = require('../models/Registration');

describe('EventHive Application Test Suite', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
    }
  });

  const crypto = require('crypto');
  const JWT_SECRET = process.env.JWT_SECRET || 'eventhive-secret-college-key-2026';

  const fetchNoKeepAlive = (url, options = {}) => {
    const headers = { ...(options.headers || {}), connection: 'close' };
    return fetch(url, { ...options, headers });
  };

  const createTestToken = (role) => {
    const payload = {
      id: '65f123456789abcdef012345',
      name: `${role} Test User`,
      email: `${role}@college.edu`,
      role: role,
      exp: Date.now() + 24 * 60 * 60 * 1000
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');
    return `${payloadB64}.${signature}`;
  };

  describe('Static Web Portals & Dashboard Routes', () => {

    it('serves the login portal (GET /login.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/login.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
      const text = await res.text();
      assert.ok(text.includes('EventHive'), 'Login page must contain EventHive title');
      assert.ok(text.includes('email') || text.includes('password'), 'Login page must contain credential fields');
    });

    it('serves the registration portal (GET /register.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/register.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
      const text = await res.text();
      assert.ok(text.includes('Register') || text.includes('register'), 'Registration page must contain registration form');
    });

    it('serves student dashboard portal (GET /pages/student/dashboard.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/pages/student/dashboard.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
    });

    it('serves faculty dashboard portal (GET /pages/faculty/dashboard.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/pages/faculty/dashboard.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
    });

    it('serves HOD dashboard portal (GET /pages/hod/dashboard.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/pages/hod/dashboard.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
    });

    it('serves club coordinator dashboard portal (GET /pages/club/dashboard.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/pages/club/dashboard.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
    });

    it('serves public homepage portal (GET / and GET /index.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
      const text = await res.text();
      assert.ok(text.includes('EventHive'), 'Homepage must contain EventHive');
      assert.ok(text.includes('Aashish Kumawat'), 'Homepage must contain developer attribution');
    });

    it('serves event details portal (GET /event-details.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/event-details.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
      const text = await res.text();
      assert.ok(text.includes('Event Details'));
    });

    it('serves HR dashboard portal (GET /pages/hr/dashboard.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/pages/hr/dashboard.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
      const text = await res.text();
      assert.ok(text.includes('HR') || text.includes('Human Resources'));
    });

    it('returns HTTP 404 for unmapped endpoints', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/api/nonexistent-endpoint-test`);
      assert.strictEqual(res.status, 404);
    });

    it('serves health check endpoint (GET /health)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'healthy');
      assert.ok(typeof data.uptime === 'number');
      assert.ok(data.timestamp);
    });

    it('serves Prometheus metrics endpoint (GET /metrics)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/metrics`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/plain'));
      const text = await res.text();
      assert.ok(text.includes('http_requests_total'));
      assert.ok(text.includes('nodejs_process_uptime_seconds'));
      assert.ok(text.includes('nodejs_process_resident_memory_bytes'));
      assert.ok(text.includes('eventhive_db_connection_status'));
    });
  });

  describe('Server Configuration & Middleware', () => {
    it('exports a valid Express application instance', () => {
      assert.ok(app);
      assert.strictEqual(typeof app.handle, 'function');
      assert.strictEqual(typeof app.listen, 'function');
    });

    it('has standard routing middleware registered', () => {
      assert.ok(app._router);
      assert.ok(app._router.stack.length > 0);
    });
  });

  describe('Mongoose User Model Validation', () => {
    it('validates a complete User document successfully', () => {
      const user = new User({
        name: 'Aashish Kumawat',
        email: 'aashish@college.edu',
        password: 'hashedpassword123',
        role: 'student',
        uniqueId: '24ESKCS005',
        domain: 'Tech',
        year: '3rd Year'
      });
      const error = user.validateSync();
      assert.strictEqual(error, undefined);
    });

    it('enforces required fields (name, email, password, role, uniqueId)', () => {
      const user = new User({});
      const error = user.validateSync();
      assert.ok(error, 'Validation error expected');
      assert.ok(error.errors.name, 'name is required');
      assert.ok(error.errors.email, 'email is required');
      assert.ok(error.errors.password, 'password is required');
      assert.ok(error.errors.role, 'role is required');
      assert.ok(error.errors.uniqueId, 'uniqueId is required');
    });

    it('enforces role enum constraints (student, club, faculty, hod)', () => {
      const user = new User({
        name: 'Unauthorized Role User',
        email: 'user@college.edu',
        password: 'password123',
        role: 'superadmin',
        uniqueId: 'EMP-999'
      });
      const error = user.validateSync();
      assert.ok(error, 'Validation error expected for unauthorized role');
      assert.ok(error.errors.role, 'role must belong to allowed enum values');
    });

    it('applies default domain value of "General"', () => {
      const user = new User({
        name: 'Default Domain User',
        email: 'default@college.edu',
        password: 'password123',
        role: 'student',
        uniqueId: 'STU-100'
      });
      assert.strictEqual(user.domain, 'General');
    });
  });

  describe('Mongoose Event Model Validation', () => {
    it('validates a complete Event document successfully', () => {
      const event = new Event({
        title: 'Smart Campus Hackathon',
        category: 'Tech',
        date: '2026-10-18',
        venue: 'CS Innovation Lab',
        fee: 0,
        maxTeamSize: 4,
        budget: 15000,
        description: '24-hour sprint developing campus automation prototypes'
      });
      const error = event.validateSync();
      assert.strictEqual(error, undefined);
    });

    it('enforces required fields (title, category, date, venue, budget)', () => {
      const event = new Event({});
      const error = event.validateSync();
      assert.ok(error, 'Validation error expected');
      assert.ok(error.errors.title, 'title is required');
      assert.ok(error.errors.category, 'category is required');
      assert.ok(error.errors.date, 'date is required');
      assert.ok(error.errors.venue, 'venue is required');
      assert.ok(error.errors.budget, 'budget is required');
    });

    it('enforces category enum constraints (NSS, Tech, Non-Tech, Sports, Robotics)', () => {
      const event = new Event({
        title: 'Invalid Category Event',
        category: 'Esports',
        date: '2026-11-01',
        venue: 'Main Arena',
        budget: 5000
      });
      const error = event.validateSync();
      assert.ok(error, 'Validation error expected for unapproved category');
      assert.ok(error.errors.category, 'category must belong to allowed domain enum');
    });

    it('applies default status and limits correctly', () => {
      const event = new Event({
        title: 'Default Limits Event',
        category: 'Sports',
        date: '2026-12-01',
        venue: 'Sports Ground',
        budget: 2000
      });
      assert.strictEqual(event.facultyStatus, 'Pending');
      assert.strictEqual(event.hodStatus, 'Pending');
      assert.strictEqual(event.isLive, false);
      assert.strictEqual(event.fee, 0);
      assert.strictEqual(event.maxTeamSize, 1);
    });
  });

  describe('Mongoose Registration Model Validation', () => {
    it('validates a complete Registration document successfully', () => {
      const reg = new Registration({
        eventName: 'ICI Robowars',
        category: 'Robotics',
        leaderName: 'Aashish Kumawat',
        leaderRoll: '24ESKCS005',
        branch: 'CSE',
        year: '3rd Year',
        passId: 'PASS-789123'
      });
      const error = reg.validateSync();
      assert.strictEqual(error, undefined);
    });

    it('enforces required registration fields', () => {
      const reg = new Registration({});
      const error = reg.validateSync();
      assert.ok(error, 'Validation error expected');
      assert.ok(error.errors.eventName, 'eventName is required');
      assert.ok(error.errors.category, 'category is required');
      assert.ok(error.errors.leaderName, 'leaderName is required');
      assert.ok(error.errors.leaderRoll, 'leaderRoll is required');
      assert.ok(error.errors.branch, 'branch is required');
      assert.ok(error.errors.year, 'year is required');
      assert.ok(error.errors.passId, 'passId is required');
    });

    it('applies default registration values (teamName: "Solo", fee: 0, mentorStatus: "Pending")', () => {
      const reg = new Registration({
        eventName: 'Solo Sports Entry',
        category: 'Sports',
        leaderName: 'Aashish Kumawat',
        leaderRoll: '24ESKCS005',
        branch: 'CSE',
        year: '3rd Year',
        passId: 'PASS-456789'
      });
      assert.strictEqual(reg.teamName, 'Solo');
      assert.strictEqual(reg.fee, 0);
      assert.strictEqual(reg.mentorStatus, 'Pending');
    });
  });

  describe('Authentication Security & Utility Functions', () => {
    it('hashes passwords securely using bcrypt', async () => {
      const password = 'StudentSecurePassword2026!';
      const hash = await bcrypt.hash(password, 10);

      assert.notStrictEqual(hash, password);
      assert.ok(hash.startsWith('$2'), 'Hash must match bcrypt algorithm format');

      const isMatch = await bcrypt.compare(password, hash);
      assert.strictEqual(isMatch, true, 'Original password must verify successfully');

      const isMismatch = await bcrypt.compare('WrongPassword123!', hash);
      assert.strictEqual(isMismatch, false, 'Invalid password must be rejected');
    });

    it('generates unique event pass IDs matching PASS-XXXXXX format', () => {
      const generatePassId = () => 'PASS-' + Math.floor(100000 + Math.random() * 900000);
      const passId1 = generatePassId();
      const passId2 = generatePassId();

      assert.match(passId1, /^PASS-\d{6}$/, 'Pass ID must match PASS-XXXXXX format');
      assert.match(passId2, /^PASS-\d{6}$/, 'Pass ID must match PASS-XXXXXX format');
      assert.notStrictEqual(passId1, passId2, 'Subsequent generated pass IDs must be unique');
    });
  });

  describe('Role-Based Access Control & Session Token Security', () => {
    it('rejects login requests missing email or password with HTTP 400', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('required'));
    });

    it('redirects unauthenticated direct access to /admin/dashboard', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/admin/dashboard`, {
        redirect: 'manual'
      });
      assert.strictEqual(res.status, 302);
      assert.ok(res.headers.get('location').includes('login.html'));
    });

    it('rejects student attempting to access /admin/dashboard with HTTP 403 Forbidden', async () => {
      const studentToken = createTestToken('student');
      const res = await fetchNoKeepAlive(`${baseUrl}/admin/dashboard`, {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 403);
      const html = await res.text();
      assert.ok(html.includes('403') || html.includes('Access Denied'));
    });

    it('allows admin with valid token to access /admin/dashboard with HTTP 200', async () => {
      const adminToken = createTestToken('admin');
      const res = await fetchNoKeepAlive(`${baseUrl}/admin/dashboard`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Admin Dashboard') || html.includes('System Admin Panel'));
    });

    it('allows student with valid token to access /student/dashboard with HTTP 200', async () => {
      const studentToken = createTestToken('student');
      const res = await fetchNoKeepAlive(`${baseUrl}/student/dashboard`, {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Student Dashboard'));
    });

    it('rejects student attempting to access /faculty/dashboard with HTTP 403', async () => {
      const studentToken = createTestToken('student');
      const res = await fetchNoKeepAlive(`${baseUrl}/faculty/dashboard`, {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 403);
      const text = await res.text();
      assert.ok(text.includes('403'));
    });

    it('rejects student attempting to access /hod/dashboard with HTTP 403', async () => {
      const studentToken = createTestToken('student');
      const res = await fetchNoKeepAlive(`${baseUrl}/hod/dashboard`, {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 403);
      const text = await res.text();
      assert.ok(text.includes('403'));
    });

    it('allows hr coordinator with valid token to access /hr/dashboard with HTTP 200', async () => {
      const hrToken = createTestToken('hr');
      const res = await fetchNoKeepAlive(`${baseUrl}/hr/dashboard`, {
        headers: { 'Authorization': `Bearer ${hrToken}` }
      });
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('HR Coordinator Portal') || html.includes('HR Administration'));
    });

    it('rejects student attempting to access /hr/dashboard with HTTP 403', async () => {
      const studentToken = createTestToken('student');
      const res = await fetchNoKeepAlive(`${baseUrl}/hr/dashboard`, {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 403);
      const text = await res.text();
      assert.ok(text.includes('403'));
    });

    it('serves admin panel portal (GET /pages/admin/dashboard.html)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/pages/admin/dashboard.html`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
      const text = await res.text();
      assert.ok(text.includes('Admin Dashboard'));
    });

    it('handles logout successfully and clears session', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/api/auth/logout`, {
        method: 'POST'
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    });
  });

  describe('Campus Event Lifecycle, Governance & Reminders', () => {
    it('serves dynamic reminders endpoint (GET /api/reminders)', async () => {
      const token = createTestToken('admin');
      const res = await fetchNoKeepAlive(`${baseUrl}/api/reminders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.success);
      assert.ok(Array.isArray(data.reminders));
      assert.ok(typeof data.totalPending === 'number');
    });

    it('serves campus budget limit configuration (GET /api/config/budget-limit)', async () => {
      const res = await fetchNoKeepAlive(`${baseUrl}/api/config/budget-limit`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.success);
      assert.ok(typeof data.maxLimit === 'number');
    });

    it('serves HR overview roster (GET /api/hr/overview)', async () => {
      const hrToken = createTestToken('hr');
      const res = await fetchNoKeepAlive(`${baseUrl}/api/hr/overview`, {
        headers: { 'Authorization': `Bearer ${hrToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.success);
      assert.ok(Array.isArray(data.coordinators));
      assert.ok(Array.isArray(data.events));
    });
  });
});


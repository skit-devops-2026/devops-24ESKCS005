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

  describe('Static Web Portals & Dashboard Routes', () => {
    const fetchNoKeepAlive = (url, options = {}) => {
      const headers = { ...(options.headers || {}), connection: 'close' };
      return fetch(url, { ...options, headers });
    };

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
});

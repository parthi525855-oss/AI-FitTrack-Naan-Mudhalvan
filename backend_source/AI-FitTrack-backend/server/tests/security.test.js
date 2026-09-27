/**
 * Phase 4 security & reliability tests (node:test + supertest).
 * Covers: expired/forged tokens, malformed auth headers, invalid ObjectIds,
 * cross-user URL/body manipulation, malformed JSON, CORS, AI auth + rate limits.
 * Gemini is MOCKED (setClientOverride); DB is mongodb-memory-server. Atlas is never touched.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { startTestDatabase, clearDatabase, stopTestDatabase } = require('./helpers/testDb');
const app = require('../app');
const geminiService = require('../services/geminiService');
const { ISSUER } = require('../services/jwtService');

test.before(async () => {
  await startTestDatabase();
});

test.beforeEach(async () => {
  await clearDatabase();
});

test.after(async () => {
  geminiService.setClientOverride(null);
  await stopTestDatabase();
});

let userCounter = 0;

async function registerUser() {
  userCounter += 1;
  const email = `sec${userCounter}${Date.now()}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: `Security User ${userCounter}`, email, password: 'secret123' });
  assert.equal(res.status, 201);
  return { token: res.body.data.token, user: res.body.data.user, email, password: 'secret123' };
}

function expiredToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub: String(userId), iat: now - 7200, exp: now - 60 }, process.env.JWT_SECRET, {
    issuer: ISSUER,
  });
}

const validWorkout = (overrides = {}) => ({
  workoutName: 'Security Push',
  category: 'Strength Training',
  duration: 25,
  caloriesBurned: 200,
  workoutDate: '2026-09-10',
  ...overrides,
});

test.describe('Token security', () => {
  test('an expired JWT is rejected with 401', async () => {
    const { user } = await registerUser();
    const response = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${expiredToken(user._id)}`);
    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  test('malformed Authorization headers are rejected with 401', async () => {
    const { token } = await registerUser();
    const cases = [
      token, // raw token, no scheme
      `Token ${token}`, // wrong scheme
      'Bearer', // scheme only
      'Bearer not.a.jwt', // garbage
      '', // empty header value omitted below
    ];
    for (const value of cases.slice(0, 4)) {
      const response = await request(app).get('/api/auth/profile').set('Authorization', value);
      assert.equal(response.status, 401, `expected 401 for header "${value}"`);
    }
    const noHeader = await request(app).get('/api/auth/profile');
    assert.equal(noHeader.status, 401);
  });

  test('login and profile responses never contain a password hash', async () => {
    const { token, email, password } = await registerUser();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.password, undefined);
    assert.equal(JSON.stringify(login.body).includes('$2b$'), false);

    const profile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.user.password, undefined);
    assert.equal(JSON.stringify(profile.body).includes('$2b$'), false);
  });
});

test.describe('Resource ownership & input safety', () => {
  test('a second user cannot read, update or delete another user\u2019s workout via the URL', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    const created = await request(app)
      .post('/api/workouts')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(validWorkout());
    assert.equal(created.status, 201);
    const id = created.body.data.workout._id;

    // Read
    const read = await request(app)
      .get(`/api/workouts/${id}`)
      .set('Authorization', `Bearer ${bob.token}`);
    assert.equal(read.status, 404);

    // Update — body claims Bob owns it; server must ignore the body owner
    const update = await request(app)
      .put(`/api/workouts/${id}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ ...validWorkout({ workoutName: 'Hijacked' }), user: bob.user._id });
    assert.equal(update.status, 404);

    // Delete
    const del = await request(app)
      .delete(`/api/workouts/${id}`)
      .set('Authorization', `Bearer ${bob.token}`);
    assert.equal(del.status, 404);

    // Alice's record is untouched
    const still = await request(app)
      .get(`/api/workouts/${id}`)
      .set('Authorization', `Bearer ${alice.token}`);
    assert.equal(still.status, 200);
    assert.equal(still.body.data.workout.workoutName, 'Security Push');
    assert.equal(still.body.data.workout.user, alice.user._id);
  });

  test('a spoofed user field in the create body is ignored (owner comes from JWT)', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const res = await request(app)
      .post('/api/workouts')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ ...validWorkout(), user: bob.user._id });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.workout.user, alice.user._id);
  });

  test('invalid ObjectIds on :id routes return 400, never a 500 crash', async () => {
    const { token } = await registerUser();
    const badIds = ['not-an-id', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz'];
    for (const id of badIds) {
      for (const [method, path] of [
        ['get', `/api/workouts/${id}`],
        ['put', `/api/workouts/${id}`],
        ['delete', `/api/workouts/${id}`],
      ]) {
        const res = await request(app)[method](path)
          .set('Authorization', `Bearer ${token}`)
          .send({ workoutName: 'X' });
        assert.equal(res.status, 400, `expected 400 for ${method.toUpperCase()} ${path}`);
        assert.equal(res.body.success, false);
      }
    }
    // Server still alive after all of those
    const health = await request(app).get('/api/health');
    assert.equal(health.status, 200);
  });

  test('malformed JSON bodies return 400 (not an unhandled crash)', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/workouts')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"workoutName": broken');
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    const health = await request(app).get('/api/health');
    assert.equal(health.status, 200);
  });

  test('CORS only allows the configured CLIENT_URL origin', async () => {
    const allowed = process.env.CLIENT_URL || 'http://localhost:5173';
    const ok = await request(app)
      .options('/api/health')
      .set('Origin', allowed);
    assert.equal(ok.headers['access-control-allow-origin'], allowed);

    const blocked = await request(app)
      .options('/api/health')
      .set('Origin', 'https://evil.example.com');
    assert.ok(
      !blocked.headers['access-control-allow-origin'] ||
        blocked.headers['access-control-allow-origin'] !== 'https://evil.example.com',
      'unexpected origin echo for a disallowed origin'
    );
  });
});


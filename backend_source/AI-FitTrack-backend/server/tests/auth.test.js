/**
 * Phase 1 backend integration tests - authentication workflow.
 * Runs against a real MongoDB engine (mongodb-memory-server), so no Atlas
 * credentials are required to execute the suite.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { startTestDatabase, clearDatabase, stopTestDatabase } = require('./helpers/testDb');
const app = require('../app');
const User = require('../models/User');
const { ISSUER } = require('../services/jwtService');

const VALID_USER = { name: 'Alex Johnson', email: 'Alex.Johnson@Example.com', password: 'secret123' };
const NORMALIZED_EMAIL = 'alex.johnson@example.com';

test.before(async () => {
  await startTestDatabase();
});

test.beforeEach(async () => {
  await clearDatabase();
});

test.after(async () => {
  await stopTestDatabase();
});

/** Register a user through the API and return the supertest response. */
async function registerUser(overrides = {}) {
  return request(app)
    .post('/api/auth/register')
    .send({ ...VALID_USER, ...overrides });
}

test.describe('Health check', () => {
  test('GET /api/health reports the API is running', async () => {
    const response = await request(app).get('/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, 'ok');
  });

  test('unknown routes return a structured 404', async () => {
    const response = await request(app).get('/api/does-not-exist');
    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message.startsWith('Route not found'), true);
  });
});

test.describe('POST /api/auth/register', () => {
  test('registers a new user (201) and returns a JWT with safe user data', async () => {
    const response = await registerUser();
    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.message, 'Registration successful');
    assert.equal(typeof response.body.data.token, 'string');
    assert.equal(response.body.data.tokenType, 'Bearer');
    assert.equal(response.body.data.user.email, NORMALIZED_EMAIL);
    assert.equal(response.body.data.user.name, VALID_USER.name);
    assert.equal(response.body.data.user.password, undefined);
    assert.notEqual(response.body.data.user.createdAt, undefined);

    // the issued token is a real, verifiable JWT for that user
    const decoded = jwt.verify(response.body.data.token, process.env.JWT_SECRET, { issuer: ISSUER });
    assert.equal(decoded.sub, response.body.data.user._id);
  });

  test('stores the password as a bcrypt hash, never as plain text', async () => {
    await registerUser();
    const stored = await User.findOne({ email: NORMALIZED_EMAIL }).select('+password');

    assert.notEqual(stored.password, VALID_USER.password);
    assert.match(stored.password, /^\$2[aby]\$\d{2}\$/);
    assert.equal(await bcrypt.compare(VALID_USER.password, stored.password), true);
  });

  test('rejects a duplicate email with 409', async () => {
    await registerUser();
    const response = await registerUser({ email: NORMALIZED_EMAIL });

    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, 'An account with this email already exists');
    assert.equal(await User.countDocuments(), 1);
  });

  test('rejects an invalid email with 400 and a field error', async () => {
    const response = await registerUser({ email: 'not-an-email' });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, 'Validation failed');
    assert.deepEqual(response.body.errors, [
      { field: 'email', message: 'Please provide a valid email address' },
    ]);
    assert.equal(await User.countDocuments(), 0);
  });

  test('rejects missing required fields with 400 and per-field errors', async () => {
    const response = await request(app).post('/api/auth/register').send({});

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors.map((error) => error.field).sort(), ['email', 'name', 'password']);
    assert.equal(await User.countDocuments(), 0);
  });

  test('rejects a password shorter than six characters', async () => {
    const response = await registerUser({ password: '12345' });
    assert.equal(response.status, 400);
    assert.equal(response.body.errors[0].field, 'password');
  });

  test('rejects a mismatched confirmPassword when it is supplied', async () => {
    const response = await registerUser({ confirmPassword: 'different1' });
    assert.equal(response.status, 400);
    assert.equal(
      response.body.errors.some((error) => error.field === 'confirmPassword'),
      true
    );
  });

  test('normalises the email address to lowercase and trims the name', async () => {
    const response = await registerUser({ name: '  Jamie   Lee  ', email: '  Jamie.Lee@Example.COM  ' });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.user.email, 'jamie.lee@example.com');
    assert.equal(response.body.data.user.name, 'Jamie Lee');
  });
});

test.describe('POST /api/auth/login', () => {
  test('logs in with valid credentials and returns a token + safe user', async () => {
    await registerUser();
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: NORMALIZED_EMAIL, password: VALID_USER.password });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.message, 'Login successful');
    assert.equal(typeof response.body.data.token, 'string');
    assert.equal(response.body.data.user.email, NORMALIZED_EMAIL);
    assert.equal(response.body.data.user.password, undefined);
  });

  test('accepts differently cased emails because they are normalised', async () => {
    await registerUser();
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ALEX.JOHNSON@EXAMPLE.COM', password: VALID_USER.password });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.email, NORMALIZED_EMAIL);
  });

  test('rejects a wrong password with 401', async () => {
    await registerUser();
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: NORMALIZED_EMAIL, password: 'wrong-password' });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, 'Invalid email or password');
  });

  test('rejects an unknown email with the same generic message (no user enumeration)', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'secret123' });

    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Invalid email or password');
  });

  test('rejects an empty payload with 400', async () => {
    const response = await request(app).post('/api/auth/login').send({});
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors.map((error) => error.field).sort(), ['email', 'password']);
  });
});

test.describe('GET /api/auth/profile (protected)', () => {
  test('grants access with a valid JWT and returns the profile without the hash', async () => {
    const registration = await registerUser();
    const { token, user } = registration.body.data;

    const response = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.message, 'Profile retrieved successfully');
    assert.equal(response.body.data.user._id, user._id);
    assert.equal(response.body.data.user.email, NORMALIZED_EMAIL);
    assert.equal(response.body.data.user.password, undefined);
  });

  test('user objects expose both id and _id (documented example uses id)', async () => {
    const registration = await registerUser();
    assert.equal(typeof registration.body.data.user._id, 'string');
    assert.equal(registration.body.data.user.id, registration.body.data.user._id);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: NORMALIZED_EMAIL, password: VALID_USER.password });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.id, login.body.data.user._id);

    const { token } = login.body.data;
    const profile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.user.id, profile.body.data.user._id);
  });

  test('rejects a missing Authorization header with 401', async () => {
    const response = await request(app).get('/api/auth/profile');
    assert.equal(response.status, 401);
    assert.match(response.body.message, /missing Authorization header/i);
  });

  test('rejects a malformed Authorization header with 401', async () => {
    const response = await request(app).get('/api/auth/profile').set('Authorization', 'Token abc123');
    assert.equal(response.status, 401);
    assert.match(response.body.message, /Malformed Authorization header/i);
  });

  test('rejects an invalid / tampered token with 401', async () => {
    const response = await request(app).get('/api/auth/profile').set('Authorization', 'Bearer not.a.jwt');
    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Invalid authentication token');
  });

  test('rejects a token signed with the wrong secret with 401', async () => {
    const forged = jwt.sign({ sub: '507f1f77bcf86cd799439011' }, 'attacker-secret', {
      issuer: ISSUER,
      expiresIn: '1h',
    });

    const response = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${forged}`);
    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Invalid authentication token');
  });

  test('rejects an expired token with 401', async () => {
    const registration = await registerUser();
    const expired = jwt.sign({ sub: registration.body.data.user._id }, process.env.JWT_SECRET, {
      issuer: ISSUER,
      expiresIn: '-10s',
    });

    const response = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${expired}`);
    assert.equal(response.status, 401);
    assert.match(response.body.message, /Session expired/i);
  });

  test('rejects a token whose user no longer exists with 401', async () => {
    const registration = await registerUser();
    await clearDatabase(); // the account is deleted while the token is still valid

    const response = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${registration.body.data.token}`);

    assert.equal(response.status, 401);
    assert.match(response.body.message, /no longer exists/i);
  });
});


/**
 * Phase 1 unit tests: validation helpers, password hashing and the JWT service.
 * These do not need a database connection.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-0123456789abcdef0123456789';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

const {
  validateRegisterInput,
  validateLoginInput,
  normalizeEmail,
} = require('../utils/authValidation');
const {
  signToken,
  verifyToken,
  getTokenExpiry,
  assertSecretConfigured,
  ISSUER,
} = require('../services/jwtService');
const { getUtcDayRange } = require('../utils/workoutValidation');
const ApiError = require('../utils/ApiError');

test.describe('authValidation', () => {
  test('normalizes email addresses consistently', () => {
    assert.equal(normalizeEmail('  User.Name@Example.COM '), 'user.name@example.com');
    assert.equal(normalizeEmail(undefined), '');
  });

  test('accepts a valid registration payload', () => {
    const { errors, value } = validateRegisterInput({
      name: 'Alex Johnson',
      email: 'alex@example.com',
      password: 'secret123',
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(value, { name: 'Alex Johnson', email: 'alex@example.com', password: 'secret123' });
  });

  test('flags every missing required field', () => {
    const { errors } = validateRegisterInput({});
    assert.deepEqual(errors.map((error) => error.field).sort(), ['email', 'name', 'password']);
  });

  test('flags an invalid email and a short password', () => {
    const { errors } = validateRegisterInput({ name: 'Al', email: 'nope', password: '123' });
    assert.deepEqual(errors.map((error) => error.field).sort(), ['email', 'password']);
  });

  test('flags a mismatched confirmPassword only when provided', () => {
    assert.equal(validateRegisterInput({ name: 'Al', email: 'a@b.co', password: 'secret1' }).errors.length, 0);
    const { errors } = validateRegisterInput({
      name: 'Al',
      email: 'a@b.co',
      password: 'secret1',
      confirmPassword: 'secret2',
    });
    assert.equal(errors[0].field, 'confirmPassword');
  });

  test('login validation requires an email and a password only', () => {
    assert.deepEqual(validateLoginInput({ email: 'a@b.co', password: 'x' }).errors, []);
    assert.deepEqual(validateLoginInput({}).errors.map((error) => error.field).sort(), ['email', 'password']);
  });
});

test.describe('jwtService', () => {
  test('signs and verifies a token round trip', () => {
    const token = signToken('507f1f77bcf86cd799439011');
    const decoded = verifyToken(token);
    assert.equal(decoded.sub, '507f1f77bcf86cd799439011');
    assert.equal(decoded.iss, ISSUER);
    assert.equal(typeof decoded.exp, 'number');
  });

  test('rejects a tampered token', () => {
    const token = signToken('507f1f77bcf86cd799439011');
    assert.throws(() => verifyToken(`${token}tampered`), /invalid signature/i);
  });

  test('reports the configured token lifetime', () => {
    assert.equal(getTokenExpiry(), '1h');
  });

  test('throws a meaningful error when JWT_SECRET is missing', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.throws(() => signToken('507f1f77bcf86cd799439011'), /JWT_SECRET is not configured/);
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });
});

test.describe('ApiError', () => {
  test('exposes helper factories with the right status codes', () => {
    assert.equal(ApiError.badRequest('x').statusCode, 400);
    assert.equal(ApiError.unauthorized().statusCode, 401);
    assert.equal(ApiError.conflict().statusCode, 409);
    assert.equal(ApiError.notFound().statusCode, 404);
    assert.deepEqual(ApiError.badRequest('x', [{ field: 'email', message: 'y' }]).errors, [
      { field: 'email', message: 'y' },
    ]);
  });
});

test.describe('getUtcDayRange (workout date search)', () => {
  test('covers the whole UTC day for a date-only input', () => {
    const { start, end } = getUtcDayRange('2026-09-02');
    assert.equal(start.toISOString(), '2026-09-02T00:00:00.000Z');
    assert.equal(end.toISOString(), '2026-09-03T00:00:00.000Z');
  });

  test('keeps a time-bearing instant inside its own UTC day', () => {
    // 20:00Z and 00:00Z on 2026-09-02 must resolve to the same window...
    const evening = getUtcDayRange('2026-09-02T20:00:00.000Z');
    const midnight = getUtcDayRange('2026-09-02');
    assert.equal(evening.start.toISOString(), midnight.start.toISOString());
    assert.equal(evening.end.toISOString(), midnight.end.toISOString());
    // ...while a late instant of the previous UTC day stays outside it.
    const previousDay = getUtcDayRange('2026-09-01T20:30:00.000Z');
    assert.ok(previousDay.end.getTime() <= evening.start.getTime());
  });

  test('reports an error for missing or invalid dates', () => {
    assert.equal(typeof getUtcDayRange('').error, 'string');
    assert.equal(typeof getUtcDayRange('not-a-date').error, 'string');
  });
});

test.describe('assertSecretConfigured (startup validation)', () => {
  test('returns true when a secret is configured', () => {
    assert.equal(assertSecretConfigured(), true);
  });

  test('fails fast with a clear error when JWT_SECRET is missing', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.throws(() => assertSecretConfigured(), /JWT_SECRET is not configured/);
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });
});

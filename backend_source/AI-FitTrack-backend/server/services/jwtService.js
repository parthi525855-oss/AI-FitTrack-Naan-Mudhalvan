const jwt = require('jsonwebtoken');

/**
 * Reusable JWT service: signing and verification live in one place so the
 * secret, issuer and lifetime are configured consistently.
 */

const ISSUER = 'ai-fittrack-api';
const DEFAULT_EXPIRES_IN = '1d';

/** Read the secret lazily so dotenv is always loaded first. */
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error('JWT_SECRET is not configured. Add a strong secret to server/.env.');
  }
  return secret.trim();
}

/** Configured token lifetime (e.g. "1d", "12h", "3600"). */
function getTokenExpiry() {
  return process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN;
}

/**
 * Sign a JWT for a user id.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {string} signed token
 */
function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, getSecret(), {
    expiresIn: getTokenExpiry(),
    issuer: ISSUER,
  });
}

/**
 * Verify a JWT. Throws jsonwebtoken errors
 * (JsonWebTokenError, TokenExpiredError, NotBeforeError).
 * @param {string} token
 * @returns {{sub: string, iat: number, exp: number, iss: string}}
 */
function verifyToken(token) {
  return jwt.verify(token, getSecret(), { issuer: ISSUER });
}

/** Non-fatal sanity check used during server startup. */
function getSecretStrengthWarning() {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length > 0 && secret.length < 32) {
    return 'JWT_SECRET is shorter than 32 characters. Use a long random value (e.g. crypto.randomBytes(48).toString("hex")).';
  }
  return null;
}

/**
 * Fail-fast startup validation.
 *
 * Without a secret the API can neither issue nor verify tokens, so refuse to
 * boot instead of failing on the first register/login request.
 * @returns {true} when a non-empty secret is configured
 * @throws {Error} when JWT_SECRET is missing or blank
 */
function assertSecretConfigured() {
  getSecret();
  return true;
}

module.exports = {
  signToken,
  verifyToken,
  getTokenExpiry,
  getSecretStrengthWarning,
  assertSecretConfigured,
  ISSUER,
};

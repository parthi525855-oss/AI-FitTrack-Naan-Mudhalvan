const { EMAIL_REGEX, MIN_PASSWORD_LENGTH } = require('../models/User');

/**
 * Pure, reusable request-payload validation for the auth endpoints.
 * Kept out of the controller so it can be unit-tested directly and reused.
 */

/** Normalise an email address consistently across the whole API. */
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeName(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate the registration payload.
 * @param {object} body
 * @returns {{ errors: Array<{field: string, message: string}>, value: {name: string, email: string, password: string} }}
 */
function validateRegisterInput(body = {}) {
  const errors = [];
  const name = normalizeName(body.name);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!isNonEmptyString(body.name)) {
    errors.push({ field: 'name', message: 'Name is required' });
  } else if (name.length < 2) {
    errors.push({ field: 'name', message: 'Name must be at least 2 characters long' });
  } else if (name.length > 80) {
    errors.push({ field: 'name', message: 'Name must be at most 80 characters long' });
  }

  if (!isNonEmptyString(body.email)) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push({ field: 'email', message: 'Please provide a valid email address' });
  }

  if (password.length === 0) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push({
      field: 'password',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    });
  }

  // Optional on the API, used by the register form for client-side confirmation.
  if (confirmPassword.length > 0 && confirmPassword !== password) {
    errors.push({ field: 'confirmPassword', message: 'Passwords do not match' });
  }

  return { errors, value: { name, email, password } };
}

/**
 * Validate the login payload.
 * @param {object} body
 * @returns {{ errors: Array<{field: string, message: string}>, value: {email: string, password: string} }}
 */
function validateLoginInput(body = {}) {
  const errors = [];
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!isNonEmptyString(body.email)) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push({ field: 'email', message: 'Please provide a valid email address' });
  }

  if (password.length === 0) {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  return { errors, value: { email, password } };
}

module.exports = {
  EMAIL_REGEX,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  normalizeName,
  validateRegisterInput,
  validateLoginInput,
};

const User = require('../models/User');
const { signToken, getTokenExpiry } = require('../services/jwtService');
const { validateRegisterInput, validateLoginInput, normalizeEmail } = require('../utils/authValidation');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  const { errors, value } = validateRegisterInput(req.body || {});
  if (errors.length > 0) {
    throw ApiError.badRequest('Validation failed', errors);
  }

  const existingUser = await User.findOne({ email: value.email });
  if (existingUser) {
    throw ApiError.conflict('An account with this email already exists', [
      { field: 'email', message: 'This email address is already registered' },
    ]);
  }

  // The password is hashed by the User model pre-save hook before storage.
  const user = await User.create({
    name: value.name,
    email: value.email,
    password: value.password,
  });

  const token = signToken(user._id);

  return sendSuccess(res, 201, 'Registration successful', {
    token,
    tokenType: 'Bearer',
    expiresIn: getTokenExpiry(),
    user: user.toSafeJSON(),
  });
});

/**
 * @desc    Authenticate a user and issue a JWT
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { errors, value } = validateLoginInput(req.body || {});
  if (errors.length > 0) {
    throw ApiError.badRequest('Validation failed', errors);
  }

  // Password is `select: false`, opt in explicitly for the comparison.
  const user = await User.findOne({ email: value.email }).select('+password');

  // Same generic message for unknown email and wrong password (no user enumeration).
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const isMatch = await user.comparePassword(value.password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = signToken(user._id);

  return sendSuccess(res, 200, 'Login successful', {
    token,
    tokenType: 'Bearer',
    expiresIn: getTokenExpiry(),
    user: user.toSafeJSON(),
  });
});

/**
 * @desc    Get the authenticated user's profile
 * @route   GET /api/auth/profile
 * @access  Private (JWT required)
 */
const getProfile = asyncHandler(async (req, res) => {
  // req.user comes from the verified token + a fresh MongoDB lookup.
  return sendSuccess(res, 200, 'Profile retrieved successfully', {
    user: req.user.toSafeJSON(),
  });
});

/**
 * @desc    Small public helper used by the register form to warn early about
 *          duplicate emails. Returns a boolean only, never account details.
 * @route   GET /api/auth/email-available?email=user@example.com
 * @access  Public
 */
const checkEmailAvailable = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    throw ApiError.badRequest('Validation failed', [{ field: 'email', message: 'Email query parameter is required' }]);
  }

  const exists = await User.exists({ email });

  return sendSuccess(res, 200, 'Email availability checked', { email, available: !exists });
});

module.exports = { register, login, getProfile, checkEmailAvailable };

const mongoose = require('mongoose');
const { verifyToken } = require('../services/jwtService');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Reusable authentication middleware.
 *
 * Protects routes by validating the `Authorization: Bearer <token>` header:
 *  - missing header            -> 401
 *  - malformed header          -> 401
 *  - invalid / tampered token  -> 401
 *  - expired token             -> 401
 *  - user no longer in MongoDB -> 401
 *
 * On success the *verified* user document is attached as `req.user`. Callers must
 * never trust a user id supplied by the frontend.
 */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !String(header).trim()) {
    throw ApiError.unauthorized('Authentication required: missing Authorization header');
  }

  if (!/^Bearer\s+/i.test(String(header).trim())) {
    throw ApiError.unauthorized('Malformed Authorization header. Expected the format: Bearer <token>');
  }

  const token = String(header).trim().replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw ApiError.unauthorized('Malformed Authorization header. Expected the format: Bearer <token>');
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Session expired. Please log in again.');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }

  const userId = decoded.sub || decoded.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw ApiError.unauthorized('Invalid authentication token');
  }

  // Always confirm the authenticated user still exists.
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.unauthorized('The account linked to this token no longer exists');
  }

  req.user = user;
  req.userId = user._id.toString();
  req.token = token;

  return next();
});

module.exports = { protect };

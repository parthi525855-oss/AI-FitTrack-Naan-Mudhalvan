const ApiError = require('../utils/ApiError');

/** 404 handler for unknown routes (registered after all routes). */
function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Centralized error handler.
 * Produces the same JSON envelope for every failure:
 * { success: false, message, errors: [{ field, message }] }
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = Array.isArray(err.errors) ? err.errors : [];

  // Mongoose schema validation errors
  if (err.name === 'ValidationError' && err.errors && !Array.isArray(err.errors)) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  // Mongo duplicate key (race condition on the unique email index)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || { email: '' })[0] || 'email';
    message = `An account with this ${field} already exists`;
    errors = [{ field, message }];
  }

  // Invalid ObjectId / cast errors
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid request parameter';
    errors = [{ field: err.path, message: `Invalid value for ${err.path}` }];
  }

  // Malformed JSON body sent by the client
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  }

  if (statusCode >= 500) {
    // Log the full error for server-side failures only.
    console.error('[error]', err.stack || err);
  }

  const payload = { success: false, message, errors };

  // Machine-readable details for our own operational error codes only
  // (e.g. GEMINI_RATE_LIMIT). Internal runtime codes are not exposed.
  if (typeof err.code === 'string' && (err.code.startsWith('GEMINI_') || err.code.startsWith('AI_'))) {
    payload.code = err.code;
  }
  if (Number.isInteger(err.attempts) && err.attempts > 0) {
    payload.attempts = err.attempts;
  }
  if (Number.isFinite(err.retryAfterSeconds) && err.retryAfterSeconds > 0) {
    payload.retryAfterSeconds = err.retryAfterSeconds;
    res.set('Retry-After', String(Math.ceil(err.retryAfterSeconds)));
  }

  if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  return res.status(statusCode).json(payload);
}

module.exports = { notFoundHandler, errorHandler };

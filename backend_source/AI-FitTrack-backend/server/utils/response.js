/**
 * Consistent JSON response helpers used by every controller.
 *
 * Success: { success: true,  message, data }
 * Failure: { success: false, message, errors: [{ field, message }] }  (see ApiError + errorMiddleware)
 */

/**
 * Send a successful JSON response.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string} message
 * @param {object|null} [data]
 */
function sendSuccess(res, statusCode, message, data = null) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

module.exports = { sendSuccess };

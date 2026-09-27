const Workout = require('../models/Workout');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { validateRecommendationInput, validateInsightsInput } = require('../utils/aiValidation');
const {
  generateWorkoutRecommendation,
  generateFitnessInsights,
  getModel,
} = require('../services/geminiService');

/** Simple per-process rate limiter: N AI requests per user per minute. */
const AI_RATE_WINDOW_MS = 60 * 1000;
const aiRequestLog = new Map();

function getAiRateLimitMax() {
  const parsed = Number(process.env.AI_RATE_LIMIT_PER_MINUTE);
  return parsed > 0 ? parsed : 10;
}

function checkAiRateLimit(userId) {
  const max = getAiRateLimitMax();
  const now = Date.now();
  const history = (aiRequestLog.get(userId) || []).filter((t) => now - t < AI_RATE_WINDOW_MS);
  if (history.length >= max) {
    const retryAfter = Math.ceil((AI_RATE_WINDOW_MS - (now - history[0])) / 1000);
    const error = new ApiError(429,
      `AI request limit reached (${max}/minute). Please try again in ${retryAfter}s.`,
      [{ field: 'ai', message: 'Rate limit exceeded' }]);
    error.retryAfterSeconds = retryAfter;
    throw error;
  }
  history.push(now);
  aiRequestLog.set(userId, history);
  if (aiRequestLog.size > 5000) aiRequestLog.clear();
}

function clearAiRateLimits() {
  aiRequestLog.clear();
}

function toGeminiStatus(error) {
  if (error && typeof error.statusCode === 'number') return error.statusCode;
  return 502;
}

function toGeminiFailure(message, error) {
  const status = toGeminiStatus(error);
  const apiError = new ApiError(status, message, [{ field: 'ai', message: error.message }]);

  // Machine-readable details for the client. Never credentials or internals.
  if (typeof error.code === 'string') apiError.code = error.code;
  if (Number.isInteger(error.attempts)) apiError.attempts = error.attempts;
  if (Number.isFinite(error.retryAfterSeconds)) apiError.retryAfterSeconds = error.retryAfterSeconds;

  return apiError;
}

const workoutRecommendation = asyncHandler(async (req, res) => {
  const { errors, value } = validateRecommendationInput(req.body || {});
  if (errors.length > 0) throw ApiError.badRequest('Validation failed', errors);

  checkAiRateLimit(req.userId);

  let recommendation;
  try {
    recommendation = await generateWorkoutRecommendation(value);
  } catch (error) {
    throw toGeminiFailure('Workout recommendation request failed', error);
  }

  return sendSuccess(res, 200, 'Workout recommendation generated successfully', {
    input: value,
    model: getModel(),
    recommendation,
  });
});

const fitnessInsights = asyncHandler(async (req, res) => {
  const { errors, value } = validateInsightsInput(req.body || {});
  if (errors.length > 0) throw ApiError.badRequest('Validation failed', errors);

  checkAiRateLimit(req.userId);

  let stats;
  let statsSource;
  if (value.useDatabaseStats) {
    const workouts = await Workout.find({ user: req.user._id }).lean();
    const totalWorkouts = workouts.length;
    const totalDuration = workouts.reduce((sum, w) => sum + (Number(w.duration) || 0), 0);
    const totalCalories = workouts.reduce((sum, w) => sum + (Number(w.caloriesBurned) || 0), 0);
    if (totalWorkouts === 0) {
      return sendSuccess(res, 200, 'No workouts found - log workouts to unlock personalized insights', {
        statsSource: 'database',
        stats: { totalWorkouts: 0, averageWorkoutDuration: 0, totalCaloriesBurned: 0 },
        insights: null,
      });
    }
    stats = {
      totalWorkouts,
      averageWorkoutDuration: Math.round((totalDuration / totalWorkouts) * 10) / 10,
      totalCaloriesBurned: totalCalories,
    };
    statsSource = 'database';
  } else {
    stats = {
      totalWorkouts: value.totalWorkouts,
      averageWorkoutDuration: value.averageWorkoutDuration,
      totalCaloriesBurned: value.totalCaloriesBurned,
    };
    statsSource = 'submitted';
  }

  let insights;
  try {
    insights = await generateFitnessInsights({ stats, source: statsSource });
  } catch (error) {
    throw toGeminiFailure('Fitness insights request failed', error);
  }

  return sendSuccess(res, 200, 'Fitness insights generated successfully', {
    statsSource,
    stats,
    model: getModel(),
    insights,
  });
});

module.exports = { workoutRecommendation, fitnessInsights, checkAiRateLimit, clearAiRateLimits };

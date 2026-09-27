const Workout = require('../models/Workout');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const {
  validateWorkoutInput,
  validateObjectId,
  normalizeCategory,
  getUtcDayRange,
  WORKOUT_CATEGORIES,
} = require('../utils/workoutValidation');

const HISTORY_SORT = { workoutDate: -1, createdAt: -1 };

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toSafeList(docs) {
  return docs.map((doc) => doc.toSafeJSON());
}

const createWorkout = asyncHandler(async (req, res) => {
  const { errors, value } = validateWorkoutInput(req.body || {}, { partial: false });
  if (errors.length > 0) {
    throw ApiError.badRequest('Validation failed', errors);
  }
  const workout = await Workout.create({ ...value, user: req.user._id });
  return sendSuccess(res, 201, 'Workout created successfully', { workout: workout.toSafeJSON() });
});

/**
 * Build the Mongo filter for the documented search parameters:
 *   name     — partial, case-insensitive match (regex-escaped)
 *   category — exact match against the documented category list
 *   date     — calendar-day match (UTC day boundaries)
 * Shared by GET /api/workouts (documented query filters) and
 * GET /api/workouts/search.
 * @returns {{ filter: object, appliedFilters: object }}
 */
function buildSearchFilter(query = {}) {
  const { name = '', category = '', date = '' } = query || {};
  const filter = {};
  const appliedFilters = {};

  if (typeof name === 'string' && name.trim()) {
    filter.workoutName = { $regex: escapeRegExp(name.trim()), $options: 'i' };
    appliedFilters.name = name.trim();
  }
  if (typeof category === 'string' && category.trim()) {
    const canonical = normalizeCategory(category);
    if (!WORKOUT_CATEGORIES.includes(canonical)) {
      throw ApiError.badRequest('Validation failed', [
        { field: 'category', message: `Category must be one of: ${WORKOUT_CATEGORIES.join(', ')}` },
      ]);
    }
    filter.category = canonical;
    appliedFilters.category = canonical;
  }
  if (typeof date === 'string' && date.trim()) {
    // UTC day boundaries: identical results on every host, independent of the
    // server's local timezone (workout dates are stored as UTC instants).
    const { start, end, error } = getUtcDayRange(date.trim());
    if (error) {
      throw ApiError.badRequest('Validation failed', [{ field: 'date', message: 'Date must be a valid date' }]);
    }
    filter.workoutDate = { $gte: start, $lt: end };
    appliedFilters.date = start.toISOString().slice(0, 10);
  }

  return { filter, appliedFilters };
}

const listWorkouts = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  // The requirements document documents optional search query params
  // (name, category, date) on GET /api/workouts itself; without them the
  // endpoint returns the full history exactly as before.
  const { filter, appliedFilters } = buildSearchFilter(req.query);
  filter.user = req.user._id;
  const workouts = await Workout.find(filter).sort(HISTORY_SORT).limit(limit);
  const data = { count: workouts.length, workouts: toSafeList(workouts) };
  if (Object.keys(appliedFilters).length > 0) data.filters = appliedFilters;
  return sendSuccess(res, 200, 'Workouts retrieved successfully', data);
});

const searchWorkouts = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const { filter, appliedFilters } = buildSearchFilter(req.query);
  filter.user = req.user._id;
  const workouts = await Workout.find(filter).sort(HISTORY_SORT).limit(limit);
  return sendSuccess(res, 200, 'Workout search completed', {
    count: workouts.length,
    filters: appliedFilters,
    workouts: toSafeList(workouts),
  });
});

const getWorkoutById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!validateObjectId(id)) {
    throw ApiError.badRequest('Invalid request parameter', [{ field: 'id', message: 'Invalid workout id' }]);
  }
  const workout = await Workout.findOne({ _id: id, user: req.user._id });
  if (!workout) {
    throw ApiError.notFound('Workout not found');
  }
  return sendSuccess(res, 200, 'Workout retrieved successfully', { workout: workout.toSafeJSON() });
});

const updateWorkout = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!validateObjectId(id)) {
    throw ApiError.badRequest('Invalid request parameter', [{ field: 'id', message: 'Invalid workout id' }]);
  }
  const { errors, value } = validateWorkoutInput(req.body || {}, { partial: true });
  if (errors.length > 0) {
    throw ApiError.badRequest('Validation failed', errors);
  }
  if (Object.keys(value).length === 0) {
    throw ApiError.badRequest('Validation failed', [
      { field: 'workoutName', message: 'Provide at least one field to update' },
    ]);
  }
  const workout = await Workout.findOneAndUpdate({ _id: id, user: req.user._id }, value, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!workout) {
    throw ApiError.notFound('Workout not found');
  }
  return sendSuccess(res, 200, 'Workout updated successfully', { workout: workout.toSafeJSON() });
});

const deleteWorkout = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!validateObjectId(id)) {
    throw ApiError.badRequest('Invalid request parameter', [{ field: 'id', message: 'Invalid workout id' }]);
  }
  const workout = await Workout.findOneAndDelete({ _id: id, user: req.user._id });
  if (!workout) {
    throw ApiError.notFound('Workout not found');
  }
  return sendSuccess(res, 200, 'Workout deleted successfully', { workout: workout.toSafeJSON() });
});

module.exports = {
  createWorkout,
  listWorkouts,
  searchWorkouts,
  getWorkoutById,
  updateWorkout,
  deleteWorkout,
};


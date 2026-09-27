const mongoose = require('mongoose');
const { WORKOUT_CATEGORIES } = require('../models/Workout');

/**
 * Pure, reusable payload validation for the workout endpoints.
 * The controller is the only writer; the model remains the final guard.
 */

const MAX_NAME_LENGTH = 120;
const MAX_DURATION_MINUTES = 1440;
const MAX_CALORIES = 20000;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Accept the documented categories exactly (case-sensitive canonical list). */
function normalizeCategory(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const match = WORKOUT_CATEGORIES.find(
    (category) => category.toLowerCase() === trimmed.toLowerCase()
  );
  return match || trimmed;
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/** Parse a date input; returns { date } or { error }. */
function parseWorkoutDate(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { error: 'Workout date is required' };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: 'Workout date must be a valid date' };
  }
  return { date };
}

/**
 * Validate create / update payloads.
 * @param {object} body Express request body
 * @param {{ partial: boolean }} options partial=true allows PATCH-style updates
 */
function validateWorkoutInput(body = {}, { partial = false } = {}) {
  const errors = [];
  const value = {};
  const source = body && typeof body === 'object' ? body : {};

  const has = (field) =>
    Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined;

  // workoutName — mandatory on create, optional on update (when supplied)
  if (!partial || has('workoutName') || has('name')) {
    const raw = has('workoutName') ? source.workoutName : source.name;
    if (!isNonEmptyString(raw)) {
      errors.push({ field: 'workoutName', message: 'Workout name is required' });
    } else if (raw.trim().length < 2) {
      errors.push({ field: 'workoutName', message: 'Workout name must be at least 2 characters long' });
    } else if (raw.trim().length > MAX_NAME_LENGTH) {
      errors.push({
        field: 'workoutName',
        message: `Workout name must be at most ${MAX_NAME_LENGTH} characters long`,
      });
    } else {
      value.workoutName = raw.trim().replace(/\s+/g, ' ');
    }
  }

  // category — mandatory on create, optional on update (when supplied)
  if (!partial || has('category')) {
    if (!isNonEmptyString(source.category)) {
      errors.push({ field: 'category', message: 'Category is required' });
    } else {
      const canonical = normalizeCategory(source.category);
      if (!WORKOUT_CATEGORIES.includes(canonical)) {
        errors.push({
          field: 'category',
          message: `Category must be one of: ${WORKOUT_CATEGORIES.join(', ')}`,
        });
      } else {
        value.category = canonical;
      }
    }
  }

  // duration — mandatory on create, optional on update (when supplied)
  if (!partial || has('duration')) {
    if (source.duration === undefined || source.duration === null || String(source.duration).trim() === '') {
      errors.push({ field: 'duration', message: 'Duration is required' });
    } else {
      const duration = toFiniteNumber(source.duration);
      if (!Number.isFinite(duration)) {
        errors.push({ field: 'duration', message: 'Duration must be a number (minutes)' });
      } else if (duration <= 0) {
        errors.push({ field: 'duration', message: 'Duration must be greater than zero (minutes)' });
      } else if (duration > MAX_DURATION_MINUTES) {
        errors.push({
          field: 'duration',
          message: `Duration must be at most ${MAX_DURATION_MINUTES} minutes`,
        });
      } else {
        value.duration = duration;
      }
    }
  }

  // caloriesBurned — mandatory on create, optional on update (when supplied)
  if (!partial || has('caloriesBurned') || has('calories')) {
    const raw = has('caloriesBurned') ? source.caloriesBurned : source.calories;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      errors.push({ field: 'caloriesBurned', message: 'Calories burned is required' });
    } else {
      const calories = toFiniteNumber(raw);
      if (!Number.isFinite(calories)) {
        errors.push({ field: 'caloriesBurned', message: 'Calories burned must be a number' });
      } else if (calories < 0) {
        errors.push({ field: 'caloriesBurned', message: 'Calories burned must be zero or greater' });
      } else if (calories > MAX_CALORIES) {
        errors.push({ field: 'caloriesBurned', message: 'Calories burned value looks unrealistic' });
      } else {
        value.caloriesBurned = calories;
      }
    }
  }

  // workoutDate — mandatory on create, optional on update (when supplied)
  if (!partial || has('workoutDate') || has('date')) {
    const raw = has('workoutDate') ? source.workoutDate : source.date;
    const { date, error } = parseWorkoutDate(raw);
    if (error) {
      errors.push({ field: 'workoutDate', message: error });
    } else {
      value.workoutDate = date;
    }
  }

  return { errors, value };
}

/**
 * Build the half-open UTC day range [start, end) that contains `value`.
 *
 * Workout documents are stored as UTC instants, so the search window is
 * computed with UTC boundaries. Using `setHours()` (server-local) made the same
 * request return different rows depending on the host timezone.
 *
 * @param {string|Date} value a date-only string ("2026-09-02") or a date/instant
 * @returns {{ start: Date, end: Date }|{ error: string }}
 */
function getUtcDayRange(value) {
  const { date, error } = parseWorkoutDate(value);
  if (error) return { error };

  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}

/** Validate a :id route parameter as a MongoDB ObjectId. */
function validateObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

module.exports = {
  WORKOUT_CATEGORIES,
  MAX_NAME_LENGTH,
  validateWorkoutInput,
  validateObjectId,
  normalizeCategory,
  parseWorkoutDate,
  getUtcDayRange,
};

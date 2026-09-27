/**
 * Input validation for the Phase 3 AI endpoints.
 * Pure helpers - the controllers stay thin and the service stays AI-only.
 */

const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

const FITNESS_GOALS = [
  'Weight Loss',
  'Muscle Gain',
  'Endurance',
  'Strength',
  'Flexibility',
  'General Fitness',
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/** Match a value against an allow-list case-insensitively, return canonical. */
function matchAllowed(value, allowed) {
  const trimmed = String(value || '').trim();
  return allowed.find((item) => item.toLowerCase() === trimmed.toLowerCase()) || null;
}

function validateRecommendationInput(body = {}) {
  const errors = [];
  const value = {};
  const source = body && typeof body === 'object' ? body : {};

  const age = toFiniteNumber(source.age);
  if (source.age === undefined || source.age === null || String(source.age).trim() === '') {
    errors.push({ field: 'age', message: 'Age is required' });
  } else if (!Number.isFinite(age) || !Number.isInteger(age)) {
    errors.push({ field: 'age', message: 'Age must be a whole number' });
  } else if (age < 13 || age > 100) {
    errors.push({ field: 'age', message: 'Age must be between 13 and 100' });
  } else {
    value.age = age;
  }

  if (!isNonEmptyString(source.fitnessGoal)) {
    errors.push({ field: 'fitnessGoal', message: 'Fitness goal is required' });
  } else {
    const goal = matchAllowed(source.fitnessGoal, FITNESS_GOALS);
    if (!goal) {
      errors.push({ field: 'fitnessGoal', message: `Fitness goal must be one of: ${FITNESS_GOALS.join(', ')}` });
    } else {
      value.fitnessGoal = goal;
    }
  }

  // `experience` is accepted as a compatibility alias (the requirements
  // document's own screenshot uses it); `experienceLevel` is canonical.
  const rawExperience = isNonEmptyString(source.experienceLevel) ? source.experienceLevel : source.experience;

  if (!isNonEmptyString(rawExperience)) {
    errors.push({ field: 'experienceLevel', message: 'Experience level is required' });
  } else {
    const level = matchAllowed(rawExperience, EXPERIENCE_LEVELS);
    if (!level) {
      errors.push({ field: 'experienceLevel', message: `Experience level must be one of: ${EXPERIENCE_LEVELS.join(', ')}` });
    } else {
      value.experienceLevel = level;
    }
  }

  return { errors, value };
}

function validateInsightsInput(body = {}) {
  const errors = [];
  const value = {};
  const source = body && typeof body === 'object' ? body : {};
  const useDatabase = source.useDatabaseStats === true || String(source.useDatabaseStats || '').toLowerCase() === 'true';

  if (!useDatabase) {
    const totalWorkouts = toFiniteNumber(source.totalWorkouts);
    // `averageDuration` is accepted as a compatibility alias (the requirements
    // document's own screenshot uses it); `averageWorkoutDuration` is canonical.
    const rawAverage =
      source.averageWorkoutDuration !== undefined && source.averageWorkoutDuration !== null &&
      String(source.averageWorkoutDuration).trim() !== ''
        ? source.averageWorkoutDuration
        : source.averageDuration;
    const averageDuration = toFiniteNumber(rawAverage);
    const totalCalories = toFiniteNumber(source.totalCaloriesBurned);

    if (source.totalWorkouts === undefined || source.totalWorkouts === null || String(source.totalWorkouts).trim() === '') {
      errors.push({ field: 'totalWorkouts', message: 'totalWorkouts is required (or set useDatabaseStats: true)' });
    } else if (!Number.isFinite(totalWorkouts) || !Number.isInteger(totalWorkouts) || totalWorkouts < 0 || totalWorkouts > 100000) {
      errors.push({ field: 'totalWorkouts', message: 'totalWorkouts must be a whole number between 0 and 100000' });
    } else {
      value.totalWorkouts = totalWorkouts;
    }

    if (rawAverage === undefined || rawAverage === null || String(rawAverage).trim() === '') {
      errors.push({ field: 'averageWorkoutDuration', message: 'averageWorkoutDuration is required (or set useDatabaseStats: true)' });
    } else if (!Number.isFinite(averageDuration) || averageDuration < 0 || averageDuration > 1440) {
      errors.push({ field: 'averageWorkoutDuration', message: 'averageWorkoutDuration must be between 0 and 1440 minutes' });
    } else {
      value.averageWorkoutDuration = averageDuration;
    }

    if (source.totalCaloriesBurned === undefined || source.totalCaloriesBurned === null || String(source.totalCaloriesBurned).trim() === '') {
      errors.push({ field: 'totalCaloriesBurned', message: 'totalCaloriesBurned is required (or set useDatabaseStats: true)' });
    } else if (!Number.isFinite(totalCalories) || totalCalories < 0 || totalCalories > 10000000) {
      errors.push({ field: 'totalCaloriesBurned', message: 'totalCaloriesBurned must be zero or greater' });
    } else {
      value.totalCaloriesBurned = totalCalories;
    }

    value.useDatabaseStats = false;
  } else {
    value.useDatabaseStats = true;
  }

  return { errors, value };
}

module.exports = {
  EXPERIENCE_LEVELS,
  FITNESS_GOALS,
  validateRecommendationInput,
  validateInsightsInput,
};

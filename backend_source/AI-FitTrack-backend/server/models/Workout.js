const mongoose = require('mongoose');

/**
 * Documented workout categories. Kept in one place so the model, the
 * validation helper and the frontend select stay consistent.
 */
const WORKOUT_CATEGORIES = [
  'Cardio',
  'Strength Training',
  'Yoga',
  'Running',
  'Cycling',
  'Walking',
];

const workoutSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Workout owner is required'],
      index: true,
    },
    workoutName: {
      type: String,
      required: [true, 'Workout name is required'],
      trim: true,
      minlength: [2, 'Workout name must be at least 2 characters long'],
      maxlength: [120, 'Workout name must be at most 120 characters long'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      enum: {
        values: WORKOUT_CATEGORIES,
        message: `Category must be one of: ${WORKOUT_CATEGORIES.join(', ')}`,
      },
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be greater than zero (minutes)'],
      max: [1440, 'Duration must be at most 1440 minutes (24 hours)'],
    },
    caloriesBurned: {
      type: Number,
      required: [true, 'Calories burned is required'],
      min: [0, 'Calories burned must be zero or greater'],
      max: [20000, 'Calories burned value looks unrealistic'],
      default: 0,
    },
    workoutDate: {
      type: Date,
      required: [true, 'Workout date is required'],
    },
    // createdAt + updatedAt are added automatically by `timestamps: true`
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Consistent ordering: most recent workout date first, then newest record first.
workoutSchema.index({ user: 1, workoutDate: -1, createdAt: -1 });
// Helps the category filter used by the search endpoint.
workoutSchema.index({ user: 1, category: 1 });

/**
 * Safe representation for API responses: plain object with string ids and
 * ISO date strings. The owner id is included (the caller already owns it);
 * nothing sensitive lives on a workout document.
 */
workoutSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    _id: this._id.toString(),
    user: this.user ? this.user.toString() : undefined,
    workoutName: this.workoutName,
    category: this.category,
    duration: this.duration,
    caloriesBurned: this.caloriesBurned,
    workoutDate: this.workoutDate ? this.workoutDate.toISOString() : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Workout = mongoose.model('Workout', workoutSchema);

module.exports = Workout;
module.exports.WORKOUT_CATEGORIES = WORKOUT_CATEGORIES;

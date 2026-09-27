const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/** Shared email format check (model + controller + frontend mirror). */
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** bcrypt cost factor: 12 is a good balance between security and login speed. */
const SALT_ROUNDS = 12;

/** Minimum documented password length. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Removes the password hash from every serialised user document (defence in
 * depth: the field is also `select: false`).
 */
function stripPassword(doc, ret) {
  delete ret.password;
  return ret;
}

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [80, 'Name must be at most 80 characters long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true, // normalise email addresses consistently
      trim: true,
      validate: {
        validator: (value) => EMAIL_REGEX.test(value),
        message: 'Please provide a valid email address',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`],
      select: false, // never loaded / returned unless explicitly requested
    },
    // createdAt + updatedAt are added automatically by `timestamps: true`
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { transform: stripPassword },
    toObject: { transform: stripPassword },
  }
);

/**
 * Hash the password with bcrypt.js before it is ever stored.
 * Also runs on password changes (`user.password = ...; user.save()`).
 *
 * NOTE: mongoose 8 / kareem invokes async hooks without a `next` callback and
 * awaits the returned promise, so this hook intentionally takes no arguments.
 */
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
});

/** Compare a plain-text candidate password with the stored hash. */
userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  if (!this.password) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Safe representation of a user for API responses.
 * Matches the documented User schema minus the password hash.
 */
userSchema.methods.toSafeJSON = function toSafeJSON() {
  const id = this._id.toString();
  return {
    _id: id,
    // `id` mirrors `_id` so responses satisfy the documented user examples
    // (`user: { id, name, email }`) without breaking existing `_id` consumers.
    id,
    name: this.name,
    email: this.email,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
module.exports.EMAIL_REGEX = EMAIL_REGEX;
module.exports.MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;
module.exports.SALT_ROUNDS = SALT_ROUNDS;

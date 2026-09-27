const express = require('express');
const { register, login, getProfile, checkEmailAvailable } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.get('/email-available', checkEmailAvailable);

// Private route (requires a valid "Authorization: Bearer <token>" header)
router.get('/profile', protect, getProfile);

module.exports = router;

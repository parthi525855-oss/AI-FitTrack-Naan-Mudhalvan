const express = require('express');
const { workoutRecommendation, fitnessInsights } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Every AI endpoint requires a valid JWT (Phase 1 `protect` middleware).
router.use(protect);

router.post('/workout-recommendation', workoutRecommendation);
router.post('/fitness-insights', fitnessInsights);

module.exports = router;

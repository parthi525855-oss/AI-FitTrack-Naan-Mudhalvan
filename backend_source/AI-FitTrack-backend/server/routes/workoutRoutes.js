const express = require('express');
const {
  createWorkout,
  listWorkouts,
  searchWorkouts,
  getWorkoutById,
  updateWorkout,
  deleteWorkout,
} = require('../controllers/workoutController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Every workout endpoint requires a valid JWT (Phase 1 `protect` middleware).
router.use(protect);

router.post('/', createWorkout);
router.get('/', listWorkouts);
// The search route must be registered BEFORE the :id route, otherwise
// "search" would be captured as a workout id.
router.get('/search', searchWorkouts);
router.get('/:id', getWorkoutById);
router.put('/:id', updateWorkout);
router.delete('/:id', deleteWorkout);

module.exports = router;

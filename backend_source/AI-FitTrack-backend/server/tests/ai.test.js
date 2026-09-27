/**
 * Backend tests for the Phase 3 AI endpoints (node:test + supertest).
 * Gemini is MOCKED via geminiService.setClientOverride - no real API calls,
 * no credentials needed. Covers validation, auth, DB-derived stats,
 * no-workout handling, missing-key + failure + malformed-response paths,
 * and regression for the Phase 1/2 APIs.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDatabase, clearDatabase, stopTestDatabase } = require('./helpers/testDb');

const app = require('../app');
const geminiService = require('../services/geminiService');

const MOCK_RECOMMENDATION = {
  workoutPlan: 'Balanced beginner plan for weight loss.',
  weeklySchedule: [
    {
      day: 'Monday', focus: 'Cardio',
      exercises: [{ name: 'Brisk walking', detail: '30 minutes' }],
      durationMinutes: 30,
    },
  ],
  experienceRecommendations: 'Start light, progress gradually.',
  trainingTips: ['Warm up 5 minutes', 'Stay hydrated'],
  restAndRecovery: 'Rest 1-2 days between sessions, sleep 7-9 hours.',
  safetyGuidance: 'Stop if you feel pain or dizziness.',
  motivation: 'Small steps every week add up.',
};

const MOCK_INSIGHTS = {
  performanceSummary: 'Solid steady progress.',
  consistencyObservations: 'Training regularly each week.',
  improvementSuggestions: ['Add one extra session', 'Increase duration gradually'],
  motivationalAdvice: 'Keep going - consistency wins.',
  progressSummary: 'On track toward the goal.',
};

function mockGeminiWith(payload) {
  geminiService.setClientOverride({
    models: { generateContent: async () => ({ text: JSON.stringify(payload) }) },
  });
}

function mockGeminiRawText(text) {
  geminiService.setClientOverride({
    models: { generateContent: async () => ({ text }) },
  });
}

function mockGeminiFailure(message = 'upstream exploded') {
  geminiService.setClientOverride({
    models: { generateContent: async () => { throw new Error(message); } },
  });
}

function restoreGemini() {
  geminiService.setClientOverride(null);
}

test.before(async () => {
  await startTestDatabase();
  process.env.GEMINI_API_KEY = 'test-key-for-mocked-suite';
});

test.after(async () => {
  restoreGemini();
  delete process.env.GEMINI_API_KEY;
  await stopTestDatabase();
});

test.beforeEach(async () => {
  await clearDatabase();
  restoreGemini();
  geminiService.setRetryOverrides(null);
  process.env.GEMINI_API_KEY = 'test-key-for-mocked-suite';
  require('../controllers/aiController').clearAiRateLimits();
});

async function registerUser({ name = 'Alex Johnson', email = 'alex@example.com', password = 'secret123' } = {}) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password });
  assert.equal(res.status, 201);
  return { token: res.body.data.token, user: res.body.data.user };
}

const validRecommendation = () => ({ age: 22, fitnessGoal: 'Weight Loss', experienceLevel: 'Beginner' });
const validStats = () => ({ totalWorkouts: 15, averageWorkoutDuration: 45, totalCaloriesBurned: 3200 });

test('POST /api/ai/workout-recommendation returns a structured plan (mocked Gemini)', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_RECOMMENDATION);
  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send(validRecommendation());
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.recommendation.workoutPlan, MOCK_RECOMMENDATION.workoutPlan);
  assert.ok(Array.isArray(res.body.data.recommendation.weeklySchedule));
  assert.ok(Array.isArray(res.body.data.recommendation.trainingTips));
  assert.ok(res.body.data.recommendation.safetyGuidance);
  assert.ok(res.body.data.recommendation.motivation);
  assert.deepEqual(res.body.data.input, validRecommendation());
});

test('recommendation rejects missing fields (400)', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_RECOMMENDATION);
  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send({ age: 22 });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('recommendation rejects invalid age (400)', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_RECOMMENDATION);
  for (const age of [5, 200, 'old', -3]) {
    const res = await request(app)
      .post('/api/ai/workout-recommendation')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validRecommendation(), age });
    assert.equal(res.status, 400, `age=${age} should be rejected`);
  }
});

test('recommendation rejects invalid experience level (400)', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_RECOMMENDATION);
  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...validRecommendation(), experienceLevel: 'Expert' });
  assert.equal(res.status, 400);
});

test('recommendation accepts the documented `experience` alias', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_RECOMMENDATION);
  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send({ age: 22, fitnessGoal: 'Weight Loss', experience: 'Beginner' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.input.experienceLevel, 'Beginner');
});

test('recommendation rejects unauthorized requests (401)', async () => {
  mockGeminiWith(MOCK_RECOMMENDATION);
  const res = await request(app).post('/api/ai/workout-recommendation').send(validRecommendation());
  assert.equal(res.status, 401);
});

test('POST /api/ai/fitness-insights works with documented stats (mocked)', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_INSIGHTS);
  const res = await request(app)
    .post('/api/ai/fitness-insights')
    .set('Authorization', `Bearer ${token}`)
    .send(validStats());
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.statsSource, 'submitted');
  assert.deepEqual(res.body.data.stats, validStats());
  assert.equal(res.body.data.insights.performanceSummary, MOCK_INSIGHTS.performanceSummary);
});

test('insights reject invalid statistics (400)', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_INSIGHTS);
  for (const payload of [
    { ...validStats(), totalWorkouts: -1 },
    { ...validStats(), averageWorkoutDuration: 9999 },
    { ...validStats(), totalCaloriesBurned: -50 },
    {},
  ]) {
    const res = await request(app)
      .post('/api/ai/fitness-insights')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    assert.equal(res.status, 400);
  }
});

test('insights accept the documented `averageDuration` alias', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_INSIGHTS);
  const res = await request(app)
    .post('/api/ai/fitness-insights')
    .set('Authorization', `Bearer ${token}`)
    .send({ totalWorkouts: 18, averageDuration: 45, totalCaloriesBurned: 6200 });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.stats.totalWorkouts, 18);
  assert.equal(res.body.data.stats.averageWorkoutDuration, 45);
  assert.equal(res.body.data.stats.totalCaloriesBurned, 6200);
});

test('insights reject unauthorized requests (401)', async () => {
  mockGeminiWith(MOCK_INSIGHTS);
  const res = await request(app).post('/api/ai/fitness-insights').send(validStats());
  assert.equal(res.status, 401);
});

test('insights use verified MongoDB stats with useDatabaseStats', async () => {
  const { token } = await registerUser();
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  await auth(request(app).post('/api/workouts')).send({
    workoutName: 'Morning Run', category: 'Running', duration: 30,
    caloriesBurned: 300, workoutDate: '2026-09-01',
  });
  await auth(request(app).post('/api/workouts')).send({
    workoutName: 'Evening Yoga', category: 'Yoga', duration: 60,
    caloriesBurned: 200, workoutDate: '2026-09-02',
  });
  mockGeminiWith(MOCK_INSIGHTS);
  const res = await auth(request(app).post('/api/ai/fitness-insights')).send({ useDatabaseStats: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.statsSource, 'database');
  assert.equal(res.body.data.stats.totalWorkouts, 2);
  assert.equal(res.body.data.stats.totalCaloriesBurned, 500);
  assert.equal(res.body.data.stats.averageWorkoutDuration, 45);
});

test('insights handle users with no workouts gracefully', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_INSIGHTS);
  const res = await request(app)
    .post('/api/ai/fitness-insights')
    .set('Authorization', `Bearer ${token}`)
    .send({ useDatabaseStats: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.statsSource, 'database');
  assert.equal(res.body.data.stats.totalWorkouts, 0);
  assert.equal(res.body.data.insights, null);
  assert.match(res.body.message, /No workouts found/i);
});

test('missing GEMINI_API_KEY returns 503 without leaking internals', async () => {
  const { token } = await registerUser();
  delete process.env.GEMINI_API_KEY;
  restoreGemini();
  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send(validRecommendation());
  assert.equal(res.status, 503);
  assert.equal(res.body.success, false);
  assert.doesNotMatch(JSON.stringify(res.body), /AIza|test-key-for-mocked/i);
});

test('Gemini API failure returns 502 and never claims success', async () => {
  const { token } = await registerUser();
  mockGeminiFailure('upstream exploded');
  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send(validRecommendation());
  assert.equal(res.status, 502);
  assert.equal(res.body.success, false);
  assert.doesNotMatch(JSON.stringify(res.body), /upstream exploded/);
});

test('malformed Gemini response is rejected gracefully (502)', async () => {
  const { token } = await registerUser();
  mockGeminiRawText('this is definitely not JSON {{{');
  const res = await request(app)
    .post('/api/ai/fitness-insights')
    .set('Authorization', `Bearer ${token}`)
    .send(validStats());
  assert.equal(res.status, 502);
  assert.equal(res.body.success, false);
});

test('incomplete Gemini response is rejected gracefully (502)', async () => {
  const { token } = await registerUser();
  mockGeminiWith({ workoutPlan: 'only one field' });
  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send(validRecommendation());
  assert.equal(res.status, 502);
  assert.equal(res.body.success, false);
});

test('AI rate limiting rejects bursts with 429', async () => {
  const { clearAiRateLimits } = require('../controllers/aiController');
  const { token } = await registerUser();
  mockGeminiWith(MOCK_RECOMMENDATION);
  clearAiRateLimits();
  process.env.AI_RATE_LIMIT_PER_MINUTE = '2';
  const statuses = [];
  for (let i = 0; i < 4; i++) {
    const res = await request(app)
      .post('/api/ai/workout-recommendation')
      .set('Authorization', `Bearer ${token}`)
      .send(validRecommendation());
    statuses.push(res.status);
  }
  delete process.env.AI_RATE_LIMIT_PER_MINUTE;
  clearAiRateLimits();
  assert.deepEqual(statuses, [200, 200, 429, 429]);
});

test('Phase 1 + 2 regression: auth, profile and workout CRUD still work', async () => {
  const { token } = await registerUser({ email: 'regression@example.com' });
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const profile = await auth(request(app).get('/api/auth/profile'));
  assert.equal(profile.status, 200);
  const created = await auth(request(app).post('/api/workouts')).send({
    workoutName: 'Regression Run', category: 'Running', duration: 20,
    caloriesBurned: 150, workoutDate: '2026-09-05',
  });
  assert.equal(created.status, 201);
  const list = await auth(request(app).get('/api/workouts'));
  assert.equal(list.body.data.count, 1);
});

test('recommendation rejects an unknown fitnessGoal (400 with a field error)', async () => {
  const { token } = await registerUser();
  mockGeminiWith(MOCK_RECOMMENDATION);
  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...validRecommendation(), fitnessGoal: 'Become a superhero' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errors[0].field, 'fitnessGoal');
});

test('useDatabaseStats derives accurate stats from the caller records only', async () => {
  const a = await registerUser({ name: 'Stats Alice', email: 'stats-a@example.com' });
  const b = await registerUser({ name: 'Stats Bob', email: 'stats-b@example.com' });
  mockGeminiWith(MOCK_INSIGHTS);
  const add = (token, body) =>
    request(app).post('/api/workouts').set('Authorization', `Bearer ${token}`).send(body);

  await add(a.token, { workoutName: 'Run one', category: 'Running', duration: 30, caloriesBurned: 300, workoutDate: '2026-09-01' });
  await add(a.token, { workoutName: 'Run two', category: 'Running', duration: 50, caloriesBurned: 500, workoutDate: '2026-09-02' });
  await add(a.token, { workoutName: 'Yoga flow', category: 'Yoga', duration: 40, caloriesBurned: 200, workoutDate: '2026-09-03' });
  // Another user's much larger record must never leak into Alice's statistics.
  await add(b.token, { workoutName: 'Big ride', category: 'Cycling', duration: 120, caloriesBurned: 9000, workoutDate: '2026-09-01' });

  const resA = await request(app)
    .post('/api/ai/fitness-insights')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ useDatabaseStats: true });
  assert.equal(resA.status, 200);
  assert.equal(resA.body.data.statsSource, 'database');
  assert.deepEqual(resA.body.data.stats, { totalWorkouts: 3, averageWorkoutDuration: 40, totalCaloriesBurned: 1000 });

  const resB = await request(app)
    .post('/api/ai/fitness-insights')
    .set('Authorization', `Bearer ${b.token}`)
    .send({ useDatabaseStats: true });
  assert.equal(resB.status, 200);
  assert.deepEqual(resB.body.data.stats, { totalWorkouts: 1, averageWorkoutDuration: 120, totalCaloriesBurned: 9000 });
  assert.notDeepEqual(resA.body.data.stats, resB.body.data.stats);
});

test('exhausted retries surface as a standardized 503 with code + attempts', async () => {
  const { token } = await registerUser();
  let calls = 0;
  geminiService.setRetryOverrides({ maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5, jitterRatio: 0, sleep: async () => {} });
  geminiService.setClientOverride({
    models: {
      generateContent: async () => {
        calls += 1;
        const error = new Error('The model is overloaded (high demand).');
        error.status = 503;
        throw error;
      },
    },
  });

  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send(validRecommendation());
  geminiService.setRetryOverrides(null);

  assert.equal(calls, 2);
  assert.equal(res.status, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.attempts, 2);
  assert.equal(res.body.code, 'GEMINI_REQUEST_FAILED');
  assert.doesNotMatch(JSON.stringify(res.body), /AIza|test-key-for-mocked/i);
});

test('a long Retry-After becomes a fail-fast 429 with a Retry-After header', async () => {
  const { token } = await registerUser();
  let calls = 0;
  const sleeps = [];
  geminiService.setRetryOverrides({ maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, jitterRatio: 0, sleep: async (ms) => { sleeps.push(ms); } });
  geminiService.setClientOverride({
    models: {
      generateContent: async () => {
        calls += 1;
        const error = new Error('Quota exceeded (429).');
        error.status = 429;
        error.response = { headers: { 'retry-after': '60' } };
        throw error;
      },
    },
  });

  const res = await request(app)
    .post('/api/ai/fitness-insights')
    .set('Authorization', `Bearer ${token}`)
    .send(validStats());
  geminiService.setRetryOverrides(null);

  assert.equal(calls, 1); // never hammered
  assert.deepEqual(sleeps, []); // we refuse to hold the request that long
  assert.equal(res.status, 429);
  assert.equal(res.headers['retry-after'], '60');
  assert.equal(res.body.retryAfterSeconds, 60);
  assert.equal(res.body.code, 'GEMINI_RATE_LIMIT');
});

test('a non-retryable Gemini failure (invalid API key) is attempted only once', async () => {
  const { token } = await registerUser();
  let calls = 0;
  geminiService.setRetryOverrides({ maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, jitterRatio: 0, sleep: async () => {} });
  geminiService.setClientOverride({
    models: {
      generateContent: async () => {
        calls += 1;
        const error = new Error('API key not valid. Please pass a valid API key.');
        error.status = 400;
        throw error;
      },
    },
  });

  const res = await request(app)
    .post('/api/ai/workout-recommendation')
    .set('Authorization', `Bearer ${token}`)
    .send(validRecommendation());
  geminiService.setRetryOverrides(null);

  assert.equal(calls, 1);
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'GEMINI_AUTH_ERROR');
  assert.equal(res.body.attempts, 1);
});




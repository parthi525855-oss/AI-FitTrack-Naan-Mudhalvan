/**
 * Backend tests for the Phase 2 workout endpoints (node:test + supertest).
 * Covers CRUD, validation, ownership isolation, search and auth enforcement.
 * Runs against mongodb-memory-server — never touches the Atlas cluster.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDatabase, clearDatabase, stopTestDatabase } = require('./helpers/testDb');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-0123456789abcdef0123456789abcdef';

const app = require('../app');
const Workout = require('../models/Workout');

test.before(async () => {
  await startTestDatabase();
});

test.after(async () => {
  await stopTestDatabase();
});

test.beforeEach(async () => {
  await clearDatabase();
});

async function registerUser({ name = 'Alex Johnson', email = 'alex@example.com', password = 'secret123' } = {}) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password });
  assert.equal(res.status, 201);
  return { token: res.body.data.token, user: res.body.data.user };
}

const validWorkout = (overrides = {}) => ({
  workoutName: 'Morning Run',
  category: 'Running',
  duration: 30,
  caloriesBurned: 280,
  workoutDate: '2026-09-01',
  ...overrides,
});

test('POST /api/workouts creates a workout for the authenticated user', async () => {
  const { token, user } = await registerUser();
  const res = await request(app)
    .post('/api/workouts')
    .set('Authorization', `Bearer ${token}`)
    .send(validWorkout());

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.workout.workoutName, 'Morning Run');
  assert.equal(res.body.data.workout.user, user._id);

  const stored = await Workout.findById(res.body.data.workout._id);
  assert.ok(stored);
  assert.equal(stored.user.toString(), user._id);
});

test('POST /api/workouts rejects unauthenticated requests', async () => {
  const res = await request(app).post('/api/workouts').send(validWorkout());
  assert.equal(res.status, 401);
});

test('POST /api/workouts rejects invalid input', async () => {
  const { token } = await registerUser();
  const cases = [
    [{ ...validWorkout(), workoutName: '' }, 400],
    [{ ...validWorkout(), category: 'Swimming' }, 400],
    [{ ...validWorkout(), duration: 0 }, 400],
    [{ ...validWorkout(), caloriesBurned: -5 }, 400],
    [{ ...validWorkout(), workoutDate: 'not-a-date' }, 400],
  ];
  for (const [payload, status] of cases) {
    const res = await request(app)
      .post('/api/workouts')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    assert.equal(res.status, status);
    assert.equal(res.body.success, false);
  }
});

test('GET /api/workouts returns history ordered by workout date', async () => {
  const { token } = await registerUser();
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  await auth(request(app).post('/api/workouts')).send(validWorkout({ workoutName: 'Older', workoutDate: '2026-08-01' }));
  await auth(request(app).post('/api/workouts')).send(validWorkout({ workoutName: 'Newer', workoutDate: '2026-09-10' }));

  const res = await auth(request(app).get('/api/workouts'));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.count, 2);
  assert.equal(res.body.data.workouts[0].workoutName, 'Newer');
  assert.equal(res.body.data.workouts[1].workoutName, 'Older');
});

test('workout records are isolated per user', async () => {
  const alice = await registerUser({ name: 'Alice', email: 'alice@example.com' });
  const bob = await registerUser({ name: 'Bob', email: 'bob@example.com' });

  const created = await request(app)
    .post('/api/workouts')
    .set('Authorization', `Bearer ${alice.token}`)
    .send(validWorkout({ workoutName: 'Alice run' }));
  assert.equal(created.status, 201);
  const id = created.body.data.workout._id;

  const bobList = await request(app).get('/api/workouts').set('Authorization', `Bearer ${bob.token}`);
  assert.equal(bobList.body.data.count, 0);

  for (const [method, path, body] of [
    ['get', `/api/workouts/${id}`, undefined],
    ['put', `/api/workouts/${id}`, { workoutName: 'Hijacked' }],
    ['delete', `/api/workouts/${id}`, undefined],
  ]) {
    let req = request(app)[method](path).set('Authorization', `Bearer ${bob.token}`);
    if (body) req = req.send(body);
    const res = await req;
    assert.equal(res.status, 404);
  }
});

test('GET /api/workouts/search filters by name, category and date', async () => {
  const { token } = await registerUser();
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  await auth(request(app).post('/api/workouts')).send(validWorkout({ workoutName: 'Morning Run', category: 'Running', workoutDate: '2026-09-01' }));
  await auth(request(app).post('/api/workouts')).send(validWorkout({ workoutName: 'Evening Yoga', category: 'Yoga', workoutDate: '2026-09-02' }));

  const byName = await auth(request(app).get('/api/workouts/search?name=morning'));
  assert.equal(byName.body.data.count, 1);

  const byCategory = await auth(request(app).get('/api/workouts/search?category=Yoga'));
  assert.equal(byCategory.body.data.count, 1);
  assert.equal(byCategory.body.data.workouts[0].category, 'Yoga');

  const byDate = await auth(request(app).get('/api/workouts/search?date=2026-09-02'));
  assert.equal(byDate.body.data.count, 1);

  const combined = await auth(request(app).get('/api/workouts/search?name=run&category=Running&date=2026-09-01'));
  assert.equal(combined.body.data.count, 1);

  const none = await auth(request(app).get('/api/workouts/search?name=zzz-no-match'));
  assert.equal(none.body.data.count, 0);

  const badCategory = await auth(request(app).get('/api/workouts/search?category=Swimming'));
  assert.equal(badCategory.status, 400);
});

test('GET /api/workouts honours the documented search query params (name, category, date)', async () => {
  const { token } = await registerUser();
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  await auth(request(app).post('/api/workouts')).send(validWorkout({ workoutName: 'Morning Run', category: 'Running', workoutDate: '2026-09-01' }));
  await auth(request(app).post('/api/workouts')).send(validWorkout({ workoutName: 'Evening Yoga', category: 'Yoga', workoutDate: '2026-09-05' }));

  // No params -> full history, no filters echo (backward compatible).
  const all = await auth(request(app).get('/api/workouts'));
  assert.equal(all.status, 200);
  assert.equal(all.body.data.count, 2);
  assert.equal(all.body.data.filters, undefined);

  const byCategory = await auth(request(app).get('/api/workouts').query({ category: 'Running' }));
  assert.equal(byCategory.status, 200);
  assert.equal(byCategory.body.data.count, 1);
  assert.equal(byCategory.body.data.workouts[0].workoutName, 'Morning Run');
  assert.deepEqual(byCategory.body.data.filters, { category: 'Running' });

  const byName = await auth(request(app).get('/api/workouts').query({ name: 'yoga' }));
  assert.equal(byName.status, 200);
  assert.equal(byName.body.data.count, 1);
  assert.equal(byName.body.data.workouts[0].workoutName, 'Evening Yoga');

  const byDate = await auth(request(app).get('/api/workouts').query({ date: '2026-09-05' }));
  assert.equal(byDate.status, 200);
  assert.equal(byDate.body.data.count, 1);
  assert.equal(byDate.body.data.workouts[0].workoutName, 'Evening Yoga');

  const invalidCategory = await auth(request(app).get('/api/workouts').query({ category: 'Swimming' }));
  assert.equal(invalidCategory.status, 400);
});

test('GET /api/workouts/:id returns one owned workout; invalid ids are rejected', async () => {
  const { token } = await registerUser();
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const created = await auth(request(app).post('/api/workouts')).send(validWorkout());
  const id = created.body.data.workout._id;

  const ok = await auth(request(app).get(`/api/workouts/${id}`));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.workout._id, id);

  const invalid = await auth(request(app).get('/api/workouts/not-an-id'));
  assert.equal(invalid.status, 400);

  const missing = await auth(request(app).get('/api/workouts/000000000000000000000000'));
  assert.equal(missing.status, 404);

  const unauth = await request(app).get(`/api/workouts/${id}`);
  assert.equal(unauth.status, 401);
});

test('PUT /api/workouts/:id persists changes and rejects bad input', async () => {
  const { token } = await registerUser();
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const created = await auth(request(app).post('/api/workouts')).send(validWorkout());
  const id = created.body.data.workout._id;

  const updated = await auth(request(app).put(`/api/workouts/${id}`)).send({
    workoutName: 'Updated Run',
    duration: 45,
    caloriesBurned: 350,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.workout.workoutName, 'Updated Run');
  assert.equal(updated.body.data.workout.duration, 45);

  const badUpdate = await auth(request(app).put(`/api/workouts/${id}`)).send({ duration: -10 });
  assert.equal(badUpdate.status, 400);

  const emptyUpdate = await auth(request(app).put(`/api/workouts/${id}`)).send({});
  assert.equal(emptyUpdate.status, 400);
});

test('DELETE /api/workouts/:id removes the record', async () => {
  const { token } = await registerUser();
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const created = await auth(request(app).post('/api/workouts')).send(validWorkout());
  const id = created.body.data.workout._id;

  const deleted = await auth(request(app).delete(`/api/workouts/${id}`));
  assert.equal(deleted.status, 200);

  const gone = await auth(request(app).get(`/api/workouts/${id}`));
  assert.equal(gone.status, 404);
  assert.equal(await Workout.countDocuments({}), 0);
});

test('client-supplied user ids are ignored (owner comes from the JWT)', async () => {
  const alice = await registerUser({ name: 'Alice', email: 'alice@example.com' });
  const bob = await registerUser({ name: 'Bob', email: 'bob@example.com' });

  const res = await request(app)
    .post('/api/workouts')
    .set('Authorization', `Bearer ${alice.token}`)
    .send({ ...validWorkout(), user: bob.user._id });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.workout.user, alice.user._id);
});

test('search by date uses UTC day boundaries (timezone-independent regression)', async () => {
  const { token } = await registerUser();
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // Late in the UTC day. The old server-local window (18:30Z -> 18:30Z on an IST
  // host) excluded this record completely, so the same request returned
  // different rows depending on the machine's timezone.
  await auth(request(app).post('/api/workouts')).send(
    validWorkout({ workoutName: 'Late UTC session', workoutDate: '2026-09-02T20:00:00.000Z' })
  );
  // This instant belongs to the previous UTC day and must stay out of 2026-09-02.
  await auth(request(app).post('/api/workouts')).send(
    validWorkout({ workoutName: 'Previous UTC day', workoutDate: '2026-09-01T20:30:00.000Z' })
  );

  const sameUtcDay = await auth(request(app).get('/api/workouts/search?date=2026-09-02'));
  assert.equal(sameUtcDay.status, 200);
  assert.equal(sameUtcDay.body.data.count, 1);
  assert.equal(sameUtcDay.body.data.workouts[0].workoutName, 'Late UTC session');
  assert.equal(sameUtcDay.body.data.filters.date, '2026-09-02');

  const previousUtcDay = await auth(request(app).get('/api/workouts/search?date=2026-09-01'));
  assert.equal(previousUtcDay.body.data.count, 1);
  assert.equal(previousUtcDay.body.data.workouts[0].workoutName, 'Previous UTC day');

  const emptyDay = await auth(request(app).get('/api/workouts/search?date=2026-09-03'));
  assert.equal(emptyDay.body.data.count, 0);
});
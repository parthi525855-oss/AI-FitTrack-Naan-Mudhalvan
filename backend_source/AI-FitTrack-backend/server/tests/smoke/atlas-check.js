/**
 * Live Phase 1 verification against the MongoDB Atlas cluster configured in
 * server/.env  (the only check that cannot run in CI, because it needs your
 * real credentials).
 *
 * Usage:  cd server && npm run test:atlas
 *
 * What it does:
 *  1. connects through the shared config/db.js module (proves Atlas connectivity)
 *  2. boots the Express app on an ephemeral port and exercises the full auth
 *     workflow over real HTTP: health -> register -> duplicate -> invalid email
 *     -> login -> wrong password -> profile (with/without JWT)
 *  3. inspects the stored document to prove the password is a bcrypt hash
 *  4. deletes the temporary user it created (your cluster stays clean)
 *
 * It never prints your connection string, and it exits with code 0 only when
 * every check passes.
 */
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../../config/db');
const app = require('../../app');
const User = require('../../models/User');

const PLACEHOLDER_PATTERN = /your_mongodb_connection_string/i;
const TEST_EMAIL = `phase1.check.${Date.now()}@example.com`;
const TEST_PASSWORD = 'secret123';

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

function apiRequest(baseUrl, pathname, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${baseUrl}/api${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

(async () => {
  const uri = process.env.MONGO_URI || '';
  if (!uri.trim() || PLACEHOLDER_PATTERN.test(uri)) {
    console.error(
      '\nMONGO_URI is not configured yet.\n' +
        'Open server/.env and replace "your_mongodb_connection_string" with your MongoDB Atlas\n' +
        'connection string (Atlas -> Cluster -> Connect -> Drivers), then run this again.\n'
    );
    process.exit(2);
  }

  let server;
  let token;

  try {
    // 1. Atlas connectivity (uses the same module the API uses at startup)
    await connectDB();
    check('config/db.js connects to MongoDB Atlas', mongoose.connection.readyState === 1);

    // 2. full auth workflow over real HTTP
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const health = await apiRequest(baseUrl, '/health');
    const healthBody = await health.json();
    check('GET /api/health -> 200 ok', health.status === 200 && healthBody.data.status === 'ok');

    const register = await apiRequest(baseUrl, '/auth/register', {
      method: 'POST',
      body: { name: 'Phase One Check', email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const registerBody = await register.json();
    check('POST /api/auth/register -> 201', register.status === 201, registerBody.message);
    check('registration returns a JWT', typeof registerBody.data?.token === 'string');
    check('registration omits the password hash', registerBody.data?.user?.password === undefined);

    const duplicate = await apiRequest(baseUrl, '/auth/register', {
      method: 'POST',
      body: { name: 'Phase One Check', email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    check('duplicate email -> 409', duplicate.status === 409);

    const invalidEmail = await apiRequest(baseUrl, '/auth/register', {
      method: 'POST',
      body: { name: 'X', email: 'not-an-email', password: TEST_PASSWORD },
    });
    check('invalid email -> 400', invalidEmail.status === 400);
    const login = await apiRequest(baseUrl, '/auth/login', {
      method: 'POST',
      body: { email: TEST_EMAIL.toUpperCase(), password: TEST_PASSWORD },
    });
    const loginBody = await login.json();
    check('POST /api/auth/login -> 200 (email case-insensitive)', login.status === 200, loginBody.message);
    token = loginBody.data?.token;

    const wrongPassword = await apiRequest(baseUrl, '/auth/login', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: 'definitely-wrong' },
    });
    check('wrong password -> 401', wrongPassword.status === 401);

    const profile = await apiRequest(baseUrl, '/auth/profile', { token });
    const profileBody = await profile.json();
    check('GET /api/auth/profile with JWT -> 200', profile.status === 200, profileBody.message);
    check('profile returns the authenticated user', profileBody.data?.user?.email === TEST_EMAIL);
    check('profile omits the password hash', profileBody.data?.user?.password === undefined);
    check(
      'profile contains timestamps',
      Boolean(profileBody.data?.user?.createdAt && profileBody.data?.user?.updatedAt)
    );

    const noToken = await apiRequest(baseUrl, '/auth/profile');
    check('GET /api/auth/profile without JWT -> 401', noToken.status === 401);

    // 3. the stored document really contains a bcrypt hash
    const stored = await User.findOne({ email: TEST_EMAIL }).select('+password');
    check('user document stored in Atlas', Boolean(stored));
    check('password stored as a bcrypt hash', /^\$2[aby]\$\d{2}\$/.test(stored?.password || ''));
    check('stored password is not the plain text', stored?.password !== TEST_PASSWORD);

    // 4. clean up: delete the temporary user and prove its token stops working
    await User.deleteOne({ email: TEST_EMAIL });
    const afterDelete = await apiRequest(baseUrl, '/auth/profile', { token });
    check('token of a deleted user -> 401', afterDelete.status === 401);
    check('temporary user removed from Atlas', (await User.countDocuments({ email: TEST_EMAIL })) === 0);
  } catch (error) {
    check('live Atlas verification completed without exceptions', false, error.message);
  } finally {
    // Safety net: never leave the test account behind.
    try {
      if (mongoose.connection.readyState === 1) await User.deleteOne({ email: TEST_EMAIL });
    } catch {
      /* ignore */
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nATLAS VERIFICATION SUMMARY: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('Failed checks:');
    failed.forEach((result) => console.log(` - ${result.name}`));
  }
  process.exit(failed.length === 0 ? 0 : 1);
})();

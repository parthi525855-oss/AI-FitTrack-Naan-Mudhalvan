/**
 * Temporary end-to-end smoke test:
 * boots the real server.js against a throwaway MongoDB instance and exercises
 * health, register, login, profile, 401 handling and CORS over real HTTP.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const PORT = 5099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = 'smoke-test-secret-0123456789abcdef0123456789abcdef';

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

async function waitForServer(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function post(pathname, body, headers = {}) {
  return fetch(`${BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

(async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('ai-fittrack-smoke');

  const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      MONGO_URI: uri,
      // Isolate the boot from developer-machine overrides in server/.env.
      MONGO_USER: '',
      MONGO_PASSWORD: '',
      MONGO_AUTH_SOURCE: 'admin',
      DNS_SERVERS: '',
      MONGO_FORCE_IPV4: '',
      GEMINI_API_KEY: '',
      JWT_SECRET,
      JWT_EXPIRES_IN: '1d',
      CLIENT_URL: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server:err] ${chunk}`));

  try {
    const up = await waitForServer();
    check('server boots after a successful MongoDB connection', up);
    if (!up) throw new Error('server did not start');

    const health = await fetch(`${BASE_URL}/api/health`);
    const healthBody = await health.json();
    check('GET /api/health -> 200 ok', health.status === 200 && healthBody.data.status === 'ok');

    const register = await post('/api/auth/register', {
      name: 'Smoke Tester',
      email: 'Smoke.Tester@Example.com',
      password: 'secret123',
    });
    const registerBody = await register.json();
    check('POST /api/auth/register -> 201', register.status === 201, registerBody.message);
    check('registration returns a JWT', typeof registerBody.data?.token === 'string');
    check('registration never returns the password hash', registerBody.data?.user?.password === undefined);

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    const stored = await mongoose.connection.collection('users').findOne({ email: 'smoke.tester@example.com' });
    check('password stored as a bcrypt hash', /^\$2[aby]\$\d{2}\$/.test(stored?.password || ''));
    check('email normalised to lowercase', stored?.email === 'smoke.tester@example.com');

    const duplicate = await post('/api/auth/register', {
      name: 'Smoke Tester',
      email: 'smoke.tester@example.com',
      password: 'secret123',
    });
    check('duplicate registration -> 409', duplicate.status === 409);

    const badEmail = await post('/api/auth/register', { name: 'X', email: 'nope', password: 'secret123' });
    check('invalid email -> 400', badEmail.status === 400);

    const login = await post('/api/auth/login', { email: 'SMOKE.TESTER@example.com', password: 'secret123' });
    const loginBody = await login.json();
    check('POST /api/auth/login -> 200', login.status === 200, loginBody.message);
    const token = loginBody.data?.token;

    const wrongPassword = await post('/api/auth/login', {
      email: 'smoke.tester@example.com',
      password: 'wrong',
    });
    check('wrong password -> 401', wrongPassword.status === 401);

    const profile = await fetch(`${BASE_URL}/api/auth/profile`, { headers: { Authorization: `Bearer ${token}` } });
    const profileBody = await profile.json();
    check('GET /api/auth/profile with JWT -> 200', profile.status === 200, profileBody.message);
    check('profile is the authenticated user', profileBody.data?.user?.email === 'smoke.tester@example.com');
    check('profile omits the password hash', profileBody.data?.user?.password === undefined);

    const noToken = await fetch(`${BASE_URL}/api/auth/profile`);
    check('GET /api/auth/profile without JWT -> 401', noToken.status === 401);

    const allowedCors = await fetch(`${BASE_URL}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
    check(
      'CORS allows the configured CLIENT_URL',
      allowedCors.headers.get('access-control-allow-origin') === 'http://localhost:5173'
    );

    const blockedCors = await fetch(`${BASE_URL}/api/health`, { headers: { Origin: 'http://evil.example.com' } });
    check('CORS blocks an unknown origin', blockedCors.status === 403, `status=${blockedCors.status}`);

    await mongoose.disconnect();
  } catch (error) {
    check('smoke test completed without exceptions', false, error.message);
  } finally {
    child.kill();
    try {
      // stderr "injected env (0) from .env" is dotenv's own notice on the
      // child process's stderr - not a failure signal.
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await mongod.stop();
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nSMOKE SUMMARY: ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
})();

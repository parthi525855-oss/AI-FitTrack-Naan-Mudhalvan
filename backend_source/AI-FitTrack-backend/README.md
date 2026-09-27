# AI FitTrack API (backend-only)

Backend-only REST API: registered users securely manage workout records and obtain AI-generated fitness insights (Google Gemini).

**Phase 4 (this release): final backend delivery — full API review, Postman collection, security review, and the complete automated test suite.** Backend-only repository: no frontend is included.

## Problem statement

Fitness enthusiasts need a single place to log workouts, see accurate progress statistics, and get personalized guidance — but raw data alone is hard to act on. AI FitTrack solves this with a secure REST API (JWT authentication, per-user data isolation) that stores workout history in MongoDB and uses Google Gemini to turn a user's profile and statistics into structured workout plans and fitness insights.

```
AI-FitTrack-API/                (this repository root: e:\AIFITTRACK_NM)
├── server/                     Express + MongoDB (Mongoose) REST API
│   ├── config/db.js
│   ├── controllers/{authController, workoutController, aiController}.js
│   ├── models/{User, Workout}.js
│   ├── routes/{authRoutes, workoutRoutes, aiRoutes}.js
│   ├── middleware/{authMiddleware.js, errorMiddleware.js}
│   ├── services/{jwtService, geminiService}.js
│   ├── utils/
│   ├── tests/
│   ├── postman/AI-FitTrack.postman_collection.json
│   ├── app.js
│   ├── server.js
│   ├── .env.example
│   └── package.json
├── .gitignore
├── package.json                 root convenience scripts (npm start/test proxy into server/)
└── README.md
```

## Technology stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js LTS (verified on v24.18.0), Express 5, JavaScript |
| Database | MongoDB Atlas + Mongoose 9 |
| Auth | JSON Web Tokens (jsonwebtoken) + bcrypt.js |
| AI | Google Gemini API via the official `@google/genai` SDK (**implemented in Phase 3**) |
| Testing | `node:test` + Supertest + mongodb-memory-server (API) |

## Backend architecture

```
HTTP client (Postman / curl / any REST consumer)
  → server.js            boot: loads env, connects MongoDB (config/db.js), starts listening ONLY after connect
  → app.js               CORS(CLIENT_URL), JSON parsing, route mounting, 404 + error middleware
      /api/auth   authRoutes.js  → protect? → authController   → User model      → jwtService / bcryptjs
      /api/workouts workoutRoutes.js (all behind protect) → workoutController → Workout model
      /api/ai     aiRoutes.js    (all behind protect)     → aiController       → geminiService → Gemini API
  → middleware/authMiddleware.js   verify Bearer JWT, re-read the user, set req.user (never trust client ids)
  → middleware/errorMiddleware.js  single funnel: validation / duplicate / cast / JSON / 404 → {success,message,errors[]}
```

Layering: **routes** declare paths and middleware · **controllers** orchestrate validation + use-cases · **models** own schema, indexes and hashing · **services** wrap external concerns (JWT, Gemini) · **utils** hold pure validation/response helpers · **config** owns the DB connection. Every response uses the same envelope (`{success, message, data}` or `{success, message, errors[]}`).

## Database schemas

**User** (`server/models/User.js`) — `name` (required) · `email` (required, unique, trimmed + lower-cased, format-validated) · `password` (required, ≥ 6 chars, bcrypt cost 12, `select: false`, stripped from all responses) · `createdAt` / `updatedAt` (automatic timestamps).

**Workout** (`server/models/Workout.js`) — `user` (ObjectId → `users`, required, the authenticated owner) · `workoutName` (required, 2–120 chars) · `category` (enum: Cardio, Strength Training, Yoga, Running, Cycling, Walking) · `duration` (minutes, integer 1–1440) · `caloriesBurned` (integer 0–20000) · `workoutDate` (valid date) · `createdAt` / `updatedAt` (automatic timestamps). Indexes: `{user: 1, workoutDate: -1, createdAt: -1}` for the history feed and `{user: 1, category: 1}` for filtered search.

## JWT authentication workflow

1. `POST /api/auth/register` → bcrypt-hash the password → save → sign `{id}` with `JWT_SECRET` → return `{token, user}`.
2. `POST /api/auth/login` → compare against the stored hash → sign the same token → return `{token, user}`.
3. Any protected route receives `Authorization: Bearer <token>`.
4. `protect` verifies signature/expiry (`jsonwebtoken`), then **re-reads the user from MongoDB** so deleted accounts and forged identities are rejected with `401`.
5. Controllers use only `req.user._id` — client-supplied ids in bodies or URLs are ignored for ownership decisions.
6. Token expiry is configurable (`JWT_EXPIRES_IN`, default `1d`); the secret exists only in `server/.env`.

## 1. Prerequisites

- Node.js 20+ (LTS) and npm
- A MongoDB Atlas cluster (free tier is fine) with your IP address added under **Network Access**

## 2. Environment configuration

### server/.env

A local `server/.env` has already been generated for you with a fresh random `JWT_SECRET`:

```ini
PORT=5000

# credential-free Atlas URI; the database name in the path is the app database
MONGO_URI=mongodb+srv://<cluster>.mongodb.net/ai-fittrack?retryWrites=true&w=majority

# Atlas database user credentials kept OUT of the URI, so the password needs no
# URL-encoding even when it contains @ # / % : ?  (Atlas users live in "admin")
MONGO_USER=<atlas-database-user>
MONGO_PASSWORD=<atlas-database-password>
MONGO_AUTH_SOURCE=admin

JWT_SECRET=<already generated, 96 hex characters>
JWT_EXPIRES_IN=1d
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=your_gemini_api_key         # required for /api/ai/* (Phase 3)
GEMINI_MODEL=gemini-3.6-flash              # optional override
GEMINI_TIMEOUT_MS=30000                    # optional per-request timeout (max 120000)
GEMINI_MAX_ATTEMPTS=3                      # optional retries for transient failures (1..5)
GEMINI_RETRY_BASE_MS=500                   # optional exponential backoff base (ms)
GEMINI_RETRY_MAX_DELAY_MS=5000             # optional backoff + Retry-After ceiling (ms)
AI_RATE_LIMIT_PER_MINUTE=10                # optional per-user AI rate limit

DNS_SERVERS=                               # optional, see troubleshooting below
MONGO_FORCE_IPV4=                          # optional, see troubleshooting below
```

Credentials may also be embedded directly in `MONGO_URI`
(`mongodb+srv://<user>:<password>@<cluster>.mongodb.net/ai-fittrack?...`) — in that case the password **must** be
URL-encoded, and `MONGO_USER`/`MONGO_PASSWORD` may stay empty. The split form is recommended because it avoids
that pitfall.

**Two pitfalls worth knowing:** the database name must be present in the path (otherwise Mongoose uses the default
`test` database), and Atlas authenticates users against the `admin` database, which is why `authSource=admin` /
`MONGO_AUTH_SOURCE=admin` is set — without it a URI containing `/ai-fittrack` makes the driver authenticate
against `ai-fittrack` and the connection fails with `bad auth`.

Generate a new JWT secret at any time with `npm run create-secret` inside `server/`.

`server/.env` is git-ignored and **never** committed. The JWT secret exists only on the server.

## 3. Install and run

```bash
# Backend
cd server
npm install
npm run dev        # nodemon, http://localhost:5000
```

The API only starts **after** the MongoDB connection succeeds; otherwise it exits with a meaningful error
(check the connection string, the cluster status and the Atlas IP allow list).

**Root shortcut:** the repository root has its own `package.json`, so from `e:\AIFITTRACK_NM` itself you can run
`npm start` / `npm run dev` (backend), `npm test`, `npm run test:smoke` and `npm run test:atlas` — they all proxy into
`server/`. Running `npm start` in a folder **without** a `package.json` fails with
`npm error code ENOENT ... package.json`; either use these root shortcuts or `cd server` first.

### Troubleshooting the Atlas connection

| Symptom | Cause | Fix |
| --- | --- | --- |
| `querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net` | your router / ISP / VPN DNS refuses SRV queries, which `mongodb+srv://` requires | set `DNS_SERVERS=8.8.8.8,1.1.1.1` in `server/.env` (already set on this machine — the local router DNS `10.79.162.101` blocks SRV records) |
| `Could not connect to any servers in your MongoDB Atlas cluster ... IP that isn't whitelisted` | your public IP is not in Atlas Network Access | Atlas → **Security → Network Access → ADD IP ADDRESS → Add Current IP Address**, wait for *Active* (or `0.0.0.0/0` for local development) |
| connection attempted over a synthesized IPv6 address (`64:ff9b::…`) and then closed | NAT64/DNS64 network (mobile hotspot, IPv6-only ISP) | set `MONGO_FORCE_IPV4=true` in `server/.env` (already set on this machine) |
| `connection <monitor> to <host>:27017 closed` or `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` | Atlas accepted TCP but refused the client: source IP not in Network Access, **or** a free-tier (M0) cluster is **Paused** | fix Network Access **and** make sure the cluster is *Active* (resume it if paused) |
| `bad auth : authentication failed` | wrong database-user password, the user does not exist, or `authSource` missing while the URI contains a database name | Atlas → **Security → Database Access**: confirm the user exists (names are case-sensitive) and reset its password with *Edit Password → Autogenerate*; keep `MONGO_AUTH_SOURCE=admin` |
| `MONGO_URI is not defined` | `server/.env` missing or empty | copy `server/.env.example` to `server/.env` and fill it in |
| startup exits with code 1 | cluster unreachable, wrong credentials, or no database name in the URI | the printed error names the cause |

Run `npm run test:atlas` after changing any of the above — it re-checks the whole Phase 1 flow against your
cluster and removes its temporary test user.

## 4. Complete REST API endpoint documentation

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/health` | Public | Service health/status |
| POST | `/auth/register` | Public | Register a user (`name`, `email`, `password`, optional `confirmPassword`) |
| POST | `/auth/login` | Public | Authenticate (`email`, `password`) and receive a JWT |
| GET | `/auth/profile` | **JWT** | Get the authenticated user's profile |
| GET | `/auth/email-available?email=` | Public | Boolean availability check for registration |
| POST | `/workouts` | **JWT** | Create a workout (owner always comes from the JWT, never the body) |
| GET | `/workouts` | **JWT** | Own workout history, newest `workoutDate` first |
| GET | `/workouts/search?name=&category=&date=` | **JWT** | Search own workouts — regex-escaped name, exact category, calendar day (filters combine) |
| GET | `/workouts/:id` | **JWT** | One owned workout (`400` invalid id, `404` missing or another user's) |
| PUT | `/workouts/:id` | **JWT** | Update an owned workout (partial, ≥ 1 field) |
| DELETE | `/workouts/:id` | **JWT** | Delete an owned workout |
| POST | `/ai/workout-recommendation` | **JWT** | Gemini workout plan — `{age, fitnessGoal, experienceLevel}` |
| POST | `/ai/fitness-insights` | **JWT** | Gemini insights — `{totalWorkouts, averageWorkoutDuration, totalCaloriesBurned}` or `{useDatabaseStats: true}` |

### Response envelope

Every endpoint answers with the same JSON shape:

```jsonc
// success
{ "success": true, "message": "Login successful",
  "data": { "token": "<jwt>", "tokenType": "Bearer", "expiresIn": "1d",
            "user": { "_id": "...", "name": "Alex", "email": "alex@example.com",
                      "createdAt": "...", "updatedAt": "..." } } }

// failure
{ "success": false, "message": "Validation failed",
  "errors": [ { "field": "email", "message": "Please provide a valid email address" } ] }
```

### Status codes

`201` created · `200` success · `400` validation/JSON error · `401` missing/invalid/expired token or bad credentials ·
`403` blocked CORS origin · `404` unknown route · `409` duplicate email · `500` unexpected server error.

### Postman / Thunder Client

An importable collection ships with the API: **`server/postman/AI-FitTrack.postman_collection.json`** —
12 requests across `0. Health`, `1. Authentication`, `2. Workouts`, `3. AI (Gemini)` folders, each with
automated `pm.test` assertions (status codes, token capture, ownership checks, no-bcrypt-leak checks) and
saved example success/error responses.

1. Postman → **Import** → choose the file → collection variables become available:
   `baseUrl` (`http://localhost:5000/api`), `userPassword`, `token`, `userId`, `workoutId`, `userEmail`.
2. Run the requests **top to bottom** (or *Collection Runner → Run*): `register` creates a fresh user
   every run and stores the token/user id automatically, `create workout` stores `workoutId`, and every
   later request reuses those variables.
3. The AI requests need a valid `GEMINI_API_KEY` in `server/.env`; everything else works without it.
4. Errors are asserted too: duplicate register → `409`, bad ids → `400`, foreign workouts → `404`,
   missing token → `401` (examples are saved on each request under *Examples*).
5. Thunder Client works as well — just hit the same URLs with `Authorization: Bearer <token>`.

## 5. Security design

- **Password hashing** — bcrypt.js with a cost factor of 12 in a Mongoose `pre('save')` hook; the stored hash
  matches `^\$2[aby]\$\d{2}\$` and the plain password is never persisted.
- **Password confidentiality** — the `password` field is `select: false`, is stripped by the schema
  `toJSON`/`toObject` transforms, and `toSafeJSON()` whitelists exactly `_id, name, email, createdAt, updatedAt`.
- **No user enumeration** — unknown email and wrong password both return `401 Invalid email or password`.
- **JWT** — signed server-side with `JWT_SECRET` (HS256) and a configurable lifetime (`JWT_EXPIRES_IN`),
  verified with an issuer check. Missing, malformed, invalid, expired and forged tokens are all rejected with `401`.
- **Fresh user lookup** — `protect` re-reads the user from MongoDB, so a deleted account cannot keep using a
  still-valid token; the identity always comes from the verified token, never from a client-supplied id.
- **Validation** — enforced on the server (source of truth);
  emails are trimmed/lower-cased consistently and the API rejects invalid `ObjectId`s and malformed JSON.
- **CORS** — restricted to `CLIENT_URL`; unknown origins get `403`.
- **Errors** — centralized handler returns a consistent envelope and hides stack traces outside development.

### Token use

Clients send the JWT as `Authorization: Bearer <token>`. This keeps the API stateless and avoids CSRF entirely
(the browser never attaches the credential automatically). For browser consumers, tokens can be stored in memory
or `localStorage` with appropriate XSS precautions, or migrated to HttpOnly + Secure + SameSite cookies with CSRF
protection for high-security environments. The JWT secret never leaves the server.

## 6. Tests

```bash
cd server && npm test          # 95 automated tests (node:test + Supertest)
cd server && npm run test:smoke # local HTTP end-to-end (17/17 checks passed)
cd server && npm run test:atlas # live check against YOUR MongoDB Atlas cluster
```

`npm run test:atlas` is the one check that needs your credentials: it connects through `config/db.js`,
exercises health/register/duplicate/invalid-email/login/wrong-password/profile over real HTTP, proves the
password is stored as a bcrypt hash, verifies that a deleted user's token stops working, deletes the temporary
test account it created and exits non-zero if any check fails. Run it once after you paste your Atlas URI.

The API tests spin up a real MongoDB engine through `mongodb-memory-server`, so they never touch your Atlas
cluster. The first run downloads the mongod binary once (~75 MB).

Automated coverage of the Phase 1 + Phase 2 checklists: registration succeeds · duplicate rejected (409) · invalid email
rejected (400) · missing fields rejected (400) · passwords stored as bcrypt hashes · valid login succeeds ·
wrong credentials rejected (401) · valid JWT grants profile access · missing/malformed/invalid/forged/expired
tokens rejected · token of a deleted user rejected · authenticated workout create/list/get/update/delete ·
unauthenticated workout access rejected (401) · invalid workout input rejected (400) · invalid ids rejected
(400) · missing workouts return 404 · cross-user reads/updates/deletes return 404 (never leak) · search by
name/category/date (combinable) · client-supplied owner ids ignored · backend builds and starts cleanly.

Phase 3 AI coverage (Gemini mocked — `tests/ai.test.js`, `tests/geminiRetry.test.js`): structured
recommendation + insights schemas validated field by field · `age` / `fitnessGoal` / `experienceLevel`
allow-lists defended (missing and invalid input → `400` with field errors) · both AI routes require a valid
JWT (`401`) · per-user rate limit (`429` with `Retry-After`) · database-derived statistics computed from the
caller's own records and verified for exact accuracy (another user's larger records never leak in) ·
zero-workout database insights skip the AI call · transient failures (`503 high demand`, `429`, timeouts)
retried with bounded exponential backoff and verified attempt counts · `Retry-After` honored, and refused
(fail fast, no sleep, no extra call) when it exceeds the delay cap · invalid key, retired model, bad request
and malformed/incomplete payloads are never retried · every failure returns the standard envelope with a
stable `code` and `attempts`, never leaking the key, prompts or internal stack traces.

## 7. Phase 2: workout management (implemented)

Backend (`server/`): `models/Workout.js` (user ref + workoutName/category/duration/caloriesBurned/workoutDate +
timestamps; categories Cardio, Strength Training, Yoga, Running, Cycling, Walking; owner + date indexes),
`utils/workoutValidation.js` (shared rules, canonical category normalization, ObjectId guard),
`controllers/workoutController.js`, `routes/workoutRoutes.js` mounted at `/api/workouts` behind `protect`.
Endpoints: `POST /` create · `GET /` history ordered by workoutDate desc · `GET /search?name=&category=&date=`
(registered before `/:id`, regex-escaped name search, calendar-day date match) · `GET /:id` · `PUT /:id` (partial
updates, at least one field) · `DELETE /:id`. Every query is scoped to `req.user._id` from the verified JWT; no
client-supplied owner is ever trusted. Consistent `{success, message, data}` / `{success, message, errors[]}`
envelopes with 201/200/400/401/404.

## 8. Phase 3: Gemini AI integration (implemented — backend only)

### Files

`server/services/geminiService.js` (prompt builders, official `@google/genai` client, structured-JSON
extraction + validation, timeout, normalized error codes) · `server/utils/aiValidation.js` (pure input
validation) · `server/controllers/aiController.js` (JWT-scoped handlers + per-user rate limiting) ·
`server/routes/aiRoutes.js` (mounted at `/api/ai` behind `protect`).

### Endpoints (JWT required — `Authorization: Bearer <token>`)

| Method | Endpoint | Body | Success |
| --- | --- | --- | --- |
| POST | `/api/ai/workout-recommendation` | `{ age, fitnessGoal, experienceLevel }` | `200` + personalized plan |
| POST | `/api/ai/fitness-insights` | `{ totalWorkouts, averageWorkoutDuration, totalCaloriesBurned }` **or** `{ useDatabaseStats: true }` | `200` + insights (or zero-workout notice) |

Allowed values — `fitnessGoal`: Weight Loss, Muscle Gain, Endurance, Strength, Flexibility, General Fitness ·
`experienceLevel`: Beginner, Intermediate, Advanced · `age`: whole number 13–100.

### Example requests / responses

```bash
# Workout recommendation
curl -X POST http://localhost:5000/api/ai/workout-recommendation \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"age": 22, "fitnessGoal": "Weight Loss", "experienceLevel": "Beginner"}'
```
```jsonc
// 200 (structure produced by Gemini, validated server-side)
{ "success": true, "message": "Workout recommendation generated successfully",
  "data": { "input": { "age": 22, "fitnessGoal": "Weight Loss", "experienceLevel": "Beginner" },
            "model": "gemini-3.6-flash",
            "recommendation": {
              "workoutPlan": "A balanced 4-day beginner plan…",
              "weeklySchedule": [ { "day": "Monday", "focus": "Full body strength",
                                    "exercises": [ { "name": "Bodyweight squats", "detail": "3 sets x 12 reps" } ],
                                    "durationMinutes": 40 } ],
              "experienceRecommendations": "…", "trainingTips": [ "…" ],
              "restAndRecovery": "…", "safetyGuidance": "…", "motivation": "…" } } }
```

```bash
# Fitness insights — documented client-submitted statistics
curl -X POST http://localhost:5000/api/ai/fitness-insights \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"totalWorkouts": 15, "averageWorkoutDuration": 45, "totalCaloriesBurned": 3200}'

# Fitness insights — verified statistics computed from the caller's MongoDB records
curl -X POST http://localhost:5000/api/ai/fitness-insights \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"useDatabaseStats": true}'
```
```jsonc
// 200 — the response echoes data.stats and distinguishes the source
{ "success": true, "message": "Fitness insights generated successfully",
  "data": { "statsSource": "submitted" /* or "database" */,
            "stats": { "totalWorkouts": 15, "averageWorkoutDuration": 45, "totalCaloriesBurned": 3200 },
            "model": "gemini-3.6-flash",
            "insights": { "performanceSummary": "…", "consistencyObservations": "…",
                          "improvementSuggestions": [ "…" ], "motivationalAdvice": "…",
                          "progressSummary": "…" } } }

// 200 zero-workout case (database stats, no Gemini call): statsSource "database",
// stats all 0, insights: null, message "No workouts found - log workouts to unlock personalized insights"
```

### Failure handling, retries and error codes

Failure shapes use the standard envelope, now with machine-readable fields:

```jsonc
{ "success": false, "message": "Workout recommendation request failed",
  "errors": [ { "field": "ai", "message": "Gemini request failed. Please try again later." } ],
  "code": "GEMINI_REQUEST_FAILED", "attempts": 3 }
```

| Situation | HTTP | `code` | Retried? |
| --- | --- | --- | --- |
| Upstream overload (`503 high demand`, `UNAVAILABLE`) | `503` | `GEMINI_REQUEST_FAILED` / `GEMINI_UNAVAILABLE` | ✅ up to `GEMINI_MAX_ATTEMPTS` |
| Rate limited / quota (`429`) | `429` (+ `Retry-After` header) | `GEMINI_RATE_LIMIT` | ✅, honoring `Retry-After` |
| Timeout / unreachable network | `504` / `502` | `GEMINI_TIMEOUT` / `GEMINI_UNAVAILABLE` | ✅ |
| Invalid or missing API key | `503` | `GEMINI_AUTH_ERROR` / `GEMINI_MISSING_KEY` | ❌ (retrying cannot help) |
| Unknown / retired model (`404 NOT_FOUND`) | `404` | `GEMINI_MODEL_NOT_FOUND` | ❌ |
| Malformed / empty / incomplete model JSON | `502` | `GEMINI_MALFORMED_RESPONSE` / `GEMINI_EMPTY_RESPONSE` / `GEMINI_INVALID_RESPONSE` | ❌ |
| Per-user AI rate limit (`AI_RATE_LIMIT_PER_MINUTE`) | `429` (+ `Retry-After`) | — | ❌ |
| Input validation | `400` | — | ❌ |
| No/invalid/expired JWT | `401` | — | ❌ |

Retry policy (only transient failures are retried, so quota is never wasted):

- **Bounded attempts** — `GEMINI_MAX_ATTEMPTS` (default 3, clamped to 1–5) i.e. at most two retries.
- **Exponential backoff with jitter** — `GEMINI_RETRY_BASE_MS` (default 500 ms, doubling per attempt) capped by
  `GEMINI_RETRY_MAX_DELAY_MS` (default 5000 ms), so a request never sleeps for an unbounded time.
- **`Retry-After` is respected** — when the upstream advertises a delay it is used instead of the backoff estimate,
  and it is echoed back to the client as a `Retry-After` response header. If it exceeds the delay cap the call
  **fails fast** (no long sleep, no extra upstream calls) and reports `retryAfterSeconds`.
- **No credential or internal leakage** — responses carry only the stable `GEMINI_*` code, the attempt count and a
  user-safe message; the API key, prompts and upstream stack traces are never returned.

### Gemini configuration

Get a free key at https://aistudio.google.com/apikey → set `GEMINI_API_KEY` in `server/.env`
(never committed, never sent to the client). Optional: `GEMINI_MODEL` (default `gemini-3.6-flash`),
`GEMINI_TIMEOUT_MS` (default 30000, max 120000), the retry policy `GEMINI_MAX_ATTEMPTS` (default 3, max 5),
`GEMINI_RETRY_BASE_MS` (default 500 ms) and `GEMINI_RETRY_MAX_DELAY_MS` (default 5000 ms), and
`AI_RATE_LIMIT_PER_MINUTE` (default 10). Missing/invalid key, quota, upstream overload, timeout, retired
model and malformed model output are all handled with structured errors (table above) — the server never
crashes, never retries a request that cannot succeed and never fabricates a recommendation when Gemini fails.

## 9. Phase 4: final backend delivery

### Backend review results

Full inspection of `app.js`, `server.js`, `config/db.js`, both models, all three controllers, all three
route files, both middleware, both services and every util — no missing features, broken imports, invalid
paths or inconsistent responses remain. The complete workflow (register → login → JWT → profile → create →
list → search → get-by-id → update → delete → AI recommendation → AI insights) passes end-to-end in the
automated suite and smoke run.

### Security review (all verified by tests in `tests/security.test.js` and the existing suites)

| Control | Status |
| --- | --- |
| bcrypt cost-12 hashing, `password: select:false`, schema transforms + `toSafeJSON()` whitelist | ✅ no hash in any response (`\$2b\$` never appears) |
| JWT HS256 + expiry + issuer, missing/malformed/forged/expired rejected with `401` | ✅ |
| Every workout/AI route behind `protect`; identity always `req.user._id` | ✅ client ids in bodies/URLs ignored |
| Cross-user GET/PUT/DELETE → `404` (never leaks existence differently than a missing doc) | ✅ |
| Server-side validation of all fields (strings, numbers, dates, ObjectIds); regex-escaped search | ✅ no injection via `name` |
| CORS restricted to `CLIENT_URL`; malformed JSON → `400` without crashing | ✅ |
| Per-user AI rate limit (`429`), Gemini errors → `502/503/504`, key never logged or returned | ✅ |
| `server/.env` + `.env.*` git-ignored; `.env.example` contains placeholders only | ✅ |

### Performance and reliability

Indexes on `{user, workoutDate, createdAt}` and `{user, category}` keep history and search queries
indexed per-user · search filters combine on indexed fields with escaped regex · startup fails fast with
a meaningful message when MongoDB is unreachable · Gemini has a 30 s timeout and never crashes the
server · invalid requests funnel through the centralized error handler · no dependencies beyond the
documented stack (+ `@google/genai`, dev-only test tooling).

### Deployment preparation

1. Provision a MongoDB cluster (Atlas free tier), create a DB user, allow-list the server IP.
2. Set environment variables on the host: `PORT`, `MONGO_URI` (+ optional `MONGO_USER`/`MONGO_PASSWORD`/
   `MONGO_AUTH_SOURCE`), `JWT_SECRET` (long random value, e.g. `npm run create-secret`), `JWT_EXPIRES_IN`,
   `CLIENT_URL` (the deployed frontend origin for CORS), `GEMINI_API_KEY`, optional `GEMINI_MODEL`,
   `GEMINI_TIMEOUT_MS`, `AI_RATE_LIMIT_PER_MINUTE`.
3. `npm ci && npm start` in `server/` (health check: `GET /api/health`).
4. Never commit secrets; rotate `JWT_SECRET`/DB password if they ever leak; serve behind HTTPS.
5. Run `npm test` in CI — tests use an isolated in-memory MongoDB and mocked Gemini, never production data.

### Future frontend integration guidance

The API is designed to be consumed with `fetch`/`axios` against `{{baseURL}}` using `Authorization: Bearer <token>`:
login/register → store token → attach it in the request header (`Authorization: Bearer <token>`) → call workout/AI endpoints.
Responses always follow `{success, message, data|errors[]}`, so a single client interceptor can handle loading, success and error states.

### Known limitations

- Live Gemini is verified end-to-end: both `/api/ai/*` endpoints returned HTTP 200 with real
  `gemini-3.6-flash` model output (a structured weekly workout plan and fitness insights that echo the
  submitted statistics; the response body reports the model actually used). Their failure paths were
  exercised live too (Google's transient `503 high demand` responses and the 60 s timeout handling) — the
  upstream flash tier is capacity-limited intermittently, so transient failures are now retried
  automatically (`GEMINI_MAX_ATTEMPTS`, default 3, bounded backoff) before a `503` is reported; during a
  longer outage a manual retry may still be needed. Automated tests mock Gemini by design. Zero-workout
  database insights intentionally skip the AI call.
- Retries happen in-process per request (no background queue): a request that exhausts its attempts answers
  immediately with `code` + `attempts`, and a large advertised `Retry-After` is passed to the client as a
  response header instead of the server waiting it out. Multi-instance deployments should share the rate
  limiter below.
- The per-user AI rate limiter is in-memory (resets on restart and is single-instance); production
  multi-instance deployments should move it to a shared store (e.g. Redis).
- Frontend is out of scope for this backend submission.


## Checklist — part 2 (CRUD, AI, hardening, ops)

| # | Requirement (docx) | Status | Source file | Test evidence |
|---|--------------------|--------|-------------|---------------|
| R13 | Get workout by ID (owner-scoped; 400 bad id, 404 missing/foreign) | Completed | `GET /api/workouts/:id` (`findOne({_id,user})`) | Workout 03 (200); 08 → 404 gone |
| R14 | Update workout (partial, owner-scoped) | Completed | `PUT /api/workouts/:id` (`findOneAndUpdate` + validators) | Workout 04 (30→45/280→400) |
| R15 | Delete workout (owner-scoped) | Completed | `DELETE /api/workouts/:id` (200) | Workout 08 (200) |
| R16 | Gemini recommendation: age+goal+experience → plan+schedule+exercises+tips+safety | Completed | `POST /api/ai/workout-recommendation` (`aiController.js` → `geminiService.js` `@google/genai`, `gemini-3.6-flash`); `aiValidation.js` age 13–100 + allow-lists (`experience` alias OK) | Gemini 01: live 200, 7-day schedule |
| R17 | Gemini insights: totals+avg+calories → performance/consistency/improvement/motivation; DB stats supported | Completed | `POST /api/ai/fitness-insights` (manual OR `{useDatabaseStats:true}`; zero-workout skips AI; `averageDuration` alias OK) | Gemini 02 (12/38/4200→200) + 03 (db {3,38.3,780} exact→200) |
| R18 | Standardized JSON + centralized errors (validation/auth/DB/404/500) | Completed | `utils/response.js`, `utils/ApiError.js`, `middleware/errorMiddleware.js` (validation→400, 11000→409, hides stacks) | Envelopes + 400/401/404/409 live |
| R19 | Input validation everywhere | Completed | `utils/authValidation.js`, `workoutValidation.js`, `aiValidation.js` + model + ObjectId guard | `validation.test.js`; 400s green |
| R20 | JWT middleware on protected routes; fresh user lookup; never trust client ids | Completed | `middleware/authMiddleware.js`; `router.use(protect)` on workouts+AI; `req.user._id` only | Auth 04; no-token 401; deleted/forged/expired 401 |
| R21 | bcrypt hashing, never stored/returned plain | Completed | `models/User.js` cost-12 pre-save, `select:false`, `stripPassword`, `toSafeJSON` | Atlas hash checks; no `$2b$` in evidence |
| R22 | Per-user isolation (all 11 docx ops permitted per user; cross-user denied) | Completed | All queries scoped to `req.user._id`; cross-user → 404 | Owner match; count=1; 404 suites; exact DB math |
| R23 | Test order auth→workouts→AI (Postman + suites) | Completed | `postman/*.json` (12 reqs) + `tests/*.test.js` (95) + smoke (17) + atlas (19) | 95/0, 17/17, 19/19 + live 200s |
| R24 | Env: PORT/MONGO_URI/JWT_SECRET/GEMINI_API_KEY (+model/timeout/retry/rate knobs) | Completed | `server/.env.example` (all keys incl. RETRY/RATE/DNS/IPV4) | Extracted server booted; bounded retry live |

**Result: 24/24 required backend items Completed. 0 missing. 0 partial.**

## Out of scope (correctly excluded, backend-only rule)

- React frontend, dashboard charts, BMI/nutrition/wearables (docx future scope) — client placeholders untouched.
- Demo/API-testing Drive video links (docx Epic 5) — external artefacts, not code.
- `GET /api/auth/email-available` — extra helper beyond docx; harmless, README-documented.

## Inconsistencies (docx vs docx vs code — all resolved in code)

1. DB host: `mongodb://localhost:27017/aifittrack` vs Atlas `mongodb+srv://` — `config/db.js` supports both; README documents Atlas. Minor.
2. AI names: text `Experience Level`/`Average Duration`, screenshots `experience`/`averageDuration`, API `experienceLevel`/`averageWorkoutDuration` — code accepts BOTH (aliases, regression-tested).
3. Search location: diagram implies filters on `GET /api/workouts`, canonical is `/search` — code supports BOTH via `buildSearchFilter()`.
4. User example `{id,name,email}` vs `_id` — `toSafeJSON()` returns BOTH `id` and `_id`.
5. `Calories Burned` vs `totalCaloriesBurned` — API name documented in README; live echo proves it. Naming only.
6. Stack line lists "posts, categories, comments, analytics" vs own 2-table schema — code follows schema (users+workouts). Doc typo.
7. Docx `npm install ...` omits `@google/genai/supertest/memory-server/nodemon` — `package.json` complete. Stale snippet.
8. API screenshot paras are image placeholders (no text) — statuses verified live instead (201/200/401/404/409).
9. `statsSource:"manual"` live vs README "`submitted`"; database `"database"` matches. One-word drift, no behavior impact.

## Missing / doc problems

- **None blocking.** All required behavior implemented, secured, evidenced.
- Nits (not fixed per no-modify rule): README §6 whitelist omits `id` mirror; §4 table omits AI 429/502/503/504 (in §9 instead); docx typos ("Experience Leve", "MonogoDB", "ThunderClient", local-vs-Atlas URI).

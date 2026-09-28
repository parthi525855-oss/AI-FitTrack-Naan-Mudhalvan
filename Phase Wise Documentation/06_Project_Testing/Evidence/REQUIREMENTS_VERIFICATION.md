# Requirements Verification — AI FitTrack Backend (final submission)

Date: 2026-09-27
Requirements: `C:\Users\parth\Downloads\AI FitTrack.docx` (7822553 bytes, 498 paragraphs, 3 tables; working copy at `E:\AI-FitTrack-submission-evidence\AI-FitTrack-requirements-copy.docx`, original untouched)
Implementation: `E:\AI-FitTrack-verify\AI-FitTrack-backend\server` (extracted ZIP copy)
Evidence: `E:\AI-FitTrack-submission-evidence\authentication\`, `\workouts\`, `\gemini\` (live statuses 2026-09-27)
No modifications made — no source, README, frontend, or ZIP changes; no credentials in this file.

## Checklist — part 1 (platform, DB, auth)

| # | Requirement (docx) | Status | Source file | Test evidence |
|---|--------------------|--------|-------------|---------------|
| R1 | MVC: routes → controllers → models + services/middleware/config | Completed | `routes/*.js`, `controllers/*.js`, `models/*.js`, `services/jwtService.js`, `services/geminiService.js`, `middleware/*.js`, `config/db.js`, `app.js`, `server.js` | Inspection + all suites green |
| R2 | Node.js + Express.js backend | Completed | `package.json`: `express ^5.2.1`, engines `node >=20.0.0` (ran v24.18.0) | `npm test` on v24.18.0 |
| R3 | MongoDB + Mongoose `config/db.js` (connect, errors, status, export) | Completed | `config/db.js` (`connectDB`/`disconnectDB`, DNS/IPv4/authSource); `server.js` connects BEFORE listen | Atlas 19/19; smoke 17/17 |
| R4 | Two collections: users + workouts | Completed | `models/User.js`, `models/Workout.js` (user ref → users) | Atlas doc checks; cleanup both collections |
| R5 | User schema: name/email/password/timestamps; unique email; bcrypt hash | Completed | `models/User.js` (unique+lowercase+regex email, `select:false`, cost-12 pre-save, `toSafeJSON`) | No hash in responses; Atlas bcrypt check |
| R6 | Workout schema: user/name/category/duration≥0/date required, per-user owner | Completed | `models/Workout.js` + `utils/workoutValidation.js` (duration 1–1440, cal 0–20000, 6-category enum) | Workout evidence 01–08 |
| R7 | Register (public) → 201 + token; 409 duplicate; 400 validation | Completed | `POST /api/auth/register` (`authRoutes.js` → `authController.js`) | Auth 01 (201); Atlas 409 |
| R8 | Login (public) → JWT; same 401 unknown-email/wrong-password | Completed | `POST /api/auth/login` (generic 401) | Auth 02 (200); smoke 401 |
| R9 | Profile (protected) | Completed | `GET /api/auth/profile` (`protect` → `getProfile`) | Auth 03 (200) + 04 (401) |
| R10 | Add workout (auth, owner from JWT) | Completed | `POST /api/workouts` (201) | Workout 01 (OWNER_MATCH:true) |
| R11 | Get all workouts (auth, newest first) | Completed | `GET /api/workouts` (user-scoped, date desc; also `?name=&category=&date=`) | Workout 02 (count=1) |
| R12 | Search by name/category/date (auth) | Completed | `GET /api/workouts/search` (escaped name, canonical category, UTC-day date; before `/:id`) | Workout 05/06/07 (count=1) |

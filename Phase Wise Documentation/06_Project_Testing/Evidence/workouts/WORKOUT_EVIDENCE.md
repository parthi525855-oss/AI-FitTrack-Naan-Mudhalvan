# Workout CRUD + Search Evidence — AI FitTrack Backend (final submission)

Date: 2026-09-27 (UTC ~04:46–04:50)
Server under test: E:\AI-FitTrack-verify\AI-FitTrack-backend\server (extracted ZIP copy, PORT=5000, Atlas-backed)
Pre-check: backend was ALREADY RUNNING from the authentication task (health uptimeSeconds=465, still 200 OK) — no restart needed.
Source code / frontend / submission ZIP: NOT modified.
Secrets policy: no passwords, JWTs, API keys, or DB credentials in this file or the evidence folder.

Evidence folder: E:\AI-FitTrack-submission-evidence\workouts\
  - 01-create-workout.txt        (POST /api/workouts → 201, sanitized)
  - 02-list-workouts.txt         (GET /api/workouts → 200, sanitized)
  - 03-get-workout-by-id.txt     (GET /api/workouts/:id → 200, sanitized)
  - 04-update-workout.txt        (PUT /api/workouts/:id → 200, sanitized)
  - 05-search-by-name.txt        (GET /api/workouts/search?name= → 200, sanitized)
  - 06-search-by-category.txt    (GET /api/workouts/search?category= → 200, sanitized)
  - 07-search-by-date.txt        (GET /api/workouts/search?date= → 200, sanitized)
  - 08-delete-workout.txt        (DELETE /api/workouts/:id → 200 + follow-ups, sanitized)
  - WORKOUT_EVIDENCE.md          (this file)

## Setup (temporary account, JWT auth)

- Registered temp user workout-evidence-<timestamp>@example.com via POST /api/auth/register → HTTP 201.
- JWT + user _id kept in memory for the flow only; never printed or saved (run-vars file deleted after use).
- All 8 workout calls sent `Authorization: Bearer <JWT>` internally.

## Actual results (all verified on the extracted server)

| # | Method + endpoint | Status | Verified |
|---|-------------------|--------|----------|
| 1 | POST /api/workouts {Evidence Morning Run, Running, 30, 280, 2026-09-20} | 201 | owner == JWT user _id (OWNER_MATCH:true) |
| 2 | GET /api/workouts | 200 | count=1, exactly the created record |
| 3 | GET /api/workouts/:id | 200 | workoutName "Evidence Morning Run" |
| 4 | PUT /api/workouts/:id {duration:45, caloriesBurned:400} | 200 | DURATION:45 CAL:400 persisted |
| 5 | GET /api/workouts/search?name=Evidence%20Morning | 200 | count=1, updated values returned |
| 6 | GET /api/workouts/search?category=Running | 200 | count=1, exact category match |
| 7 | GET /api/workouts/search?date=2026-09-20 | 200 | count=1, UTC calendar-day match |
| 8 | DELETE /api/workouts/:id | 200 | "Workout deleted successfully" |

Follow-up checks (same run):
- GET /api/workouts/:id AFTER delete → HTTP 404 (record gone).
- GET /api/workouts with NO token → HTTP 401 (routes require auth).

Ownership: every operation affected only the authenticated temp user's records (create owner match; list/search counts of exactly 1; cross-user isolation is additionally covered by the 95-test suite).

## Cleanup (actual)

- Atlas check found exactly the one temp account (workout-evidence-1790484399880@example.com) with 0 remaining workouts (already deleted via API).
- Deleted: TEMP_WORKOUTS_DELETED:0, TEMP_USERS_DELETED:1, TEMP_USERS_REMAINING:0.
- Filter used: /^workout-evidence-.*@example\.com$/ — no other user data touched.
- Temp scripts (flow + cleanup) and the run-vars JSON removed; extracted server folder contains no leftover temp files.

## Errors encountered

1. Cleanup script first failed with "MONGO_URI is not defined" — the script ran from a working directory where dotenv did not auto-load the extracted server's .env. Fixed by explicit `require('dotenv').config({path: path.join(__dirname,'.env')})`; re-ran successfully.
2. This shell reports exit-code-1 noise on `Select-Object -Last` pipelines even when the printed lines show success (same as the auth task). Verdicts above use the actual printed SUMMARY values, e.g. TEMP_USERS_REMAINING:0 and the 201/200/404/401 statuses.
3. No application errors: every workout endpoint returned the expected status on first attempt.

## How to display/capture

- Open each of the 01–08 .txt files (plain fixed-width text, no secrets) and screenshot them, or screenshot this .md.
- Server left RUNNING on port 5000 for your next evidence task.

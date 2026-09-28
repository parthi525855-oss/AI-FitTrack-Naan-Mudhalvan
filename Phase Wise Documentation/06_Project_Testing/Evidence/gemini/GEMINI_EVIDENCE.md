# Live Gemini AI Evidence — AI FitTrack Backend (final submission)

Date: 2026-09-27 ~04:50–04:55 UTC
Server under test: E:\AI-FitTrack-verify\AI-FitTrack-backend\server (extracted ZIP copy, PORT=5000, Atlas-backed)
Pre-check: backend ALREADY RUNNING (health 200, uptimeSeconds=688) — no restart needed.
Source code / frontend / submission ZIP: NOT modified.
Secrets policy: no API keys, JWTs, passwords, or DB credentials in this file or the evidence folder.

Evidence folder: E:\AI-FitTrack-submission-evidence\gemini\
  - 01-workout-recommendation.txt      (POST /api/ai/workout-recommendation → 200, sanitized live output)
  - 02-fitness-insights-manual.txt    (POST /api/ai/fitness-insights manual stats → 200, sanitized live output)
  - 03-fitness-insights-database.txt  (POST /api/ai/fitness-insights useDatabaseStats → 200, sanitized live output)
  - GEMINI_EVIDENCE.md                (this file)

## Actual results (all live, first attempt each — no retries needed)

| # | Method + endpoint | Status | Verified |
|---|-------------------|--------|----------|
| 1 | POST /api/ai/workout-recommendation {22, Weight Loss, Beginner} | 200 | model gemini-3.6-flash; keys workoutPlan,weeklySchedule(7 days),experienceRecommendations,trainingTips(3),restAndRecovery,safetyGuidance,motivation |
| 2 | POST /api/ai/fitness-insights {12, 38, 4200} | 200 | model gemini-3.6-flash, statsSource manual; text references 12/38/4200 |
| 3 | POST /api/ai/fitness-insights {useDatabaseStats:true} | 200 | model gemini-3.6-flash, statsSource database; stats {3, 38.3, 780} exactly match the 3 seeded temp workouts ((30+45+40)/3=38.3, 280+320+180=780); text references 3/38.3/780 |

Setup: temp user gemini-evidence-<timestamp>@example.com registered 201; JWT kept in memory only. Three temp workouts seeded (201 each) for the database test.

Retry policy: bounded retries (GEMINI_MAX_ATTEMPTS) handled inside the service; this run needed zero retries — no 503/429 occurred, so no additional requests were made.

## Cleanup (actual)

- Atlas check found exactly the temp account (gemini-evidence-1790484625008@example.com) with its 3 temp workouts.
- Deleted: TEMP_WORKOUTS_DELETED:3, TEMP_USERS_DELETED:1, TEMP_USERS_REMAINING:0.
- Filter: /^gemini-evidence-.*@example\.com$/ — no other user data touched.
- Temp flow/cleanup scripts and raw JSON captures removed; only the 3 sanitized .txt files + this .md remain.

## Errors encountered

1. None from the AI endpoints — all three returned HTTP 200 with genuine structured Gemini output on the first attempt.
2. Shell-only noise: `Select-Object -Last` pipelines surface exit-code-1 despite success lines (same as prior tasks); verdicts use the printed statuses/counts. Cleanup output ends with "[db] MongoDB connection closed" normally.

## How to display/capture

- Open each of the 01–03 .txt files (plain fixed-width text, no secrets) and screenshot them, or screenshot this .md.
- Server left RUNNING on port 5000 for your next task.

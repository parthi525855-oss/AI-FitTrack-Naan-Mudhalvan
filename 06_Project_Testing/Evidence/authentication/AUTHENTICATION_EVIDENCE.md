# Authentication Evidence — AI FitTrack Backend (final submission)

Date: 2026-09-27 (UTC 04:38–04:43)
Server under test: E:\AI-FitTrack-verify\AI-FitTrack-backend\server (extracted ZIP copy, PORT=5000, Atlas-backed)
Source code: NOT modified. Original project and submission ZIP: NOT modified/recreated.
Secrets policy: no passwords, JWTs, API keys, or DB credentials appear in this file or the evidence folder.

Evidence folder: E:\AI-FitTrack-submission-evidence\authentication\
  - 01-registration.txt          (successful registration, sanitized)
  - 02-login.txt                 (successful login, sanitized)
  - 03-profile-authorized.txt    (authenticated profile retrieval, sanitized)
  - 04-profile-unauthorized.txt  (unauthorized profile access, sanitized)
  - AUTHENTICATION_EVIDENCE.md   (this file)

## STEP 1 — Backend start + health (actual)

- Port 5000 pre-check: no node.exe running (`tasklist` → "No tasks ... matching").
- Started extracted backend: `node server.js` in E:\AI-FitTrack-verify\AI-FitTrack-backend\server (background process).
- Health check `GET http://localhost:5000/api/health` → HTTP 200:
  {"success":true,"message":"AI FitTrack API is running","data":{"status":"ok","service":"ai-fittrack-api","version":"1.0.0","environment":"development"}}

## STEP 2 — Registration (actual)

- `POST /api/auth/register` with {name:"Auth Evidence User", email:"auth-evidence-1790483958313@example.com", password:"<hidden>"} → **HTTP 201**, success:true, message:"Registration successful".
- User keys: _id, id, name, email, createdAt, updatedAt. No password hash in response.
- JWT generated (HS256 shape, length > 20). Full evidence: 01-registration.txt.

## STEP 3 — Login (actual)

- `POST /api/auth/login` with same email + password → **HTTP 200**, success:true, message:"Login successful".
- Fresh JWT generated (kept in memory only, never printed/saved). Returned _id identical to registration (same account). Full evidence: 02-login.txt.

## STEP 4 — Protected profile (actual)

- `GET /api/auth/profile` with `Authorization: Bearer <login JWT>` → **HTTP 200**, success:true, message:"Profile retrieved successfully". Returned email/_id match registration. No password hash. Full evidence: 03-profile-authorized.txt.
- `GET /api/auth/profile` with NO token → **HTTP 401**, success:false, message:"Authentication required: missing Authorization header". No user data returned. Full evidence: 04-profile-unauthorized.txt.

## STEP 6 — Cleanup (actual)

- Direct Atlas check found exactly the one temp account: auth-evidence-1790483958313@example.com, with 0 workouts.
- Deleted: TEMP_WORKOUTS_DELETED:0, TEMP_USERS_DELETED:1, TEMP_USERS_REMAINING:0.
- No other user data touched (filter: /^auth-evidence-.*@example\.com$/). Temporary cleanup script removed after use.
- Server left RUNNING on port 5000 for your next evidence task; stop it with: `taskkill /FI "IMAGENAME eq node.exe"` (verify the PIDs belong to this test server first).

## Errors encountered

1. First background-job start (`Start-Job`) did not persist as expected (job name not found on receive). Switched to `Start-Process node server.js -WindowStyle Hidden` — worked (PID 9996, uptime 31s at health check, 249s at final check).
2. Evidence-vars write failed once (ENOENT) because the evidence folder did not exist yet — created it, then wrote the four sanitized evidence files. (The failed write contained only the temp email pattern, no secrets.)
3. One-off cleanup script initially failed: wrong relative require paths (`../config/db` → `./config/db`) and one garbled inline `-e` quoting attempt. Rewrote as a temp `.cjs` file in the extracted server folder with correct paths — worked (see counts above). Temp file deleted afterwards.
4. `atlas-check.js` run during diagnosis exits nonzero by design harness convention but prints `19/19 checks passed`; it created/removed its own temp user and did not affect this evidence.
5. `Select-Object -Last` on some native commands surfaces exit-code-1 noise in this shell even when the underlying output shows success; all verdicts above use the actual printed SUMMARY/status lines and JSON bodies.

## How to display/capture

- Open each of the 01–04 .txt files (they are plain fixed-width text, no secrets) and screenshot them, or screenshot this .md.
- To re-verify live: keep the running server, or restart it with the same command, then repeat the four requests with your own temp email.

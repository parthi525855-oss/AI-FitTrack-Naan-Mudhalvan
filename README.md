# AI FitTrack — SmartBridge Naan Mudhalvan Project Submission

**AI FitTrack** is a backend-only REST API built with Node.js, Express.js, MongoDB Atlas, Mongoose, JWT authentication, bcrypt password hashing, and Google Gemini AI integration. The platform provides authenticated users with end-to-end workout logging, statistical tracking, and personalized AI-generated fitness recommendations and workout plans.

This repository preserves the complete, unaltered backend source code and organizes all official project documentation across the eight required SmartBridge phases.

---

## Repository Structure & Phase Deliverables

| Phase / Folder | Documentation Deliverables | Description |
|---|---|---|
| [**01_Brainstorming_and_Ideation**](./01_Brainstorming_and_Ideation/) | [DOCX](./01_Brainstorming_and_Ideation/Phase_01_Brainstorming_and_Ideation.docx) \| [PDF](./01_Brainstorming_and_Ideation/Phase_01_Brainstorming_and_Ideation.pdf) | Problem definition, concept selection, scope boundaries, and solution architecture |
| [**02_Requirement_Analysis**](./02_Requirement_Analysis/) | [DOCX](./02_Requirement_Analysis/Phase_02_Requirement_Analysis.docx) \| [PDF](./02_Requirement_Analysis/Phase_02_Requirement_Analysis.pdf) \| [Reference DOCX](./02_Requirement_Analysis/Reference/Official_AI_FitTrack_Requirements.docx) | Functional/non-functional requirements mapping and official SmartBridge requirement reference |
| [**03_Project_Design**](./03_Project_Design/) | [DOCX](./03_Project_Design/Phase_03_Project_Design.docx) \| [PDF](./03_Project_Design/Phase_03_Project_Design.pdf) | System architecture, MongoDB schemas, JWT security flows, API specifications, and error handling |
| [**04_Project_Planning**](./04_Project_Planning/) | [DOCX](./04_Project_Planning/Phase_04_Project_Planning.docx) \| [PDF](./04_Project_Planning/Phase_04_Project_Planning.pdf) | Evidence-based milestone gates, work breakdown structure, risk management, and team roles |
| [**05_Project_Development**](./05_Project_Development/) | [DOCX](./05_Project_Development/Phase_05_Project_Development.docx) \| [PDF](./05_Project_Development/Phase_05_Project_Development.pdf) | Source implementation walkthrough, module structure, routing, services, and middleware |
| [**06_Project_Testing**](./06_Project_Testing/) | [DOCX](./06_Project_Testing/Phase_06_Project_Testing.docx) \| [PDF](./06_Project_Testing/Phase_06_Project_Testing.pdf) \| [Evidence Logs](./06_Project_Testing/Evidence/) | Test strategy, test suites breakdown, and verified execution logs |
| [**07_Project_Documentation**](./07_Project_Documentation/) | [DOCX](./07_Project_Documentation/Phase_07_Final_Project_Report.docx) \| [PDF](./07_Project_Documentation/Phase_07_Final_Project_Report.pdf) \| [Root Copy](./AI_FitTrack_Final_Documentation.docx) | Complete final project report covering all project lifecycle phases |
| [**08_Project_Demonstration**](./08_Project_Demonstration/) | [DOCX](./08_Project_Demonstration/Phase_08_Project_Demonstration_Guide.docx) \| [PDF](./08_Project_Demonstration/Phase_08_Project_Demonstration_Guide.pdf) | Demonstration guide, step-by-step video script, API walkthrough, and submission checklist |
| [**backend_source**](./backend_source/AI-FitTrack-backend/) | [Backend Source README](./backend_source/AI-FitTrack-backend/README.md) \| [server/](./backend_source/AI-FitTrack-backend/server/) | Original, unaltered production-ready Node.js/Express REST API source code |

---

## Root Documentation & Quick Links

- **Final Documentation (Root Copy):** [AI_FitTrack_Final_Documentation.docx](./AI_FitTrack_Final_Documentation.docx)
- **Source Manifest:** [SOURCE_MANIFEST.json](./SOURCE_MANIFEST.json)
- **Submission Checklist:** [SUBMISSION_CHECKLIST.md](./SUBMISSION_CHECKLIST.md)
- **Postman Collection:** [AI-FitTrack.postman_collection.json](./backend_source/AI-FitTrack-backend/server/postman/AI-FitTrack.postman_collection.json)

---

## Demonstration Video

- **Public Google Drive Demo Video:** `[INSERT_PUBLIC_GOOGLE_DRIVE_VIDEO_LINK_HERE]`

*(Refer to [Phase 08 Demonstration Guide](./08_Project_Demonstration/Phase_08_Project_Demonstration_Guide.docx) for the video recording structure and voice-over script.)*

---

## Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Runtime & Framework** | Node.js (v20+ LTS / v24.x LTS), Express.js 5 | RESTful API architecture, JSON body parsing, CORS middleware |
| **Database & ODM** | MongoDB Atlas, Mongoose 9 | Document schemas, compound indexing (`{user: 1, workoutDate: -1}`), cascade queries |
| **Authentication & Security** | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` | Bcrypt salt rounds (12), Bearer token validation, database-backed user re-read, isolated user data |
| **Artificial Intelligence** | Google Gemini API (`@google/genai`) | AI workout recommendations, progress insights, exponential backoff retry handler |
| **Testing & Quality** | Node.js built-in test runner (`node:test`), Supertest, mongodb-memory-server | Unit tests, integration tests, security suites, validation checks, in-memory MongoDB |

---

## Backend Source Code Location

The backend source code is located in [`backend_source/AI-FitTrack-backend/`](./backend_source/AI-FitTrack-backend/):
```
backend_source/AI-FitTrack-backend/
├── server/
│   ├── config/
│   │   └── db.js                        # MongoDB Atlas connection lifecycle & events
│   ├── controllers/
│   │   ├── authController.js            # User registration, login, profile
│   │   ├── workoutController.js         # Workout CRUD, search, filter, stats
│   │   └── aiController.js              # Gemini recommendation & insight generation
│   ├── middleware/
│   │   ├── authMiddleware.js            # JWT Bearer token authentication & user re-read
│   │   └── errorMiddleware.js           # Standardized error responses & HTTP mapping
│   ├── models/
│   │   ├── User.js                      # User schema with bcrypt pre-save hashing
│   │   └── Workout.js                   # Workout schema with validation & compound indexes
│   ├── routes/
│   │   ├── authRoutes.js                # /api/auth routes
│   │   ├── workoutRoutes.js             # /api/workouts routes (protected)
│   │   └── aiRoutes.js                  # /api/ai routes (protected)
│   ├── services/
│   │   ├── jwtService.js                # JWT sign, verify, and decode logic
│   │   └── geminiService.js             # Google Gemini SDK caller with retry logic
│   ├── utils/                           # Validation schemas and response envelopes
│   ├── tests/                           # Complete test suite (95 tests)
│   ├── postman/                         # Exported Postman collection
│   ├── .env.example                     # Environment template (no secrets)
│   ├── app.js                           # Express application configuration
│   ├── server.js                        # HTTP server bootstrapper
│   └── package.json                     # Server dependencies and scripts
└── package.json                         # Root proxy scripts
```

Detailed architectural patterns and endpoints are documented in the [Backend Source README](./backend_source/AI-FitTrack-backend/README.md).

---

## Installation and Execution Instructions

### Prerequisites
- **Node.js**: v20+ LTS or v24.x LTS installed
- **MongoDB Atlas**: Free-tier or dedicated cluster with Network Access configured
- **Google Gemini API Key**: From Google AI Studio (required for `/api/ai/*` endpoints)

### 1. Clone the Repository
```bash
git clone https://github.com/parthi525855-oss/AI-FitTrack-Naan-Mudhalvan.git
cd AI-FitTrack-Naan-Mudhalvan
```

### 2. Configure Environment Variables
Navigate to the server directory and create your `.env` configuration from the provided template:
```bash
cd backend_source/AI-FitTrack-backend/server
cp .env.example .env
```
Open `.env` and fill in your connection details (never commit this file):
```ini
PORT=5000
MONGO_URI=mongodb+srv://<cluster-url>/ai-fittrack?retryWrites=true&w=majority
MONGO_USER=<your-atlas-username>
MONGO_PASSWORD=<your-atlas-password>
MONGO_AUTH_SOURCE=admin
JWT_SECRET=your_strong_random_jwt_secret_min_32_chars
JWT_EXPIRES_IN=1d
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run the Backend Server
```bash
npm start
```
*For development mode with automatic restarts:*
```bash
npm run dev
```

### 5. Verify Server Health
Open your browser or run curl:
```bash
curl http://localhost:5000/api/health
```
Expected response:
```json
{
  "success": true,
  "message": "AI FitTrack API is healthy",
  "data": {
    "status": "ok",
    "timestamp": "2026-09-27T..."
  }
}
```

---

## Testing Summary (Verified Evidence)

All verification metrics are backed by execution records in the [`06_Project_Testing/Evidence/`](./06_Project_Testing/Evidence/) directory:

| Test Category | Target / Scope | Result | Evidence File |
|---|---|---|---|
| **Automated Unit & Integration Tests** | Auth, Workouts, AI, Security, Validation, Gemini Retry (`node:test` + Supertest) | **95 passed, 0 failed** (11 test suites) | [`06_Project_Testing/Phase_06_Project_Testing.pdf`](./06_Project_Testing/Phase_06_Project_Testing.pdf) |
| **End-to-End Smoke Checks** | Route health, authentication cycle, workout CRUD, search filters, AI plan fallback | **17 passed, 0 failed** (17/17 checks) | [`backend_source/AI-FitTrack-backend/server/tests/smoke/e2e-smoke.js`](./backend_source/AI-FitTrack-backend/server/tests/smoke/e2e-smoke.js) |
| **MongoDB Atlas Live Integration** | Direct cloud cluster connectivity, index validation, write/read isolation | **19 passed, 0 failed** (19/19 checks) | [`backend_source/AI-FitTrack-backend/server/tests/smoke/atlas-check.js`](./backend_source/AI-FitTrack-backend/server/tests/smoke/atlas-check.js) |
| **Live API Evidence Records** | Registration, Login, Profile (Auth/Unauth), Workouts CRUD + Search, Gemini Recommendations & Insights | **15 sanitized transaction logs** | [`06_Project_Testing/Evidence/`](./06_Project_Testing/Evidence/) |

### Running the Test Suites Locally
To run the automated in-memory test suite (no live MongoDB or Gemini API key required):
```bash
cd backend_source/AI-FitTrack-backend/server
npm test
```

---

## Security and Privacy Assurance

- **No Secrets Committed:** This repository contains no private `.env` files, production passwords, active API keys, or JWT tokens.
- **Password Protection:** Uses `bcryptjs` with 12 salt rounds; passwords have `select: false` on the User model and are never returned in responses.
- **Strict Data Isolation:** All workout and AI routes require a valid JWT Bearer token; queries enforce ownership via `req.user._id`.
- **Injection Prevention:** User inputs are strictly validated with custom schemas, and search parameters are sanitized against regex injection.

---

## Source Integrity

- **Backend Source ZIP SHA-256:** `7431ff0027bcfeda1fa81b19151d3a3ada84b812adb1742b4eb84ed22f630320`
- **Official Requirements DOCX SHA-256:** `ee120f7fb965d423296687e3c0c528e828e44adce5dd28f39a0e5ebcb5c3a27d`
- **Phase 07 Final Report DOCX SHA-256:** `776f25b12957eb0e8dda0358ebfafb94e1039a53423b5eefae5b6fa0d2cdfb3c`

See [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md) for pre-submission checks.

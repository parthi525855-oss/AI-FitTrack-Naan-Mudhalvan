# AI FitTrack SmartBridge Naan Mudhalvan Submission

AI FitTrack is a backend-only REST API built with Node.js, Express.js, MongoDB, Mongoose, JWT, bcrypt and Google Gemini AI. This repository bundle preserves the uploaded backend and organizes the submission documentation into the eight required phases.

## Repository contents

- `backend_source/AI-FitTrack-backend/` - unchanged source extracted from the uploaded backend ZIP
- `01_Brainstorming_and_Ideation/` - concept selection and scope
- `02_Requirement_Analysis/` - official requirement mapping and reference copy
- `03_Project_Design/` - architecture, schema, API and security design
- `04_Project_Planning/` - evidence-based gates, risks and role placeholders
- `05_Project_Development/` - source implementation and module evidence
- `06_Project_Testing/` - test report plus supplied sanitized evidence
- `07_Project_Documentation/` - complete final project report
- `08_Project_Demonstration/` - demonstration guide, voice-over script and checklist

Each phase contains a DOCX and matching PDF.

## Run the backend

```bash
cd backend_source/AI-FitTrack-backend/server
npm ci
# create .env locally from .env.example; never commit it
npm start
```

Health endpoint: `GET http://localhost:5000/api/health`

## Verification baseline

The supplied records report 95 automated tests passed with 0 failures, 17 of 17 smoke checks, 19 of 19 Atlas checks and 15 sanitized live API evidence records. Before final submission, re-run the evidence flow on the frozen GitHub commit and capture evaluator-ready screenshots.

## Privacy

The bundle contains no private `.env` file, API key, password, MongoDB credential or JWT. Configure private values only in a local `server/.env` derived from `server/.env.example`.

## Source integrity

- Backend ZIP SHA-256: `7431ff0027bcfeda1fa81b19151d3a3ada84b812adb1742b4eb84ed22f630320`
- Official requirements DOCX SHA-256: `ee120f7fb965d423296687e3c0c528e828e44adce5dd28f39a0e5ebcb5c3a27d`

See `SUBMISSION_CHECKLIST.md` for the remaining student-provided items.

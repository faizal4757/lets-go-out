# Lets Go Out - Project Notes

## What this app does
- Simple social app to host and join outings (movies, coffee, sports, etc.).
- Users can create outings, browse, express interest, and hosts accept/reject.
- MVP scope is intentionally small (no chat, payments, feeds, dating features).

## Tech stack
- Backend: Cloudflare Workers + D1 (SQLite).
- Frontend: Vanilla HTML/CSS/JS (no framework, lightweight MVP).
- Hosting: Cloudflare Pages for frontend, Workers for API.

## Key technical decisions
- Session auth with bearer tokens stored in localStorage.
- No real-time chat or feeds to keep MVP safe and simple.
- Database schema auto-checks to avoid production breaks.
- Frontend API URL is dynamic via Pages Function /config.

## Backend structure (high level)
- Single Worker entry: backend/index.js.
- Routes:
  - /auth/signup, /auth/login, /auth/session, /auth/logout
  - /auth/github, /auth/github/callback (optional OAuth)
  - /profile (GET/PATCH), /users/:id/profile
  - /outings (GET/POST), /outings/:id (PATCH), /outings/:id/close
  - /interest_requests (GET/POST), /interest_requests/:id (PATCH)
- D1 schema:
  - users, sessions, outings, interest_requests

## Frontend structure
- index.html: basic layout and forms.
- app.js: DOM logic + UI actions (create outing, request interest, etc.).
- api.js: API wrapper (adds auth token, handles session expiry).
- state.js: session persistence in localStorage.

## Dynamic config (no code edits for URLs)
- Pages Function: frontend/functions/config.js
- Returns JSON: { apiBaseUrl: "..." }
- Frontend loads /config at runtime, falls back to localhost in dev.

## Deployment notes
- Backend deploy:
  - wrangler deploy --env production
- Frontend deploy:
  - npx wrangler pages deploy . --project-name=lets-go-out
- Pages env vars:
  - API_BASE_URL = https://lets-go-out.lets-go-out-api.workers.dev
- Share this link:
  - https://lets-go-out.pages.dev

## Local dev
- Backend:
  - wrangler dev --env dev
- Frontend:
  - cd frontend
  - python -m http.server 8080
  - open http://localhost:8080

## Common pitfalls and fixes
- 500 errors on /outings or /interest_requests:
  - usually missing DB columns (e.g., is_closed). Run migrations or auto-checks.
- Wrong Worker URL:
  - check /config from Pages and Pages env var API_BASE_URL.
- wrangler dev fails with env.DB undefined:
  - must use --env dev.

## Why it was failing earlier (summary)
- Production DB schema was older than backend code (missing is_closed).
- The Worker was deployed under a different name, so frontend hit old URL.
- Fix: add schema migration + set production name to match.

## How to remember this project
- Think: "MVP social outings" + "Workers + D1 + Pages".
- Core flows: auth -> profile -> outings -> interest requests.
- Dynamic config via /config so URLs never hardcoded.
- Always migrate DB when schema changes.

## Future improvements to consider
- Add pagination for outings.
- Add rate limiting for auth and requests.
- Add caching for /outings.
- Add migration system (schema_version table).
- Better logging and monitoring.

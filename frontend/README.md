# Frontend MVP

Minimal web UI for Lets Go Out.
Built with plain HTML, CSS, and JS.

Purpose:
- Validate core outing flow
- Persist login with session token + expiry
- Disposable UI (React later)

## Pages

- `home.html` + `home.js`: landing page with sign up / log in
- `outings.html` + `outings.js`: outing creation/discovery and interest workflows
- `profile.html` + `profile.js`: profile management and account deactivation

## Real-time behavior (MVP)

- `outings.js` opens an EventSource stream to `/events` for near-real-time outing and interest updates.
- A periodic background sync every 8 seconds remains active as fallback while the tab is visible.
- Combined behavior keeps outings, interest requests, and accept/reject status changes up to date across users without manual refresh.

`index.html` redirects to `home.html` for root compatibility in local and deployed environments.

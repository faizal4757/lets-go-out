/**
 * Base URL of the deployed backend API
 * This points to the Cloudflare Workers backend
 */
const API_BASE_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787"
    : "https://lets-go-out.lets-go-out-api.workers.dev";

/**
 * Generic API request helper
 *
 * All frontend API calls go through this function.
 * Responsibilities:
 * - Attach required headers (Content-Type, X-User-Id)
 * - Parse JSON responses
 * - Surface backend error messages to the UI
 *
 * @param {string} path - API endpoint path (e.g. /outings)
 * @param {object} options - fetch options (method, body, headers)
 */
async function apiRequest(path, options = {}) {
  // Make the HTTP request using fetch
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      // Backend expects JSON payloads
      "Content-Type": "application/json",

      // Simulated authentication via user id header
      // Fallback to user_1 if not explicitly set
      "X-User-Id": window.currentUser || "user_1",

      // Allow overriding / extending headers per request
      ...(options.headers || {})
    },

    // Spread remaining fetch options (method, body, etc.)
    ...options
  });

  // Parse JSON response from backend
  const data = await response.json();

  /**
   * If backend responds with a non-2xx status:
   * - Extract error message from response
   * - Throw an Error so UI layer can handle it
   *
   * This is the key part for AP-7:
   * backend errors are NOT swallowed,
   * they are surfaced to the frontend cleanly.
   */
  if (!response.ok) {
    throw new Error(data.error || "API error");
  }

  // For successful responses, return parsed data
  return data;
}

/* =========================================================
   AP-2: Create an outing
   Host creates a new outing (movie / coffee / sports)
   ========================================================= */
window.createOuting = (payload) =>
  apiRequest("/outings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

/* =========================================================
   AP-3: Fetch all available outings
   Used by both hosts and guests
   ========================================================= */
window.getOutings = () =>
  apiRequest("/outings");

/* =========================================================
   AP-4: Express interest in an outing
   Guest sends an interest request to the host
   ========================================================= */
window.expressInterest = (outingId) =>
  apiRequest("/interest_requests", {
    method: "POST",
    body: JSON.stringify({ outing_id: outingId })
  });

/* =========================================================
   AP-5: Fetch interest requests for a specific outing
   Only the host of the outing is authorized
   ========================================================= */
window.getInterestRequests = (outingId) =>
  apiRequest(`/outings/${outingId}/interest_requests`);

/* =========================================================
   AP-5: Update interest request status
   Host can accept or reject a request
   ========================================================= */
window.updateInterestStatus = (requestId, status) =>
  apiRequest(`/interest_requests/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

/* =========================================================
   AP-15: Fetch my interest requests (Guest view)
   ========================================================= */
window.getMyInterestRequests = () =>
  apiRequest("/interest_requests");

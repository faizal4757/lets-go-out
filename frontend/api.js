const API_BASE_URL = "https://lets-go-out.lets-go-out-api.workers.dev";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": window.currentUser || "user_1",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "API error");
  }

  return data;
}

/* AP-2 */
window.createOuting = (payload) =>
  apiRequest("/outings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

/* AP-3 */
window.getOutings = () =>
  apiRequest("/outings");

/* AP-4 */
window.expressInterest = (outingId) =>
  apiRequest("/interest_requests", {
    method: "POST",
    body: JSON.stringify({ outing_id: outingId })
  });

/* AP-5 */
window.getInterestRequests = (outingId) =>
  apiRequest(`/outings/${outingId}/interest_requests`);

window.updateInterestStatus = (requestId, status) =>
  apiRequest(`/interest_requests/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

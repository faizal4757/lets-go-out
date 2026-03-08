const FALLBACK_API_BASE_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787"
    : "https://lets-go-out.lets-go-out-api.workers.dev";
let resolvedApiBaseUrl = null;

async function loadApiBaseUrl() {
  if (resolvedApiBaseUrl) {
    return resolvedApiBaseUrl;
  }

  try {
    const response = await fetch("/config", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.apiBaseUrl === "string" && data.apiBaseUrl.trim()) {
        resolvedApiBaseUrl = data.apiBaseUrl.trim();
        return resolvedApiBaseUrl;
      }
    }
  } catch (_err) {
    // Fallback is applied below if config fetch fails.
  }

  resolvedApiBaseUrl = FALLBACK_API_BASE_URL;
  return resolvedApiBaseUrl;
}
const SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";

function expireSession() {
  setCurrentUser(null);
  window.dispatchEvent(
    new CustomEvent("session-expired", {
      detail: { message: SESSION_EXPIRED_MESSAGE }
    })
  );
}

async function apiRequest(path, options = {}) {
  const requiresAuth = !path.startsWith("/auth/") || path === "/auth/session" || path === "/auth/logout";
  if (requiresAuth && !isAuthenticated()) {
    expireSession();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (window.currentSessionToken) {
    headers.Authorization = `Bearer ${window.currentSessionToken}`;
  }

  const apiBaseUrl = await loadApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers
  });

  const refreshedExpiry = response.headers.get("X-Session-Expires-At");
  if (refreshedExpiry) {
    updateSessionExpiry(refreshedExpiry);
  }

  let data = {};
  try {
    data = await response.json();
  } catch (_err) {
    data = {};
  }

  if (response.status === 401 && requiresAuth) {
    expireSession();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(data.error || "API error");
  }

  return data;
}

window.signup = (payload) =>
  apiRequest("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload)
  });

window.login = (payload) =>
  apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });

window.restoreSession = () => apiRequest("/auth/session");

window.logoutSession = () =>
  apiRequest("/auth/logout", {
    method: "POST"
  });

window.getMyProfile = () => apiRequest("/profile");

window.updateMyProfile = (payload) =>
  apiRequest("/profile", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

window.deleteMyAccount = () =>
  apiRequest("/profile", {
    method: "DELETE"
  });

window.getUserProfile = (userId) => apiRequest(`/users/${userId}/profile`);

window.createOuting = (payload) =>
  apiRequest("/outings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

window.getOutings = () => apiRequest("/outings");

window.updateOuting = (outingId, payload) =>
  apiRequest(`/outings/${outingId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

window.expressInterest = (outingId) =>
  apiRequest("/interest_requests", {
    method: "POST",
    body: JSON.stringify({ outing_id: outingId })
  });

window.getInterestRequests = (outingId) =>
  apiRequest(`/outings/${outingId}/interest_requests`);

window.updateInterestStatus = (requestId, status) =>
  apiRequest(`/interest_requests/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

window.getMyInterestRequests = () => apiRequest("/interest_requests");

window.closeOuting = (outingId) =>
  apiRequest(`/outings/${outingId}/close`, {
    method: "PATCH"
  });

window.openOutingsUpdatesStream = async ({ onConnected, onUpdate, onError } = {}) => {
  if (!window.currentSessionToken) {
    throw new Error("Missing session token");
  }

  const apiBaseUrl = await loadApiBaseUrl();
  const token = encodeURIComponent(window.currentSessionToken);
  const streamUrl = `${apiBaseUrl}/events?token=${token}`;
  const source = new EventSource(streamUrl);

  source.addEventListener("connected", (event) => {
    if (typeof onConnected === "function") {
      onConnected(event);
    }
  });

  source.addEventListener("outings-updated", (event) => {
    if (typeof onUpdate === "function") {
      onUpdate(event);
    }
  });

  source.onerror = (event) => {
    if (typeof onError === "function") {
      onError(event);
    }
  };

  return source;
};

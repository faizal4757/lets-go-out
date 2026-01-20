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

/* =========================
   CREATE OUTING
   ========================= */
window.createOuting = async function (payload) {
  return apiRequest("/outings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
};

/* =========================
   GET OUTINGS
   ========================= */
window.getOutings = async function () {
  return apiRequest("/outings", {
    method: "GET"
  });
};

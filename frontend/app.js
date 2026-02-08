console.log("Frontend loaded");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");

const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const showSignupBtn = document.getElementById("show-signup-btn");
const showLoginBtn = document.getElementById("show-login-btn");
const logoutBtn = document.getElementById("logout-btn");

const form = document.getElementById("create-outing-form");
const messageEl = document.getElementById("message");
const errorEl = document.getElementById("global-error");

const outingsListEl = document.getElementById("outings-list");
const requestsListEl = document.getElementById("requests-list");
const myRequestsListEl = document.getElementById("my-requests-list");
const currentUserLabel = document.getElementById("current-user-label");

let myInterestStatusByOuting = {};

const STATUS_UI = {
  pending: {
    label: "Pending",
    message: "Waiting for host decision",
    className: "pending"
  },
  accepted: {
    label: "Accepted",
    message: "You are in. See you there.",
    className: "accepted"
  },
  rejected: {
    label: "Rejected",
    message: "This outing did not work out.",
    className: "rejected"
  }
};

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

function showSuccess(message) {
  messageEl.textContent = message;
  messageEl.classList.remove("hidden");
  setTimeout(() => {
    messageEl.classList.add("hidden");
  }, 3000);
}

function createButton(label, onClick, className) {
  const button = document.createElement("button");
  button.textContent = label;

  if (className) {
    button.classList.add(className);
  }

  if (onClick) {
    button.onclick = onClick;
  }

  return button;
}

function showAuthMode(mode) {
  if (mode === "signup") {
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  } else {
    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
  }
}

function updateUserUI() {
  if (!window.currentUserProfile) {
    currentUserLabel.textContent = "";
    return;
  }

  const name = window.currentUserProfile.display_name || window.currentUserProfile.email;
  currentUserLabel.textContent = `${name} (${window.currentUserProfile.email})`;
}

async function renderAuthState() {
  clearError();

  if (!isAuthenticated()) {
    appSection.classList.add("hidden");
    authSection.classList.remove("hidden");
    showAuthMode("signup");
    return;
  }

  try {
    const refreshedSession = await restoreSession();
    setCurrentUser(refreshedSession);
  } catch (_err) {
    setCurrentUser(null);
    appSection.classList.add("hidden");
    authSection.classList.remove("hidden");
    showAuthMode("login");
    return;
  }

  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  updateUserUI();

  requestsListEl.innerHTML = "<li>Select one of your outings</li>";
  await loadMyRequests();
  await loadOutings();
}

showSignupBtn.addEventListener("click", () => {
  clearError();
  showAuthMode("signup");
});

showLoginBtn.addEventListener("click", () => {
  clearError();
  showAuthMode("login");
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const display_name = document.getElementById("signup-display-name").value.trim();

  if (!email || !password) {
    showError("Email and password are required.");
    return;
  }

  if (!emailPattern.test(email)) {
    showError("Please enter a valid email address.");
    return;
  }

  if (password.length < 8) {
    showError("Password must be at least 8 characters.");
    return;
  }

  try {
    const result = await signup({ email, password, display_name });
    setCurrentUser(result);
    signupForm.reset();
    showSuccess("Account created. You are now logged in.");
    await renderAuthState();
  } catch (err) {
    showError(err.message);
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showError("Email and password are required.");
    return;
  }

  try {
    const result = await login({ email, password });
    setCurrentUser(result);
    loginForm.reset();
    showSuccess("Logged in successfully.");
    await renderAuthState();
  } catch (err) {
    showError(err.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await logoutSession();
  } catch (_err) {
    // Local logout still applies even if server logout request fails.
  }
  setCurrentUser(null);
  showSuccess("Logged out.");
  await renderAuthState();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const rawDate = document.getElementById("date_time").value;
  const unixDate = Math.floor(new Date(rawDate).getTime() / 1000);

  if (!Number.isFinite(unixDate)) {
    showError("Please provide a valid date and time.");
    return;
  }

  const payload = {
    title: document.getElementById("title").value,
    activity_type: document.getElementById("type").value,
    date_time: unixDate,
    location: document.getElementById("location").value
  };

  try {
    await createOuting(payload);
    showSuccess("Outing created successfully.");
    form.reset();
    await loadOutings();
  } catch (err) {
    showError(err.message);
  }
});

async function loadOutings() {
  outingsListEl.innerHTML = "";
  clearError();

  try {
    const outings = await getOutings();

    outings.forEach((outing) => {
      const li = document.createElement("li");

      const titleRow = document.createElement("div");
      titleRow.textContent = `${outing.title} | ${outing.activity_type}`;
      li.appendChild(titleRow);

      const buttonRow = document.createElement("div");
      buttonRow.className = "button-row";

      if (outing.host_user_id === window.currentUser) {
        const viewBtn = createButton("View requests", () => loadRequests(outing.id));
        buttonRow.appendChild(viewBtn);

        if (outing.is_closed === 0) {
          const closeBtn = createButton("Close outing", async () => {
            clearError();
            try {
              await closeOuting(outing.id);
              showSuccess("Outing closed successfully.");
              await loadOutings();
              await loadMyRequests();
            } catch (err) {
              showError(err.message);
            }
          });
          buttonRow.appendChild(closeBtn);
        } else {
          const closedTag = document.createElement("span");
          closedTag.textContent = "Closed";
          closedTag.className = "closed-tag";
          buttonRow.appendChild(closedTag);
        }
      } else {
        const interestBtn = createButton("", null);
        const status = myInterestStatusByOuting[outing.id];

        if (!status) {
          interestBtn.textContent = "I am interested";
          interestBtn.onclick = async () => {
            clearError();
            try {
              await expressInterest(outing.id);
              interestBtn.textContent = "Awaiting host response";
              interestBtn.disabled = true;
              interestBtn.classList.add("pending");
              await loadMyRequests();
            } catch (err) {
              showError(err.message);
            }
          };
        } else {
          if (outing.is_closed === 1) {
            interestBtn.textContent = `${STATUS_UI[status].label} (Outing closed)`;
          } else {
            interestBtn.textContent = STATUS_UI[status].label;
          }
          interestBtn.disabled = true;
          interestBtn.classList.add(status);
        }

        buttonRow.appendChild(interestBtn);
      }

      li.appendChild(buttonRow);
      outingsListEl.appendChild(li);
    });
  } catch (err) {
    showError(err.message);
  }
}

async function loadRequests(outingId) {
  requestsListEl.innerHTML = "";
  clearError();

  try {
    const requests = await getInterestRequests(outingId);

    if (requests.length === 0) {
      requestsListEl.innerHTML = "<li>No requests yet</li>";
      return;
    }

    requests.forEach((req) => {
      const li = document.createElement("li");
      li.textContent = `User: ${req.requester_user_id} | Status: ${req.status}`;

      if (req.status === "pending") {
        const acceptBtn = createButton("Accept", async () => {
          clearError();
          try {
            await updateInterestStatus(req.id, "accepted");
            await loadRequests(outingId);
            await loadMyRequests();
          } catch (err) {
            showError(err.message);
          }
        });

        const rejectBtn = createButton("Reject", async () => {
          clearError();
          try {
            await updateInterestStatus(req.id, "rejected");
            await loadRequests(outingId);
            await loadMyRequests();
          } catch (err) {
            showError(err.message);
          }
        });

        li.appendChild(acceptBtn);
        li.appendChild(rejectBtn);
      }

      requestsListEl.appendChild(li);
    });
  } catch (err) {
    showError(err.message);
  }
}

async function loadMyRequests() {
  myRequestsListEl.innerHTML = "";
  clearError();

  try {
    const requests = await getMyInterestRequests();
    myInterestStatusByOuting = {};
    requests.forEach((req) => {
      myInterestStatusByOuting[req.outing_id] = req.status;
    });

    if (requests.length === 0) {
      myRequestsListEl.innerHTML = "<li>No requests yet</li>";
      return;
    }

    requests.forEach((req) => {
      const li = document.createElement("li");
      const ui = STATUS_UI[req.status];

      let closedNote = "";
      if (req.is_closed === 1) {
        if (req.status === "accepted") {
          closedNote = "Host closed requests. You are confirmed.";
        } else if (req.status === "pending") {
          closedNote = "Host closed this outing before deciding.";
        } else {
          closedNote = "Host finalized decisions and closed this outing.";
        }
      }

      li.innerHTML = `
        <strong>${req.title}</strong><br/>
        ${req.activity_type} | ${req.location || ""}<br/>
        <span class="${ui.className}">${ui.label}: ${ui.message}</span>
        ${closedNote ? `<div class="closed-note ${req.status}-note">${closedNote}</div>` : ""}
      `;

      myRequestsListEl.appendChild(li);
    });
  } catch (err) {
    showError(err.message);
  }
}

renderAuthState();

window.addEventListener("session-expired", async (event) => {
  const message = event?.detail?.message || "Session expired. Please log in again.";
  await renderAuthState();
  showError(message);
});

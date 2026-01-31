/**
 * Frontend entry point
 * Handles UI rendering, user switching, and backend interactions
 */

console.log("Frontend MVP loaded");
let isInitialLoad = true;

/* =========================================================
   DOM REFERENCES
   ========================================================= */

const form = document.getElementById("create-outing-form");
const messageEl = document.getElementById("message");
const errorEl = document.getElementById("global-error");

const outingsListEl = document.getElementById("outings-list");
const requestsListEl = document.getElementById("requests-list");
const myRequestsListEl = document.getElementById("my-requests-list");

const userSelector = document.getElementById("user-selector");
const currentUserLabel = document.getElementById("current-user-label");

/* =========================================================
   GLOBAL STATE
   ========================================================= */

let myInterestStatusByOuting = {};

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */

function showError(message) {
  if (isInitialLoad) return;
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

/* =========================================================
   STATUS UI MAPPING
   ========================================================= */

const STATUS_UI = {
  pending: {
    label: "Pending",
    message: "Waiting for host decision",
    className: "pending"
  },
  accepted: {
    label: "Accepted",
    message: "You’re in. See you there.",
    className: "accepted"
  },
  rejected: {
    label: "Rejected",
    message: "This outing didn’t work out.",
    className: "rejected"
  }
};

/* =========================================================
   USER SWITCHING
   ========================================================= */

function updateUserUI() {
  currentUserLabel.textContent = window.currentUser;
}

userSelector.addEventListener("change", async () => {
  setCurrentUser(userSelector.value);
  updateUserUI();
  clearError();

  await loadMyRequests();
  await loadOutings();

  requestsListEl.innerHTML = "<li>Select one of your outings</li>";
});

/* =========================================================
   CREATE OUTING
   ========================================================= */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const payload = {
    title: document.getElementById("title").value,
    activity_type: document.getElementById("type").value,
    date_time: Math.floor(
      new Date(document.getElementById("date_time").value).getTime() / 1000
    ),
    location: document.getElementById("location").value
  };

  try {
    await createOuting(payload);
    showSuccess("Outing created successfully");
    form.reset();
    loadOutings();
  } catch (err) {
    showError(err.message);
  }
});

/* =========================================================
   LOAD OUTINGS (FEED)
   ========================================================= */

async function loadOutings() {
  outingsListEl.innerHTML = "";
  clearError();

  try {
    const outings = await getOutings();

    outings.forEach((outing) => {
      const li = document.createElement("li");

      /* ---------- TITLE ROW ---------- */
      const titleRow = document.createElement("div");
      titleRow.textContent = `${outing.title} | ${outing.activity_type}`;
      li.appendChild(titleRow);

      /* ---------- BUTTON ROW ---------- */
      const buttonRow = document.createElement("div");
      buttonRow.className = "button-row";

      /* ==========================
         HOST VIEW
         ========================== */
      if (outing.host_user_id === window.currentUser) {
        const viewBtn = document.createElement("button");
        viewBtn.textContent = "View requests";
        viewBtn.onclick = () => loadRequests(outing.id);
        buttonRow.appendChild(viewBtn);

        if (outing.is_closed === 0) {
          const closeBtn = document.createElement("button");
          closeBtn.textContent = "Close outing";

          closeBtn.onclick = async () => {
            clearError();
            try {
              await closeOuting(outing.id);
              showSuccess("Outing closed successfully!");
              loadOutings();
              loadMyRequests();
            } catch (err) {
              showError(err.message);
            }
          };

          buttonRow.appendChild(closeBtn);
        } else {
          const closedTag = document.createElement("span");
          closedTag.textContent = " 🚫 Closed";
          closedTag.className = "closed-tag";
          buttonRow.appendChild(closedTag);
        }
      }

      /* ==========================
         GUEST VIEW
         ========================== */
      if (outing.host_user_id !== window.currentUser) {
        const interestBtn = document.createElement("button");

        const status = myInterestStatusByOuting[outing.id];

        if (!status) {
          interestBtn.textContent = "I'm interested";

          interestBtn.onclick = async () => {
            clearError();
            try {
              await expressInterest(outing.id);

              interestBtn.textContent = "Awaiting host response";
              interestBtn.disabled = true;
              interestBtn.classList.add("pending");

              loadMyRequests();
            } catch (err) {
              showError(err.message);
            }
          };
        } else {
          if (outing.is_closed === 1) {
            interestBtn.textContent = `${STATUS_UI[status].label} (Outing Closed)`;
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

/* =========================================================
   LOAD HOST REQUESTS
   ========================================================= */

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
        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "Accept";

        const rejectBtn = document.createElement("button");
        rejectBtn.textContent = "Reject";

        acceptBtn.onclick = async () => {
          clearError();
          await updateInterestStatus(req.id, "accepted");
          loadRequests(outingId);
          loadMyRequests();
        };

        rejectBtn.onclick = async () => {
          clearError();
          await updateInterestStatus(req.id, "rejected");
          loadRequests(outingId);
          loadMyRequests();
        };

        li.appendChild(acceptBtn);
        li.appendChild(rejectBtn);
      }

      requestsListEl.appendChild(li);
    });
  } catch (err) {
    showError(err.message);
  }
}

/* =========================================================
   LOAD MY REQUESTS (GUEST STATUS PANEL)
   ========================================================= */

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
          closedNote =
            "✅ Host closed requests. You’re confirmed and ready to meet!";
        } else if (req.status === "pending") {
          closedNote =
            "⏳ Host closed this outing before deciding. No further requests allowed.";
        } else {
          closedNote =
            "🚫 Host finalized decisions and closed this outing.";
        }
      }

      li.innerHTML = `
        <strong>${req.title}</strong><br/>
        ${req.activity_type} | ${req.location || ""}<br/>
        <span class="${ui.className}">
          ${ui.label}: ${ui.message}
        </span>

        ${
          closedNote
            ? `<div class="closed-note ${req.status}-note">${closedNote}</div>`
            : ""
        }
      `;

      myRequestsListEl.appendChild(li);
    });
  } catch (err) {
    showError(err.message);
  }
}

/* =========================================================
   INITIAL LOAD
   ========================================================= */

async function initApp() {
  updateUserUI();
  await loadMyRequests();
  await loadOutings();
  isInitialLoad = false;
}

initApp();

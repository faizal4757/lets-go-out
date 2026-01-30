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
   Global Map
   ========================================================= */

let myInterestStatusByOuting = {};

/* =========================================================
   HELPER FUNCTIONS (AP-7)
   ========================================================= */

/** Show backend error message */
function showError(message) {
  if (isInitialLoad) return; // suppress errors on initial load
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}


/** Clear error message */
function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

/** Show success message */
function showSuccess(message) {
  messageEl.textContent = message;
  messageEl.classList.remove("hidden");

  setTimeout(() => {
    messageEl.classList.add("hidden");
  }, 3000);
}
/* =========================================================
   AP-15: Status → UI mapping
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
   USER SWITCHING (AP-6)
   ========================================================= */

function updateUserUI() {
  currentUserLabel.textContent = window.currentUser;
}

userSelector.addEventListener("change", async () => {
  setCurrentUser(userSelector.value);
  updateUserUI();
  clearError();

  await loadMyRequests(); // rebuild interest state
  await loadOutings();    // render correctly

  requestsListEl.innerHTML = "<li>Select one of your outings</li>";
});


/* =========================================================
   CREATE OUTING (AP-2 + AP-7)
   ========================================================= */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const payload = {
    title: document.getElementById("title").value,
    activity_type: document.getElementById("type").value,
    date_time: document.getElementById("date_time").value,
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
   LOAD OUTINGS (AP-3 → AP-7)
   ========================================================= */

async function loadOutings() {
  outingsListEl.innerHTML = "";
  clearError();

  try {
    const outings = await getOutings();

    outings.forEach((outing) => {
      const li = document.createElement("li");
      li.textContent = `${outing.title} | ${outing.activity_type}`;

      /* ---------- HOST VIEW ---------- */
      if (outing.host_user_id === window.currentUser) {
        const viewBtn = document.createElement("button");
        viewBtn.textContent = "View requests";
        viewBtn.onclick = () => loadRequests(outing.id);
        li.appendChild(viewBtn);
      }

      /* ---------- GUEST VIEW ---------- */
      if (outing.host_user_id !== window.currentUser) {
        const interestBtn = document.createElement("button");

        const status = myInterestStatusByOuting[outing.id];

        if (!status) {
          // No request yet
          interestBtn.textContent = "I'm interested";

          interestBtn.onclick = async () => {
            clearError();
            try {
              await expressInterest(outing.id);

              interestBtn.textContent = "Awaiting host response";
              interestBtn.disabled = true;
              interestBtn.classList.add("pending");

              loadMyRequests(); // immediately reflect in AP-15 section
            } catch (err) {
              showError(err.message);
            }
          };

        } else if (status === "pending") {
          interestBtn.textContent = "Awaiting host response";
          interestBtn.disabled = true;
          interestBtn.classList.add("pending");
        } else if (status === "accepted") {
          interestBtn.textContent = "Request accepted";
          interestBtn.disabled = true;
          interestBtn.classList.add("accepted");
        } else if (status === "rejected") {
          interestBtn.textContent = "Request rejected";
          interestBtn.disabled = true;
          interestBtn.classList.add("rejected");
        }

        li.appendChild(interestBtn);
      }

      outingsListEl.appendChild(li);
    });
  } catch (err) {
    showError(err.message);
  }
}

/* =========================================================
   LOAD INTEREST REQUESTS (AP-5 + AP-7)
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
          try {
            await updateInterestStatus(req.id, "accepted");
            loadRequests(outingId);
            loadMyRequests(); // keep guest state in sync
          } catch (err) {
            showError(err.message);
          }
        };

        rejectBtn.onclick = async () => {
          clearError();
          try {
            await updateInterestStatus(req.id, "rejected");
            loadRequests(outingId);
          } catch (err) {
            showError(err.message);
          }
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
   AP-15: Load my interest requests (Guest)
   ========================================================= */

async function loadMyRequests() {
  myRequestsListEl.innerHTML = "";
  clearError();

  try {
    const requests = await getMyInterestRequests();
    myInterestStatusByOuting = {};
      requests.forEach(req => {
        myInterestStatusByOuting[req.outing_id] = req.status;
      });

    requests.sort((a, b) => b.created_at - a.created_at);

    if (requests.length === 0) {
      myRequestsListEl.innerHTML = "<li>No requests yet</li>";
      return;
    }

    requests.forEach((req) => {
      const li = document.createElement("li");

      const ui = STATUS_UI[req.status];

      li.innerHTML = `
        <strong>${req.title}</strong><br/>
        ${req.activity_type} | ${req.date_time}<br/>
        ${req.location || ""}<br/>
        <span class="${ui.className}">
          ${ui.label}: ${ui.message}
        </span>
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
  await loadMyRequests(); // MUST come first
  await loadOutings();    // uses interest state
  isInitialLoad = false;
}

initApp();

const form = document.getElementById("create-outing-form");
const messageEl = document.getElementById("message");
const errorEl = document.getElementById("global-error");

const outingsListEl = document.getElementById("outings-list");
const requestsListEl = document.getElementById("requests-list");
const myRequestsListEl = document.getElementById("my-requests-list");
const currentUserLabel = document.getElementById("current-user-label");
const hostProfilePanel = document.getElementById("host-profile-panel");
const hostProfileDetails = document.getElementById("host-profile-details");
const logoutBtn = document.getElementById("logout-btn");

let myInterestStatusByOuting = {};
let outingInterestRequestCounts = {};
let selectedOutingIdForRequests = null;
let pollingTimerId = null;
let isSyncInProgress = false;
let liveUpdatesSource = null;
let reconnectLiveUpdatesTimerId = null;

const POLL_INTERVAL_MS = 8000;
const LIVE_RECONNECT_DELAY_MS = 3000;

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

function toDateTimeLocalValue(unixSeconds) {
  const date = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function updateUserUI() {
  if (!window.currentUserProfile) {
    currentUserLabel.textContent = "";
    return;
  }

  const name = window.currentUserProfile.display_name || window.currentUserProfile.email;
  currentUserLabel.textContent = `${name} (${window.currentUserProfile.email})`;
}

function hideHostProfilePanel() {
  hostProfilePanel.classList.add("hidden");
  hostProfileDetails.textContent = "";
}

function redirectToHome() {
  window.location.href = "home.html";
}

async function guardAuthenticatedPage() {
  if (!isAuthenticated()) {
    redirectToHome();
    return false;
  }

  try {
    const refreshedSession = await restoreSession();
    setCurrentUser(refreshedSession);
    updateUserUI();
    return true;
  } catch (_err) {
    setCurrentUser(null);
    redirectToHome();
    return false;
  }
}

async function showHostProfile(userId) {
  clearError();

  try {
    const profile = await getUserProfile(userId);
    const user = profile.user;
    const lines = [
      `Name: ${user.display_name || "N/A"}`,
      `Email: ${user.email || "N/A"}`,
      `Age: ${user.age ?? "N/A"}`,
      `Likes: ${user.likes || "N/A"}`,
      `Dislikes: ${user.dislikes || "N/A"}`,
      `Interests: ${user.interests || "N/A"}`
    ];

    hostProfileDetails.textContent = lines.join("\n");
    hostProfilePanel.classList.remove("hidden");
  } catch (err) {
    showError(err.message);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
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
    await syncOutingsState();
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
  redirectToHome();
});

async function loadOutings({ silent = false } = {}) {
  outingsListEl.innerHTML = "";
  if (!silent) {
    clearError();
  }

  try {
    const outings = await getOutings();

    if (outings.length === 0) {
      outingsListEl.innerHTML = '<li class="empty-state">No outings available yet. Create one to get started!</li>';
      return;
    }

    outingInterestRequestCounts = {};
    const myOutings = outings.filter((outing) => outing.host_user_id === window.currentUser);
    await Promise.all(
      myOutings.map(async (outing) => {
        try {
          const requests = await getInterestRequests(outing.id);
          outingInterestRequestCounts[outing.id] = requests.length;
        } catch (_err) {
          outingInterestRequestCounts[outing.id] = 0;
        }
      })
    );

    outings.forEach((outing) => {
      const li = document.createElement("li");

      const titleRow = document.createElement("div");
      titleRow.textContent = `${outing.title} | ${outing.activity_type} | Host: ${outing.host_display_name || outing.host_user_id}`;
      li.appendChild(titleRow);

      const buttonRow = document.createElement("div");
      buttonRow.className = "button-row";
      const hostProfileBtn = createButton("View host profile", () => showHostProfile(outing.host_user_id));
      buttonRow.appendChild(hostProfileBtn);

      if (outing.host_user_id === window.currentUser) {
        if (outing.is_closed === 0) {
          const hasRequests = outingInterestRequestCounts[outing.id] > 0;
          const editBtn = createButton("Edit outing", () => {
            const existingForm = li.querySelector(".outing-edit-form");
            if (existingForm) {
              existingForm.classList.toggle("hidden");
              return;
            }

            const editForm = document.createElement("form");
            editForm.className = "outing-edit-form";

            const titleWrap = document.createElement("div");
            const titleLabel = document.createElement("label");
            titleLabel.textContent = "Title";
            const titleBreak = document.createElement("br");
            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.name = "title";
            titleInput.required = true;
            titleInput.value = outing.title || "";
            titleWrap.append(titleLabel, titleBreak, titleInput);

            const typeWrap = document.createElement("div");
            const typeLabel = document.createElement("label");
            typeLabel.textContent = "Type";
            const typeBreak = document.createElement("br");
            const typeSelect = document.createElement("select");
            typeSelect.name = "activity_type";
            const activityOptions = ["movie", "coffee", "sports"];
            if (outing.activity_type && !activityOptions.includes(outing.activity_type)) {
              activityOptions.push(outing.activity_type);
            }
            activityOptions.forEach((option) => {
              const optionEl = document.createElement("option");
              optionEl.value = option;
              optionEl.textContent = option;
              if (option === outing.activity_type) {
                optionEl.selected = true;
              }
              typeSelect.appendChild(optionEl);
            });
            typeWrap.append(typeLabel, typeBreak, typeSelect);

            const dateWrap = document.createElement("div");
            const dateLabel = document.createElement("label");
            dateLabel.textContent = "Date and Time";
            const dateBreak = document.createElement("br");
            const dateInput = document.createElement("input");
            dateInput.type = "datetime-local";
            dateInput.name = "date_time";
            dateInput.required = true;
            dateInput.value = toDateTimeLocalValue(outing.date_time);
            dateWrap.append(dateLabel, dateBreak, dateInput);

            const locationWrap = document.createElement("div");
            const locationLabel = document.createElement("label");
            locationLabel.textContent = "Location";
            const locationBreak = document.createElement("br");
            const locationInput = document.createElement("input");
            locationInput.type = "text";
            locationInput.name = "location";
            locationInput.value = outing.location || "";
            locationWrap.append(locationLabel, locationBreak, locationInput);

            const saveButton = document.createElement("button");
            saveButton.type = "submit";
            saveButton.textContent = "Save changes";

            editForm.append(titleWrap, typeWrap, dateWrap, locationWrap, saveButton);

            editForm.addEventListener("submit", async (event) => {
              event.preventDefault();
              clearError();
              const formData = new FormData(editForm);
              const rawDate = String(formData.get("date_time") || "");
              const unixDate = Math.floor(new Date(rawDate).getTime() / 1000);

              if (!Number.isFinite(unixDate)) {
                showError("Please provide a valid date and time.");
                return;
              }

              const payload = {
                title: String(formData.get("title") || "").trim(),
                activity_type: String(formData.get("activity_type") || "").trim(),
                date_time: unixDate,
                location: String(formData.get("location") || "").trim()
              };

              try {
                await updateOuting(outing.id, payload);
                showSuccess("Outing updated successfully.");
                await syncOutingsState();
              } catch (err) {
                showError(err.message);
              }
            });

            li.appendChild(editForm);
          });

          if (hasRequests) {
            editBtn.disabled = true;
            editBtn.title = "This outing already has interest requests. Editing is not allowed. Please delete this outing and create a new one.";
          }

          buttonRow.appendChild(editBtn);
        }

        const viewBtn = createButton("View requests", () => {
          selectedOutingIdForRequests = outing.id;
          loadRequests(outing.id);
        });
        buttonRow.appendChild(viewBtn);

        if (outing.is_closed === 0) {
          const closeBtn = createButton("Close outing", async () => {
            clearError();
            try {
              await closeOuting(outing.id);
              showSuccess("Outing closed successfully.");
              await syncOutingsState();
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
              await syncOutingsState();
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
    if (selectedOutingIdForRequests && !outings.some((outing) => outing.id === selectedOutingIdForRequests)) {
      selectedOutingIdForRequests = null;
      requestsListEl.innerHTML = '<li class="empty-state">Select one of your outings to view interest requests</li>';
    }
  } catch (err) {
    if (!silent) {
      showError(err.message);
    }
  }
}

async function loadRequests(outingId, { silent = false } = {}) {
  requestsListEl.innerHTML = "";
  if (!silent) {
    clearError();
  }

  try {
    const requests = await getInterestRequests(outingId);

    if (requests.length === 0) {
      requestsListEl.innerHTML = '<li class="empty-state">No one has expressed interest yet. Share your outing!</li>';
      return;
    }

    requests.forEach((req) => {
      const li = document.createElement("li");
      const isRequesterActive = req.requester_is_active !== false;
      const inactiveMessage = req.inactive_message || "This user is no longer active in the system.";

      li.textContent = `User: ${req.requester_user_id} | Status: ${req.status}`;

      if (!isRequesterActive) {
        const inactiveNote = document.createElement("div");
        inactiveNote.textContent = inactiveMessage;
        li.appendChild(inactiveNote);
      }

      if (req.status === "pending" && isRequesterActive) {
        const acceptBtn = createButton("Accept", async () => {
          clearError();
          try {
            await updateInterestStatus(req.id, "accepted");
            await syncOutingsState();
          } catch (err) {
            showError(err.message);
          }
        });

        const rejectBtn = createButton("Reject", async () => {
          clearError();
          try {
            await updateInterestStatus(req.id, "rejected");
            await syncOutingsState();
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
    if (!silent) {
      showError(err.message);
    }
  }
}

async function loadMyRequests({ silent = false } = {}) {
  myRequestsListEl.innerHTML = "";
  if (!silent) {
    clearError();
  }

  try {
    const requests = await getMyInterestRequests();
    myInterestStatusByOuting = {};
    requests.forEach((req) => {
      myInterestStatusByOuting[req.outing_id] = req.status;
    });

    if (requests.length === 0) {
      myRequestsListEl.innerHTML = '<li class="empty-state">You haven\'t expressed interest in any outings yet. Browse the available outings above!</li>';
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
    if (!silent) {
      showError(err.message);
    }
  }
}

async function syncOutingsState({ silent = false } = {}) {
  if (isSyncInProgress) {
    return;
  }

  isSyncInProgress = true;

  try {
    await loadMyRequests({ silent });
    await loadOutings({ silent });

    if (selectedOutingIdForRequests) {
      await loadRequests(selectedOutingIdForRequests, { silent });
    }
  } finally {
    isSyncInProgress = false;
  }
}

function startPolling() {
  if (pollingTimerId) {
    return;
  }

  pollingTimerId = setInterval(() => {
    if (document.hidden) {
      return;
    }

    syncOutingsState({ silent: true });
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (!pollingTimerId) {
    return;
  }

  clearInterval(pollingTimerId);
  pollingTimerId = null;
}

function clearLiveReconnectTimer() {
  if (!reconnectLiveUpdatesTimerId) {
    return;
  }

  clearTimeout(reconnectLiveUpdatesTimerId);
  reconnectLiveUpdatesTimerId = null;
}

function stopLiveUpdates() {
  clearLiveReconnectTimer();

  if (!liveUpdatesSource) {
    return;
  }

  liveUpdatesSource.close();
  liveUpdatesSource = null;
}

function scheduleLiveReconnect() {
  if (reconnectLiveUpdatesTimerId || document.hidden || !isAuthenticated()) {
    return;
  }

  reconnectLiveUpdatesTimerId = setTimeout(() => {
    reconnectLiveUpdatesTimerId = null;
    startLiveUpdates();
  }, LIVE_RECONNECT_DELAY_MS);
}

async function startLiveUpdates() {
  if (liveUpdatesSource || !isAuthenticated()) {
    return;
  }

  clearLiveReconnectTimer();

  try {
    liveUpdatesSource = await openOutingsUpdatesStream({
      onUpdate: () => {
        syncOutingsState({ silent: true });
      },
      onError: () => {
        if (liveUpdatesSource) {
          liveUpdatesSource.close();
          liveUpdatesSource = null;
        }
        scheduleLiveReconnect();
      }
    });
  } catch (_err) {
    scheduleLiveReconnect();
  }
}

window.addEventListener("session-expired", () => {
  redirectToHome();
});

async function initializeOutingsPage() {
  hideHostProfilePanel();

  const authenticated = await guardAuthenticatedPage();
  if (!authenticated) {
    return;
  }

  requestsListEl.innerHTML = '<li class="empty-state">Select one of your outings to view interest requests</li>';
  await syncOutingsState();
  startPolling();
  await startLiveUpdates();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    syncOutingsState({ silent: true });
    startLiveUpdates();
    return;
  }

  stopLiveUpdates();
});

window.addEventListener("beforeunload", () => {
  stopPolling();
  stopLiveUpdates();
});

initializeOutingsPage();

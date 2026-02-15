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
const profileForm = document.getElementById("profile-form");
const profileDisplayNameInput = document.getElementById("profile-display-name");
const profileEmailInput = document.getElementById("profile-email");
const profileAgeInput = document.getElementById("profile-age");
const profileLikesInput = document.getElementById("profile-likes");
const profileDislikesInput = document.getElementById("profile-dislikes");
const profileInterestsInput = document.getElementById("profile-interests");
const hostProfilePanel = document.getElementById("host-profile-panel");
const hostProfileDetails = document.getElementById("host-profile-details");
const deleteAccountBtn = document.getElementById("delete-account-btn");

let myInterestStatusByOuting = {};
let outingInterestRequestCounts = {};

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

function hideHostProfilePanel() {
  hostProfilePanel.classList.add("hidden");
  hostProfileDetails.textContent = "";
}

function renderProfileForm(user) {
  profileDisplayNameInput.value = user.display_name || "";
  profileEmailInput.value = user.email || "";
  profileAgeInput.value = user.age ?? "";
  profileLikesInput.value = user.likes || "";
  profileDislikesInput.value = user.dislikes || "";
  profileInterestsInput.value = user.interests || "";
}

function syncSessionUser(user) {
  if (!window.currentSessionToken || !window.currentSessionExpiry) {
    return;
  }

  setCurrentUser({
    user,
    token: window.currentSessionToken,
    expires_at: window.currentSessionExpiry
  });
}

async function loadMyProfile() {
  const profile = await getMyProfile();
  syncSessionUser(profile.user);
  renderProfileForm(profile.user);
  updateUserUI();
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
    hideHostProfilePanel();
    showAuthMode("login");
    return;
  }

  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  updateUserUI();
  hideHostProfilePanel();
  await loadMyProfile();

  requestsListEl.innerHTML = '<li class="empty-state">Select one of your outings to view interest requests</li>';
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

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const payload = {
    display_name: profileDisplayNameInput.value.trim(),
    age: profileAgeInput.value === "" ? "" : Number(profileAgeInput.value),
    likes: profileLikesInput.value.trim(),
    dislikes: profileDislikesInput.value.trim(),
    interests: profileInterestsInput.value.trim()
  };

  if (!payload.display_name) {
    showError("Name is required.");
    return;
  }

  try {
    const result = await updateMyProfile(payload);
    syncSessionUser(result.user);
    renderProfileForm(result.user);
    updateUserUI();
    showSuccess("Profile updated.");
  } catch (err) {
    showError(err.message);
  }
});

deleteAccountBtn.addEventListener("click", async () => {
  clearError();

  const confirmMessage = 
    "Are you ABSOLUTELY sure you want to delete your account?\n\n" +
    "This will:\n" +
    "• Permanently delete your profile\n" +
    "• Delete all your outings\n" +
    "• Delete all your interest requests\n" +
    "• Block your email from future sign-ups\n\n" +
    "This action CANNOT be undone.";

  if (!confirm(confirmMessage)) {
    return;
  }

  const finalConfirm = confirm(
    "Last chance! Type 'DELETE' in the next prompt to confirm.\n\n" +
    "Click OK to proceed."
  );

  if (!finalConfirm) {
    return;
  }

  const typedConfirmation = prompt("Type DELETE to confirm account deletion:");

  if (typedConfirmation !== "DELETE") {
    showError("Account deletion cancelled. You must type DELETE exactly.");
    return;
  }

  try {
    await deleteMyAccount();
    setCurrentUser(null);
    showSuccess("Account deleted successfully. You will be logged out.");
    setTimeout(async () => {
      await renderAuthState();
    }, 2000);
  } catch (err) {
    showError(err.message);
  }
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

    if (outings.length === 0) {
      outingsListEl.innerHTML = '<li class="empty-state">No outings available yet. Create one to get started!</li>';
      return;
    }

    // Fetch interest request counts for user's own outings
    outingInterestRequestCounts = {};
    const myOutings = outings.filter(o => o.host_user_id === window.currentUser);
    await Promise.all(
      myOutings.map(async (outing) => {
        try {
          const requests = await getInterestRequests(outing.id);
          outingInterestRequestCounts[outing.id] = requests.length;
        } catch (err) {
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
                await loadOutings();
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
      requestsListEl.innerHTML = '<li class="empty-state">No one has expressed interest yet. Share your outing!</li>';
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
    showError(err.message);
  }
}

renderAuthState();

window.addEventListener("session-expired", async (event) => {
  const message = event?.detail?.message || "Session expired. Please log in again.";
  await renderAuthState();
  showError(message);
});

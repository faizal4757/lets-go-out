const profileForm = document.getElementById("profile-form");
const profileDisplayNameInput = document.getElementById("profile-display-name");
const profileEmailInput = document.getElementById("profile-email");
const profileAgeInput = document.getElementById("profile-age");
const profileLikesInput = document.getElementById("profile-likes");
const profileDislikesInput = document.getElementById("profile-dislikes");
const profileInterestsInput = document.getElementById("profile-interests");
const currentUserLabel = document.getElementById("current-user-label");
const logoutBtn = document.getElementById("logout-btn");
const deleteAccountBtn = document.getElementById("delete-account-btn");
const messageEl = document.getElementById("message");
const errorEl = document.getElementById("global-error");

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

function renderProfileForm(user) {
  profileDisplayNameInput.value = user.display_name || "";
  profileEmailInput.value = user.email || "";
  profileAgeInput.value = user.age ?? "";
  profileLikesInput.value = user.likes || "";
  profileDislikesInput.value = user.dislikes || "";
  profileInterestsInput.value = user.interests || "";
}

function updateUserUI() {
  if (!window.currentUserProfile) {
    currentUserLabel.textContent = "";
    return;
  }

  const name = window.currentUserProfile.display_name || window.currentUserProfile.email;
  currentUserLabel.textContent = `${name} (${window.currentUserProfile.email})`;
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

async function loadMyProfile() {
  const profile = await getMyProfile();
  syncSessionUser(profile.user);
  renderProfileForm(profile.user);
  updateUserUI();
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
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
    "Are you sure you want to deactivate your account?\n\n" +
    "This will:\n" +
    "• Mark your profile as inactive\n" +
    "• Keep your past activity visible where needed\n" +
    "• Close your hosted outings\n" +
    "• Log you out immediately\n\n" +
    "You can reactivate by logging in again.";

  if (!confirm(confirmMessage)) {
    return;
  }

  const finalConfirm = confirm(
    "Last chance! Type 'DEACTIVATE' in the next prompt to confirm.\n\n" +
    "Click OK to proceed."
  );

  if (!finalConfirm) {
    return;
  }

  const typedConfirmation = prompt("Type DEACTIVATE to confirm account deactivation:");

  if (typedConfirmation !== "DEACTIVATE") {
    showError("Account deactivation cancelled. You must type DEACTIVATE exactly.");
    return;
  }

  try {
    await deleteMyAccount();
    setCurrentUser(null);
    showSuccess("Account deactivated successfully. You have been logged out.");
    setTimeout(() => {
      redirectToHome();
    }, 1500);
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

window.addEventListener("session-expired", () => {
  redirectToHome();
});

async function initializeProfilePage() {
  clearError();

  const authenticated = await guardAuthenticatedPage();
  if (!authenticated) {
    return;
  }

  try {
    await loadMyProfile();
  } catch (err) {
    showError(err.message);
  }
}

initializeProfilePage();

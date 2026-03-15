// Navigation active link highlighting and logout
function setActiveNav() {
  const navLinks = document.querySelectorAll('.site-nav a');
  const path = window.location.pathname.split('/').pop();
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.id === 'nav-profile' && path === 'profile.html') link.classList.add('active');
    if (link.id === 'nav-discover' && path === 'outings.html') link.classList.add('active');
  });
}
setActiveNav();

const navLogout = document.getElementById('nav-logout');
if (navLogout) {
  navLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    if (logoutBtn) logoutBtn.click();
  });
}
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const guestHomeSection = document.getElementById("guest-home");
const memberHomeSection = document.getElementById("member-home");
const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const showSignupBtn = document.getElementById("show-signup-btn");
const showLoginBtn = document.getElementById("show-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const currentUserLabel = document.getElementById("current-user-label");
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

function showAuthMode(mode) {
  if (mode === "signup") {
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    return;
  }

  signupForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
}

function updateCurrentUserUI() {
  if (!window.currentUserProfile) {
    currentUserLabel.textContent = "";
    return;
  }

  const name = window.currentUserProfile.display_name || window.currentUserProfile.email;
  currentUserLabel.textContent = `${name} (${window.currentUserProfile.email})`;
}

function showGuestHome() {
  memberHomeSection.classList.add("hidden");
  guestHomeSection.classList.remove("hidden");
  showAuthMode("signup");
}

function showMemberHome() {
  guestHomeSection.classList.add("hidden");
  memberHomeSection.classList.remove("hidden");
  updateCurrentUserUI();
}

async function renderHomeState() {
  clearError();

  if (!isAuthenticated()) {
    showGuestHome();
    return;
  }

  try {
    const refreshedSession = await restoreSession();
    setCurrentUser(refreshedSession);
    showMemberHome();
  } catch (_err) {
    setCurrentUser(null);
    showGuestHome();
  }
}

showSignupBtn.addEventListener("click", () => {
  clearError();
  showAuthMode("signup");
});

showLoginBtn.addEventListener("click", () => {
  clearError();
  showAuthMode("login");
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
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
    await renderHomeState();
  } catch (err) {
    showError(err.message);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
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
    await renderHomeState();
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
  showGuestHome();
});

window.addEventListener("session-expired", (event) => {
  const message = event?.detail?.message || "Session expired. Please log in again.";
  showGuestHome();
  showError(message);
});

renderHomeState();

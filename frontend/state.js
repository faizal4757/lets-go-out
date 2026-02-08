const AUTH_STORAGE_KEY = "letsgoout.auth.session";

function isExpired(session) {
  return !session?.expires_at || Date.now() >= Number(session.expires_at) * 1000;
}

function loadPersistedSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.user ||
      !parsed.token ||
      !parsed.expires_at
    ) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    if (isExpired(parsed)) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch (_err) {
    return null;
  }
}

const persistedSession = loadPersistedSession();

window.currentUserProfile = persistedSession ? persistedSession.user : null;
window.currentUser = window.currentUserProfile ? window.currentUserProfile.id : null;
window.currentSessionToken = persistedSession ? persistedSession.token : null;
window.currentSessionExpiry = persistedSession ? persistedSession.expires_at : null;

function setCurrentUser(authData) {
  const session = authData
    ? {
        user: authData.user,
        token: authData.token,
        expires_at: authData.expires_at
      }
    : null;

  window.currentUserProfile = session ? session.user : null;
  window.currentUser = session ? session.user.id : null;
  window.currentSessionToken = session ? session.token : null;
  window.currentSessionExpiry = session ? session.expires_at : null;

  if (session) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

function isAuthenticated() {
  if (!window.currentUser || !window.currentSessionToken || !window.currentSessionExpiry) {
    return false;
  }

  if (Date.now() >= Number(window.currentSessionExpiry) * 1000) {
    setCurrentUser(null);
    return false;
  }

  return true;
}

function updateSessionExpiry(expiresAt) {
  const parsedExpiresAt = Number(expiresAt);
  if (!Number.isFinite(parsedExpiresAt)) {
    return;
  }

  if (!window.currentUserProfile || !window.currentSessionToken) {
    return;
  }

  window.currentSessionExpiry = parsedExpiresAt;
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      user: window.currentUserProfile,
      token: window.currentSessionToken,
      expires_at: parsedExpiresAt
    })
  );
}

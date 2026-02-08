-- =========================
-- USERS
-- =========================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- =========================
-- SESSIONS
-- =========================
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- =========================
-- OUTINGS
-- =========================
CREATE TABLE IF NOT EXISTS outings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  outing_mode TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  location TEXT,
  virtual_link TEXT,
  date_time INTEGER NOT NULL,
  host_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  is_closed INTEGER DEFAULT 0, 
  created_at INTEGER NOT NULL,
  FOREIGN KEY (host_user_id) REFERENCES users(id)
);

-- =========================
-- INTEREST REQUESTS
-- =========================
CREATE TABLE IF NOT EXISTS interest_requests (
  id TEXT PRIMARY KEY,
  outing_id TEXT NOT NULL,
  requester_user_id TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at INTEGER NOT NULL,
  UNIQUE (outing_id, requester_user_id),
  FOREIGN KEY (outing_id) REFERENCES outings(id),
  FOREIGN KEY (requester_user_id) REFERENCES users(id)
);

-- =========================
-- USERS
-- =========================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

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

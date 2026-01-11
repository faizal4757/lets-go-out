-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Outings table
CREATE TABLE outings (
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
  created_at INTEGER NOT NULL
);

-- Interest requests table
CREATE TABLE interest_requests (
  id TEXT PRIMARY KEY,
  outing_id TEXT NOT NULL,
  requester_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (outing_id, requester_user_id)
);

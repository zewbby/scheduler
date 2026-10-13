CREATE TABLE IF NOT EXISTS planner_profile (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at INTEGER NOT NULL
);

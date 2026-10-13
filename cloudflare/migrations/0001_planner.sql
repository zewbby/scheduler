-- One database is one personal workspace. Tombstones are deliberately retained.
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0)
);
CREATE TABLE IF NOT EXISTS sync_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT OR IGNORE INTO sync_meta (singleton, revision) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS planner_items (
  id TEXT PRIMARY KEY NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS planner_items_revision ON planner_items (revision);

CREATE TRIGGER IF NOT EXISTS planner_items_insert_revision
AFTER INSERT ON planner_items
BEGIN
  UPDATE sync_meta SET revision = revision + 1 WHERE singleton = 1;
  UPDATE planner_items SET revision = (SELECT revision FROM sync_meta WHERE singleton = 1)
    WHERE id = NEW.id;
END;

-- This trigger excludes revision, so its own revision update cannot recurse.
CREATE TRIGGER IF NOT EXISTS planner_items_update_revision
AFTER UPDATE OF updated_at, deleted, payload ON planner_items
BEGIN
  UPDATE sync_meta SET revision = revision + 1 WHERE singleton = 1;
  UPDATE planner_items SET revision = (SELECT revision FROM sync_meta WHERE singleton = 1)
    WHERE id = NEW.id;
END;

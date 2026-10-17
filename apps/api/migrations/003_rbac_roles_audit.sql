-- dialect:postgresql
ALTER TABLE workspace_users DROP CONSTRAINT IF EXISTS workspace_users_role_check;
-- statement
ALTER TABLE workspace_users ADD CONSTRAINT workspace_users_role_check CHECK (role IN ('viewer', 'analyst', 'reviewer', 'admin'));
-- statement
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
-- dialect:sqlite
DELETE FROM workspace_sessions;
-- statement
CREATE TABLE workspace_users_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL CHECK (workspace_id = 'synthetic'),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'analyst', 'reviewer', 'admin')),
  created_at TEXT NOT NULL
);
-- statement
INSERT INTO workspace_users_new SELECT id, workspace_id, username, password_hash, role, created_at FROM workspace_users;
-- statement
DROP TABLE workspace_sessions;
-- statement
DROP TABLE workspace_users;
-- statement
ALTER TABLE workspace_users_new RENAME TO workspace_users;
-- statement
CREATE TABLE workspace_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES workspace_users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- statement
CREATE INDEX workspace_sessions_expiry_idx ON workspace_sessions(expires_at);
-- statement
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);

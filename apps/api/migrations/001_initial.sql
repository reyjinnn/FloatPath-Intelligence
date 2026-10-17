-- dialect:common
CREATE TABLE schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
-- statement
CREATE TABLE companies (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL CHECK (workspace_id = 'synthetic'),
 code TEXT NOT NULL, legal_name TEXT NOT NULL, board TEXT NOT NULL CHECK (board = 'DEMO_STANDARD'),
 created_at TEXT NOT NULL
);
-- statement
CREATE TABLE snapshots (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id),
 workspace_id TEXT NOT NULL CHECK (workspace_id = 'synthetic'),
 total_shares BIGINT NOT NULL CHECK (total_shares > 0 AND total_shares <= 9007199254740991),
 payload TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('DRAFT', 'LOCKED')),
 data_hash TEXT, created_at TEXT NOT NULL, locked_at TEXT,
 CHECK ((status = 'DRAFT' AND data_hash IS NULL AND locked_at IS NULL) OR
        (status = 'LOCKED' AND data_hash IS NOT NULL AND locked_at IS NOT NULL))
);
-- statement
CREATE TABLE assessments (
 id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
 payload TEXT NOT NULL, created_at TEXT NOT NULL
);
-- statement
CREATE TABLE scenarios (
 id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
 action_json TEXT NOT NULL, result_json TEXT NOT NULL, input_hash TEXT NOT NULL,
 result_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
-- statement
CREATE TABLE reports (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL CHECK (workspace_id = 'synthetic'),
 scenario_ids_json TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
);
-- statement
CREATE TABLE audit_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL CHECK (workspace_id = 'synthetic'),
 actor_id TEXT NOT NULL, action TEXT NOT NULL, entity_id TEXT NOT NULL,
 before_hash TEXT, after_hash TEXT, correlation_id TEXT NOT NULL, created_at TEXT NOT NULL
);
-- statement
CREATE TABLE idempotency_records (
 scope TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
 response_json TEXT NOT NULL, status_code INTEGER NOT NULL,
 PRIMARY KEY (scope, key)
);
-- statement
CREATE INDEX snapshots_company_idx ON snapshots(company_id, created_at);
-- statement
CREATE INDEX scenarios_snapshot_idx ON scenarios(snapshot_id);
-- dialect:sqlite
CREATE TRIGGER snapshots_no_locked_update BEFORE UPDATE ON snapshots
WHEN OLD.status = 'LOCKED' BEGIN SELECT RAISE(ABORT, 'immutable snapshot'); END;
-- statement
CREATE TRIGGER snapshots_no_locked_delete BEFORE DELETE ON snapshots
WHEN OLD.status = 'LOCKED' BEGIN SELECT RAISE(ABORT, 'immutable snapshot'); END;
-- statement
CREATE TRIGGER scenarios_no_update BEFORE UPDATE ON scenarios BEGIN SELECT RAISE(ABORT, 'immutable scenario'); END;
-- statement
CREATE TRIGGER scenarios_no_delete BEFORE DELETE ON scenarios BEGIN SELECT RAISE(ABORT, 'immutable scenario'); END;
-- statement
CREATE TRIGGER reports_no_update BEFORE UPDATE ON reports BEGIN SELECT RAISE(ABORT, 'immutable report'); END;
-- statement
CREATE TRIGGER reports_no_delete BEFORE DELETE ON reports BEGIN SELECT RAISE(ABORT, 'immutable report'); END;
-- statement
CREATE TRIGGER assessments_no_update BEFORE UPDATE ON assessments BEGIN SELECT RAISE(ABORT, 'immutable assessment'); END;
-- statement
CREATE TRIGGER assessments_no_delete BEFORE DELETE ON assessments BEGIN SELECT RAISE(ABORT, 'immutable assessment'); END;
-- statement
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'immutable audit'); END;
-- statement
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'immutable audit'); END;
-- dialect:postgresql
CREATE FUNCTION reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable record'; END; $$;
-- statement
CREATE FUNCTION reject_locked_snapshot_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status = 'LOCKED' THEN RAISE EXCEPTION 'immutable snapshot'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
-- statement
CREATE TRIGGER snapshots_immutable BEFORE UPDATE OR DELETE ON snapshots FOR EACH ROW EXECUTE FUNCTION reject_locked_snapshot_change();
-- statement
CREATE TRIGGER scenarios_immutable BEFORE UPDATE OR DELETE ON scenarios FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
-- statement
CREATE TRIGGER reports_immutable BEFORE UPDATE OR DELETE ON reports FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
-- statement
CREATE TRIGGER assessments_immutable BEFORE UPDATE OR DELETE ON assessments FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
-- statement
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

"""Explicit local management. No default account and no implicit data seeding."""
import argparse
import copy
from datetime import datetime, timezone
import getpass
import os
from pathlib import Path
import sys
from uuid import NAMESPACE_URL, uuid4, uuid5

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from apps.api.auth import create_user, hash_password
from apps.api.db import get_engine, run_migrations, write_transaction
from apps.api.engine_bridge import calculate, engine
from apps.api.idempotency import digest, dump
from apps.api.identifiers import stable_id
from apps.api.main import catalog
from apps.api.presentation import PRESENTATION_MAP
from apps.api.reports import render_report


DEMO_ROLES = [
    ("admin", "admin"),
    ("reviewer", "reviewer"),
    ("analyst", "analyst"),
    ("viewer", "viewer"),
]


def configure_demo_credentials(database, password: str, *, reset_existing: bool = False,
                               allow_short_demo_password: bool = False) -> dict:
    """Create or rotate synthetic-only demo accounts without hardcoded passwords."""
    # Validate before opening a transaction. Every changed account gets its own salt.
    encoded = hash_password(password, allow_short_synthetic_demo=allow_short_demo_password)
    now = datetime.now(timezone.utc).isoformat()
    actor_id = stable_id("actor:cli:manage_workspace")
    correlation_id = str(uuid4())
    counts = {"created": 0, "rotated": 0, "skipped": 0, "sessions_revoked": 0}
    with write_transaction(database) as connection:
        existing = {row["username"]: row for row in connection.execute(
            text("SELECT id, username, role FROM workspace_users WHERE workspace_id='synthetic'")
        ).mappings().all()}
        for username, default_role in DEMO_ROLES:
            current = existing.get(username)
            if current is not None and not reset_existing:
                counts["skipped"] += 1
                continue
            uid = current["id"] if current else str(uuid4())
            role = current["role"] if current else default_role
            if encoded is None:
                encoded = hash_password(password, allow_short_synthetic_demo=allow_short_demo_password)
            revoked = 0
            if current is None:
                connection.execute(text(
                    "INSERT INTO workspace_users (id, workspace_id, username, password_hash, role, created_at) "
                    "VALUES (:id, 'synthetic', :username, :hash, :role, :created)"
                ), {"id": uid, "username": username, "hash": encoded, "role": role, "created": now})
                action = "CREATE_DEMO_USER"
                counts["created"] += 1
            else:
                connection.execute(text(
                    "UPDATE workspace_users SET password_hash=:hash WHERE id=:id AND workspace_id='synthetic'"
                ), {"id": uid, "hash": encoded})
                revoked = connection.execute(text(
                    "DELETE FROM workspace_sessions WHERE user_id=:id"
                ), {"id": uid}).rowcount
                counts["sessions_revoked"] += revoked
                action = "ROTATE_DEMO_CREDENTIAL"
                counts["rotated"] += 1
            # Log only non-secret metadata, never passwords, PBKDF2 hashes, or session hashes.
            connection.execute(text(
                "INSERT INTO audit_events VALUES (:id, 'synthetic', :actor, :action, :entity, "
                "NULL, :after, :correlation, :created)"
            ), {"id": str(uuid4()), "actor": actor_id, "action": action, "entity": uid,
                "after": digest({"role": role, "sessions_revoked": revoked}),
                "correlation": correlation_id, "created": now})
            encoded = None
    return counts


def seed_workspace(database):
    """One atomic, idempotent seed; never overwrite a user's existing records."""
    run_migrations(database)
    counts = dict.fromkeys(("companies", "snapshots", "assessments", "scenarios", "reports", "users"), 0)
    created = datetime.now(timezone.utc).isoformat()
    actor_id = stable_id("actor:cli:seed")

    def seed_id(value):
        return str(uuid5(NAMESPACE_URL, "floatpath:synthetic-seed:" + value))

    with write_transaction(database) as connection:
        for company in catalog():
            # Presence means this company was already seeded (or managed locally).
            if connection.execute(text("SELECT id FROM companies WHERE id=:id"), {"id": company["id"]}).first():
                continue
            name = PRESENTATION_MAP[company["code"]]["legal_name"]
            payload = copy.deepcopy(company["snapshot"])
            snapshot = calculate(engine.snapshot_from_dict, payload)
            assessment = calculate(engine.assess_numeric_target, snapshot)
            scenario_id = seed_id(company["id"] + ":scenario")
            action = {"action_type": "NEW_ISSUANCE", "price_idr_per_share": "500.00", "allocations": [
                {"holder_ref": company["code"] + "-SEED-INV", "shares": 10_000_000,
                 "eligibility": "ELIGIBLE", "holder_type": "ORGANIZATION",
                 "evidence_ref": payload["holders"][0]["evidence_ref"]}]}
            result = calculate(engine.simulate, snapshot, action)
            report = render_report(name, assessment, [result], sorted({h["evidence_ref"] for h in payload["holders"]}))
            report["id"] = seed_id(company["id"] + ":report")
            connection.execute(text(
                "INSERT INTO companies (id, workspace_id, code, legal_name, board, created_at) "
                "VALUES (:id, 'synthetic', :code, :name, :board, :created)"
            ), company | {"name": name, "created": created})
            connection.execute(text(
                "INSERT INTO snapshots (id, company_id, workspace_id, total_shares, payload, status, data_hash, created_at, locked_at) "
                "VALUES (:id, :company, 'synthetic', :total, :payload, 'LOCKED', :hash, :created, :created)"
            ), {"id": payload["id"], "company": company["id"], "total": payload["total_shares"],
                "payload": dump(payload), "hash": assessment["data_hash"], "created": created})
            connection.execute(text("INSERT INTO assessments VALUES (:id, :snapshot, :payload, :created)"),
                               {"id": seed_id(company["id"] + ":assessment"), "snapshot": payload["id"],
                                "payload": dump(assessment), "created": created})
            connection.execute(text("INSERT INTO scenarios VALUES (:id, :snapshot, :action, :result, :input, :hash, :created)"),
                               {"id": scenario_id, "snapshot": payload["id"], "action": dump(action), "result": dump(result),
                                "input": result["input_hash"], "hash": result["result_hash"], "created": created})
            connection.execute(text("INSERT INTO reports VALUES (:id, 'synthetic', :scenarios, :payload, :created)"),
                               {"id": report["id"], "scenarios": dump([scenario_id]), "payload": dump(report), "created": created})
            correlation_id = seed_id(company["id"] + ":correlation")
            connection.execute(text(
                "INSERT INTO audit_events VALUES (:id, 'synthetic', :actor, 'SEED_COMPANY', :company, NULL, :hash, :correlation, :created)"
            ), {"id": seed_id(company["id"] + ":audit"), "actor": actor_id, "company": company["id"],
                "hash": digest(payload), "correlation": correlation_id, "created": created})
            for key in ("companies", "snapshots", "assessments", "scenarios", "reports"):
                counts[key] += 1
    return counts


def main():
    parser = argparse.ArgumentParser(description="Manage the single SYNTHETIC FloatPath workspace")
    commands = parser.add_subparsers(dest="command", required=True)

    user = commands.add_parser("create-user")
    user.add_argument("--username", required=True)
    user.add_argument("--role", required=True, choices=["viewer", "analyst", "reviewer", "admin"])

    seed = commands.add_parser("seed")

    demo = commands.add_parser("demo-credentials")
    demo.add_argument("--reset-existing", action="store_true", help="Rotate passwords for existing demo accounts")
    demo.add_argument("--allow-short-demo-password", action="store_true",
                      help="Allow the 11-character synthetic demo password")

    for command in (user, seed, demo):
        command.add_argument("--database-url", default=os.getenv("DATABASE_URL", "sqlite:///./floatpath.db"))

    args = parser.parse_args()
    database = get_engine(args.database_url)
    try:
        run_migrations(database)
        if args.command == "seed":
            print(f"SYNTHETIC workspace seeded: {seed_workspace(database)}")
        elif args.command == "demo-credentials":
            password = os.getenv("FLOATPATH_DEMO_PASSWORD")
            if not password:
                prompt_msg = "Password (11–256 characters): " if args.allow_short_demo_password else "Password (12–256 characters): "
                password = getpass.getpass(prompt_msg)
                if password != getpass.getpass("Confirm password: "):
                    parser.exit(1, "Passwords do not match\n")
            result = configure_demo_credentials(
                database,
                password,
                reset_existing=args.reset_existing,
                allow_short_demo_password=args.allow_short_demo_password,
            )
            print(f"SYNTHETIC demo credentials configured: {result}")
        else:
            password = getpass.getpass("Password (12–256 characters): ")
            if password != getpass.getpass("Confirm password: "):
                parser.exit(1, "Passwords do not match\n")
            created = create_user(database, args.username, password, args.role)
            print(f"Created {created['username']} ({created['role']})")
    except IntegrityError:
        parser.exit(1, "Conflict: user or seed record already exists; nothing overwritten\n")
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    finally:
        database.dispose()


if __name__ == "__main__":
    main()

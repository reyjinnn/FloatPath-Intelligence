"""Explicit local management. No default account and no implicit data seeding."""
import argparse
import copy
from datetime import datetime, timezone
import getpass
import os
from pathlib import Path
import sys
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from apps.api.auth import create_user
from apps.api.db import get_engine, run_migrations, write_transaction
from apps.api.engine_bridge import calculate, engine
from apps.api.idempotency import digest, dump
from apps.api.main import catalog
from apps.api.presentation import PRESENTATION_MAP
from apps.api.reports import render_report


DEFAULT_SEED_USERS = [
    ("admin", "AdminFloatPath2026!", "admin"),
    ("reviewer", "ReviewerFloatPath2026!", "reviewer"),
    ("analyst", "AnalystFloatPath2026!", "analyst"),
    ("viewer", "ViewerFloatPath2026!", "viewer"),
]


def seed_workspace(database):
    """One atomic, idempotent seed; never overwrite a user's existing records."""
    run_migrations(database)
    counts = dict.fromkeys(("companies", "snapshots", "assessments", "scenarios", "reports", "users"), 0)
    created = datetime.now(timezone.utc).isoformat()

    def seed_id(value):
        return str(uuid5(NAMESPACE_URL, "floatpath:synthetic-seed:" + value))

    with database.connect() as connection:
        existing_users = set(connection.execute(text("SELECT username FROM workspace_users WHERE workspace_id='synthetic'")).scalars().all())
    for username, password, role in DEFAULT_SEED_USERS:
        if username not in existing_users:
            create_user(database, username, password, role)
            counts["users"] += 1

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
            connection.execute(text(
                "INSERT INTO audit_events VALUES (:id, 'synthetic', 'cli:seed', 'SEED_COMPANY', :company, NULL, :hash, 'cli_seed', :created)"
            ), {"id": seed_id(company["id"] + ":audit"), "company": company["id"], "hash": digest(payload), "created": created})
            counts = {key: value + 1 for key, value in counts.items()}
    return counts


def main():
    parser = argparse.ArgumentParser(description="Manage the single SYNTHETIC FloatPath workspace")
    commands = parser.add_subparsers(dest="command", required=True)
    user = commands.add_parser("create-user")
    user.add_argument("--username", required=True)
    user.add_argument("--role", required=True, choices=["viewer", "analyst", "reviewer", "admin"])
    seed = commands.add_parser("seed")
    for command in (user, seed):
        command.add_argument("--database-url", default=os.getenv("DATABASE_URL", "sqlite:///./floatpath.db"))
    args = parser.parse_args()
    database = get_engine(args.database_url)
    try:
        run_migrations(database)
        if args.command == "seed":
            print(f"SYNTHETIC workspace seeded: {seed_workspace(database)}")
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

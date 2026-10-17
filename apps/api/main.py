"""Authenticated single-workspace API. Synthetic data, unverified legal rules."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
from types import SimpleNamespace
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError
from starlette.exceptions import HTTPException

from apps.api.auth import (
    COOKIE_NAME,
    SESSION_SECONDS,
    LoginLimiter,
    check_csrf,
    create_user,
    get_current_role,
    login_user,
    logout_user,
    session_user,
)
from apps.api.csv_import import parse_csv
from apps.api.db import get_engine, run_migrations, write_transaction
from apps.api.engine_bridge import calculate, engine
from apps.api.errors import ApiProblem, problem_response
from apps.api.idempotency import digest, dump, remember, replay
from apps.api.presentation import enrich_company_presentation
from apps.api.reports import render_report
from apps.api.schemas import (
    Action,
    CompanyBody,
    CreateUserBody,
    CSVBody,
    DemoReport,
    DemoSimulation,
    HoldingsReviewBody,
    LoginBody,
    ScenarioIds,
    SnapshotBody,
    UpdateUserRoleBody,
)

logger = logging.getLogger("apps.api")
CATALOG_PATH = Path(__file__).resolve().parents[2] / "datasets" / "synthetic" / "companies.json"
CODES = {f"DEMO-{number:03}" for number in range(1, 6)}


def _load_env_defaults():
    env_file = Path(__file__).resolve().parents[2] / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip()
                if k not in os.environ:
                    os.environ[k] = v


_load_env_defaults()


def now():
    return datetime.now(timezone.utc).isoformat()


def fail(status, code, detail):
    raise ApiProblem(status, code, "Request rejected", detail)


def catalog():
    try:
        companies = json.loads(CATALOG_PATH.read_text("utf-8"))
    except (OSError, ValueError):
        fail(503, "SYNTHETIC_FIXTURES_UNAVAILABLE", "Synthetic fixtures are unavailable")
    if (not isinstance(companies, list) or len(companies) != 5
            or {c.get("code") for c in companies} != CODES
            or any(c.get("demo") is not True or c.get("board") != "DEMO_STANDARD" for c in companies)):
        fail(503, "SYNTHETIC_FIXTURES_INVALID", "Synthetic catalog failed validation")
    return companies


def demo_company(identifier):
    for company in catalog():
        if identifier in (company["id"], company["code"]):
            return company
    fail(404, "NOT_FOUND", "Synthetic company not found")


def approved_sources(code=None):
    return {holder["evidence_ref"] for company in catalog() if code in (None, company["code"])
            for holder in company["snapshot"]["holders"] if holder.get("evidence_ref")}


def check_sources(holders, code=None, require=False):
    allowed = approved_sources(code)
    for holder in holders:
        source = holder.get("evidence_ref")
        if source and source not in allowed:
            fail(422, "SOURCE_NOT_ALLOWED", "Only catalog synthetic fixture references are allowed")
        if require and not source:
            fail(422, "EVIDENCE_REQUIRED", "Every locked holding requires a synthetic fixture reference")


def action_dict(action, code):
    payload = action.model_dump(mode="json", exclude_none=True)
    check_sources(payload["allocations"], code)
    if payload["action_type"] == "TRANSFER":
        if not payload.get("seller_ref"):
            fail(422, "SELLER_REQUIRED", "TRANSFER requires seller_ref")
        if any(alloc["shares"] == 0 for alloc in payload["allocations"]):
            fail(422, "INVALID_SHARE_COUNT", "TRANSFER does not accept zero-share allocations")
    if payload["action_type"] == "NEW_ISSUANCE" and payload.get("seller_ref"):
        fail(422, "INVALID_ACTION", "NEW_ISSUANCE does not accept seller_ref")
    return payload


def validated_snapshot(payload):
    if not isinstance(payload, dict) or "holders" not in payload or "total_shares" not in payload:
        fail(422, "INVALID_SNAPSHOT", "Snapshot missing holders or total_shares")
    # Explicit reconciliation also covers engines that validate by raising only.
    if sum(holder.get("shares", 0) for holder in payload.get("holders", [])) != payload.get("total_shares"):
        fail(422, "SNAPSHOT_RECONCILIATION_FAILED", "Holdings must reconcile exactly to total_shares")
    snapshot = calculate(engine.snapshot_from_dict, payload)
    calculate(engine.validate_snapshot, snapshot)
    return snapshot


def audit(connection, request, actor, action, entity_id, before=None, after=None):
    connection.execute(text(
        "INSERT INTO audit_events (id, workspace_id, actor_id, action, entity_id, before_hash, after_hash, correlation_id, created_at) "
        "VALUES (:id, 'synthetic', :actor, :action, :entity, :before, :after, :correlation, :created)"
    ), {"id": str(uuid4()), "actor": getattr(request.state, "user", {}).get("id", actor), "action": action, "entity": entity_id,
        "before": before, "after": after, "correlation": request.state.correlation_id, "created": now()})


def company_row(connection, identifier):
    row = connection.execute(text(
        "SELECT * FROM companies WHERE id=:id AND workspace_id='synthetic'"
    ), {"id": identifier}).mappings().first()
    if not row:
        fail(404, "NOT_FOUND", "Company not found in synthetic workspace")
    return dict(row)


def resolve_company(connection, identifier):
    row = None
    try:
        uid = str(UUID(identifier))
        row = connection.execute(text(
            "SELECT * FROM companies WHERE id=:id AND workspace_id='synthetic'"
        ), {"id": uid}).mappings().first()
    except (ValueError, TypeError):
        pass
    if not row:
        row = connection.execute(text(
            "SELECT * FROM companies WHERE code=:code AND workspace_id='synthetic' ORDER BY created_at DESC, id DESC LIMIT 1"
        ), {"code": identifier}).mappings().first()
    if not row:
        fail(404, "NOT_FOUND", "Company not found in synthetic workspace")
    return dict(row)


def snapshot_row(connection, identifier):
    row = connection.execute(text(
        "SELECT s.*, c.code FROM snapshots s JOIN companies c ON s.company_id=c.id "
        "WHERE s.id=:id AND s.workspace_id='synthetic' AND c.workspace_id='synthetic'"
    ), {"id": identifier}).mappings().first()
    if not row:
        fail(404, "NOT_FOUND", "Snapshot not found in synthetic workspace")
    return dict(row)


def snapshot_response(row):
    return {key: row[key] for key in ("id", "company_id", "status", "data_hash", "created_at", "locked_at")} | {
        "snapshot": json.loads(row["payload"]), "mode": "SYNTHETIC_ONLY"}


def scenario_row(connection, identifier):
    row = connection.execute(text(
        "SELECT s.*, snap.payload AS baseline, snap.company_id, c.legal_name, c.code "
        "FROM scenarios s JOIN snapshots snap ON s.snapshot_id=snap.id JOIN companies c ON snap.company_id=c.id "
        "WHERE s.id=:id AND snap.workspace_id='synthetic' AND c.workspace_id='synthetic'"
    ), {"id": identifier}).mappings().first()
    if not row:
        fail(404, "NOT_FOUND", "Scenario not found in synthetic workspace")
    return dict(row)


def scenario_rows(connection, identifiers):
    rows = [scenario_row(connection, str(identifier)) for identifier in identifiers]
    if len({row["snapshot_id"] for row in rows}) != 1:
        fail(422, "BASELINE_MISMATCH", "Scenarios must share the same immutable baseline")
    return rows


def get_company_with_latest_snapshot(connection, comp_row):
    snap_row = connection.execute(text(
        "SELECT * FROM snapshots WHERE company_id=:cid AND workspace_id='synthetic' "
        "ORDER BY COALESCE(locked_at, created_at) DESC, id DESC LIMIT 1"
    ), {"cid": comp_row["id"]}).mappings().first()
    snap_dict = None
    assessment = None
    validation_errors = []
    if snap_row:
        snap_dict = json.loads(snap_row["payload"])
        snap_dict["id"] = snap_row["id"]
        try:
            snap_obj = validated_snapshot(snap_dict)
            assessment = calculate(engine.assess_numeric_target, snap_obj)
        except ApiProblem as error:
            if snap_row["status"] != "DRAFT":
                raise
            validation_errors = [{"code": error.code, "detail": error.problem_detail}]
    return enrich_company_presentation({
        "id": comp_row["id"],
        "code": comp_row["code"],
        "legal_name": comp_row["legal_name"],
        "board": comp_row["board"],
        "created_at": comp_row["created_at"],
        "snapshot": snap_dict,
        "snapshot_status": snap_row["status"] if snap_row else None,
        "validation_errors": validation_errors,
        "assessment": assessment,
    })


def origins_config(allowed_origins):
    if allowed_origins is None:
        value = os.getenv(
            "FLOATPATH_ALLOWED_ORIGINS",
            os.getenv("FLOATPATH_CORS_ORIGINS", os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")),
        )
        allowed_origins = value.split(",")
    origins = []
    for value in allowed_origins:
        value = value.strip()
        parsed = urlsplit(value)
        try:
            port = parsed.port
        except ValueError:
            raise ValueError("Invalid CORS origin") from None
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment or "*" in value
                or any(c.isspace() for c in value) or (port is not None and not 1 <= port <= 65535)):
            raise ValueError("CORS origins must be explicit HTTP(S) origins without paths or credentials")
        origins.append(value)
    return origins


def create_app(database_url=None, analyst_token=None, reviewer_token=None, allowed_origins=None,
               public_demo=None, cookie_secure=None):
    analyst = os.getenv("FLOATPATH_ANALYST_TOKEN") if analyst_token is None else analyst_token
    reviewer = os.getenv("FLOATPATH_REVIEWER_TOKEN") if reviewer_token is None else reviewer_token
    if analyst and reviewer and analyst == reviewer:
        raise ValueError("Analyst and reviewer tokens must be different")
    database = get_engine(database_url or os.getenv("DATABASE_URL", "sqlite:///./floatpath.db"))

    if public_demo is None:
        public_demo = os.getenv("FLOATPATH_PUBLIC_DEMO", "false").lower() in ("true", "1")
    if cookie_secure is None:
        cookie_secure = os.getenv("FLOATPATH_COOKIE_SECURE", "false").lower() in ("true", "1")

    allowed = origins_config(allowed_origins)

    @asynccontextmanager
    async def lifespan(application):
        run_migrations(database)
        try:
            yield
        finally:
            database.dispose()

    application = FastAPI(title="FloatPath workspace API", version="0.1.0", lifespan=lifespan)
    application.state.db = database
    application.state.config = SimpleNamespace(
        analyst_token=analyst,
        reviewer_token=reviewer,
        allowed_origins=allowed,
        public_demo=public_demo,
        cookie_secure=cookie_secure,
    )
    application.state.login_limiter = LoginLimiter()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=allowed,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_credentials=True,
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Correlation-ID", "Origin"],
        expose_headers=["X-Correlation-ID"],
    )

    @application.middleware("http")
    async def correlation(request: Request, call_next):
        supplied = request.headers.get("x-correlation-id", "")
        request.state.correlation_id = supplied if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", supplied) else "req_" + uuid4().hex

        # Check disabled public demo routes early
        if request.url.path.startswith("/api/v1/demo/") and not application.state.config.public_demo:
            res = problem_response(404, "NOT_FOUND", "Request rejected", "Public demo routes are disabled in this workspace",
                                   request.state.correlation_id)
            res.headers["x-correlation-id"] = request.state.correlation_id
            res.headers["x-content-type-options"] = "nosniff"
            return res

        auth_handled = ((request.url.path == "/api/v1/auth/login" and request.method == "POST")
                        or (request.url.path == "/api/v1/auth/session" and request.method == "GET"))
        is_public = (
            request.url.path in {"/health", "/api/v1/rulesets"}
            or (request.url.path.startswith("/api/v1/demo/") and application.state.config.public_demo)
        )
        private = request.url.path.startswith("/api/v1/") and not is_public

        try:
            if private and not auth_handled and request.method != "OPTIONS":
                get_current_role(request)
            response = await call_next(request)
        except ApiProblem as error:
            if private and error.code == "UNAUTHORIZED":
                logger.info("Authentication rejected (correlation_id=%s)", request.state.correlation_id)
            response = problem_response(error.status_code, error.code, error.title, error.problem_detail,
                                        request.state.correlation_id, error.field_errors)
        except Exception:
            response = problem_response(500, "INTERNAL_ERROR", "Internal error", "Request could not be completed",
                                        request.state.correlation_id)

        response.headers["x-correlation-id"] = request.state.correlation_id
        response.headers["x-content-type-options"] = "nosniff"
        if private or request.url.path.startswith("/api/v1/auth/"):
            response.headers["cache-control"] = "no-store"
        return response

    @application.exception_handler(ApiProblem)
    async def problem_handler(request, error):
        return problem_response(error.status_code, error.code, error.title, error.problem_detail,
                                request.state.correlation_id, error.field_errors)

    @application.exception_handler(RequestValidationError)
    async def validation_handler(request, error):
        fields = [{"field": ".".join(map(str, item["loc"])), "message": item["msg"]} for item in error.errors()]
        return problem_response(422, "VALIDATION_ERROR", "Validation failed", "Request fields are invalid",
                                request.state.correlation_id, fields)

    @application.exception_handler(HTTPException)
    async def http_handler(request, error):
        return problem_response(error.status_code, "HTTP_ERROR", "Request rejected", "Invalid request or resource",
                                request.state.correlation_id)

    @application.exception_handler(IntegrityError)
    async def conflict_handler(request, error):
        return problem_response(409, "WRITE_CONFLICT", "Write conflict", "Resource already exists or is immutable",
                                request.state.correlation_id)

    @application.exception_handler(OperationalError)
    async def database_handler(request, error):
        return problem_response(503, "DATABASE_UNAVAILABLE", "Storage unavailable", "Retry the request later",
                                request.state.correlation_id)

    def require_roles(*allowed):
        def dependency(request: Request):
            actor = get_current_role(request)
            if actor not in allowed:
                with write_transaction(database) as connection:
                    audit(connection, request, actor, "AUTH_DENIED", "workspace")
                fail(403, "FORBIDDEN", f"Otorisasi ditolak: Memerlukan salah satu peran {', '.join(allowed)}")
            return actor
        return dependency

    role_any = require_roles("viewer", "analyst", "reviewer", "admin")
    role_analyst_plus = require_roles("analyst", "reviewer", "admin")
    role_reviewer_plus = require_roles("reviewer", "admin")
    role_admin_only = require_roles("admin")
    role_audit = require_roles("viewer", "reviewer", "admin")
    role = role_any
    reviewer_role = role_reviewer_plus

    @application.get("/health")
    def health():
        with database.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok", "mode": "synthetic_only"}

    # --- Auth routes ---

    @application.post("/api/v1/auth/login")
    def login_endpoint(body: LoginBody, request: Request, response: Response):
        token, user = login_user(request, body.username, body.password)
        response.set_cookie(
            key=COOKIE_NAME,
            value=token,
            max_age=SESSION_SECONDS,
            httponly=True,
            samesite="strict",
            secure=application.state.config.cookie_secure,
            path="/",
        )
        return {
            "user": user,
            "workspace": {"name": "FloatPath", "data_mode": "SYNTHETIC"},
        }

    @application.post("/api/v1/auth/logout")
    def logout_endpoint(request: Request, response: Response, actor=Depends(role)):
        if request.cookies.get(COOKIE_NAME):
            check_csrf(request)
        logout_user(request)
        response.delete_cookie(key=COOKIE_NAME, path="/", httponly=True, samesite="strict",
                               secure=application.state.config.cookie_secure)
        return {"status": "ok"}

    @application.get("/api/v1/auth/session")
    def session_endpoint(request: Request):
        user = session_user(request)
        return {
            "user": {"id": user["id"], "username": user.get("username"), "role": user["role"]},
            "workspace": {"name": "FloatPath", "data_mode": "SYNTHETIC"},
        }

    # --- Public demo routes ---

    @application.get("/api/v1/demo/companies")
    def demo_companies():
        return catalog()

    @application.get("/api/v1/demo/companies/{identifier}")
    def demo_detail(identifier: str):
        company = demo_company(identifier)
        snapshot = validated_snapshot(company["snapshot"])
        return company | {"assessment": calculate(engine.assess_numeric_target, snapshot)}

    @application.post("/api/v1/demo/simulations")
    def demo_simulation(body: DemoSimulation):
        company = demo_company(body.company_id)
        result = calculate(engine.simulate, validated_snapshot(company["snapshot"]), action_dict(body.action, company["code"]))
        return result | {"scenario_id": result["result_hash"], "company_id": company["id"]}

    @application.post("/api/v1/demo/reports")
    def demo_report(body: DemoReport):
        company = demo_company(body.company_id)
        snapshot = validated_snapshot(company["snapshot"])
        results = [calculate(engine.simulate, snapshot, action_dict(action, company["code"])) for action in body.actions]
        sources = sorted({h["evidence_ref"] for h in company["snapshot"]["holders"] if h.get("evidence_ref")})
        report = render_report(company["legal_name"], calculate(engine.assess_numeric_target, snapshot), results, sources)
        return report | {"id": digest(report), "company_id": company["id"]}

    @application.get("/api/v1/rulesets")
    def rulesets():
        assessment = calculate(engine.assess_numeric_target, validated_snapshot(catalog()[0]["snapshot"]))
        return [{"rule_set_id": assessment["rule_set_id"], "rule_version": assessment["rule_version"],
                 "version": assessment["rule_version"], "status": "DRAFT", "rule_status": "DRAFT",
                 "target_ratio": "0.15", "board": "DEMO_STANDARD", "mode": "SIMULATION_ONLY",
                 "warnings": ["NOT_A_LEGAL_COMPLIANCE_DETERMINATION", "UNVERIFIED_REGULATORY_CLAUSES_DISABLED"]}]

    # --- Authenticated workspace routes ---

    @application.get("/api/v1/workspace/companies")
    def list_workspace_companies(actor=Depends(role)):
        with database.connect() as connection:
            rows = connection.execute(text(
                "SELECT * FROM companies WHERE workspace_id='synthetic' ORDER BY created_at ASC, id ASC LIMIT 100"
            )).mappings().all()
            return [get_company_with_latest_snapshot(connection, dict(row)) for row in rows]

    @application.get("/api/v1/workspace/companies/{identifier}")
    def get_workspace_company(identifier: str, actor=Depends(role)):
        with database.connect() as connection:
            comp = resolve_company(connection, identifier)
            return get_company_with_latest_snapshot(connection, comp)

    @application.get("/api/v1/workspace/companies/{identifier}/scenarios")
    def list_workspace_company_scenarios(identifier: str, actor=Depends(role)):
        with database.connect() as connection:
            comp = resolve_company(connection, identifier)
            rows = connection.execute(text(
                "SELECT s.*, snap.id AS snapshot_id, c.id AS company_id, c.code "
                "FROM scenarios s "
                "JOIN snapshots snap ON s.snapshot_id=snap.id "
                "JOIN companies c ON snap.company_id=c.id "
                "WHERE c.id=:cid AND snap.workspace_id='synthetic' AND c.workspace_id='synthetic' "
                "ORDER BY s.created_at DESC, s.id DESC LIMIT 100"
            ), {"cid": comp["id"]}).mappings().all()
            return [
                json.loads(row["result_json"]) | {
                    "id": row["id"],
                    "scenario_id": row["id"],
                    "snapshot_id": row["snapshot_id"],
                    "company_id": row["company_id"],
                    "created_at": row["created_at"],
                } for row in rows
            ]

    @application.get("/api/v1/workspace/companies/{identifier}/reports")
    def list_workspace_company_reports(identifier: str, actor=Depends(role)):
        with database.connect() as connection:
            comp = resolve_company(connection, identifier)
            # Scenario identifiers are canonical UUID strings in the persisted JSON array.
            reports = connection.execute(text(
                "SELECT r.* FROM reports r WHERE r.workspace_id='synthetic' AND EXISTS ("
                "SELECT 1 FROM scenarios s JOIN snapshots snap ON s.snapshot_id=snap.id "
                "WHERE snap.company_id=:cid AND snap.workspace_id='synthetic' "
                "AND r.scenario_ids_json LIKE '%\"' || s.id || '\"%') "
                "ORDER BY r.created_at DESC, r.id DESC LIMIT 100"
            ), {"cid": comp["id"]}).mappings().all()
            return [json.loads(row["payload"]) | {"id": row["id"], "created_at": row["created_at"]} for row in reports]

    @application.post("/api/v1/workspace/companies/{identifier}/scenarios", status_code=201)
    def create_workspace_company_scenario(identifier: str, body: Action, request: Request, actor=Depends(role_analyst_plus)):
        with database.connect() as connection:
            comp = resolve_company(connection, identifier)
            snap_row = connection.execute(text(
                "SELECT * FROM snapshots WHERE company_id=:cid AND workspace_id='synthetic' "
                "ORDER BY COALESCE(locked_at, created_at) DESC, id DESC LIMIT 1"
            ), {"cid": comp["id"]}).mappings().first()
            if not snap_row or snap_row["status"] != "LOCKED":
                fail(409, "SNAPSHOT_NOT_LOCKED", "Scenario requires a locked snapshot")
        return create_scenario(UUID(snap_row["id"]), body, request, actor)

    # --- Core resources ---

    @application.post("/api/v1/companies", status_code=201)
    def create_company(body: CompanyBody, request: Request, actor=Depends(role_analyst_plus)):
        demo_company(body.code)
        row = {"id": str(uuid4()), "code": body.code, "legal_name": body.legal_name,
               "board": body.board, "created_at": now()}
        with write_transaction(database) as connection:
            connection.execute(text(
                "INSERT INTO companies (id, workspace_id, code, legal_name, board, created_at) "
                "VALUES (:id, 'synthetic', :code, :legal_name, :board, :created_at)"), row)
            audit(connection, request, actor, "CREATE_COMPANY", row["id"], after=digest(row))
        return enrich_company_presentation(row | {"workspace_id": "synthetic", "demo": True, "mode": "SYNTHETIC_ONLY"})

    @application.get("/api/v1/companies/{identifier}")
    def get_company(identifier: UUID, actor=Depends(role)):
        with database.connect() as connection:
            return enrich_company_presentation(company_row(connection, str(identifier)) | {"demo": True, "mode": "SYNTHETIC_ONLY"})

    @application.post("/api/v1/companies/{identifier}/snapshots", status_code=201)
    def create_snapshot(identifier: UUID, body: SnapshotBody, request: Request, actor=Depends(role_analyst_plus)):
        payload = body.model_dump(mode="json")
        payload["id"] = str(body.id or uuid4())
        with write_transaction(database) as connection:
            company = company_row(connection, str(identifier))
            check_sources(payload["holders"], company["code"])
            # DRAFT may be unreconciled; engine validation is mandatory at validate/lock.
            row = {"id": payload["id"], "company_id": str(identifier), "total_shares": payload["total_shares"],
                   "payload": dump(payload), "created_at": now(), "status": "DRAFT", "data_hash": None, "locked_at": None}
            connection.execute(text(
                "INSERT INTO snapshots (id, company_id, workspace_id, total_shares, payload, status, created_at) "
                "VALUES (:id, :company_id, 'synthetic', :total_shares, :payload, 'DRAFT', :created_at)"), row)
            audit(connection, request, actor, "CREATE_SNAPSHOT", row["id"], after=digest(payload))
        return snapshot_response(row)

    @application.get("/api/v1/snapshots/{identifier}")
    def get_snapshot(identifier: UUID, actor=Depends(role)):
        with database.connect() as connection:
            return snapshot_response(snapshot_row(connection, str(identifier)))

    @application.patch("/api/v1/snapshots/{identifier}/holdings")
    @application.post("/api/v1/snapshots/{identifier}/holdings:review")
    def review_holdings(identifier: UUID, body: HoldingsReviewBody, request: Request, actor=Depends(role_analyst_plus)):
        with write_transaction(database) as connection:
            row = snapshot_row(connection, str(identifier))
            if row["status"] != "DRAFT":
                fail(409, "SNAPSHOT_LOCKED", "Locked snapshots cannot be changed")
            payload = json.loads(row["payload"])
            before = digest(payload)
            holders = [h.model_dump(mode="json", exclude_none=True) for h in body.holders]
            check_sources(holders, row["code"], require=False)
            for h in holders:
                if "source_as_of_date" in h and h["source_as_of_date"] != payload["as_of_date"]:
                    fail(422, "DATE_MISMATCH", "Holder source date differs from snapshot date")
            payload["holders"] = holders
            connection.execute(text("UPDATE snapshots SET payload=:payload WHERE id=:id AND status='DRAFT'"),
                               {"payload": dump(payload), "id": str(identifier)})
            audit(connection, request, actor, "EDIT_HOLDINGS", str(identifier), before=before, after=digest(payload))
            updated_row = snapshot_row(connection, str(identifier))
            return snapshot_response(updated_row)

    @application.post("/api/v1/snapshots/{identifier}/holdings:import")
    def import_holdings(identifier: UUID, body: CSVBody, request: Request, actor=Depends(role_analyst_plus)):
        request_body = body.model_dump()
        with write_transaction(database) as connection:
            original = replay(connection, request, request_body)
            if original is not None:
                return original
            row = snapshot_row(connection, str(identifier))
            if row["status"] != "DRAFT":
                fail(409, "SNAPSHOT_LOCKED", "Locked snapshots cannot be changed")
            payload = json.loads(row["payload"])
            before = digest(payload)
            holders = parse_csv(body.csv_content, payload)
            check_sources(holders, row["code"], require=True)
            payload["holders"] = holders
            validated_snapshot(payload)
            connection.execute(text("UPDATE snapshots SET payload=:payload WHERE id=:id AND status='DRAFT'"),
                               {"payload": dump(payload), "id": str(identifier)})
            audit(connection, request, actor, "IMPORT_HOLDINGS", str(identifier), before, digest(payload))
            response = {"snapshot_id": str(identifier), "holders_count": len(holders), "status": "IMPORTED",
                        "import_hash": digest(request_body), "data_hash": digest(payload)}
            remember(connection, request, request_body, response, 200)
            return response

    @application.post("/api/v1/snapshots/{identifier}:validate")
    def validate(identifier: UUID, actor=Depends(role_analyst_plus)):
        with database.connect() as connection:
            row = snapshot_row(connection, str(identifier))
        payload = json.loads(row["payload"])
        snapshot = validated_snapshot(payload)
        check_sources(payload["holders"], row["code"], require=True)
        assessment = calculate(engine.assess_numeric_target, snapshot)
        return {"valid": True, "errors": [], "assessment_status": assessment["assessment_status"]}

    @application.post("/api/v1/snapshots/{identifier}:lock")
    def lock(identifier: UUID, request: Request, actor=Depends(reviewer_role)):
        with write_transaction(database) as connection:
            row = snapshot_row(connection, str(identifier))
            if row["status"] != "DRAFT":
                fail(409, "SNAPSHOT_LOCKED", "Snapshot is already locked")
            payload = json.loads(row["payload"])
            snapshot = validated_snapshot(payload)
            check_sources(payload["holders"], row["code"], require=True)
            assessment = calculate(engine.assess_numeric_target, snapshot)
            data_hash = calculate(engine.snapshot_hash, snapshot)
            locked_at = now()
            connection.execute(text(
                "UPDATE snapshots SET status='LOCKED', data_hash=:hash, locked_at=:time WHERE id=:id AND status='DRAFT'"
            ), {"id": str(identifier), "hash": data_hash, "time": locked_at})
            audit(connection, request, actor, "LOCK_SNAPSHOT", str(identifier), digest(payload), data_hash)
            return {"id": str(identifier), "status": "LOCKED", "data_hash": data_hash,
                    "locked_at": locked_at, "assessment_status": assessment["assessment_status"]}

    @application.post("/api/v1/snapshots/{identifier}/assessments", status_code=201)
    def assess(identifier: UUID, request: Request, actor=Depends(role)):
        with write_transaction(database) as connection:
            row = snapshot_row(connection, str(identifier))
            if row["status"] != "LOCKED":
                fail(409, "SNAPSHOT_NOT_LOCKED", "Assessment requires a locked snapshot")
            snapshot = validated_snapshot(json.loads(row["payload"]))
            result = calculate(engine.assess_numeric_target, snapshot)
            assessment_id = str(uuid4())
            connection.execute(text("INSERT INTO assessments VALUES (:id, :snapshot, :payload, :created)"),
                               {"id": assessment_id, "snapshot": str(identifier), "payload": dump(result), "created": now()})
            audit(connection, request, actor, "CREATE_ASSESSMENT", assessment_id, row["data_hash"], digest(result))
            return result | {"id": assessment_id, "snapshot_id": str(identifier)}

    @application.post("/api/v1/snapshots/{identifier}/scenarios", status_code=201)
    def create_scenario(identifier: UUID, body: Action, request: Request, actor=Depends(role_analyst_plus)):
        payload = body.model_dump(mode="json", exclude_none=True)
        with write_transaction(database) as connection:
            original = replay(connection, request, payload)
            if original is not None:
                return original
            row = snapshot_row(connection, str(identifier))
            if row["status"] != "LOCKED":
                fail(409, "SNAPSHOT_NOT_LOCKED", "Scenario requires a locked snapshot")
            action = action_dict(body, row["code"])
            result = calculate(engine.simulate, validated_snapshot(json.loads(row["payload"])), action)
            scenario_id = str(uuid4())
            connection.execute(text(
                "INSERT INTO scenarios (id, snapshot_id, action_json, result_json, input_hash, result_hash, created_at) "
                "VALUES (:id, :snapshot, :action, :result, :input, :hash, :created)"
            ), {"id": scenario_id, "snapshot": str(identifier), "action": dump(action), "result": dump(result),
                "input": result["input_hash"], "hash": result["result_hash"], "created": now()})
            audit(connection, request, actor, "CREATE_SCENARIO", scenario_id, result["input_hash"], result["result_hash"])
            response = result | {"id": scenario_id, "scenario_id": scenario_id, "snapshot_id": str(identifier),
                                 "company_id": row["company_id"]}
            remember(connection, request, payload, response)
            return response

    @application.get("/api/v1/scenarios/{identifier}/result")
    def get_result(identifier: UUID, actor=Depends(role)):
        with database.connect() as connection:
            row = scenario_row(connection, str(identifier))
            return json.loads(row["result_json"]) | {"id": row["id"], "scenario_id": row["id"],
                                                    "snapshot_id": row["snapshot_id"], "company_id": row["company_id"]}

    @application.post("/api/v1/scenario-comparisons")
    def compare(body: ScenarioIds, actor=Depends(role)):
        with database.connect() as connection:
            rows = scenario_rows(connection, body.scenario_ids)
            baseline = json.loads(rows[0]["baseline"])
            return {
                "snapshot_id": rows[0]["snapshot_id"],
                "company_id": rows[0]["company_id"],
                "baseline": baseline,
                "baseline_assessment": calculate(engine.assess_numeric_target, validated_snapshot(baseline)),
                "scenarios": [
                    json.loads(row["result_json"]) | {
                        "id": row["id"],
                        "scenario_id": row["id"],
                        "snapshot_id": row["snapshot_id"],
                        "company_id": row["company_id"],
                        "created_at": row["created_at"],
                    } for row in rows
                ],
                "watermark": "SIMULATION_ONLY",
            }

    @application.post("/api/v1/reports", status_code=201)
    def create_report(body: ScenarioIds, request: Request, actor=Depends(role_analyst_plus)):
        payload = body.model_dump(mode="json")
        with write_transaction(database) as connection:
            original = replay(connection, request, payload)
            if original is not None:
                return original
            rows = scenario_rows(connection, body.scenario_ids)
            baseline = json.loads(rows[0]["baseline"])
            results = [json.loads(row["result_json"]) for row in rows]
            sources = {h["evidence_ref"] for h in baseline["holders"] if h.get("evidence_ref")}
            for result in results:
                sources.update(a["evidence_ref"] for a in result["action"]["allocations"] if a.get("evidence_ref"))
            report = render_report(rows[0]["legal_name"], calculate(engine.assess_numeric_target, validated_snapshot(baseline)),
                                   results, sorted(sources))
            report["id"] = str(uuid4())
            report["company_id"] = rows[0]["company_id"]
            report["snapshot_id"] = rows[0]["snapshot_id"]
            report["scenario_ids"] = payload["scenario_ids"]
            connection.execute(text("INSERT INTO reports VALUES (:id, 'synthetic', :scenarios, :payload, :created)"),
                               {"id": report["id"], "scenarios": dump(payload["scenario_ids"]), "payload": dump(report), "created": now()})
            audit(connection, request, actor, "CREATE_REPORT", report["id"], after=digest(report))
            remember(connection, request, payload, report)
            return report

    @application.get("/api/v1/reports/{identifier}")
    def get_report(identifier: UUID, actor=Depends(role)):
        with database.connect() as connection:
            row = connection.execute(text("SELECT payload FROM reports WHERE id=:id AND workspace_id='synthetic'"),
                                     {"id": str(identifier)}).first()
            if not row:
                fail(404, "NOT_FOUND", "Report not found in synthetic workspace")
            return json.loads(row[0])

    # --- Governance & Team Management ---

    @application.get("/api/v1/workspace/audit-events")
    def list_audit_events(limit: int = 100, actor=Depends(role_audit)):
        with database.connect() as connection:
            rows = connection.execute(text(
                "SELECT a.id, a.workspace_id, a.actor_id, a.action, a.entity_id, "
                "a.before_hash, a.after_hash, a.correlation_id, a.created_at, "
                "u.username, u.role AS actor_role "
                "FROM audit_events a "
                "LEFT JOIN workspace_users u ON a.actor_id = u.id "
                "WHERE a.workspace_id='synthetic' "
                "ORDER BY a.created_at DESC, a.id DESC LIMIT :limit"
            ), {"limit": min(max(1, limit), 200)}).mappings().all()
            return [dict(row) for row in rows]

    @application.get("/api/v1/workspace/users")
    def list_workspace_users(actor=Depends(role_admin_only)):
        with database.connect() as connection:
            rows = connection.execute(text(
                "SELECT id, username, role, created_at FROM workspace_users "
                "WHERE workspace_id='synthetic' ORDER BY created_at ASC, username ASC"
            )).mappings().all()
            return [dict(row) for row in rows]

    @application.post("/api/v1/workspace/users", status_code=201)
    def create_workspace_user(body: CreateUserBody, request: Request, actor=Depends(role_admin_only)):
        with database.connect() as connection:
            existing = connection.execute(text(
                "SELECT id FROM workspace_users WHERE username=:username AND workspace_id='synthetic'"
            ), {"username": body.username}).first()
            if existing:
                fail(409, "USER_EXISTS", f"Pengguna '{body.username}' sudah terdaftar")
        created = create_user(database, body.username, body.password, body.role)
        with write_transaction(database) as connection:
            audit(connection, request, actor, "CREATE_USER", created["id"], after=created["role"])
        return created

    @application.patch("/api/v1/workspace/users/{identifier}")
    def update_workspace_user_role(identifier: UUID, body: UpdateUserRoleBody, request: Request, actor=Depends(role_admin_only)):
        uid = str(identifier)
        with write_transaction(database) as connection:
            user = connection.execute(text(
                "SELECT id, username, role FROM workspace_users WHERE id=:id AND workspace_id='synthetic'"
            ), {"id": uid}).mappings().first()
            if not user:
                fail(404, "NOT_FOUND", "Pengguna tidak ditemukan")
            if user["role"] == "admin" and body.role != "admin":
                admin_count = connection.execute(text(
                    "SELECT count(*) FROM workspace_users WHERE role='admin' AND workspace_id='synthetic'"
                )).scalar()
                if admin_count <= 1:
                    fail(400, "CANNOT_DEMOTE_LAST_ADMIN", "Tidak dapat mengubah peran admin terakhir")
            connection.execute(text("UPDATE workspace_users SET role=:role WHERE id=:id"), {"role": body.role, "id": uid})
            audit(connection, request, actor, "UPDATE_USER_ROLE", uid, before=user["role"], after=body.role)
            return {"id": uid, "username": user["username"], "role": body.role}

    @application.post("/api/v1/documents")
    @application.post("/api/v1/documents/{identifier}:extract")
    @application.post("/api/v1/extractions/{identifier}:approve")
    def unavailable(request: Request, actor=Depends(role)):
        fail(503, "SYNTHETIC_MANUAL_ONLY", "Uploads and AI are disabled; use synthetic fixture-backed manual input")

    return application


app = create_app()

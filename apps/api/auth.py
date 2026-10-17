"""Single synthetic workspace identity; opaque persisted sessions, no default users."""
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
import hashlib
from hmac import compare_digest
import re
import secrets
from threading import Lock
from time import monotonic
from uuid import uuid4

from fastapi import Request
from sqlalchemy import text

from apps.api.db import write_transaction
from apps.api.errors import ApiProblem

COOKIE_NAME = "floatpath_session"
SESSION_SECONDS = 8 * 60 * 60
PASSWORD_ITERATIONS = 600_000
USERNAME_PATTERN = r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}"
TOKEN_PATTERN = r"[A-Za-z0-9_-]{43}"


def utcnow():
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise ValueError("Password must contain 12 to 256 characters")
    salt = secrets.token_hex(16)
    value = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt}${value.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split("$")
        if algorithm != "pbkdf2_sha256" or int(iterations) != PASSWORD_ITERATIONS:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations))
        return compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, TypeError, UnicodeError):
        return False


_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


ALLOWED_ROLES = {"viewer", "analyst", "reviewer", "admin"}


def create_user(database, username: str, password: str, role: str) -> dict:
    if not isinstance(username, str) or not re.fullmatch(USERNAME_PATTERN, username) or role not in ALLOWED_ROLES:
        raise ValueError("Use a bounded username and valid role (viewer, analyst, reviewer, admin)")
    user = {"id": str(uuid4()), "username": username, "role": role}
    with write_transaction(database) as connection:
        connection.execute(text(
            "INSERT INTO workspace_users (id, workspace_id, username, password_hash, role, created_at) "
            "VALUES (:id, 'synthetic', :username, :password_hash, :role, :created_at)"
        ), user | {"password_hash": hash_password(password), "created_at": utcnow().isoformat()})
    return user


class LoginLimiter:
    # ponytail: per-process, bounded 1024-client limiter; use shared limits before multiple API workers.
    def __init__(self):
        self.attempts = OrderedDict()
        self.lock = Lock()

    def check(self, key):
        with self.lock:
            current = monotonic()
            start, count = self.attempts.pop(key, (current, 0))
            if current - start >= 60:
                start, count = current, 0
            self.attempts[key] = (start, count + 1)
            if len(self.attempts) > 1024:
                self.attempts.popitem(last=False)
            if count >= 10:
                raise ApiProblem(429, "LOGIN_RATE_LIMITED", "Too many attempts", "Wait before trying again")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def unauthorized(detail: str = "Invalid credentials or expired session"):
    raise ApiProblem(401, "UNAUTHORIZED", "Authentication required", detail)


def check_csrf(request: Request):
    origin = request.headers.get("origin")
    if not origin:
        raise ApiProblem(403, "CSRF_ORIGIN_REJECTED", "Origin rejected", "Origin header is required for cookie-authenticated mutations")
    if origin not in request.app.state.config.allowed_origins:
        raise ApiProblem(403, "CSRF_ORIGIN_REJECTED", "Origin rejected", "Configured Origin required")


def session_user(request: Request):
    token = request.cookies.get(COOKIE_NAME, "")
    if not token or not re.fullmatch(TOKEN_PATTERN, token):
        unauthorized("Provide a configured bearer token or session cookie")
    with request.app.state.db.connect() as connection:
        row = connection.execute(text(
            "SELECT u.id, u.username, u.role, s.expires_at FROM workspace_sessions s "
            "JOIN workspace_users u ON u.id=s.user_id "
            "WHERE s.token_hash=:hash AND u.workspace_id='synthetic'"
        ), {"hash": token_hash(token)}).mappings().first()
    if row is None:
        unauthorized("Session not found or revoked")
    try:
        expired = datetime.fromisoformat(row["expires_at"]) <= utcnow()
    except (ValueError, TypeError):
        expired = True
    if expired:
        unauthorized("Session has expired")
    return {key: row[key] for key in ("id", "username", "role")}


def login_user(request: Request, username: str, password: str):
    check_csrf(request)
    request.app.state.login_limiter.check(request.client.host if request.client else "unknown")
    with request.app.state.db.connect() as connection:
        row = connection.execute(text(
            "SELECT id, username, role, password_hash FROM workspace_users WHERE username=:username AND workspace_id='synthetic'"
        ), {"username": username}).mappings().first()
    valid = verify_password(password, row["password_hash"] if row else _DUMMY_PASSWORD_HASH)
    if row is None or not valid:
        unauthorized("Invalid username or password")
    token = secrets.token_urlsafe(32)
    created = utcnow()
    with write_transaction(request.app.state.db) as connection:
        connection.execute(text("DELETE FROM workspace_sessions WHERE expires_at<=:now"), {"now": created.isoformat()})
        previous = request.cookies.get(COOKIE_NAME)
        if previous and re.fullmatch(TOKEN_PATTERN, previous):
            connection.execute(text("DELETE FROM workspace_sessions WHERE token_hash=:hash"), {"hash": token_hash(previous)})
        connection.execute(text(
            "INSERT INTO workspace_sessions (token_hash, user_id, expires_at, created_at) VALUES (:hash, :user, :expires, :created)"
        ), {"hash": token_hash(token), "user": row["id"], "expires": (created + timedelta(seconds=SESSION_SECONDS)).isoformat(),
            "created": created.isoformat()})
    return token, {key: row[key] for key in ("id", "username", "role")}


def logout_user(request: Request):
    token = request.cookies.get(COOKIE_NAME, "")
    if token and re.fullmatch(TOKEN_PATTERN, token):
        with write_transaction(request.app.state.db) as connection:
            connection.execute(text("DELETE FROM workspace_sessions WHERE token_hash=:hash"), {"hash": token_hash(token)})


def get_current_role(request: Request, required_role: str | None = None) -> str:
    if not hasattr(request.state, "user"):
        config = request.app.state.config
        authorization = request.headers.get("Authorization", "")
        if authorization:
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() != "bearer" or not token or token != token.strip():
                unauthorized("Provide a configured bearer token")
            supplied = token.encode("utf-8")
            analyst = bool(config.analyst_token) and compare_digest(supplied, config.analyst_token.encode("utf-8"))
            reviewer = bool(config.reviewer_token) and compare_digest(supplied, config.reviewer_token.encode("utf-8"))
            if not (analyst or reviewer):
                unauthorized("Invalid credentials")
            role = "reviewer" if reviewer else "analyst"
            request.state.user = {"id": f"bearer:{role}", "username": None, "role": role, "auth_type": "bearer"}
        else:
            user = session_user(request)
            request.state.user = {**user, "auth_type": "session"}
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                check_csrf(request)

    role = request.state.user["role"]
    if required_role == "reviewer" and role != "reviewer":
        raise ApiProblem(403, "FORBIDDEN", "Insufficient permissions", "Reviewer role is required")
    return role

"""Local synthetic workspace bearer tokens; not a production identity provider."""
from hmac import compare_digest

from fastapi import Request

from apps.api.errors import ApiProblem


def get_current_role(request: Request, required_role: str | None = None) -> str:
    config = request.app.state.config
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token or token != token.strip():
        raise ApiProblem(401, "UNAUTHORIZED", "Authentication required", "Provide a configured bearer token")
    if not config.analyst_token or not config.reviewer_token:
        raise ApiProblem(401, "AUTH_NOT_CONFIGURED", "Authentication unavailable", "Local workspace tokens are not configured")
    supplied = token.encode("utf-8")
    analyst = compare_digest(supplied, config.analyst_token.encode("utf-8"))
    reviewer = compare_digest(supplied, config.reviewer_token.encode("utf-8"))
    if not (analyst or reviewer):
        raise ApiProblem(401, "UNAUTHORIZED", "Authentication failed", "Invalid credentials")
    role = "reviewer" if reviewer else "analyst"
    if required_role == "reviewer" and role != "reviewer":
        raise ApiProblem(403, "FORBIDDEN", "Insufficient permissions", "Reviewer role is required")
    return role

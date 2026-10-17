"""RFC 9457 Problem Details responses and error classes."""
from __future__ import annotations

from typing import Any
from fastapi import HTTPException
from fastapi.responses import JSONResponse


class ApiProblem(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str,
        field_errors: list[dict[str, Any]] | None = None,
    ):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
        self.title = title
        self.problem_detail = detail
        self.field_errors = field_errors or []


def problem_response(
    status: int,
    code: str,
    title: str,
    detail: str,
    correlation_id: str,
    field_errors: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    payload = {
        "type": f"https://floatpath.example/errors/{code.lower().replace('_', '-')}",
        "title": title,
        "status": status,
        "code": code,
        "detail": detail,
        "field_errors": field_errors or [],
        "correlation_id": correlation_id,
    }
    return JSONResponse(
        status_code=status,
        content=payload,
        media_type="application/problem+json",
        headers={"x-correlation-id": correlation_id},
    )

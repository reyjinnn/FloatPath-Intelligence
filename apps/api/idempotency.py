"""Replay storage shares the write transaction with the resource and its audit."""
import hashlib
import json

from sqlalchemy import text

from apps.api.errors import ApiProblem


def dump(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value) -> str:
    return "sha256:" + hashlib.sha256(dump(value).encode()).hexdigest()


def replay(connection, request, payload):
    key = request.headers.get("Idempotency-Key")
    if key is None:
        return None
    if not key or len(key) > 128 or not key.isascii() or any(ord(c) < 33 for c in key):
        raise ApiProblem(400, "INVALID_IDEMPOTENCY_KEY", "Invalid key", "Use 1 to 128 printable ASCII characters")
    row = connection.execute(text(
        "SELECT request_hash, response_json FROM idempotency_records WHERE scope=:scope AND key=:key"
    ), {"scope": request.url.path, "key": key}).mappings().first()
    if row:
        if row["request_hash"] != digest(payload):
            raise ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Key conflict", "Key was already used with a different body")
        return json.loads(row["response_json"])
    return None


def remember(connection, request, payload, response, status=201):
    key = request.headers.get("Idempotency-Key")
    if key:
        connection.execute(text(
            "INSERT INTO idempotency_records (scope, key, request_hash, response_json, status_code) "
            "VALUES (:scope, :key, :hash, :response, :status)"
        ), {"scope": request.url.path, "key": key, "hash": digest(payload), "response": dump(response), "status": status})

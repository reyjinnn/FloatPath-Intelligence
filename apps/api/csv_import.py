"""Bounded, atomic-import parser. Caller replaces the draft only after success."""
import csv
import io
import re

from pydantic import ValidationError

from apps.api.errors import ApiProblem
from apps.api.schemas import Holding, MAX_SHARES

COLUMNS = ["holder_ref", "holder_type", "share_count", "controller", "controller_affiliate",
           "director_commissioner", "treasury", "restricted", "eligibility_state", "evidence_ref"]
MAX_BYTES = 5 * 1024 * 1024


def reject(code, detail):
    raise ApiProblem(422, code, "CSV rejected", detail)


def parse_csv(content: str, snapshot: dict) -> list[dict]:
    try:
        encoded = content.encode("utf-8", errors="strict")
    except UnicodeError:
        reject("CSV_INVALID_UTF8", "CSV must be valid UTF-8")
    if len(encoded) > MAX_BYTES:
        reject("CSV_FILE_TOO_LARGE", "CSV exceeds 5 MiB")
    if "\x00" in content or "\ufffd" in content:
        reject("CSV_INVALID_UTF8", "CSV contains invalid content")
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff"), newline=""), strict=True)
    try:
        columns = reader.fieldnames or []
        if (len(columns) != len(set(columns)) or not set(COLUMNS) <= set(columns)
                or set(columns) - set(COLUMNS) - {"as_of_date", "snapshot_id"}):
            reject("CSV_MISSING_COLUMN", "Use the canonical holdings header")
        holders, refs = [], set()
        for number, row in enumerate(reader, 1):
            if number > 10_000:
                reject("CSV_TOO_MANY_ROWS", "CSV exceeds 10000 rows")
            if None in row or any(value is None for value in row.values()):
                reject("CSV_MALFORMED_ROW", "Every row must match the header")
            if any(value.lstrip().startswith(("=", "+", "-", "@")) for value in row.values()):
                reject("CSV_UNTRUSTED_FORMULA", "Formula-like CSV cells are not accepted")
            if "as_of_date" in row and row["as_of_date"] != snapshot["as_of_date"]:
                reject("CSV_DATE_MISMATCH", "CSV date must match its snapshot")
            if "snapshot_id" in row and row["snapshot_id"] != snapshot["id"]:
                reject("CSV_SNAPSHOT_MISMATCH", "CSV snapshot ID must match its owner")
            if not re.fullmatch(r"[0-9]+", row["share_count"]) or len(row["share_count"]) > 16:
                reject("CSV_INVALID_INTEGER", "share_count must be a nonnegative safe integer")
            shares = int(row["share_count"])
            if shares > MAX_SHARES:
                reject("CSV_INVALID_INTEGER", "share_count exceeds the safe integer limit")
            if row["holder_ref"] in refs:
                reject("CSV_DUPLICATE_HOLDER", "holder_ref must be unique")
            refs.add(row["holder_ref"])
            values = {key: row[key] for key in COLUMNS if key not in {"share_count", "eligibility_state"}}
            try:
                holder = Holding(**values, shares=shares, eligibility=row["eligibility_state"])
            except ValidationError:
                reject("CSV_INVALID_ROW", "CSV contains invalid holder fields")
            holders.append(holder.model_dump(mode="json"))
    except csv.Error:
        reject("CSV_MALFORMED", "CSV quoting or structure is invalid")
    if not holders:
        reject("CSV_EMPTY", "At least one holding is required")
    return holders

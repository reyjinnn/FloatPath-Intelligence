"""Generate/check the actual API contract without starting a server or touching data."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apps.api.main import create_app  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contract = ROOT / "docs/06-architecture/openapi.json"
    schema = create_app(database_url="sqlite:///:memory:").openapi()
    text = json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.check:
        if not contract.exists() or contract.read_text(encoding="utf-8") != text:
            raise SystemExit("OpenAPI differs. Run: python scripts/export_openapi.py")
        print("OpenAPI contract matches implementation.")
    else:
        contract.write_text(text, encoding="utf-8")
        print(contract.relative_to(ROOT))


if __name__ == "__main__":
    main()

"""Deterministic Markdown, not AI advice. No external sources are fetched."""
import json
import re


def safe(value) -> str:
    value = str(value).replace("\n", " ").replace("\r", " ")
    return re.sub(r"([\\`*_{}\[\]()<>#+.!|~-])", r"\\\1", value)


def render_report(company, baseline, results: list[dict], sources: list[str]) -> dict:
    lines = ["# FloatPath synthetic comparison", "", "**SIMULATION_ONLY**", "",
             "Synthetic data only. Not a legal compliance determination or financial recommendation.",
             "The DRAFT numeric target is 0.15; other regulatory constraints remain unverified.",
             "", f"Company: {safe(company)}", "", "## Baseline",
             f"- Free-float ratio: {safe(baseline.get('free_float_ratio') or 'UNKNOWN')}",
             f"- Numeric status: {safe(baseline['numeric_target_status'])}",
             f"- Input hash: {safe(baseline['data_hash'])}"]
    for index, result in enumerate(results):
        assessment = result["assessment"]
        lines += ["", f"## Scenario {chr(65 + index)}",
                  f"- Action: {safe(result['action']['action_type'])}",
                  f"- Total shares: {assessment['total_shares']}",
                  f"- Eligible shares: {safe(assessment.get('eligible_shares'))}",
                  f"- Free-float ratio: {safe(assessment.get('free_float_ratio') or 'UNKNOWN')}",
                  f"- Numeric status: {safe(assessment['numeric_target_status'])}",
                  f"- Assessment: {safe(assessment['assessment_status'])}",
                  f"- Input hash: {safe(result['input_hash'])}",
                  f"- Result hash: {safe(result['result_hash'])}",
                  f"- Cash estimate IDR: {safe(result.get('cash_estimate_idr'))}",
                  f"- Issuance dilution by holder: {safe(json.dumps(result.get('dilution_by_holder'), sort_keys=True))}"]
        for warning in assessment.get("warnings", []):
            lines.append(f"- Warning: {safe(warning)}")
        for constraint in assessment.get("unresolved_constraints", []):
            lines.append(f"- Unresolved: {safe(constraint)}")
    lines += ["", "## Synthetic provenance"] + [f"- {safe(source)}" for source in sources]
    return {"markdown_content": "\n".join(lines) + "\n", "watermark": "SIMULATION_ONLY", "sources": sources}

# Definition of Done

## For every task
- Acceptance criteria traceable to PRD ID and test ID.
- Code and config are reviewed; deterministic tests pass locally and in CI.
- Error path, empty path, unsupported input, and provenance behavior documented.
- No new dependency without reason, license, vulnerability check.
- No secret, raw personal record, or unlicensed data committed.
- API and user guide updated for changed behavior.

## For rule changes
- Primary text/authority/date and specific section stored; reviewer identity and rationale recorded.
- Old/new rule version preserved; tests cover temporal boundary, excluded category, and rounding.
- Historical results reproduce with old rule version; new assessments explicitly use new version.
- Fail closed on unsupported board/category.

## For AI features
- JSON schema validated; numeric extracted values remain `PENDING_REVIEW` until approved.
- Source citation points to document page/span and is checked; missing data does not become a guess.
- Versioned model/prompt, eval dataset, quality metrics, and cost logged.
- Sensitive documents disallowed in public demo; injection tests pass.

## For public demo
- Stable URL, clear `Synthetic Data` watermark, no write to confidential production records.
- Rate limit, safe upload or upload disabled; no-login environment isolated.
- Mobile/responsive UX, video 60–90 sec, replayable scenarios, status/error messages.
- No unsupported ROI/pricing/compliance claims.

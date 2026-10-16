# Local lead endpoint QA

Version: 2026.10.01.1 · 2026-10-01 · Codex / GPT-6
Result: PASS
Runtime: PHP 8.5.11 (cli) (built: Sep 22 2026 13:51:38) (NTS Visual C++ 2022 x64)
Real email transmissions: **0**. Local test capture/failure transport only.
Validated configuration matrix: **270/270**.

- PASS — Method, media type, malformed JSON, oversized body and origin validation
- PASS — Contact validation rejects missing, wrong-type, overlong, injected and honeypot values
- PASS — Configuration validation rejects invalid types, duplicates and incompatible modules
- PASS — Phone-only/email-only, Unicode boundary and allowed origins remain usable
- PASS — 270 valid configurations produce matching server-owned catalog and shared equipment
- PASS — Success, safe replay, canonical module ordering and conflicting payload ID
- PASS — Parallel duplicate across two PHP processes is captured once
- PASS — Per-IP limit is five attempts/10 minutes and replay remains available
- PASS — Global limit permits 25 attempts/minute and blocks request 26 regardless of IP bucket
- PASS — Expired windows are pruned and limits reserve capacity across concurrent requests
- PASS — Windows transient replacement lock recovers; persistent lock fails before capture
- PASS — Mail transport failure is explicit and the same request can retry safely
- PASS — Pending/unknown and corrupt persisted states fail closed without another capture
- PASS — Unavailable/private-storage guards prevent acceptance and public writes

## Limits

- Runtime tests use PHP 8.5.11, not PHP 5.6. PHP 5.6 compatibility is syntax/API inspection only.
- Beget PHP/sendmail and actual delivery to premium-gas@mail.ru are not exercised.
- Global limit applies to this application; other sites on the Beget account may also send mail.

PHP 5.6 review: array() syntax, no null coalescing, scalar/return type declarations, arrow functions, random_bytes, JSON_THROW_ON_ERROR or other newer syntax/API. Functions used by lead.php are available in PHP 5.6. The older interpreter was not installed or executed.

Private test evidence: C:\Users\Алексей\Documents\Codex\2026-10-01\sites-plugin-sites-openai-curated-remote\work\lead-test\1790855851696-43336

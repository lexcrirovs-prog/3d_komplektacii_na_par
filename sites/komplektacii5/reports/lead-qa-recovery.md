# Lead API persistence regression investigation

Version 2026.10.01.1 · 2026-10-01 · Codex / GPT-6

## Observed failure

The complete npm test run recorded HTTP 503 where the global-rate scenario expected HTTP 200. Its private test storage was `work/lead-test/1790855659093-14396`. The 270-configuration matrix and other endpoint scenarios passed. The original assertion did not retain the response body or PHP stderr, so the exact original cause is **not established**. Antivirus involvement is not confirmed.

A targeted rerun after adding diagnostics passed all 14 then-existing tests without a transport/state behavior change. This successful rerun alone was not treated as a fix.

## Deterministic regression and change

On Windows, a separate hidden PowerShell process opened `rate-global.json` with `FileShare.Read`, denying replacement while the handle remained open. This exercises a concrete failure of atomic rename that a transient file reader can cause.

- A 100 ms lock was recovered by the bounded atomic-rename retry. The endpoint returned HTTP 200, retained accepted idempotency state, and logged a recovered rename.
- A 900 ms lock exceeded the retry budget. The endpoint returned HTTP 503 **before** any test-mail capture and preserved the old rate state. After release, the same request ID succeeded.
- Six attempts allow at most 310 ms of delay, only on Windows. The global application lock remains held. Linux keeps its single atomic-rename attempt.
- Only the file replacement is retried. The mail transport is never repeated by this mechanism.
- Persistence failures now enter the PHP server log. A failed global-rate assertion now includes its response body and recent server logs.

The controlled test proves that the mitigated failure class exists. It does not prove that it caused the original uninstrumented HTTP 503.

## Final verification

`node --test tests/lead-api.test.mjs` — **15 tests passed, 0 failed**, including all **270 valid server configurations**, cross-process idempotency and global-rate boundaries, and both controlled Windows replacement-lock cases. Total duration: 10.18 seconds. See `lead-qa.json` for the current scenario results.

All PHP servers used localhost `cli-server` with `PREMIUM_TEST_MODE=1`; transport was capture or explicit failure. **Real emails sent: 0.** Test processes were stopped. Actual Beget/sendmail delivery remains unverified, and PHP 5.6 compatibility remains a static review rather than an executed PHP 5.6 runtime test.

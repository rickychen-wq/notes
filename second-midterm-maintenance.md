# Second-midterm admin preview — 2026-10-19 (Taiwan)

## Scope and visibility

- Five uploaded 4500 ranges: 11-3 (46), 11-4 (48), 11-5 (46), 11-6 (46), 12-1 (50). Total: **236 numbered headwords**.
- Updated 2026-10-21: `index.html` and `en-second-vocab.html` admit administrators or exact UIDs in `settings/system.secondVocabAllowedUids`. Unlisted accounts retain the preparing screen. First-midterm grants and matching display names do not grant new access.
- `manage.html` remains strictly administrator-only. `second-vocab-access.js` mounts its account picker only for administrators, on the home, vocabulary and management pages. Saving updates only the new allowlist and `updatedAt`; canceling does not write. The list starts empty unless the administrator has explicitly saved grants. Classmates refresh the page after a grant or revocation.
- Previous notes, accounts, Firestore rules, administrator identity and existing access lists are unchanged. No previous content was deleted or re-linked from the homepage.
- This is a static GitHub Pages site: UI/page gating is **not** secrecy for source files in a public repository. Truly confidential future content must be served by an authenticated backend and protected rules.

## Data and quizzes

- Source: the user's 32 scanned pages dated 2026-10-19, printed pages 216–252 with intervening exercise pages omitted. Every headword records its unit, number and printed page.
- Meanings/POS are transcribed; usage notes are paraphrased. Unnumbered derivatives appear in notes, not as extra quiz headwords.
- English input ignores letter case and whitespace, but not misspelled letters. Listed British spelling variants are accepted.
- Chinese accepts curated synonymous meanings and punctuation differences. Unrecognized but correct meanings can be manually marked correct; the attempt keeps that flag. This is deterministic matching, not an AI semantic classifier.
- Three modes: Chinese-to-English choices, Chinese-to-English typing, English-to-Chinese typing.
- A–Z, unit, starred and recent-wrong filters; manual next/Enter; IME composition protection; saved unfinished drafts; wrong-answer retry.

## Persistence

- UID-scoped local cache: `nx:midterm2:<uid>:state`, `pending`, `outbox`, `draft`.
- Starred/wrong flags: `users/<uid>.studyV2`. Updates use dotted fields and do not replace the account document.
- Completed attempts: `users/<uid>/attempts/m2-<unique-id>` with full answers, score, units, mode, duration and manual-correction markers.
- An idempotent Firestore transaction records the attempt and increments that user's daily quiz count once. Retried uploads retain the original completion time; new daily attempt keys use Asia/Taipei.
- No old `nx:score:*` writes, so the legacy score observer cannot double-record new quizzes.
- Localhost preview never writes to Firebase. Pending synchronization is shown explicitly; reconnect/retry flushes the outbox.

## Admin controls

- Search/sort users, 7/30-day stats, per-user detail. Attempt statistics read at most 120 recent attempts per person, labeled when the limit is reached.
- Content tab provides the second-midterm vocabulary account picker and read-only archived-grant counts. It never reopens archived content.
- Registration changes require explicit confirmation and modify only `registrationOpen`/`updatedAt`.
- Password change affects the signed-in administrator only. Firebase may require a recent login.
- No account deletion, role changes, or new first-admin bootstrap behavior.

## Verification

```sh
npm run validate
npm run test:study
# Requires Playwright and a browser; tests start their own local server.
npm run test:study:browser
```

Browser tests route Firebase to an in-memory fixture, block external requests, and run the actual gate/UI/store. They do not access live accounts. Optional environment variables: `TEST_CHROMIUM_PATH`, `TEST_SCREENSHOTS`, `TEST_BASE_URL`, `TEST_CJK_FONT_ROOT`; the Codex runtime can supply Playwright via `CODEX_PRIMARY_RUNTIME_NODE_MODULES`.

Before releasing more ranges, preserve old filenames and update the bank version only when a draft becomes incompatible. Never reuse archived grant lists automatically.

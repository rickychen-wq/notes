# Second-midterm admin preview — 2026-10-19 (Taiwan)

## Scope and visibility

- Five uploaded 4500 ranges: 11-3 (46), 11-4 (48), 11-5 (46), 11-6 (46), 12-1 (50). Total: **236 numbered headwords**.
- `index.html` shows the new workspace only after the authenticated profile has `role: admin`. Ordinary accounts retain the existing preparing screen.
- `en-second-vocab.html` and `manage.html` use the strict admin gate. First-midterm grants or matching display names do not grant new access.
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
- Content tab shows strict current visibility and read-only archived-grant counts.
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

Before releasing more ranges, preserve old filenames and update the bank version only when a draft becomes incompatible. Opening the preview to classmates is a separate deliberate permission change; never reuse archived grant lists automatically.

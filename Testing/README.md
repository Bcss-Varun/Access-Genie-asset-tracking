# Testing — Access Genie

QA artefacts and the automated harness that produces them. One module per cycle.

## Documents

| File | What it is |
|---|---|
| [00-TEST-PLAN.md](00-TEST-PLAN.md) | Scope, approach, environment, risks, what was deliberately deferred |
| [01-TEST-CASES.md](01-TEST-CASES.md) | Every case with steps, expected, actual, status, severity — **generated** |
| [02-EXECUTION-LOG.md](02-EXECUTION-LOG.md) | Run-by-run results and teardown record — **generated** |
| [03-BUG-REPORTS.md](03-BUG-REPORTS.md) | Full bug reports with root cause and suggested fix |
| [04-SUMMARY.md](04-SUMMARY.md) | Testing summary, severity breakdown, recommendations, readiness score |

`01` and `02` are written by `harness/report.mjs`. Edit the runners, not those
two files.

## Running the suite

The app must be up (`npm run dev`) with a connected database and a seeded
super-admin (`npm run seed`).

```bash
node Testing/harness/api-tests.mjs                        # ~70 cases, ~3 min
node --experimental-websocket Testing/harness/ui-tests.mjs # ~29 cases, ~2 min
node Testing/harness/report.mjs                            # regenerate 01 + 02
```

Override the target or credentials with `AG_API`, `AG_WEB`, `AG_EMAIL`,
`AG_PASSWORD`.

## The harness

| File | Role |
|---|---|
| `harness/lib.mjs` | Auth, request helper, result recording, teardown bookkeeping |
| `harness/cdp.mjs` | Chrome DevTools Protocol driver — navigation, React-safe `fill`, screenshots, console/network capture |
| `harness/api-tests.mjs` | API, validation, boundary, negative, security, database, performance |
| `harness/ui-tests.mjs` | UI, UX, functional, accessibility, responsive, permission |
| `harness/report.mjs` | Renders the generated markdown from `results/*.json` |

`cdp.mjs` exists because this container has a Chrome binary but no Playwright,
Puppeteer or `chromium-cli`. It speaks CDP over a WebSocket directly — Node 20
needs `--experimental-websocket` for the global, which is why the UI runner is
launched with that flag.

Two details worth knowing before extending it:

- **`fill()` uses the native value setter plus a bubbling `input` event.**
  Assigning `.value` does not reach React — its value tracker suppresses the
  duplicate and `onChange` never fires.
- **`waitForGate()` waits out two sequential loading screens** — "Restoring your
  session…" then "Loading your workspace…". Asserting on page content before both
  clear is a race, and the failure looks exactly like a broken feature.

## Data safety

These suites run against a **live database**. Every runner records what it
creates and deletes it in teardown; the execution log reports the result. A run
interrupted mid-flight can leave assets named `QA …` behind — check with:

```bash
curl -s "$AG_API/assets?q=QA%20" -H "Authorization: Bearer $TOKEN"
```

Cycle 1 was verified clean: the operator's own `AST-1` was untouched and no QA
records remained.

## Output

- `results/*.json` — machine-readable results, the source for `01` and `02`
- `evidence/*.png` — screenshots referenced by test cases and bug reports

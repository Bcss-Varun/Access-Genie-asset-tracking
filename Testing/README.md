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

## Isolated stabilization regressions

Stage 2 has a self-contained suite that does not use the running application or
`backend/.env`:

```bash
npm run test:stabilization       # HTTP, database, permission and error-handling regressions
npm run test:stabilization:ui    # same checks plus real Chrome browser flows
```

Both commands create a disposable loopback MongoDB with a unique port, load
explicit test fixtures, start the API on a random local port and stop everything
at completion. No live credentials are needed. The first run downloads the
MongoDB binary into the operating system's temporary directory; later runs reuse
it. MongoDB remains an explicit test dependency, never a runtime fallback.

The UI command requires `google-chrome` on PATH. It runs an isolated Vite server
with environment-file loading disabled and a unique Chrome profile. It tests
account-recovery wording, gateway failure recovery, direct URL denial and an
authorized registry reload. The non-UI command explicitly skips the browser group.
The test process exits nonzero on failure, including fixture or cleanup failures.

Stage 3 adds the isolated primary asset journey suite:

```bash
npm run test:asset-journey
```

It covers blank/template/clone registration, edit and reload, real CSV upload,
validation and partial retries, import undo, QR binding, lifecycle and financial
consistency, scope switches and delayed responses, denied edits, keyboard focus,
registry pagination and mobile layouts. It uses the same disposable API/MongoDB
approach, an isolated Vite instance and a unique Chrome profile. Screenshots are
written to `Testing/evidence/stage3-*.png`.

Stage 4 adds the isolated cross-module suite:

```bash
npm run test:cross-module
```

It covers tracking intake/presence and scope, PM/inspection/predictive work-order
journeys, workforce, transfer/reservation/custody consistency, compliance/audits,
report counts/CSV export, approval workflows, scoped notifications and loopback
webhook outcomes. Browser checks exercise the PM form and representative module
routes. It uses disposable services and never loads the running estate's `.env`.

Run browser suites after the build has finished, with no concurrent source or
shared-output changes: Vite hot reload can otherwise replace provider contexts
while a test is in flight. These isolated commands are separate from the legacy
live-database runners described below.

Stage-by-stage scope, findings and validation are recorded in
[STAGED-STABILIZATION.md](STAGED-STABILIZATION.md).

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

## Stage 5 — security and deployment

Run `npm run test:security` for the isolated API/MongoDB/Chrome suite, including
compiled production startup and failed startup. It overrides application
credentials and database settings and never uses the running estate. Run builds
before browser suites; rebuilding shared output during Vite tests triggers HMR.
The deployment template and hosted verification steps are in
[deployment/README.md](../deployment/README.md). Production TLS/proxy acceptance
requires the actual host and certificates; local cookie-header tests do not
substitute for that check.

## Stage 6 — final isolated regression

Run `npm run test:final` to build the application and execute the Stage 2 access
and failure suite, primary asset/browser journey, cross-module suite and security
deployment suite sequentially. The final verified run contains 103 passing tests.
It creates disposable MongoDB/API/Vite/Chrome processes and does not use the live
application estate. Current evidence and external acceptance limits are recorded
in [STAGED-STABILIZATION.md](STAGED-STABILIZATION.md#stage-6-full-regression-and-final-review).

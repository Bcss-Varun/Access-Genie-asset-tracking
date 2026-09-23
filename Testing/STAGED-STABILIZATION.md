# Staged application stabilization

Review date: 2026-09-21.

Execution rule: complete one stage, report its results, and ask the user before starting the next. Stage 1 is discovery and baseline validation; application fixes begin in Stage 2. This document tracks remaining work, not a declaration that the product is stable.

| Stage | Scope | Completion evidence | Status |
| --- | --- | --- | --- |
| 1 | Architecture, modules, intended journeys, test readiness and baseline | Source map, executed baseline checks, prioritized findings | Complete |
| 2 | Critical access-control and failure-handling fixes; reliable test setup | Scoped-user/action-permission regressions, error-response tests, explicit database behavior, passing lint/build | Complete |
| 3 | UI/UX and asset journey: login, dashboard, registry, registration, templates, tags, import, detail/edit, lifecycle and financials | Browser journeys, validation and recovery, persistence after reload, responsive/accessibility checks | Complete |
| 4 | Remaining modules and cross-module data integrity | Tracking, intelligence, maintenance, work orders, inspections, workforce, compliance, reporting, admin and notification flow tests | Complete |
| 5 | Complete authentication, configuration and deployment review | Session/MFA/expiry/logout, permission matrix, CORS/cookies/ports, environment checks, runtime and deployment evidence | Complete |
| 6 | Full regression and final report | Fresh end-to-end evidence, resolved issue ledger, explicit external verification limits | Complete |

Stages 3–5 include root-cause fixes and relevant regression tests as problems are found. Stage 2 brings forward access and failure-handling issues already visible in discovery; the full security review still belongs to Stage 5. This was the stop point at the end of Stage 1; Stage 2 was subsequently authorized by the user.

## Stage 1: architecture and baseline

### Actual implementation

The project is an npm workspace with React 19/Vite on the frontend, Express 5/Mongoose on the backend, and shared TypeScript contracts. Despite the Next.js instruction in `AGENTS.md`, the package manifests do not use Next.js and `node_modules/next/dist/docs/` is absent. No application code was written during this stage.

Source counts measured in this working tree:

| Area | Count |
| --- | ---: |
| Frontend page files | 103 |
| Lazy route entries in `page-routes.ts` | 96, all unique |
| Frontend API modules | 35 |
| Backend route files | 18 |
| Backend controllers | 35 |
| Backend services | 54 |
| Backend model files (not collection count) | 45 |
| Backend validator files | 30 |
| Shared source modules | 17 |
| Permission module keys | 11 |

The route count excludes separately registered public pages, dashboard, QR resolution, redirects and fallback routes. It is not a count of verified working screens.

### Request and data flow

1. `frontend/src/main.tsx` mounts the query/auth/theme providers and React Router.
2. `frontend/src/app/router.tsx` registers public login/MFA/recovery routes and the authenticated subtree. `RequireAuth` restores the session before rendering.
3. `RequireDataset` loads `/dataset` and hydrates shared frontend module bindings. Tracking and label screens have additional workspace gates. Some modules use their own React Query reads.
4. `frontend/src/api/client.ts` configures Axios, an in-memory access token, credentialed requests and refresh-on-401. Mutations generally invalidate the dataset and sometimes module-specific/tracking queries.
5. Vite proxies `/api` and `/health` to the backend in development and preview. The default frontend/backend ports are 5173/4000; the default API prefix is `/api/v1`.
6. `backend/src/app.ts` applies request IDs, security headers, CORS, body parsing, cookies, compression, rate limiting and the route tree.
7. Auth routes precede the shared bearer-token guard. Authenticated requests receive a resolved visible scope. Individual routes/controllers/services must enforce module/action permissions and apply that scope to their queries.
8. Controllers validate requests and call services; services use Mongoose models. Response helpers serialize business IDs and response envelopes.
9. Asset writes also update related tracking/custody/activity records. Lifecycle, work-order and approval services implement state transitions; background schedulers derive health/risk/compliance and notifications.

### Module map and relationships

| Area | Representative frontend routes | Backend/data relationships |
| --- | --- | --- |
| Workspace | `/`, `/notifications`, `/copilot` | Dashboard/dataset services aggregate scoped assets, work, alerts and insights; inbox belongs to the signed-in user |
| Registry and registration | `/assets`, `/assets/new`, `/assets/:id`, `/assets/:id/edit`, `/assets/import` | Asset routes, registration service, asset service, numbering, embedded onboarding, documents and asset graph projections |
| Templates, taxonomy and labels | `/assets/templates`, `/taxonomy`, `/groups`, `/kits`, `/assets/labels`, `/a/:code` | Templates/classes/groups, label templates/printers/jobs, identity/tag binding and QR asset resolution |
| Lifecycle and finance | `/lifecycle`, `/financials`, `/depreciation`, `/custody` | Asset stages, transition history/approval, depreciation, purchase/book values and custody |
| Tracking | `/tracking`, inventory/journey/geofences/alerts/infrastructure, twin by facility | Facilities/zones, presence, devices, sensors, gateways, observations, geofences, inventory and movement trails |
| Intelligence | `/ai-insights`, `/ai/*` | Insights, models, anomalies, forecasts, health/risk derivation and recomputation |
| Maintenance | `/maintenance/dashboard`, `/work-orders`, `/maintenance/:id`, `/predictive`, `/pm`, `/inspections` | Work orders, technicians, preventive schedules, predictive alerts, inspections, activity and linked assets |
| Workforce and operations | `/my-work`, `/workforce`, `/scheduling`, `/asset-movement`, `/approvals`, `/cycle-counts` | Assignment, fieldwork, transfers/reservations, custody, approval chains and reconciliation |
| Compliance | `/audit`, `/audit/:id`, `/audit-log`, `/certifications`, `/compliance-reports` | Compliance records, audits/findings/evidence, certifications, sweep jobs and audit history |
| Analytics/reporting | `/analytics`, `/reports`, `/reports/builder`, `/reports/schedules` | Scoped report queries, saved definitions, exports, subscriptions and scheduled execution |
| Administration | `/admin/*` | Users, role/action grants, scope hierarchy, numbering, notification rules, workflows, integration/webhook/API-key configuration, organization and data settings |
| Settings and support | `/settings/*`, `/help`, `/support`, `/whats-new` | Preferences, profile/security/session APIs, support tickets and help collections |

### Journeys to validate in later stages

- Sign in → dashboard → choose scope → registry → add from blank/template/clone → bind tag → save → view → edit → reload → verify labels/tracking/custody and totals → logout.
- Import file → map columns → validate duplicates/invalid rows → partial/full commit → reopen imported records → undo where permitted.
- Asset → lifecycle transition → required approval → financial/depreciation view → history and reporting consistency.
- Predictive alert or PM schedule → work order → technician assignment → My Work → labor/checklist/inspection → completion → asset health/history.
- Movement request → multi-step approval → destination/custodian change → tracking and custody → reconciliation.
- Compliance record → audit → finding/evidence → resolution → compliance report and audit log.
- Select authorized scope → analytics → report builder → saved report/export/schedule → compare with source records in the same scope.
- Administrator creates user/grants → restricted user signs in → permitted journeys → direct URL/API denial checks → role change/suspension → existing session behavior.
- Empty estate, missing/duplicate data, network/backend failures, expired sessions, browser reload/back/forward, small viewport and keyboard use across these journeys.

These are coverage targets inferred from source, not executed end-to-end results.

### Checks actually executed

| Check | Result | Limit |
| --- | --- | --- |
| Node/npm | Node 20.19.6; npm 11.17.0 | Current workstation only |
| `npm run build` | PASS; shared/backend compilation and frontend typecheck/Vite bundle complete | Does not prove functional behavior |
| `npm run lint` | FAIL: 6 errors, 41 warnings | Pre-existing baseline, no fixes applied |
| `GET http://127.0.0.1:4000/health` | 200, `database: connected`, development | Does not prove which database is connected or durable persistence |
| `GET http://127.0.0.1:5173/login` | 200 HTML | Not a browser rendering or login test |
| `GET http://127.0.0.1:5173/health` | 200, connected | Confirms current local Vite proxy reaches API |
| `GET /api/v1/assets` without bearer token | 401, `UNAUTHORIZED` | One endpoint/auth failure mode |
| Same request with invalid token | 401, `UNAUTHORIZED` | Does not validate role/scope enforcement |
| Error normalization: standard API failure | Returned `ApiRequestError` | Isolated execution of current client code |
| Error normalization: proxy HTML or unexpected JSON | Both threw `TypeError: Cannot read properties of undefined (reading 'details')` | Reproduced without network or database writes |

Raw build and lint logs from this stage are at `/tmp/access-genie-stage1-build.log` and `/tmp/access-genie-stage1-lint.log`; these are temporary local artifacts.

Lint errors occur in `backend/src/config/db.ts` (explicit `any`), `asset.service.ts` and `workOrder.service.ts` (unused `nextId` imports), `complianceSweep.service.ts` (unused argument), and frontend audit/compliance-report pages (unused `setSort`). Warnings include Fast Refresh exports and hook dependencies; they need classification rather than blanket suppression.

### Prioritized issue ledger

Evidence labels distinguish source findings from runtime reproduction. Severity is provisional until the targeted regression verifies reachability and impact.

| ID | Priority | Finding and evidence | Next work |
| --- | --- | --- | --- |
| S1-01 | High | **Lifecycle scope is not propagated.** `controllers/lifecycle.controller.ts` never passes `req.scope`; `getLifecycleBoard()` aggregates all assets, `listTransitions()` filters only by asset ID, and `requestStageChange()` looks up an asset directly by ID. Code-path finding; no cross-scope request executed. | Stage 2: scoped board/KPI/history/read/write/approval tests and enforce scope throughout |
| S1-02 | High | **Clone source bypasses scoped asset lookup.** `registration.controller.ts:cloneSource` calls `clonePrefill(id)` without scope; the service reads `Asset.findById`. Code-path finding. | Stage 2: require visible asset before returning clone fields; test foreign and nonexistent IDs |
| S1-03 | High | **Registration omits the create-action gate.** `POST /assets` requires `requirePermission('assets', 'create')`, but `POST /assets/registration` has only the enclosing assets-module gate; its controller calls the same creation service without an action check. Code-path finding. | Stage 2: deny both entry points consistently for read-only action grants |
| S1-04 | High | **Database failure can switch the estate to temporary demo data.** `config/db.ts` automatically starts `MongoMemoryServer` and invokes `seedDemo` after non-production connection attempts fail. README instead describes one durable database and opt-in demo data. Source confirmed; fallback not triggered by this review. | Stage 2: make test/demo operation explicit and verify failure/restart behavior; do not silently substitute an estate |
| S1-05 | Medium | **Error normalization crashes on gateway bodies.** `api/client.ts:toApiError` accesses `payload.error.details` before validating the response envelope. Isolated reproduction failed for HTML and unexpected JSON. | Stage 2: validate shape first and test proxy/timeouts/malformed envelopes |
| S1-06 | Medium | **Password recovery falsely claims delivery.** Forgot-password page uses a 700ms timer and local state, makes no request, then promises a reset link with a 30-minute expiry. Source confirmed. | Stage 2: remove false success; Stage 5: verify an honest supported recovery path and any real transport requirement |
| S1-07 | Medium | **Frontend module guard is unused.** `RequireModule` is defined but has no callers in frontend source; router wraps general pages in authentication/data guards only. Source confirmed; actual per-page behavior still needs browser checks. | Stage 2/3: align direct URL behavior with grants while retaining backend enforcement |
| S1-08 | Medium | **Lint baseline fails.** Six errors and 41 warnings reproduced. | Stage 2: resolve errors, investigate hook warnings, document any remaining nonblocking warnings |
| S1-09 | Investigate | **Tracking includes synthetic projections.** `assetGraph.service.ts` generates positions from asset-ID hashes, uses fixed confidence values and updates `lastSeen` during projection. Source confirmed; how clearly UI distinguishes inferred from observed data is unverified. | Stage 4: trace real observation precedence and user-facing provenance before deciding a correction |
| S1-10 | Investigate | **Shared dataset state needs concurrency/session review.** Dataset hydration mutates module bindings; active scope is stored globally and in localStorage while query keys vary by scope. Not a reproduced bug. | Stage 3/5: rapid scope switches, stale responses, logout/login as another user and refresh behavior |
| S1-11 | Integration gap | **Email delivery transport is incomplete.** Notification delivery service explicitly describes an email provider stub; merely setting an SMTP variable is not proof of delivery. | Stage 4/5: inspect consumers, avoid false delivery claims, record actual provider requirements |

### Test readiness and limits

- Existing servers were already listening on 4000/5173. This stage did not start, stop or restart them.
- Backend and frontend `.env` files exist; only variable names were inventoried, not secret values. Local health does not establish whether the intended configured database or fallback is in use.
- Chrome is available at `/usr/bin/google-chrome`; browser harnesses use CDP. No standalone `mongod` executable was found on PATH. Availability of a cached memory-server binary was not checked.
- The current `npm test` invokes isolation, analytics and admin integration runners. These connect to a running API, provision records and depend on an existing facility/building hierarchy. They are not a self-contained unit-test suite.
- Additional API, registration, predictive and UI runners exist but are not all included in `npm test`. Some use defaults for credentials and a live database; audit teardown and use an explicitly isolated estate before broad execution.
- Historical result files date from August 7–19, 2026. Their recorded failures include `AM-NEG-001`, `AM-PERF-010` and `AM-A11Y-008`. These are historical findings, neither confirmed fixed nor reproduced in Stage 1.
- No tracked Vercel, Render, Docker or GitHub workflow configuration was found by the filename inventory. Hosted configuration and production behavior remain unverified; absence of those files does not prove there is no deployment.
- No authenticated CRUD, durable persistence, migrations/index synchronization, role switching, full browser flow, production traffic or external delivery was exercised in Stage 1.
- The sandbox repeatedly failed to initialize its loopback interface. Approved shell execution outside that sandbox was used for the scoped inspection and baseline commands.

### Changes made and stop point

Only this review document was added. Application source/configuration and databases were not intentionally changed by the review; the production build regenerated ignored build outputs and the API smoke requests may affect routine request counters/logging. The pre-existing untracked `docs/27-platform-reference.md` was read and left unchanged.

Stage 1 is complete as discovery and baseline validation. The overall stabilization request remains incomplete. Next action, only after the user's go-ahead: Stage 2, critical access-control and failure-handling fixes with targeted regressions.


## Stage 2: access control, failure handling and isolated tests

Authorized by the user after the Stage 1 stop point. Changes below apply to the working tree; no deployment was performed.

### Fixes applied

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| S1-01 | Lifecycle controllers now pass the required visible scope into services. Board/KPI aggregates filter assets and asset-linked PM/approval records. History, individual transitions, bulk actions and approval decisions verify asset visibility before returning data or changing records. | HTTP tests use two facilities, a descendant building, an empty scope and a platform administrator with an explicit selection. Denied writes are checked directly in MongoDB. |
| S1-02 | Clone-source queries filter by scope. Submitting a clone registration directly also checks access to the source asset. | Foreign and missing clone/history IDs return matching 404 errors; a forged clone submission inserts no asset. |
| S1-03 | Registration uses the same create-action gate as the ordinary asset endpoint. Lifecycle requests/bulk changes require edit; decisions require approve in addition to the existing stage-specific role and requester rules. | Read-only overrides deny both creation paths and lifecycle mutations. Allowed registration, assignment and approval persist and can be re-read. |
| Permission compatibility | Action checks now include per-user module grants, while retaining role action overrides. The executive role retains its documented disposal-approval default when explicitly granted Assets; no Assets module is added to its default module list. | A user with an extra Assets grant can register; another user with the same role and no extra grant is denied. Finance can approve disposal through either a role or per-user Assets grant, cannot edit or approve retirement, and explicit action restrictions still win. |
| S1-04 | Removed automatic in-memory/demo fallback from application startup. Retries target only the configured database and respect its configured timeout. The isolated test runner owns its temporary MongoDB explicitly. | Records survive disconnect/reconnect to the same database. A separate child process pointed at an unavailable local port fails instead of connecting to or seeding a replacement estate. |
| S1-05 | Error conversion validates unknown response shapes before reading nested fields; malformed validation details are ignored safely. Refresh requests now have the configured request timeout. | Unit-level checks cover HTML, malformed JSON, missing responses, timeouts, field errors and request IDs. A real Chrome login receives injected gateway HTML, shows a recoverable message and records no JavaScript exception. The refresh-timeout configuration itself was code-reviewed, not separately delay-tested. |
| S1-06 | Replaced the simulated password-reset submission and false delivery claim with an account-recovery page directing users to their organization administrator. An administrator password-reset endpoint already exists. | Chrome verifies the supported recovery wording and absence of a fake send form. No email transport was added or claimed to work. |
| S1-07 | Mounted a route-access guard around the shell outlet, preserving navigation when access is denied. Policies cover protected route families and shared workflows, including case-insensitive/encoded paths; settings, notifications and approvals remain session-only. | Chrome verifies asset/admin/tracking URL denial, upper-case/encoded asset URLs, personal profile access and permitted registry reopening after full reload. Policy tests also cover shared workflows and system API-key access. |
| S1-08 | Resolved six lint errors and the tracking-alert hook dependency warning. The remaining warnings are Fast Refresh export organization warnings. | Final lint command and production build are recorded below. |

### Repeatable validation

`Testing/harness/stabilization-tests.mjs` starts a new loopback MongoDB, creates explicit scope/user/asset fixtures, and binds an API to a random port. It overrides connection credentials, does not load the application's environment files, does not start application schedulers, and never targets the already-running API. It checks actual HTTP responses and re-reads MongoDB after writes and denials.

The browser variant additionally starts an isolated Vite server with environment-file loading disabled and a unique Chrome profile. The existing CDP helper now accepts a profile directory, waits for Chrome shutdown and avoids leaving request timeout timers holding the process open. Temporary services and browser profiles are cleaned up.

Commands:

```bash
npm run test:stabilization
npm run test:stabilization:ui
npm run build
npm run lint
```

The browser command includes the API/database/error/policy tests; a separate successful non-browser run is not needed to count that same coverage again. The first MongoDB run needs network access to download its binary into the operating system temporary directory. Chrome must be available on PATH for UI checks.

Final validation:

| Check | Result |
| --- | --- |
| `npm run test:stabilization:ui` | PASS: 25 reported tests, 0 failed, 0 skipped (20 core tests, four browser subtests and their enclosing browser test) |
| `npm run build` | PASS: shared/backend TypeScript compilation, frontend typecheck and production Vite bundle |
| `npm run lint` | PASS: 0 errors; 40 nonblocking `react-refresh/only-export-components` warnings |
| `git diff --check` | PASS |
| Test cleanup | Final browser profile removed; no isolated MongoDB/Chrome listening sockets left |

Passing test output is saved in [results/stage2-results.tap](results/stage2-results.tap).
Build and lint logs for this run are in `/tmp/access-genie-stage2-build.log` and
`/tmp/access-genie-stage2-lint.log`.

Intermediate runs exposed a missing required timestamp in the test fixture and a Chrome-profile cleanup race. Both were corrected; they were harness failures, not reported as application regressions.

### Boundaries and follow-up

- S1-09 (tracking provenance), S1-10 (dataset concurrency/session state) and S1-11 (notification delivery) remain assigned to their planned stages. Full module, role and deployment validation has not been performed.
- The existing lifecycle notification helpers broadcast some event text or target users by role without carrying the asset scope. Notification visibility and delivery need explicit scope tests in Stages 4–5; the repaired lifecycle endpoints do not establish notification isolation.
- The route guard is a user-facing access check; backend checks remain authoritative. Existing fine-grained permission coverage on other endpoints, and whether every screen hides unavailable actions consistently, remain for Stages 3–5.
- Email self-service password recovery remains unavailable. The page now states that limitation accurately. The full administrator recovery flow is still part of the later authentication review.
- Removing the database fallback means local startup will now fail if the configured database is unavailable. The application cannot silently replace it with demo data. Existing MongoDB configuration and credentials were not changed; no migrations, seeding or test mutations were run against the existing estate.
- The full legacy live-database suites were not run against the user's estate. Stage 2 evidence comes from the disposable database. Production persistence, hosted CORS/cookies and external integrations remain unverified.
- No Stage 3 journey review or broad redesign has been started. The pre-existing untracked `docs/27-platform-reference.md` remains unchanged.


### Stage 2 stop point

Stage 2 is complete. Stage 3 has not started. Next, only after the user's go-ahead:
UI/UX and the full primary asset journey, including forms, validation, templates,
tagging, import, detail/edit/reload, lifecycle/financial views, responsive behavior
and error recovery. The overall stabilization effort remains in progress across
the later stages.


## Stage 3: primary asset journey and UI recovery

Authorized by the user with “start stage 3”; resumed after a temporary tool-usage
limit. The work remains local and uncommitted. No deployment, migration or test
write was performed against the existing application estate.

### Corrections

| Area | Change | Evidence |
| --- | --- | --- |
| Session reload | Bootstrap and interceptor refresh calls share one in-flight request, avoiding competing refresh-cookie rotations under React Strict Mode. | Repeated full-page navigations, reloads, user switching and logout in Chrome. Full session/security testing remains Stage 5. |
| Registration | Lock submission before validation begins; ignore superseded validation responses; allow retry after validation failure; show defaults/form loading errors; key forms by source; recover invalid source links to the picker. | Blank registration double-click creates one document; missing fields block; injected validation failures insert nothing and retry succeeds; template and clone records survive reload. |
| Template flows | Prevent duplicate template saves; invalidate template/form queries after edits; expose retry controls for catalogue, template list and clone-list failures. | Browser-created template is used for registration, usage increments, category and provenance persist. Catalogue/list/defaults fault injection and retry pass. |
| Asset editing | Include a pending tag draft in the submitted body; support clearing manufacturer/model and warranty; validate name/serial length; choose a real location ID; preserve location details when the site is unchanged; lock repeated saves. | Keyboard form submission persists the tag and price; reload shows saved data; cleared manufacturer/warranty stay cleared. Read-only API denial preserves the draft and database value. |
| Financial consistency | Synchronize purchase facts between the asset and embedded commercial record; calculate detail book value using shared depreciation inputs; remove conflicting dollar captions. Stop inventing vendor/department and class financial terms for legacy assets. | MongoDB re-reads verify price synchronization and warranty removal; detail book value matches elapsed depreciation within display rounding; the portfolio total matches the fixture estate. |
| Registry persistence | Compute writes outside React state updater callbacks, serialize writes per asset, send changed top-level fields, and return a saved/failed result to callers. | Label mutation failure shows an error and opens no print dialog; retry persists exactly one binding before printing. |
| QR labels | Save the binding before opening print; leave it Bound until verification; do not claim paper output or a received hardware scan; exclude passive QR labels from online sensor/device projection; hide app chrome in print. Unsupported barcode/RFID output is visibly unavailable instead of producing illustrative codes as usable labels. | Chrome fault injection, MongoDB binding checks, reload, scan landing route and print-media screenshot. Physical scanner/print hardware was not exercised. |
| CSV import | Replace sample substitution with a file input and drag/drop handler, strict UTF-8/CSV parsing, size/row/column limits, explicit site mapping, category/status/price/serial validation, durable per-row results and failed-row retry. Preserve mapped status; serial is optional. Block navigation during submission. | Real file upload tests cover quoted commas/newlines, malformed quoting, invalid rows, partial API failure, retry without repeating successful writes, no-serial import and confirmed undo. |
| Lifecycle | Keep entered reason after failure; serialize submissions; report per-asset bulk results and retain failed IDs for retry. | Failed single-stage save and retry; pending retirement leaves stage unchanged until a different authorized user approves; history/detail reflect retirement. Bulk API permissions retain Stage 2 coverage; bulk dialog recovery is source-reviewed. |
| Scope and navigation | Capture scope and generation in each query; cancel obsolete requests and reject stale hydration; fetch the exact new selection; reset stored scope on login/logout. Detail tabs use router search parameters and browser history. | A→B→A, empty scope, cross-user login and an injected late B response all preserve A’s rows. Browser Back restores the prior detail tab. |
| Responsive/accessibility | Keep mobile header actions in view; reduce shell padding at narrow widths; constrain main layout; trap keyboard focus in form dialogs. | Desktop 1440×900 and mobile 390×844 captures; main pages have no document overflow, account menu stays visible, Tab stays inside the lifecycle dialog and Escape closes it. Registry search, pagination, sorting and page selection pass. |

### Evidence and limits

The repeatable command is `npm run test:asset-journey`. It creates its own
MongoDB, API, Vite server and browser profile, disables application environment
loading and cleans up those temporary services. Direct database reads verify
what was saved; UI success text alone is not treated as persistence evidence.

- Stage 3 journey suite: **21 passed, 0 failed, 0 skipped**; no uncaught browser exceptions.
- Stage 2 security/error/browser regression rerun: **25 reported tests passed, 0 failed, 0 skipped** (including the parent browser test).
- `npm run build`: **PASS**, shared/backend compilation plus frontend typecheck and production bundle.
- `npm run lint`: **PASS**, 0 errors and the same 40 nonblocking Fast Refresh export warnings.
- `git diff --check`: **PASS**.
- The final bulk-dialog callback ordering adjustment was typechecked and source-reviewed; the 21 journey tests do not exercise the bulk dialog.

Passing output is saved in [stage3-results.tap](results/stage3-results.tap) and
[stage3-stage2-regression.tap](results/stage3-stage2-regression.tap). Build and lint
logs are `/tmp/access-genie-stage3-build.log` and `/tmp/access-genie-stage3-lint.log`.
The final test runs stopped their disposable MongoDB/API/Vite/Chrome instances
and removed their own browser profiles.
- Screenshots: [asset detail](evidence/stage3-asset-desktop.png),
  [mobile detail](evidence/stage3-mobile-detail.png),
  [mobile registry](evidence/stage3-mobile-registry.png),
  [mobile registration](evidence/stage3-mobile-registration.png),
  [mobile import](evidence/stage3-mobile-import.png),
  [print media](evidence/stage3-label-print.png).

Early harness failures included hook ordering, selectors that matched sidebar
links, an escaped browser expression, an incorrect pending-transition HTTP
status expectation, and a book-value assertion that ignored elapsed
depreciation. These were corrected. A Stage 2 browser attempt run concurrently
with the production build observed a Vite hot-reload/provider-context error;
its result is not counted as passing. The final rerun uses a stable source tree.

This is bounded Stage 3 coverage, not a declaration that the entire product is
stable. Remaining modules and tracking/notification provenance stay in Stage 4;
the complete session/action-permission/configuration matrix stays in Stage 5.
In particular, read-only asset actions can still be visible before the API
rejects the write; denial and draft recovery were tested, hiding every such
control was not implemented in this stage. Whole-module query/session isolation
outside the core dataset also remains to be checked in the later stages.

Physical printer output, QR decoding by a real scanner, RFID/barcode hardware,
production deployment and multi-browser concurrent editing were not verified.
CSV retry tracks confirmed successes within the current import screen; it is
not a server-side idempotency guarantee for a response lost after a successful
write. No legacy-data migration is included. The pre-existing untracked
`docs/27-platform-reference.md` was left unchanged.


### Stage 3 stop point

Stage 3 is complete within the primary asset-journey scope and verification
limits above. Stage 4 has not started. Await the user's go-ahead before reviewing
the remaining modules and their cross-module data integrity. The overall
stabilization effort remains in progress.

## Stage 4: remaining modules and cross-module integrity

Authorized with “okay, start stage 4” and continued on request. Work was performed
on 2026-09-22 against disposable local services. Existing application servers,
credentials and estate data were not used for test writes; nothing was deployed.

### Corrections and evidence

| Area | Correction | Verification |
| --- | --- | --- |
| Observations and tracking | Enforce asset/facility scope on direct and tag intake, preflight batches, reject mismatched asset/tag pairs and far-future timestamps. Serialize observations per asset and condition the latest-presence write in MongoDB. Old readings cannot rewind presence; coordinate-free observations clear an obsolete point. | Foreign, mixed-batch, concurrent/out-of-order and future-reading tests; direct MongoDB reads. |
| Registry → tracking | Registry edits update descriptive/custody metadata without manufacturing a sighting, map coordinate, firmware or healthy radio. Bound hardware must already be provisioned. The live map uses observed coordinates. | Registration without observation has no presence/device; asset edits preserve observation time/position; map coordinates match observations. |
| Tracking workspace | Scope presence, journeys, devices, alerts, events, inventory and counts. Preflight tracking mutations and batch actions. Shared automation/firmware and legacy gateway/geofence configuration require full estate scope. Fix tracking action audit IDs. | Foreign device/alert/movement refusal; empty selection; alert count and acknowledgement persistence; provisioning audit row. |
| Tracking client | Key workspace reads by scope generation, cancel obsolete requests and prevent obsolete responses from hydrating shared state. | Typecheck/source review and scoped workspace/browser reads. The Stage 3 delayed-response browser test still covers the reference dataset; a separate delayed tracking-response test is not claimed. |
| Preventive maintenance | Scope schedule writes and manual automation. Preserve due dates while earlier work remains open; do not invent `lastDone`. Remove synthetic completion history and unverified compliance percentages. Replace the toast-only detail action with the real prefilled work-order form. | Automation repeat produces no duplicate; foreign schedule untouched; browser creation persists across reload; history comes from completed work orders. |
| Inspections and predictive alerts | Preflight every asset-specific read/action and create/bulk input; scope template asset pickers and facet counts. Predictive manual provenance is preserved. | Inspection start → required-answer rejection → failed finding → one corrective order → completion/labor; predictive acknowledgement and repeated order creation reuse one order. Foreign actions fail. |
| Workforce | Scope field queues/scans, exclude cancelled/completed work and scope technician roster mutations/reads. Narrow inspection/work-order assignee facets. | Foreign queue/scan and roster probes; completed repair disappears from field queue; technician update persists. |
| Transfers, reservations and custody | Scope reads/writes; require an unambiguous authorized hierarchy destination. Receipt uses the shared asset-update path so location ID/name, custodian and history agree. Custody actions update observed custody metadata without changing observation time. | Self-approval blocked; authorized transfer progresses through receipt/completion; registry/custody re-read; overlap rejection/cancellation; foreign identifier probes. |
| Intelligence and analytics | Recompute only the selected asset set, preserve foreign metrics/findings and avoid writing a global daily snapshot from a subset. Analytics organization/executive roles retain their home scope; missing home scope no longer widens to root. | Explain/recompute boundary checks; report preview and saved run equal scoped registry counts; CSV content and foreign-facility refusal. |
| AI interface claims | Utilization recommendations link to transfer review. Feedback storage/retraining is explicitly unavailable; fabricated review totals, shipped-model counts and submission success are removed. Local anomaly hiding is labeled as session-only. | Browser feedback wording and route checks; no external model training is claimed. |
| Compliance and administration | Exercise existing scoped compliance/audit services and configured transfer approval workflow. | Resolve finding; audit evidence and finding closure; foreign refusal; workflow blocks direct approval and releases transfer after an authorized decision. |
| Notifications | Deliver asset/lifecycle and rule notifications only to eligible users in the asset scope, with independent inbox rows. Estate-wide summary counts are platform-only. Keep delivery errors visible; clarify unavailable email transport. | Scoped lifecycle inboxes; isolated loopback webhook 204 vs 503 stored as sent vs failed; absent email transport recorded as skipped. |

### Verification

The repeatable command is `npm run test:cross-module`. It creates its own
MongoDB/API/Vite/Chrome, overrides connection and credential settings, disables
application environment loading, and cleans up its services/profile. Webhook
tests contact only temporary loopback receivers. Assertions verify saved records,
not just success toasts. Browser builds and test execution are kept sequential.

Final results are recorded in:

- [Stage 4 suite](results/stage4-results.tap): **31 passed, 0 failed, 0 skipped**, including API/database journeys, notification delivery and browser checks; no uncaught browser exceptions.
- [Stage 3 regression](results/stage4-stage3-regression.tap): **21 passed, 0 failed, 0 skipped**; no uncaught browser exceptions.
- [Stage 2 regression](results/stage4-stage2-regression.tap): **25 reported tests passed, 0 failed, 0 skipped**, including the parent browser test.
- Build: **PASS**, shared/backend/frontend compilation and production bundle; `/tmp/access-genie-stage4-build.log`.
- Lint: **PASS**, 0 errors and the existing 40 Fast Refresh export warnings; `/tmp/access-genie-stage4-lint.log`.
- `git diff --check`: **PASS**.
- Browser captures: [work orders](evidence/stage4-work-orders.png), [feedback availability](evidence/stage4-feedback.png).

### Remaining boundaries

This stage validates representative complete workflows across the remaining
modules; it is not an exhaustive action/role matrix or a hardware acceptance test.

- Full session/MFA/action permissions, shared administration/configuration,
  hosted cookies/CORS and deployment checks remain Stage 5. Full application
  regression and the final issue ledger remain Stage 6.
- No physical radio, scanner, firmware rollout, printer, external email transport,
  production webhook or ML training service was exercised. Unsupported feedback
  and email remain visibly unavailable rather than reported as successful.
- Tracking records keyed only by facility name require an unambiguous hierarchy
  match. Facility-wide infrastructure is not inferred to belong to a narrower
  building selection. Legacy shared map/gateway/geofence configuration still
  lacks per-facility ownership fields and needs the Stage 5 configuration review.
- Existing historical synthetic positions, timestamps, broadcast notifications
  and PM compliance values were not migrated or deleted. New registry writes no
  longer manufacture that evidence. A separately reviewed migration is needed
  before old records can be treated as verified observations/history.
- Transfer receipt/custody, inspection corrective work and reservation overlap
  remain multi-document workflows. This stage tests ordinary repeat/retry and
  selected concurrent observations, not crash recovery or multi-process races
  across every workflow. Load, large-estate pagination and distributed concurrency
  are not certified by these local fixtures.
- PM history associates existing orders through their recorded schedule reference;
  it does not implement a new occurrence ledger or calculate contractual adherence.
- SMTP credentials alone do not install an email transport. Retraining and
  hardware commands need real integrations before operational acceptance.

### Stage 4 stop point

Stage 4 is complete within the coverage and limits above. Stage 5 has not started and requires the user's next go-ahead. Changes remain local and uncommitted; the pre-existing `docs/27-platform-reference.md` was not changed.

## Stage 5: authentication, authorization, configuration and deployment

Authorized with “continue, start stage 5”. Work performed on 2026-09-22 using
isolated MongoDB, API, Vite and Chrome processes. Existing servers, credentials
and estate data were not used for test mutations. No deployment was performed.

### Corrections

| Area | Finding and correction | Evidence |
| --- | --- | --- |
| Session revocation | Logout previously left an issued JWT usable. Access tokens now bind to a live, owned session document; logout, password changes, suspension and device revocation invalidate access immediately. Rotation atomically consumes the current refresh hash while preserving the session ID. | Logout/access/refresh replay, six concurrent refreshes, stable session IDs, password reset, logout-all, foreign device revocation and suspended accounts. |
| JWT checks | Require the access type, issuer, audience, HS256 signature, expiry and valid owned session ID. Old tokens without a session ID must renew. | Wrong type/owner/signature/issuer/audience, missing session and expired-token probes. |
| MFA | Replace process-local challenges with hashed, expiring MongoDB records. Bound guesses to five; claim a challenge atomically; consume recovery hashes and TOTP steps once. Enrollment uses conditional writes and account security versions invalidate pending challenges after credential/security changes. | Concurrent challenge/recovery redemption, cross-challenge TOTP replay, expiry, attempt ceiling, credential-reset invalidation and absence of secrets in public user responses. |
| Module/action permissions | Module-only guards now also enforce the request action, including view-only overrides and decisions. Scope root-mounted inspection/technician guards to their own paths so unrelated inbox/settings routes remain reachable. Empty view grants remove dataset/navigation access. | Mutation-family denial tests across assets, work orders, inspections, tracking, custody, configuration, users, scopes and insights; live override and minimal-account tests; existing lifecycle regression. |
| Account administration | Scope user lists, reads, password resets, assignments and the dataset directory. Non-platform administrators cannot alter platform users or grant modules/actions beyond their own. Validate home scopes and permission matrices. Protect the last active platform administrator and scopes still assigned to users. | Foreign/platform reset refusal, attempted privilege/scope escalation, malformed permission input, missing scope, direct reads and directory checks. |
| Shared configuration | Legacy platform resources have no tenant ownership. Restrict sensitive shared reads/writes to the platform administrator, including case-insensitive URLs. Global settings/rule changes and global role permissions are platform-only. Approval workflows and approver candidates are scoped; decisions require an action grant as well as existing workflow checks. | Foreign workflow mutation refusal, shared-resource denial, configured transfer workflow regression. |
| Inbox and audit | Inbox reads and read-marking require the recipient's identity. Stop exposing unaddressed legacy broadcasts. New request audit rows carry actor scope; scoped reads exclude foreign and unscoped historical rows. | Foreign notification marking leaves the stored row unread; directory, dataset, audit and workflow scope tests. |
| CORS and environment | Reject unsafe requests from untrusted browser origins before handlers execute. Keep configured credentialed CORS and same-origin requests working. Configure proxy trust explicitly; reject invalid API prefixes, ports, token lifetimes, origins and insecure SameSite=None cookies. Demo account enumeration is off by default and forbidden in production. | Allowed preflight, rejected foreign-origin refresh, unsafe startup configurations and production response headers. |
| Seed credentials | Remove the default administrator password and plaintext password logging. Seeding requires an explicit password; demo seeding is prohibited in production. | Source review and compilation; no live seeder was run. |
| Security UX | Password changes explicitly end all sessions and return the browser to sign-in. Saved device labels no longer claim authenticator registration, credential removal or passkey protection. | Chrome changes a password, returns to sign-in, rejects the old access token, signs in with the new password and reloads settings. |
| Backup truthfulness | Backup creation previously inserted a “Complete” row without creating a backup artifact. It now returns 501 without inserting a row. UI explains provider setup and marks legacy rows unverified. | API status plus collection-count assertion and browser availability wording. |
| Deployment | Add a production runbook and nginx example with TLS, SPA fallback, API forwarding, explicit proxy trust and operator-managed database backups. | Compiled production API startup, readiness, Secure/HttpOnly/Strict cookie headers, CORS, authentication throttling, SIGTERM exit and failed-database startup. |

### Verification

`npm run test:security` builds first, then runs the isolated Stage 5 suite.
Earlier-stage browser regressions run after builds to avoid Vite HMR during tests.
The Stage 3 test now waits for the template usage write to complete, rather than
reading that counter as soon as the preceding asset insert appears. Its former
premature assertion also prevented the clone step and caused a later financial
assertion to fail; both pass with the completion wait.

- [stage5-results.tap](results/stage5-results.tap): **26 passed, 0 failed, 0 skipped**.
- [stage5-stage4-regression.tap](results/stage5-stage4-regression.tap): **31 passed, 0 failed, 0 skipped**.
- [stage5-stage3-regression.tap](results/stage5-stage3-regression.tap): **21 passed, 0 failed, 0 skipped**.
- [stage5-stage2-regression.tap](results/stage5-stage2-regression.tap): **25 passed, 0 failed, 0 skipped**.
- Production build: **PASS**; `/tmp/access-genie-stage5-build.log`.
- Lint: **PASS**, 0 errors and 40 existing Fast Refresh warnings; `/tmp/access-genie-stage5-lint.log`.
- `git diff --check`: **PASS**.

Final verification and report completed on 2026-09-23.

### Deployment and acceptance limits

- [Deployment runbook](../deployment/README.md) and [nginx example](../deployment/nginx.conf.example)
  are reviewable local artifacts. No host, DNS, TLS certificate, proxy installation,
  hosted browser cookie policy or production database was changed or certified.
- Cookie flags are verified against the compiled production API over loopback;
  the browser journeys use the development cookie configuration. Verify the real
  HTTPS hostname and its proxy chain before deployment.
- This is API action-family and representative role/override coverage, plus the
  named browser journeys, not every possible role × button × custom grant
  combination. A visible client control never overrides server authorization;
  remaining exhaustive application regression belongs to Stage 6.
- Scope-less platform records are restricted rather than assigned invented
  tenants. This intentionally narrows legacy organization-admin access to shared
  platform configuration. No legacy data migration was performed. Shared asset
  and inspection catalogs retain their established module/action policies.
- Existing MFA sessions remain active on enrollment; logout-all terminates them.
  Enrollment consumes its TOTP step, so subsequent sign-in needs a fresh code.
  Password reset and account security changes invalidate pending challenges.
- Backup/restore, WebAuthn passkeys, SMTP and hardware/provider operations require
  real infrastructure integrations. No backup artifact, passwordless login,
  external delivery or disaster-recovery success is claimed.
- Atomic refresh/MFA redemption is exercised concurrently. Cross-document account
  administration, crash recovery, high-load behavior and every distributed race
  are not certified by these local tests. Earlier workflow concurrency limits
  remain applicable.
- Changes remain local and uncommitted. The pre-existing
  `docs/27-platform-reference.md` was left unchanged.


### Stage 5 stop point

Stage 5 is complete within the coverage and external verification limits above.
Stage 6 has not started. Ask the user before beginning the full regression and
final issue ledger. Nothing has been deployed or committed.

## Stage 6: full regression and final review

Authorized with “continue stage 6” and completed on 2026-09-23. The final pass
used disposable MongoDB, API, Vite and Chrome processes. It did not use or mutate
the running application estate and nothing was deployed.

### A. Overall review

The completed six-stage review covered the React/Vite navigation and primary
browser journeys, Express APIs, Mongoose persistence and scope rules, module and
action authorization, session/MFA behavior, configuration, CORS/cookies,
production startup, deployment documentation, responsive layouts, failure
recovery and cross-module record consistency. The final pass reran all four
isolated regression families after the last dependency changes.

### B. Issues identified

The initial ledger contained eleven principal findings: lifecycle and clone scope
bypasses; inconsistent create permission enforcement; silent fallback to a demo
database; malformed-response crashes; false password-recovery delivery; missing
client route enforcement; lint failures; synthetic tracking evidence; shared
scope/session races; and absent email delivery. Later stages found inconsistent
asset journeys, invented or toast-only actions, stale-scope races, cross-module
scope leaks, notification fanout errors, session/MFA replay risks, privilege
escalation paths, unsafe origin/configuration behavior, and false backup/passkey
claims. Stage 6 additionally found four dependency advisories and cold-cache
browser-harness timing assumptions.

### C. Fixes applied

The staged corrections now enforce visible scope and action grants at the API,
make route access match those grants, preserve data relationships across assets,
tracking, maintenance, inspections, workforce, movement, compliance and reports,
and replace simulated success with saved behavior or explicit unavailability.
Access tokens are bound to revocable sessions, refresh and MFA redemption are
atomic, user/configuration administration is scoped, unsafe origins and invalid
production settings are refused, and seed credentials are no longer supplied or
logged by default. Dependency patches updated `morgan` 1.11.0→1.12.1, `qs`
6.15.3→6.16.0, `nanoid` 3.3.16→3.3.19 and `js-yaml` 4.3.0→4.3.2; the final npm
audit reports zero known vulnerabilities.

### D. UI/UX findings

Navigation now denies inaccessible direct URLs without destroying the app shell,
legacy links route to their real successor or an honest removed-feature screen,
and failed requests retain entered work where retry is meaningful. The asset
registration/import/template/clone/tag/lifecycle journeys persist through reload,
work-order and PM actions open real forms, AI feedback and backup limitations are
stated plainly, password changes visibly end the session, and device labels no
longer claim WebAuthn protection. Tested desktop/mobile layouts, keyboard submit,
browser history, rapid scope changes and error recovery passed without uncaught
browser exceptions.

### E. Technical findings

The application is a React 19/Vite 6 frontend with an Express 5/Mongoose backend,
not a Next.js application. MongoDB is the authoritative store; an unavailable
configured database now stops startup. Scope and permission checks are resolved
server-side on every request. New tracking writes preserve observation provenance,
analytics use the selected estate, and live workflow assertions re-read MongoDB
instead of trusting response payloads. Production startup was exercised from the
compiled backend with secure cookie/CORS settings, readiness, rate limiting and
graceful SIGTERM. The nginx example and production runbook remain deployment
artifacts rather than proof of a hosted installation.

### F. Testing performed

Fresh final results after all source and lockfile changes:

- [Stage 2 regression](results/stage6-stage2.tap): **25 passed, 0 failed, 0 skipped**.
- [Asset/browser journey](results/stage6-asset-journey.tap): **21 passed, 0 failed, 0 skipped**.
- [Cross-module regression](results/stage6-cross-module.tap): **31 passed, 0 failed, 0 skipped**.
- [Security/deployment regression](results/stage6-security-deployment.tap): **26 passed, 0 failed, 0 skipped**.
- [Production build](results/stage6-build.log): **PASS**.
- [Lint](results/stage6-lint.log): **PASS**, 0 errors and 40 Fast Refresh organization warnings.
- [Dependency audit](results/stage6-audit.log): **PASS**, 0 known vulnerabilities.
- `git diff --check`: **PASS**.

That is **103 passing functional tests** in the final run. The repeatable command
is `npm run test:final`. Browser suites ran sequentially after builds to avoid
hot-reload interference. The first cold run exposed two harness waits that were
shorter than the verified Vite startup envelope; their 30-second shell threshold
now matches the other browser suites, and full reruns passed.

### G. Remaining issues

No reproducible application defect remains from the staged issue ledger within
the tested local scope. The following capabilities remain intentionally and
visibly unavailable because they need real infrastructure: SMTP email delivery,
WebAuthn/passkey authentication, database backup/restore, physical RFID/BLE
hardware and firmware rollout, external ML retraining, and production webhook
acceptance. `purchase_request` approval is still labeled “not wired yet”. The 40
lint warnings concern component/helper export organization for development Fast
Refresh; they do not affect compilation or production runtime, but can be removed
by splitting those exports in a future maintenance pass.

### H. Risk areas and acceptance limits

- Real DNS, certificates, reverse proxy hops, browser cookie policy, production
  secrets, hosted database permissions/indexes, SMTP and external endpoints need
  verification in the target environment before release.
- Historical synthetic positions, broadcast notifications, unscoped audit rows
  and calculated PM values were not migrated. New writes no longer create those
  claims; a reviewed migration is required before treating legacy rows as proof.
- Multi-document workflows were tested for ordinary retries and selected races,
  not process crashes at every write boundary. Large-estate performance,
  distributed concurrency, disaster recovery and load limits require dedicated
  infrastructure testing.
- Coverage is broad and journey-based, including representative role/action
  matrices. It is not a mathematical enumeration of every role × custom grant ×
  endpoint × browser control combination or every one of the 96 lazy routes.
- The legacy live-database runners were deliberately not executed because they
  mutate an existing estate. Their critical coverage is represented by the
  isolated suites above.

### Final status

The staged stabilization work is complete within these stated boundaries. All
changes are local and uncommitted. The pre-existing untracked
`docs/27-platform-reference.md` remains unchanged. No deployment, migration or
write against the user's existing estate was performed.

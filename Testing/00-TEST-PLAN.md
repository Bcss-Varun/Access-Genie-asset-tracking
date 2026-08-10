# Test Plan — Asset Management

**Product:** Access Genie — Enterprise Asset Management
**Module under test:** Asset Management (IT Asset Registry)
**QA owner:** Senior QA Lead
**Cycle:** 1 — first full pass
**Status:** Executed · 99 cases · 97.0% pass

---

## 1. Scope

### 1.1 The module, as built

Asset Management is the module that owns the asset record itself: creating it,
finding it, changing it and retiring it. Everything that hangs *off* an asset —
work orders, tracking presence, custody — belongs to other modules and is out of
scope here except where this module reads or writes it.

**Frontend surfaces**

| Surface | Path | Purpose |
|---|---|---|
| Asset Registry | `/assets` | The list. Search, filter, sort, columns, density, saved views, bulk actions, CSV export |
| Add Asset | `/assets/new` | Registration flow — source picker → form |
| Asset 360 | `/assets/:id` | Full record plus every timeline attached to it |
| Edit Asset | `/assets/:id/edit` | Field-level edit |
| Bulk Import | `/assets/import` | CSV/spreadsheet ingest |
| Label & Tag Printing | `/assets/labels` | Label designer, driven from a registry selection |
| Custody | `/custody/:assetId` | Chain of custody for one asset |

**Components:** `AssetForm`, `AssetActionDialogs`, `BulkActionDialog`,
`ExplainDialog`, `UploadDocumentDialog`, `LabelArtwork`, `AssetPicker`.

**API surface** (`/api/v1/assets`, all behind the `assets` module grant)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/assets` | List: `q`, `status`, `category`, `health`, `criticality`, `trackingTech`, `facility`, `tracked`, pagination, sort |
| `GET` | `/assets/stats` | Registry-wide aggregates |
| `GET` | `/assets/:id` | One asset |
| `GET` | `/assets/:id/profile` | Asset 360 — asset + work orders + activity + insights + custody |
| `POST` | `/assets` | Create |
| `POST` | `/assets/bulk` | One patch across ≤ 500 assets, partial success reported |
| `PATCH` | `/assets/:id` | Partial update |
| `DELETE` | `/assets/:id` | Retire — **additionally requires the `admin` grant** |

**Data layer:** `Asset` (Mongoose), embedded `onboarding` sub-document,
`AssetClass`, plus the projections `assetGraph.service` writes into tracking,
custody and activity on every create/update.

### 1.2 Out of scope for this cycle

Work Orders, Predictive Maintenance, Inventory & Parts, Tracking/RTLS,
Compliance, Analytics dashboards, Administration. Bulk Import and Label Printing
are **deferred to cycle 2** — see §7.

---

## 2. Test approach

Two automated runners drive the real, running application. Nothing in this plan
is a desk check.

| Runner | Drives | Covers |
|---|---|---|
| `harness/api-tests.mjs` | HTTP against `:4000` | API, Validation, Boundary, Negative, Security, Database, Performance |
| `harness/ui-tests.mjs` | Real Chrome via CDP against `:5173` | UI, UX, Functional, Accessibility, Responsive, Permission, stored-XSS |

`harness/cdp.mjs` is a Chrome DevTools Protocol driver written for this suite —
the container has a Chrome binary but no Playwright/Puppeteer, so the harness
speaks CDP over a WebSocket directly. It captures console output, uncaught
exceptions and every network response per page, so a case can assert that a
screen rendered **and** that nothing failed silently behind it.

### 2.1 Observation points

Every UI case observes all five, per the module brief:

1. **UI** — rendered DOM and a PNG in `Testing/evidence/`
2. **Network** — every `/api/` response code collected via `Network.responseReceived`
3. **Console** — `Runtime.consoleAPICalled` + `Runtime.exceptionThrown`
4. **API response** — asserted directly in the API runner
5. **Validation** — status code, error envelope and `details[]`

### 2.2 Data hygiene

This suite runs against a **live Atlas cluster holding real operator data**.
Every runner registers what it creates and deletes it in teardown; the execution
log records the teardown result. Verified after the run: the operator's own
asset `AST-1` was untouched and no QA records remained.

---

## 3. Environment

| | |
|---|---|
| App | `npm run dev` — API `:4000`, web `:5173` |
| Runtime | Node 20.19.6, npm 11.17.0 |
| Browser | Google Chrome 151.0.7922.75, headless |
| Database | MongoDB Atlas, `access_genie_demo` |
| Auth | `raj@bcss.in` / super_admin (all 12 module grants) |
| Baseline data | 1 operator asset (`AST-1`), 1 user, 1 scope node |

**Two environment conditions materially affect results and are stated here so
the numbers are read correctly:**

- `MONGODB_MAX_POOL_SIZE=1` — a standing workaround for Atlas connection
  throttling. It serialises every database round-trip and is the direct cause of
  **BUG-002**.
- The Atlas cluster is intermittently refusing TLS handshakes (`alert number
  80`). Isolated request failures during a run are environmental, not defects.

---

## 4. Entry / exit criteria

**Entry** — app builds and runs; API healthy with a connected database; a
super-admin account exists. All met.

**Exit** — every planned case executed; no open Critical or High defect; all
Critical/High cases pass. **Not met** — see §6.

---

## 5. Risk-based priority

| Priority | Meaning | Cases |
|---|---|---|
| P0 | Data loss, security, or the module cannot be used | 24 |
| P1 | Core workflow degraded | 39 |
| P2 | Secondary function or polish | 33 |
| P3 | Cosmetic | 3 |

The highest-risk areas were targeted deliberately:

- **Silent data loss on partial update.** A `PATCH` sending one field must not
  reset unsent fields to schema defaults. `AM-API-020` is a permanent regression
  guard for this.
- **Serial-number integrity.** Uniqueness must hold for real serials while any
  number of assets may legitimately have none — `AM-API-012/013`, `AM-DB-001`.
- **Optional-field crashes.** The registry dereferences `onboarding`, which the
  API treats as optional — `AM-UI-030` creates the minimal legal asset and
  proves the registry survives it.
- **Authorisation.** Every endpoint unauthenticated, plus forged and malformed
  tokens — `AM-SEC-001…004`.
- **Injection.** NoSQL operators in body and query, regex metacharacters in
  search, stored XSS rendered in the registry.

---

## 6. Result

99 executed · 96 passed · **3 failed** · 97.0%.

| Severity | Open |
|---|---:|
| Critical | 0 |
| High | 2 |
| Medium | 1 |
| Low | 0 |

Full detail in [03-BUG-REPORTS.md](03-BUG-REPORTS.md); verdict and score in
[04-SUMMARY.md](04-SUMMARY.md).

**Exit criteria are not met**: two High-severity defects are open. Neither is a
data-integrity or security fault.

---

## 7. Deferred to cycle 2

Named explicitly so this plan is not mistaken for full module coverage:

| Area | Why deferred |
|---|---|
| **Bulk Import** (`/assets/import`, 631 lines) | Needs fixture CSVs — malformed rows, duplicate serials, wrong encodings, 10k-row volume. A meaningful pass is its own cycle. |
| **Label & Tag Printing** (`/assets/labels`, 833 lines) | Print/PDF output cannot be asserted from the DOM alone; needs artefact capture. |
| **Asset 360 deep tabs** | Reached and asserted at page level (`AM-UI-050`); individual tabs, dialogs and document upload not yet exercised. |
| **Role-based access matrix** | Only super_admin exercised. The other six roles need seeded accounts — in particular that `technician` cannot `DELETE` (it lacks the `admin` grant that route additionally requires). |
| **Cross-browser** | Only Chrome 151 available in this container. Firefox/Safari/Edge unverified — see BUG note in §8. |
| **Concurrency** | Two users editing one asset; last-write-wins vs optimistic locking. |
| **Volume** | The registry loads and filters **client-side over the whole estate**. Behaviour at 10k+ assets is unknown and is the single largest untested scalability risk. |

## 8. Coverage honesty

- **Cross-browser was not executed.** Only Chromium is installed here. No case
  asserts Firefox, Safari or Edge behaviour, and none should be read as doing so.
- **Accessibility is automated-only.** Automated checks catch labelling,
  landmarks and keyboard reachability — roughly a third of WCAG. Colour contrast,
  screen-reader semantics and focus-order sanity need a manual pass with NVDA or
  VoiceOver.
- **Performance figures are from a single-connection pool** and an
  almost-empty database. They are a floor, not a projection.

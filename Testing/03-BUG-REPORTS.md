# Bug Reports — Asset Management

Cycle 1. Three defects, all reproduced against the running application.

| Bug ID | Severity | Priority | Feature | Status |
|---|---|---|---|---|
| [BUG-001](#bug-001) | High | P1 | API error handling — malformed JSON | Open |
| [BUG-002](#bug-002) | High | P1 | Workspace load performance | Open |
| [BUG-003](#bug-003) | Medium | P2 | Registry sortable headers — keyboard access | Open |

---

## BUG-001

**Bug ID:** BUG-001
**Severity:** High
**Priority:** P1
**Module:** Asset Management (affects every module — global middleware)
**Page / Endpoint:** `POST /api/v1/assets` — and every JSON endpoint
**Feature:** API error handling
**Test case:** `AM-NEG-001`

### Description

A request body that is not parseable JSON returns **500 INTERNAL_ERROR** instead
of a 4xx. The caller made the mistake, but the API reports it as a server fault.

Three consequences: monitoring and on-call alerting treat client typos as server
outages; the client cannot distinguish "fix your request" from "retry later" and
will retry a request that can never succeed; and in development the raw parser
message is echoed in a `debug` field, which is a shape only unexpected errors are
supposed to take.

### Steps to reproduce

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"raj@bcss.in","password":"raj@bcss"}' | jq -r .data.accessToken)

curl -i -X POST http://localhost:4000/api/v1/assets \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"broken",'
```

Reproduced on all four malformed variants tested — `{"name":"broken",` ·
`{bad json}` · `[1,2,3` · `not json at all`. **4 of 4 return 500.**

### Expected result

`400 BAD_REQUEST` with the standard failure envelope and a message naming the
body as unparseable. This is the same class as the oversized-body case the
handler already gets right (413).

### Actual result

```
HTTP/1.1 500 Internal Server Error
{"success":false,
 "error":{"code":"INTERNAL_ERROR","message":"Something went wrong",
          "debug":"Expected double-quoted property name in JSON at position 17"},
 "requestId":"3ada7bb0-8722-435b-9f8d-dba331d58593"}
```

### Possible root cause

`backend/src/middleware/error.ts`. The handler maps `ApiError`, `ZodError`,
Mongoose validation/cast errors, duplicate keys, and `isPayloadTooLarge` — then
falls through to `ApiError.internal()`.

`express.json()` throws a `SyntaxError` carrying `type: 'entity.parse.failed'`
and `status: 400` for an unparseable body. There is no branch for it, so it lands
in the `else`.

The sibling case is already handled, with a comment describing this exact failure
mode: *"body-parser rejects an oversized body before any route sees it… Without
this the user uploads a large file and is told 'Something went wrong', which
reads as a broken server rather than as a file they need to shrink."* The
unparseable-body twin was missed.

### Suggested fix

Add a branch alongside `isPayloadTooLarge`:

```ts
} else if (isJsonParseError(err)) {
  apiError = ApiError.badRequest('Request body is not valid JSON');
}

/** body-parser's unparseable-body error — a client fault, not a server one. */
function isJsonParseError(err: unknown): err is SyntaxError {
  return err instanceof SyntaxError
    && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed';
}
```

Match on `type` rather than `instanceof SyntaxError` alone, so a genuine
`SyntaxError` thrown from application code still surfaces as a 500.

### Evidence

| | |
|---|---|
| Console logs | Server-side: full stack logged at `error` level — correct for a 500, but this should never have been one |
| Network request | `POST /api/v1/assets`, `Content-Type: application/json`, body `{"name":"broken",` |
| API endpoint | All JSON-accepting endpoints |
| Database impact | **None.** The body never parses, so no route or model is reached. No write occurs. |

---

## BUG-002

**Bug ID:** BUG-002
**Severity:** High
**Priority:** P1
**Module:** Asset Management (module-wide; originates in the shared data gate)
**Page:** every authenticated screen — measured on `/assets`
**Feature:** Workspace load performance
**Test cases:** `AM-PERF-010`, corroborated by `AM-PERF-002`

### Description

Every authenticated screen blocks behind a single `GET /api/v1/dataset` call that
takes **~3.7 s against an essentially empty database**. Time from navigation to an
interactive registry measured **4975–5492 ms across three runs**.

The user sees "Restoring your session…" then "Loading your workspace…" for five
seconds before any asset is visible — on an estate containing *one* asset.

This is a floor, not a worst case. The payload is 37 KB today; it grows with the
estate, and the registry filters client-side over the whole set.

### Steps to reproduce

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"raj@bcss.in","password":"raj@bcss"}' | jq -r .data.accessToken)

for i in 1 2 3; do
  curl -s -o /dev/null -w "%{time_total}s  %{size_download} bytes\n" \
    http://localhost:4000/api/v1/dataset -H "Authorization: Bearer $TOKEN"
done
```

### Expected result

Registry interactive in **< 3 s**; `/dataset` well under 1 s at this data volume.

### Actual result

```
/dataset  HTTP 200  3.811871s  37691 bytes
/dataset  HTTP 200  3.634911s  37691 bytes
/dataset  HTTP 200  3.610634s  37691 bytes
```

Full page: 4975 ms, 5054 ms, 5492 ms.

### Possible root cause

Two compounding causes; the first is dominant.

**1. Connection-pool starvation (configuration).** `backend/.env` carries
`MONGODB_MAX_POOL_SIZE=1`, a standing workaround for Atlas throttling.
`dataset.service.ts` fans out **55 collection queries** through one
`Promise.all` — with a pool of one they cannot run concurrently and execute
strictly serially.

The arithmetic matches the measurement: a single trivial query round-trips in
~65 ms of database time; 55 × 65 ms ≈ 3.6 s ≈ the 3.7 s measured.

Independently confirmed by `AM-PERF-002`: **10 concurrent** list requests took
2359 ms — 236 ms each, exactly the single-request latency, i.e. no concurrency
whatsoever.

**2. Gate design (code).** Even with a healthy pool, one call that reads 55
collections gates the entire application. Nothing renders until all of it lands,
so the slowest collection sets the time-to-interactive for every screen.

### Suggested fix

Immediate — restore the pool once Atlas is stable, which should recover most of
the loss:

```bash
MONGODB_MAX_POOL_SIZE=10
```

Structural — stop gating every screen on the whole estate:

- Let the registry read the paginated `GET /assets` it already has, and drop
  `/dataset` from its critical path.
- Split `/dataset` by module so a screen waits only for what it renders.
- Render the shell and stream panels in, rather than holding a full-page spinner.

### Evidence

| | |
|---|---|
| Screenshot | `Testing/evidence/03-registry-empty.png` (post-load) |
| Console logs | Clean — no errors; this is latency, not failure |
| Network request | `GET /api/v1/dataset` → 200, 37691 bytes, ~3.7 s |
| API endpoint | `GET /api/v1/dataset` |
| Database impact | Read-only. 55 collection reads per page load, serialised at `maxPoolSize=1` |

### Note on classification

The dominant cause is a **known environmental workaround**, not new product code.
Raising the pool will likely move this below the threshold. It is filed as High
because it is what a user experiences today, and because cause 2 remains a real
architectural risk once the estate grows.

---

## BUG-003

**Bug ID:** BUG-003
**Severity:** Medium
**Priority:** P2
**Module:** Asset Management
**Page:** `/assets` — Asset Registry
**Feature:** Sortable column headers
**Test case:** `AM-A11Y-008`

### Description

The registry's four sortable column headers (Asset ID / Name, Status, Health,
Category) sort on click, but **none can be reached or operated by keyboard**.
Sorting is available to mouse users only.

`0 of 4` sortable headers were focusable.

### Steps to reproduce

1. Sign in and open `/assets`.
2. Press <kbd>Tab</kbd> repeatedly from the top of the page.
3. Observe that focus never lands on any column header.
4. There is no key that triggers sort.

Programmatically:

```js
const clickable = [...document.querySelectorAll('th')]
  .filter(t => t.className.includes('cursor-pointer'));
const reachable = clickable.filter(t =>
  t.hasAttribute('tabindex') || t.querySelector('button') || t.getAttribute('role') === 'button');
// clickable: 4, reachable: 0
```

### Expected result

Each sortable header is focusable and operable by <kbd>Enter</kbd> or
<kbd>Space</kbd>, and announces its sort state. WCAG 2.1 **2.1.1 Keyboard (A)**
and **4.1.2 Name, Role, Value (A)**.

### Actual result

`<th onClick={…} className="… cursor-pointer …">` — a click handler on a
non-interactive element with no `tabindex`, no `role`, no keyboard handler and no
`aria-sort`. Invisible to keyboard and to assistive technology.

### Possible root cause

`frontend/src/pages/assets/page.tsx`, the `SortHead` component (~line 195). It
was built as a styled `<th>` with an `onClick`; the interactive semantics were
never added. The visual affordance (`cursor-pointer`, ▲/▼) exists, so the gap is
invisible in review.

### Suggested fix

Put a real button inside the header cell — it brings focusability, Enter/Space
and the correct role for free — and expose sort state via `aria-sort`:

```tsx
const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
  <th
    className={cn(th, className)}
    aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
  >
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 hover:text-slate-800"
    >
      {label}
      {sortKey === k && <span aria-hidden className="text-primary-500">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  </th>
);
```

### Evidence

| | |
|---|---|
| Screenshot | `Testing/evidence/03-registry-empty.png` — headers visible with sort affordance |
| Console logs | None |
| Network request | None — client-side sort |
| API endpoint | n/a |
| Database impact | **None.** Presentation-layer only. |

### Related — passing, for contrast

The rest of the registry's accessibility is sound and was verified: row
checkboxes are labelled (`AM-A11Y-004`), icon-only buttons carry accessible names
(`AM-A11Y-003`), images have `alt` (`AM-A11Y-002`), the table uses `<th>`
(`AM-A11Y-006`) and there is exactly one `<h1>` (`AM-A11Y-005`). This is a
localised gap, not a systemic one.

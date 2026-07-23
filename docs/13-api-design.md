# 13. API Design

**Document type:** Technical Blueprint — public & internal API surface, contracts, streaming & events
**Covers deliverable:** 13 (APIs) · Feature Matrix §M13 (Integrations & Platform) · cross-cuts every module
**Coordinates with:** [11-technical-architecture.md](./11-technical-architecture.md) (services, gateway, event bus,
IoT ingestion) · [12-database-design.md](./12-database-design.md) (event-sourced graph, entities, IDs) ·
[16-security-compliance.md](./16-security-compliance.md) (OAuth/OIDC, RBAC/ABAC, scopes, row/field-level security)

> **Principle 6 (Master Blueprint §0.4): "Open & programmable."** Everything in the UI is an API + webhook +
> event; the product is marketplace-ready. The API is not an afterthought bolted onto screens — the screens are
> *clients* of the same public contract. Anything a user can do in the app, an integrator can do over the API,
> subject to the identical RBAC + scope + audit enforcement.

---

## 13.1 API strategy — why four protocols, not one

Access Genie is a **single event-sourced asset graph** feeding EAM, RTLS/IoT, AI and BI (Master Blueprint §0.1).
No single protocol serves request/response CRUD, flexible graph reads, high-frequency device telemetry, live UI
push, and outbound automation equally well. We deliberately expose **four complementary surfaces**, each the
right tool for a distinct traffic shape, all sharing one auth model, one scope model, and one audit trail.

| Surface | Protocol / style | Primary use | Why this and not the others | Feature |
|---------|------------------|-------------|-----------------------------|---------|
| **REST** (primary) | HTTP/1.1+HTTP/2, JSON, resource-oriented | CRUD, actions, bulk, import, admin, integrations | Universal, cacheable, debuggable, connector-friendly; the contract of record for every entity | M13-171 |
| **GraphQL** (flexible reads) | Single POST endpoint, typed schema | 360° reads, dashboards, mobile — fetch an asset + tracking + health + open WOs in **one round-trip**, no over/under-fetch | The asset graph *is* a graph; deep nested reads over REST need N calls or bespoke `?include=`. Read-optimized; mutations go through REST | M13-171 |
| **Streaming** | WebSocket (bidir) + SSE (one-way) | Live map positions, alert push, WO board sync, telemetry tails, Copilot token streaming | Polling REST for live location at 10M assets is infeasible; push is O(changes) not O(clients×interval) | M13-173 |
| **Webhooks / events** (outbound) | Signed HTTP POST, at-least-once | Fire-and-forget automation into customer/3rd-party systems (Slack, ERP, iPaaS) | Inverts control: customer systems react to *our* events without polling; the backbone of the connector marketplace | M13-172 |
| **IoT ingestion** (inbound, separate) | HTTP batch + MQTT + gateway SDK | Device → platform telemetry at scale | Isolated from the business API: different auth (device identity), different SLOs, different scaling envelope, back-pressure-tolerant | M13-174 |

**Positioning vs. incumbents:** ServiceNow/Maximo expose SOAP-era + partial REST; Samsara/Zebra expose
device-centric REST. We lead with a **first-class GraphQL graph** over the asset object + **vendor-neutral IoT
ingestion** (Principle 4, §0.4) so integrators are never coupled to a hardware SKU.

**Design tenets**
1. **One contract, many clients.** The web app, mobile apps (→ [14](./14-mobile-apps.md)) and 3rd parties call the same `/v1` surface.
2. **RBAC + scope + audit on every call** — enforced at the data layer, never by hiding a menu ([16](./16-security-compliance.md)).
3. **Idempotent & replay-safe** — writes carry idempotency keys; events are at-least-once with dedupe keys.
4. **Tenant-isolated by construction** — tenant is derived from the token, never trusted from the body.
5. **Evolvable** — additive changes only within a major version; breaking changes get a new `/vN`.
6. **Discoverable** — OpenAPI 3.1 + GraphQL SDL + AsyncAPI (events) published in the Developer Portal (`/system/developer`).

---

## 13.2 Conventions (apply to every endpoint)

### 13.2.1 Base URL, versioning, environments

| Aspect | Convention |
|--------|-----------|
| **Base URL** | `https://api.accessgenie.ai/v1` (REST) · `https://api.accessgenie.ai/graphql` · `wss://stream.accessgenie.ai/v1` (WS) · `https://ingest.accessgenie.ai/v1` (IoT) |
| **Versioning** | URI major version `/v1`; additive within-major (new fields/endpoints) is non-breaking. Breaking → `/v2`. Minor behavior via `AG-Api-Version: 2026-07-01` date header (opt-in) |
| **Deprecation** | `Deprecation: true` + `Sunset: <RFC1123 date>` + `Link: <docs>; rel="deprecation"` headers; ≥ 6-month sunset window; changelog in Developer Portal |
| **Environments** | `api.accessgenie.ai` (prod) · `api.sandbox.accessgenie.ai` (sandbox, isolated data, free) · region-pinned hosts `api.eu.` / `api.us.` for data residency (→ [16](./16-security-compliance.md)) |
| **Content type** | `application/json; charset=utf-8`; `Accept` negotiates `application/json` (default). Timestamps ISO-8601 UTC (`2026-07-23T14:05:00Z`); money as `{ "amount": 1250.00, "currency": "USD" }`; IDs are prefixed ULIDs (`ast_01J…`, `wo_01J…`) |
| **Tenancy** | Tenant is **derived from the token** (never from path/body). Optional `AG-Scope: fac_01J…` header narrows the active scope node; requests are always filtered to token tenant ∩ requested scope |

### 13.2.2 Authentication & authorization

Auth is delegated to the platform IdP (OAuth2 + OIDC); full model in [16-security-compliance.md](./16-security-compliance.md).

| Credential | Flow / use | Notes |
|-----------|-----------|-------|
| **User (SSO/OIDC)** | Authorization Code + PKCE | For the web/mobile apps; MFA/passkey at IdP (SAML/OIDC → Okta/Azure AD/Google) |
| **Machine (M2M)** | OAuth2 **Client Credentials** | Server-to-server integrations; short-lived JWT access token |
| **API key** | `Authorization: Bearer ag_live_…` (opaque, hashed at rest) | Low-friction for scripts/connectors; scoped, rotatable, per-key rate limit, revocable in `/admin/api-keys` |
| **Device** | mTLS + device JWT (gateway-provisioned) | **IoT ingestion only** — separate trust domain (§13.5.3) |

- **Bearer JWT** on every business call: `Authorization: Bearer <access_token>`. Access token TTL 15 min; refresh via rotating refresh token. JWT claims: `iss, sub, aud, tenant_id, scopes[], scope_nodes[], exp, jti`.
- **Scopes** are `resource:action` (matching the RBAC model in [02](./02-personas.md)§2.3), e.g. `assets:read`, `assets:write`, `workorders:close`, `transfers:approve`, `ai:invoke`, `webhooks:manage`. A token is granted the **intersection** of the client's registered scopes and the acting user's role permissions.
- **Scope binding:** every token carries `scope_nodes[]` (Org/Facility/Building/Zone ULIDs). Row-level security filters every query; field-level masking hides restricted fields (e.g., financials from a technician token). `403` with `insufficient_scope` when the resource is outside the token's scope nodes.
- **Segregation of duties (SoD):** requester ≠ approver enforced server-side on `transfers:approve`, `disposals:approve`, `writeoffs:approve` regardless of scopes held.
- **Break-glass** (Platform tier) is possible but always logged + alerts the tenant Security Admin.

### 13.2.3 Pagination — cursor-based (default)

Offset pagination is banned on collections (unstable under writes at 10M+ assets). All list endpoints are cursor-paginated.

```
GET /v1/assets?limit=50&cursor=eyJvIjoiYXN0XzAxSjkuLi4ifQ&sort=-updated_at
```

| Param | Meaning |
|-------|---------|
| `limit` | Page size, default 50, max 200 |
| `cursor` | Opaque, base64 keyset cursor (encodes sort key + last id) |
| `sort` | Comma list; `-` prefix = desc (e.g. `-updated_at,name`) |

Response envelope:
```json
{
  "data": [ /* … items … */ ],
  "page": {
    "next_cursor": "eyJvIjoiYXN0XzAxSjkuLi4ifQ",
    "has_more": true,
    "limit": 50
  }
}
```
Cursors are also returned as `Link: <…?cursor=…>; rel="next"` for hypermedia clients.

### 13.2.4 Filtering, sorting, sparse fieldsets, expansion

| Feature | Syntax | Example |
|---------|--------|---------|
| **Filter** | `filter[field][op]=value`; ops: `eq,ne,gt,gte,lt,lte,in,nin,like,between,exists` | `filter[status][in]=active,maintenance&filter[health][lt]=60` |
| **Full-text** | `q=` (semantic + keyword, → M18) | `q=forklift building a` |
| **Sort** | `sort=` (`-` desc, multi-key) | `sort=-risk_score,name` |
| **Sparse fieldset** | `fields=` (comma list; dot for nested) | `fields=id,name,status,health.score` |
| **Expansion** | `expand=` (inline related resources; alt to GraphQL for simple cases) | `expand=location,assigned_to,open_work_orders` |
| **Scope** | `AG-Scope` header or `scope_node=` | `scope_node=bld_01J…` |

Complex/deep read shapes should use **GraphQL** (§13.4) rather than stacking `expand`.

### 13.2.5 Idempotency & concurrency

| Mechanism | How |
|-----------|-----|
| **Idempotency keys** | `Idempotency-Key: <uuid>` **required on all POST that create** and on bulk/action endpoints. Server stores the (key, tenant, request-hash) → response for 24 h; a retry returns the original result and never double-creates. Mismatched body under same key → `409 idempotency_key_reuse` |
| **Optimistic concurrency** | Mutable resources return `ETag`; `PUT`/`PATCH`/`DELETE` require `If-Match: <etag>`; stale → `412 precondition_failed`. Event-sourced writes also carry `expected_version` for the aggregate |
| **Conditional reads** | `If-None-Match` → `304 Not Modified` |

### 13.2.6 Standard error envelope

Every non-2xx returns a consistent RFC-9457-style problem object. `trace_id` matches the UI error state (§0.7) for support.

```json
{
  "error": {
    "type": "https://docs.accessgenie.ai/errors/validation_failed",
    "code": "validation_failed",
    "message": "One or more fields are invalid.",
    "status": 422,
    "trace_id": "trc_01J9ZK7Q2C3V8H",
    "request_id": "req_01J9ZK7Q2C…",
    "errors": [
      { "field": "attributes.serial_no", "code": "required", "message": "Serial number is required for class 'vehicle'." },
      { "field": "purchase.cost.amount", "code": "min", "message": "Must be ≥ 0." }
    ],
    "docs": "https://docs.accessgenie.ai/errors/validation_failed"
  }
}
```

| HTTP | `code` examples | Meaning |
|------|-----------------|---------|
| 400 | `malformed_request`, `invalid_cursor` | Bad syntax/params |
| 401 | `unauthenticated`, `token_expired` | Missing/invalid credential |
| 403 | `insufficient_scope`, `sod_violation`, `out_of_scope_node` | Authenticated but not permitted |
| 404 | `not_found` | Absent or outside tenant (indistinguishable, by design) |
| 409 | `conflict`, `idempotency_key_reuse`, `duplicate_asset` | State/uniqueness conflict |
| 412 | `precondition_failed` | Stale `If-Match` |
| 422 | `validation_failed`, `business_rule_violation` | Semantically invalid |
| 429 | `rate_limited` | Throttled (see §13.2.7) |
| 5xx | `internal_error`, `dependency_unavailable` | Server/side-effect failure (retry with backoff) |

### 13.2.7 Rate limiting & quotas

- Sliding-window limits per **credential × endpoint-class**, returned on every response:
  `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (RFC draft headers) + `Retry-After` on `429`.
- Default tiers (configurable per plan in `/admin/billing`, monitored in [19]/`/system/monitoring`):

| Endpoint class | Default limit | Burst |
|----------------|--------------|-------|
| Reads (`GET`, GraphQL query) | 600 req/min/key | 60/s |
| Writes (`POST/PUT/PATCH/DELETE`) | 120 req/min/key | 20/s |
| Bulk / import | 10 req/min/key | job-queued |
| AI / Copilot (`ai:invoke`) | 60 req/min/key | token-metered |
| IoT ingestion | per-gateway contract (§13.5.3) | back-pressured |

- GraphQL additionally enforces **query cost/complexity** budgets and max depth; expensive queries → `429 query_too_complex`.

### 13.2.8 Bulk & async jobs

- **Small batch (≤ 1000 items), synchronous:** `POST /v1/{resource}/bulk` with `{ "operations": [ … ] }`; returns per-item `207 Multi-Status` results.
- **Large / import (CSV/Excel/API), asynchronous:** `POST /v1/assets/import` → `202 Accepted` + `{ "job_id": "job_…" }`; poll `GET /v1/jobs/{job_id}` or subscribe to `job.completed` webhook / stream. Imports support **dry-run** (`?mode=validate`) with a downloadable error report (Feature M1-7).
- All bulk/import calls require `Idempotency-Key`.

---

## 13.3 Resource endpoint tables

Format: **Method · Path · Purpose · Scope** (`resource:action`). All paths are under `/v1`. Scopes stack with
**row/field-level** enforcement and the token's `scope_nodes[]`. `…/{id}` is a prefixed ULID.

### 13.3.1 Auth & Tokens

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| POST | `/oauth/token` | Issue token (authorization_code / refresh_token / client_credentials) | public |
| POST | `/oauth/revoke` | Revoke access/refresh token | authenticated |
| POST | `/oauth/introspect` | Token introspection (RFC 7662) | `tokens:introspect` |
| GET | `/oauth/authorize` | OIDC authorization endpoint (PKCE) | public |
| GET | `/.well-known/openid-configuration` · `/jwks.json` | OIDC discovery + signing keys | public |
| GET | `/v1/me` | Current identity, tenant, scopes, scope_nodes | authenticated |
| GET | `/v1/me/permissions` | Effective permission matrix for the caller | authenticated |
| POST | `/v1/auth/api-keys` · GET · DELETE `…/{id}` | Manage API keys | `apikeys:manage` |

### 13.3.2 Assets (+ search / bulk / import)

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/assets` | List/filter/sort assets (cursor) | `assets:read` |
| POST | `/v1/assets` | Create asset (idempotent) | `assets:write` |
| GET | `/v1/assets/{id}` | Get asset (sparse/expand) | `assets:read` |
| PATCH | `/v1/assets/{id}` | Partial update (If-Match) | `assets:write` |
| DELETE | `/v1/assets/{id}` | Soft-delete (restorable) | `assets:delete` |
| POST | `/v1/assets/{id}/restore` | Restore soft-deleted asset | `assets:write` |
| POST | `/v1/assets/{id}/clone` | Clone from template (M1-12) | `assets:write` |
| POST | `/v1/assets/merge` | Merge duplicates (M1-16) | `assets:merge` |
| GET | `/v1/assets/search` | Advanced/semantic search (M18) | `assets:read` |
| POST | `/v1/assets/bulk` | Bulk create/update/delete (≤1000, 207) | `assets:write` |
| POST | `/v1/assets/import` | Async CSV/Excel/API import (dry-run) | `assets:import` |
| POST | `/v1/assets/{id}/labels` | Generate QR/barcode/RFID label payload (M1-9) | `assets:read` |
| GET | `/v1/assets/{id}/components` | Parent/child & sub-assets (M1-5) | `assets:read` |
| GET | `/v1/assets/{id}/timeline` | Unified event/history stream (from event store) | `assets:read` |
| GET | `/v1/assets/{id}/attachments` · POST · DELETE `…/{docId}` | Docs/images/manuals/CAD (M1-14) | `assets:read` / `assets:write` |
| GET | `/v1/assets/lookup?tag=…` | Scan-to-open by QR/RFID/NFC (M1-18) | `assets:read` |
| GET | `/v1/groups` · POST · GET `…/{id}` | Asset groups / kits / fleets (M1-6) | `assets:read` / `assets:write` |
| GET | `/v1/saved-views` · POST · DELETE | Shareable filtered lists (M1-17) | `assets:read` |

### 13.3.3 Asset Attributes & Taxonomy

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/taxonomy/classes` | List asset classes / hierarchy (M1-2) | `taxonomy:read` |
| POST | `/v1/taxonomy/classes` · PATCH `…/{id}` | Create/edit class node | `taxonomy:manage` |
| GET | `/v1/taxonomy/classes/{id}/attributes` | Per-class attribute template (M1-3) | `taxonomy:read` |
| POST | `/v1/taxonomy/classes/{id}/attributes` | Define custom field (type, units, pick-list, validation) (M1-13) | `taxonomy:manage` |
| GET | `/v1/taxonomy/attribute-sets` | Reusable attribute templates | `taxonomy:read` |
| GET | `/v1/taxonomy/data-quality/{assetId}` | Completeness/quality score (M1-11) | `taxonomy:read` |

### 13.3.4 Tracking / Locations & Telemetry

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/locations/live` | Current positions (bbox/scope/class filter) for live map (M2-22) | `tracking:read` |
| GET | `/v1/assets/{id}/location` | Latest fused position + confidence (M2-31) | `tracking:read` |
| GET | `/v1/assets/{id}/movement` | Historical trail / replay (M2-26) | `tracking:read` |
| GET | `/v1/movement/heatmap` | Aggregated flow/dwell heatmap (M2-27) | `tracking:read` |
| GET | `/v1/zones/{id}/occupancy` | Zone dwell-time & occupancy (M2-25) | `tracking:read` |
| GET | `/v1/telemetry` | Time-series query (metric, asset, window, agg) (M2-35) | `telemetry:read` |
| GET | `/v1/telemetry/latest` | Latest sensor readings snapshot | `telemetry:read` |
| POST | `/v1/telemetry/query` | Complex multi-series / downsampled query | `telemetry:read` |
| GET | `/v1/twin/{facilityId}/state` | Digital-twin live state snapshot (M2-23) | `tracking:read` |

> **High-frequency reads** (live map, telemetry tails) should use the **streaming API** (§13.5), not polling.
> **Device→platform writes** go to the **IoT ingestion API** (§13.5.3), never these business endpoints.

### 13.3.5 Geofences

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/geofences` | List geofences (M2-24) | `geofences:read` |
| POST | `/v1/geofences` | Create (GeoJSON polygon / draw / import) | `geofences:write` |
| GET · PATCH · DELETE | `/v1/geofences/{id}` | Get / edit / delete | `geofences:read` / `geofences:write` |
| GET | `/v1/geofences/{id}/breaches` | Breach events for a fence | `geofences:read` |
| POST | `/v1/geofences/{id}/test` | Point-in-fence test / simulate | `geofences:read` |

### 13.3.6 Sensors & Gateways

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/sensors` · GET `…/{id}` | Sensor/tag inventory + health/battery (M2-32) | `devices:read` |
| POST · PATCH · DELETE | `/v1/sensors/{id}` | Provision / configure / retire sensor | `devices:manage` |
| POST | `/v1/sensors/{id}/calibrate` | Calibration action (M2-34) | `devices:manage` |
| GET | `/v1/gateways` · GET `…/{id}` | Gateway/reader fleet & config (M2-33) | `devices:read` |
| POST · PATCH | `/v1/gateways/{id}` | Register / configure gateway | `devices:manage` |
| POST | `/v1/gateways/{id}/firmware` | Trigger OTA firmware update (M2-34) | `devices:manage` |
| GET | `/v1/gateways/{id}/health` | Uptime, throughput, lag | `devices:read` |

### 13.3.7 Maintenance / Work Orders + PM

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/work-orders` | List/board/calendar feed (M4-62/66) | `workorders:read` |
| POST | `/v1/work-orders` | Create WO (corrective/predictive) | `workorders:write` |
| GET · PATCH | `/v1/work-orders/{id}` | Get / update WO | `workorders:read` / `workorders:write` |
| POST | `/v1/work-orders/{id}/assign` | Assign technician/vendor (M4-67/79) | `workorders:assign` |
| POST | `/v1/work-orders/{id}/transition` | State change (start/hold/complete/close) | `workorders:write` |
| POST | `/v1/work-orders/{id}/close` | Close with resolution/failure code (M4-70) | `workorders:close` |
| POST | `/v1/work-orders/{id}/labor` · `/parts` | Log time / consume parts (M4-71/72) | `workorders:write` |
| POST | `/v1/work-orders/from-insight` | Create WO from AI insight (M4-64) | `workorders:write` |
| GET | `/v1/pm-schedules` · POST · PATCH `…/{id}` | PM plans (time/usage/meter) (M4-63/75) | `pm:read` / `pm:manage` |
| POST | `/v1/pm-schedules/{id}/generate` | Force-generate due WOs | `pm:manage` |
| GET | `/v1/inspections` · POST `…/{id}/submit` | Digital checklists/forms (M4-69) | `inspections:read` / `inspections:write` |
| GET | `/v1/failure-codes` | Problem/cause/remedy taxonomy (M4-70) | `workorders:read` |

### 13.3.8 Inventory / Parts

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/parts` · POST · GET `…/{sku}` | Spare parts & consumables catalog (M5-80) | `inventory:read` / `inventory:write` |
| GET | `/v1/stock` | Stock levels by warehouse/bin (M5-81) | `inventory:read` |
| POST | `/v1/stock/adjustments` | Cycle count / adjustment (M5-86) | `inventory:write` |
| POST | `/v1/parts/{sku}/issue` · `/return` | Issue/return to WO (M5-85) | `inventory:write` |
| GET | `/v1/reorder` · POST `/reorder/rules` | Reorder points & auto-reorder (M5-82) | `inventory:manage` |
| GET | `/v1/purchase-orders` · POST · POST `…/{id}/receive` | POs & receiving (M5-83) | `procurement:read` / `procurement:write` |
| GET | `/v1/warehouses` · `/bins` · `/suppliers` | Locations & vendor catalog (M5-87) | `inventory:read` |

### 13.3.9 Transfers / Custody / Reservations

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/transfers` · POST | List / request transfer (M6-96) | `transfers:read` / `transfers:request` |
| POST | `/v1/transfers/{id}/approve` · `/reject` | Approval (SoD: requester ≠ approver) | `transfers:approve` |
| POST | `/v1/transfers/{id}/receive` | Confirm receipt at destination | `transfers:write` |
| POST | `/v1/custody/checkout` · `/checkin` | Check-out / check-in (M6-94) | `custody:write` |
| GET | `/v1/assets/{id}/custody` | Immutable chain-of-custody log (M6-98) | `custody:read` |
| GET | `/v1/reservations` · POST · DELETE `…/{id}` | Book/cancel shared assets (M6-95/99) | `reservations:read` / `reservations:write` |
| GET | `/v1/requests` · POST | Asset request & fulfillment (M6-101) | `requests:read` / `requests:write` |

### 13.3.10 Users / Roles / RBAC

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/users` · POST · GET `…/{id}` | Manage users (M12-159) | `users:read` / `users:manage` |
| POST | `/v1/users/{id}/deactivate` | Disable user | `users:manage` |
| GET | `/v1/roles` · POST · PATCH `…/{id}` | Custom roles & permission sets (M12-160) | `roles:manage` |
| GET | `/v1/permissions` | Catalog of `resource:action` permissions | `roles:read` |
| POST | `/v1/users/{id}/assignments` | Assign role × scope (× optional time-box) | `roles:manage` |
| GET | `/v1/teams` · POST | Teams / departments / cost centers (M12-161) | `users:manage` |
| POST · GET | `/scim/v2/Users` · `/scim/v2/Groups` | SCIM 2.0 provisioning (M12-170) | `scim:manage` |

### 13.3.11 Notifications / Alerts / Rules

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/alerts` | Unified alert center feed (M9-125) | `alerts:read` |
| GET | `/v1/alerts/{id}` | Alert detail + correlation group (M9-133) | `alerts:read` |
| POST | `/v1/alerts/{id}/ack` · `/snooze` · `/escalate` · `/resolve` | Alert lifecycle (M9-128) | `alerts:write` |
| GET | `/v1/alert-rules` · POST · PATCH `…/{id}` | Rules engine / condition builder (M9-127) | `alertrules:manage` |
| GET | `/v1/escalation-policies` · POST | On-call routing (M9-129) | `alertrules:manage` |
| GET | `/v1/notifications` | Per-user in-app inbox (M17-213) | authenticated |
| GET · PUT | `/v1/notifications/preferences` | Channels & digests (M9-130) | authenticated |
| POST | `/v1/notifications/test` | Send test notification (channel check) | `alertrules:manage` |

### 13.3.12 Reports / Analytics / BI

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/reports` · GET `…/{id}` | Report library (M10-135) | `reports:read` |
| POST | `/v1/reports` · PATCH `…/{id}` | Create/edit custom report (M10-136) | `reports:manage` |
| POST | `/v1/reports/{id}/run` | Execute report (async → job) (M10-139) | `reports:read` |
| GET | `/v1/reports/{id}/exports/{exportId}` | Fetch PDF/Excel/CSV/PNG artifact | `reports:read` |
| POST | `/v1/reports/{id}/subscriptions` | Scheduled delivery (M10-138) | `reports:read` |
| POST | `/v1/analytics/query` | Ad-hoc BI query (pivot/aggregate) (M10-137) | `analytics:read` |
| GET | `/v1/metrics/kpi` | KPI values for dashboards/targets (M10-144) | `analytics:read` |
| GET | `/v1/financials/depreciation` · `/tco` | Depreciation & TCO rollups (M8) | `finance:read` |

### 13.3.13 AI / Insights / Copilot

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/ai/insights` | Ranked, $-impact recommendation feed (M3-57) | `ai:read` |
| POST | `/v1/ai/insights/{id}/feedback` | HITL accept/dismiss/rate (M3-60) | `ai:read` |
| POST | `/v1/ai/insights/{id}/act` | Execute suggested action (e.g. create WO) | `ai:invoke` |
| GET | `/v1/ai/assets/{id}/health` | Explainable health score + drivers (M3-39/58) | `ai:read` |
| GET | `/v1/ai/assets/{id}/risk` | Composite risk score + drivers (M3-46) | `ai:read` |
| GET | `/v1/ai/assets/{id}/predictions` | Failure/RUL forecast + confidence (M3-40/41) | `ai:read` |
| GET | `/v1/ai/anomalies` | Behavioral/telemetry anomalies (M3-42) | `ai:read` |
| POST | `/v1/ai/copilot/messages` | Copilot turn (agentic; streams tokens; may call tools/act) (M3-53) | `ai:invoke` |
| POST | `/v1/ai/search` | Natural-language / semantic query (M3-54) | `ai:read` |
| POST | `/v1/ai/reports/generate` | Generative report/narrative (M3-55) | `ai:invoke` |
| GET | `/v1/ai/models` · GET `…/{id}` | Model registry, versions, drift (M3-59) | `ai:governance` |
| POST | `/v1/ai/explain` | On-demand explanation/counterfactual (M3-58) | `ai:read` |

> AI write actions (`ai:invoke`) still pass through the **same RBAC/SoD/scope** checks as the equivalent direct
> call — the Copilot cannot exceed the acting user's permissions. Full method/explainability/governance in
> [08-ai-intelligence.md](./08-ai-intelligence.md).

### 13.3.14 Webhooks / Event subscriptions

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET | `/v1/webhooks` · POST | List / create webhook endpoint (M13-172) | `webhooks:manage` |
| GET · PATCH · DELETE | `/v1/webhooks/{id}` | Manage endpoint (URL, events[], active) | `webhooks:manage` |
| GET | `/v1/webhooks/{id}/deliveries` | Delivery log (status, attempts, response) | `webhooks:manage` |
| POST | `/v1/webhooks/{id}/deliveries/{deliveryId}/retry` | Manual redelivery | `webhooks:manage` |
| POST | `/v1/webhooks/{id}/rotate-secret` | Rotate signing secret | `webhooks:manage` |
| POST | `/v1/webhooks/{id}/test` | Send synthetic `ping` event | `webhooks:manage` |
| GET | `/v1/events/catalog` | Machine-readable event catalog (AsyncAPI) | `webhooks:manage` |

### 13.3.15 Admin / Org / Facilities

| Method | Path | Purpose | Scope |
|--------|------|---------|-------|
| GET · PATCH | `/v1/org` | Organization/tenant settings (M12-158) | `org:manage` |
| GET | `/v1/facilities` · POST · GET `…/{id}` | Facilities/sites | `facilities:manage` |
| GET | `/v1/facilities/{id}/tree` | Building▸Floor▸Zone hierarchy | `facilities:read` |
| GET | `/v1/integrations` · POST `…/{id}/connect` | Connector config (ERP/ITSM/comms) (M13-175/178) | `integrations:manage` |
| GET | `/v1/workflows` · POST · PATCH `…/{id}` | Approval/automation workflows (M12-162/163) | `workflows:manage` |
| GET | `/v1/audit-log` | Immutable system audit log (M11-150) | `audit:read` |
| GET | `/v1/jobs/{id}` | Async job status (import/report/bulk) | authenticated |
| GET | `/v1/feature-flags` | Enabled modules/flags for tenant (M12-167) | `org:manage` |
| POST | `/v1/data/export` · `/backup` | Tenant data export / backup (M12-168) | `org:manage` |
| GET · POST · DELETE | `/v1/tenants` (Platform) | Tenant provisioning (M19-225) | `platform:tenants` |

---

## 13.4 GraphQL (flexible reads)

Single endpoint `POST /graphql`; same bearer auth, scopes, scope-node filtering and audit as REST. **Read-first**:
queries + subscriptions are the norm; mutations exist for convenience but the REST action endpoints remain the
contract of record for complex/side-effecting writes (idempotency, SoD, job semantics live there).

**Why GraphQL here:** the 360° asset page ([10](./10-asset-360-profile.md)) and role dashboards
([04](./04-dashboards.md)) need an asset *plus* its location, health, open work orders, custody and sensors in one
round-trip. REST would need many calls or an ever-growing `expand=`. Example:

```graphql
query Asset360($id: ID!) {
  asset(id: $id) {
    id  name  status  tag
    class { name path }
    location { lat lng zone { name } confidence updatedAt }
    health { score band drivers { factor weight direction } }
    risk { score band }
    openWorkOrders(first: 5) { edges { node { id priority slaDueAt status } } }
    custody { current { holder since } }
    sensors { id type battery lastReadingAt }
  }
}
```

| Guardrail | Setting |
|-----------|---------|
| **Depth limit** | Max nesting depth 8 |
| **Cost budget** | Weighted complexity score per query; over-budget → `429 query_too_complex` |
| **Pagination** | Relay-style cursor connections (`first/after`, `edges/node/pageInfo`) — same keyset cursors as REST |
| **Persisted queries** | APQ (hash) supported/recommended for mobile to cut payload + allow allow-listing |
| **Errors** | `errors[]` per GraphQL spec + `extensions.code` mirroring REST error codes |
| **Field-level security** | Restricted fields resolve to `null` + `extensions.masked=true`, never leaked |
| **Subscriptions** | `subscription { assetMoved(scopeNode: ID) { … } }` over the WS transport (§13.5) |

Schema (SDL) is published + versioned in the Developer Portal; additive-only within `/v1`.

---

## 13.5 Streaming & IoT — three distinct channels

Live push, and device ingestion, are **separate concerns** with separate hosts, auth and SLOs. Master Blueprint
Principle 4/§0.10: *"Tracking hardware is a commodity — the abstraction is the product."* The ingestion layer is
vendor-neutral; the streaming layer is UI-facing.

### 13.5.1 WebSocket streaming API (bidirectional, UI live-sync)

- Endpoint `wss://stream.accessgenie.ai/v1`. Auth: connect with `Authorization: Bearer <jwt>` (or `?access_token=` for browsers); the socket inherits the token's scopes + scope_nodes.
- Client subscribes to **channels**; server pushes deltas. Multiplexed; heartbeats every 30 s; resume via `last_event_id`.

| Channel | Payload | Backs UI |
|---------|---------|----------|
| `locations:{scopeNode}` | Position deltas (asset_id, lat/lng/zone, confidence) | Live map, twin |
| `telemetry:{assetId}` | Latest sensor readings tail | Telemetry explorer, sensor tab |
| `alerts:{scopeNode}` | New/updated alerts | Alerts bell, Security dashboard |
| `workorders:{scopeNode}` | WO create/transition | WO board live sync |
| `copilot:{sessionId}` | Streamed Copilot tokens + tool-call events | Copilot ⌘K |

```json
{ "action": "subscribe", "channels": ["locations:fac_01J…", "alerts:fac_01J…"], "since": "evt_01J9…" }
```

### 13.5.2 Server-Sent Events (one-way, simple consumers)

For clients that only need a downstream tail (dashboards, TV walls, lightweight integrations) without WS
complexity: `GET /v1/streams/{channel}` with `Accept: text/event-stream`, `Last-Event-ID` resume, auto-reconnect.
Same channels/auth as §13.5.1, read-only.

### 13.5.3 IoT ingestion API (inbound device → platform, **separate**)

A distinct, hardened ingress with its **own trust domain, host, quotas and back-pressure** — never mixed with the
business API. Feeds the event-sourced telemetry pipeline ([11](./11-technical-architecture.md),
[12](./12-database-design.md)). Vendor-neutral: RFID/BLE/UWB/GPS/LoRaWAN/WiFi/NFC normalized by the gateway/adapter
SDK (M13-174, [09](./09-tracking-technologies.md)) before or at ingest.

| Aspect | Detail |
|--------|--------|
| **Host** | `https://ingest.accessgenie.ai/v1` (HTTP) · `mqtts://ingest.accessgenie.ai:8883` (MQTT/TLS) |
| **Auth** | **Device identity** — mTLS client cert or gateway-provisioned device JWT; *not* user/API-key auth |
| **HTTP batch** | `POST /v1/ingest/telemetry` — gzip NDJSON batches of readings; `202 Accepted` + accepted/rejected counts; at-least-once |
| **MQTT** | Topics `tenants/{tid}/gateways/{gid}/telemetry` · `…/events`; QoS 1; LWT for gateway offline detection |
| **Positions** | `POST /v1/ingest/positions` — raw RFID/BLE/UWB/GPS reads → sensor-fusion service resolves fused location + confidence |
| **Schema** | Normalized envelope `{ device_id, asset_tag?, metric, value, unit, ts, quality }`; adapter SDK maps vendor formats |
| **Back-pressure** | Per-gateway rate contract; `429`/MQTT throttle; edge buffers + replays on reconnect (offline-first, §0.4-5) |
| **Idempotency** | `(device_id, metric, ts)` dedupe key drops duplicate re-sends |
| **Isolation** | Compromise/flood of ingestion cannot degrade the business API — separate autoscaling group + WAF policy |

```jsonc
// POST https://ingest.accessgenie.ai/v1/ingest/telemetry   (device JWT / mTLS)
{ "gateway_id": "gw_01J…", "batch": [
  { "device_id": "tag_01J…", "asset_tag": "FL-1183", "metric": "temperature", "value": 4.2, "unit": "C", "ts": "2026-07-23T14:05:01Z", "quality": "good" },
  { "device_id": "tag_01J…", "asset_tag": "FL-1183", "metric": "battery",     "value": 71,  "unit": "%", "ts": "2026-07-23T14:05:01Z", "quality": "good" }
] }
```

---

## 13.6 Webhook / event catalog (outbound)

Outbound events are **at-least-once**, HMAC-signed, ordered-per-resource where feasible, and idempotent by
`event.id`. Consumers must verify the signature and dedupe on `id`. Common envelope:

```json
{
  "id": "evt_01J9ZM2Q…",
  "type": "asset.moved",
  "api_version": "2026-07-01",
  "created_at": "2026-07-23T14:05:03Z",
  "tenant_id": "org_01J…",
  "scope_node": "bld_01J…",
  "idempotency_key": "evt_01J9ZM2Q…",
  "data": { /* type-specific payload */ },
  "previous": { /* prior state for *.updated events, optional */ }
}
```

**Delivery & security:** signed header `AG-Signature: t=<ts>,v1=<hmac_sha256(secret, ts + "." + body)>`; reject if
`|now − t| > 5 min` (replay defense). Retries with exponential backoff for ~24 h (≈12 attempts); auto-disable +
alert after sustained failure; full log + manual retry at `/admin/webhooks` (§13.3.14). Recommended endpoint
returns `2xx` fast and processes async.

| Event | Trigger | Payload summary | Module |
|-------|---------|-----------------|--------|
| `asset.created` | New asset registered | asset id, class, tag, scope, created_by | M1 |
| `asset.updated` | Asset fields changed | id, changed fields, `previous` | M1 |
| `asset.deleted` / `asset.restored` | Soft-delete / restore | id, actor | M1 |
| `asset.merged` | Duplicates merged | surviving id, merged ids | M1 |
| `asset.moved` | Fused location crossed zone/threshold | id, from_zone, to_zone, lat/lng, confidence, ts | M2 |
| `asset.status_changed` | Lifecycle/operational status change | id, from, to, reason | M1/M7 |
| `geofence.breached` | Asset entered/exited a fence | fence id, asset id, direction, ts | M2 |
| `telemetry.threshold_crossed` | Reading breached configured limit | asset id, metric, value, threshold | M2 |
| `sensor.battery_low` / `sensor.signal_lost` | Tag/sensor health event | device id, asset id, level/last_seen | M2 |
| `gateway.offline` / `gateway.online` | Gateway connectivity (MQTT LWT) | gateway id, since | M2 |
| `workorder.created` | WO opened (incl. from insight) | wo id, asset, priority, source | M4 |
| `workorder.assigned` | Technician/vendor assigned | wo id, assignee | M4 |
| `workorder.status_changed` | WO transition | wo id, from, to | M4 |
| `workorder.completed` / `.closed` | WO done | wo id, resolution, failure_code, labor, parts | M4 |
| `pm.due` | PM schedule generated a WO | pm id, wo id, asset | M4 |
| `inventory.low_stock` / `stockout` | Stock ≤ reorder / = 0 | sku, warehouse, on_hand, reorder_point | M5 |
| `transfer.requested` | Transfer created | transfer id, asset, from, to, requester | M6 |
| `transfer.approved` / `.rejected` | Approval decision (SoD-checked) | transfer id, approver, decision | M6 |
| `custody.changed` | Check-in/out / custody handoff | asset id, from_holder, to_holder, ts | M6 |
| `reservation.created` / `.conflict` | Booking made / conflict | reservation id, asset, window | M6 |
| `alert.triggered` | Any alert fired | alert id, severity, source, correlation_id | M9 |
| `alert.acknowledged` / `.escalated` / `.resolved` | Alert lifecycle | alert id, actor, state | M9 |
| `ai.insight.created` | New ranked recommendation | insight id, type, asset, impact_usd, confidence | M3 |
| `ai.anomaly.detected` | Behavioral/telemetry anomaly | asset id, metric, score, drivers | M3 |
| `ai.risk.changed` | Composite risk band change | asset id, from_band, to_band, drivers | M3 |
| `report.completed` | Async report/export ready | report id, export id, url (signed, expiring) | M10 |
| `job.completed` / `job.failed` | Import/bulk/report job finished | job id, kind, counts, error_report_url? | M13 |
| `compliance.audit_finding` | Audit exception recorded | audit id, asset, finding, severity | M11 |
| `user.provisioned` / `user.deactivated` | SCIM/user lifecycle | user id, actor | M12 |
| `webhook.ping` | Manual test | timestamp | M13 |

Machine-readable **AsyncAPI** spec at `/v1/events/catalog` and in the Developer Portal.

---

## 13.7 Example request / response blocks

### 13.7.1 Create an asset (REST, idempotent)

```http
POST /v1/assets HTTP/2
Host: api.accessgenie.ai
Authorization: Bearer eyJhbGciOi…
Idempotency-Key: 6f1a2c9e-8b3d-4a11-9f22-0c7e5d1b4a90
AG-Scope: bld_01J8ZQ4C7K
Content-Type: application/json

{
  "class_id": "cls_vehicle_forklift",
  "name": "Toyota 8FGCU25 — Dock 3",
  "tag": "FL-1183",
  "status": "active",
  "location": { "zone_id": "zon_01J8ZQ7T2M" },
  "attributes": { "serial_no": "8FGCU25-77213", "capacity_kg": 2500, "fuel": "LPG" },
  "purchase": { "cost": { "amount": 32750.00, "currency": "USD" }, "date": "2026-06-30", "supplier_id": "sup_01J…" },
  "tracking": { "tag_id": "tag_01J8ZQ9V4P", "tech": "BLE" }
}
```

```http
HTTP/2 201 Created
Location: /v1/assets/ast_01J8ZR0X5N
ETag: "3"
RateLimit-Remaining: 118

{
  "data": {
    "id": "ast_01J8ZR0X5N",
    "tag": "FL-1183",
    "name": "Toyota 8FGCU25 — Dock 3",
    "status": "active",
    "class": { "id": "cls_vehicle_forklift", "name": "Forklift", "path": "Vehicle/Material Handling/Forklift" },
    "location": { "zone_id": "zon_01J8ZQ7T2M", "zone_name": "Dock 3", "confidence": null },
    "health": { "score": null, "band": "pending" },
    "version": 3,
    "created_at": "2026-07-23T14:05:00Z",
    "created_by": "usr_01J…",
    "links": { "self": "/v1/assets/ast_01J8ZR0X5N", "timeline": "/v1/assets/ast_01J8ZR0X5N/timeline" }
  }
}
```

### 13.7.2 Query live locations (REST snapshot; stream for continuous)

```http
GET /v1/locations/live?filter[class][eq]=cls_vehicle_forklift&filter[health][lt]=60
    &bbox=-122.42,37.77,-122.40,37.79&fields=asset_id,tag,lat,lng,zone,health.score&limit=100 HTTP/2
Authorization: Bearer eyJhbGciOi…
```

```json
{
  "data": [
    { "asset_id": "ast_01J8ZR0X5N", "tag": "FL-1183", "lat": 37.7801, "lng": -122.4102,
      "zone": "Dock 3", "confidence": 0.94, "health": { "score": 58 }, "last_seen": "2026-07-23T14:05:02Z" },
    { "asset_id": "ast_01J8ZP3B1A", "tag": "FL-0925", "lat": 37.7788, "lng": -122.4110,
      "zone": "Aisle 7", "confidence": 0.88, "health": { "score": 42 }, "last_seen": "2026-07-23T14:04:55Z" }
  ],
  "page": { "next_cursor": null, "has_more": false, "limit": 100 }
}
```

### 13.7.3 Create a Work Order from an AI insight

```http
POST /v1/work-orders/from-insight HTTP/2
Authorization: Bearer eyJhbGciOi…
Idempotency-Key: b21e7c44-1f0a-4c33-a0d9-2e6b8f9a1c02
Content-Type: application/json

{
  "insight_id": "ins_01J8ZS5M2R",
  "priority": "high",
  "assign_to": "usr_tech_01J…",
  "schedule": { "due_at": "2026-07-25T17:00:00Z" },
  "notes": "Predicted hydraulic seal failure — inspect + replace seal kit."
}
```

```json
{
  "data": {
    "id": "wo_01J8ZS8Q7T",
    "number": "WO-2026-04412",
    "type": "predictive",
    "status": "scheduled",
    "priority": "high",
    "asset": { "id": "ast_01J8ZR0X5N", "tag": "FL-1183" },
    "source": { "kind": "ai_insight", "insight_id": "ins_01J8ZS5M2R", "confidence": 0.82,
                "drivers": ["hydraulic_pressure_variance", "cycle_count_high"] },
    "assigned_to": "usr_tech_01J…",
    "sla_due_at": "2026-07-25T17:00:00Z",
    "created_at": "2026-07-23T14:06:11Z",
    "version": 1
  }
}
```

### 13.7.4 Webhook payload — `geofence.breached` (outbound)

```http
POST /your-endpoint HTTP/1.1
AG-Signature: t=1753279503,v1=6b8e…c1f9
AG-Event-Id: evt_01J9ZM2Q8R
Content-Type: application/json

{
  "id": "evt_01J9ZM2Q8R",
  "type": "geofence.breached",
  "api_version": "2026-07-01",
  "created_at": "2026-07-23T14:05:03Z",
  "tenant_id": "org_01J8Z…",
  "scope_node": "fac_01J8Z…",
  "idempotency_key": "evt_01J9ZM2Q8R",
  "data": {
    "geofence": { "id": "geo_01J8ZT…", "name": "Yard — Restricted After Hours" },
    "asset": { "id": "ast_01J8ZR0X5N", "tag": "FL-1183", "name": "Toyota 8FGCU25 — Dock 3" },
    "direction": "exit",
    "position": { "lat": 37.7772, "lng": -122.4131, "confidence": 0.91 },
    "detected_at": "2026-07-23T14:05:02Z",
    "alert_id": "alr_01J8ZT9K…",
    "severity": "high"
  }
}
```

---

## 13.8 Developer experience & platform

| Aspect | Provision |
|--------|-----------|
| **Specs** | OpenAPI 3.1 (REST) · GraphQL SDL · AsyncAPI 2.x (events) — versioned, downloadable, drive codegen |
| **Portal** | `/system/developer` (M13-180): interactive docs, try-it console, API-key & webhook management, event log, changelog, rate-limit dashboard |
| **SDKs** | Official TypeScript/Node, Python, Java, Go generated from OpenAPI; IoT gateway/adapter SDK (M13-174) separate |
| **Sandbox** | Isolated tenant + sample-data generator (M20-238) for integration testing at no cost |
| **iPaaS** | Zapier/Make/low-code connector (M13-181) + connector marketplace (M13-179) built entirely on the public API + webhooks |
| **Observability** | Every response carries `request_id` + `trace_id`; ingest/throughput/lag & rate-limit metrics in `/system/monitoring` (M19) |
| **Data residency** | Region-pinned API hosts; tenant home-region enforced end-to-end (→ [16](./16-security-compliance.md)) |

**Consistency guarantee:** the web app, mobile apps ([14](./14-mobile-apps.md)) and every 3rd-party integration
call this **same `/v1` surface** under the **same RBAC + scope + audit** enforcement — no privileged private API.

---

*Cross-references: services/gateway/event-bus/IoT pipeline → [11](./11-technical-architecture.md); entities, IDs,
event/telemetry tables → [12](./12-database-design.md); OAuth/OIDC, scopes, RBAC/ABAC, encryption, residency →
[16](./16-security-compliance.md); tracking technologies & sensor fusion → [09](./09-tracking-technologies.md);
AI method/explainability/governance → [08](./08-ai-intelligence.md).*

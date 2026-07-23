# 16. Security, Identity & Compliance

**Document type:** Product blueprint section — security architecture, identity model, authorization model & compliance posture
**Version:** 1.0 · **Status:** Planning (pre-rebuild) · **Owner:** Security & Compliance Architecture
**Covers deliverable:** 16 (Security) · **Module:** M16 (Security & Identity) · **Persona/RBAC source:** [02-personas.md §2.3](./02-personas.md)

> Access Genie AI sells into **regulated buyers** — hospitals, federal/state agencies, police, airports. For these
> buyers security is not a feature list, it is the *purchase criterion*. This section specifies identity, authorization,
> data protection, auditability, compliance-framework mapping, and threat posture as **product requirements**, not
> aspirations. Enforcement lives at the **data layer** (row/field-level), the **service layer** (policy engine), and the
> **edge** (device trust) — never in menu-hiding. Deep design of *where* these controls are implemented lives in
> [11-technical-architecture.md](./11-technical-architecture.md); the tables/columns that back them in
> [12-database-design.md](./12-database-design.md); the wire contracts (auth flows, scopes, headers) in
> [13-api-design.md](./13-api-design.md).

---

## 16.1 Security principles (the non-negotiables)

1. **Zero-trust, deny-by-default.** No implicit trust from network location, tenant, or prior auth. Every request is
   authenticated, authorized against policy, and scoped. Absence of a grant = denial.
2. **Enforce at the data layer.** Multi-tenant + scope isolation (`Org▸Region▸Facility▸Building▸Floor▸Zone▸Asset`) is a
   row-level predicate on every query and a field-level mask on every projection — not UI logic. (Master principle 3 → [00 §0.4](./00-master-blueprint.md).)
3. **Everything is audited, nothing is mutable.** Every security-relevant action emits an immutable, tamper-evident event
   onto the same event-sourced core the rest of the platform is built on. The audit log *is* a projection of the event stream.
4. **Least privilege + time-boxing.** Roles are minimal; elevated access is scoped, time-boxed, and expiring. Standing
   super-access does not exist — even Platform tier uses break-glass.
5. **Separation of duties by design.** Requester ≠ approver on any value-bearing or risk-bearing transition (transfer,
   disposal, write-off, role grant, break-glass).
6. **Explainable & governed AI is a security control.** Regulated buyers reject black-box scores; every AI decision that
   affects access, custody, or disposal is explainable and logged. (→ [08-ai-intelligence.md](./08-ai-intelligence.md) governance.)
7. **Compliance is a byproduct of architecture, not a bolt-on.** SOC 2 / ISO 27001 / HIPAA / GDPR controls map to concrete
   platform capabilities (§16.9), each with an evidence source.
8. **Secure defaults, hard to misconfigure.** MFA on by default, encryption non-optional, public sharing off by default,
   API keys least-scope, new roles empty.

---

## 16.2 Identity & Authentication (AuthN)

**Model:** Users authenticate to an **Identity** object; identities carry **credentials** (0..n factors) and bind to one or
more **tenant memberships**. Machines authenticate as **service accounts** via API keys or OAuth2 client-credentials. The
Identity Provider is pluggable per tenant.

### 16.2.1 Federation & SSO

| Capability | Detail | Tier / Notes |
|-----------|--------|--------------|
| **SAML 2.0 SSO** | SP-initiated + IdP-initiated; signed assertions; encrypted assertions optional; per-tenant metadata | ●●● Enterprise default |
| **OIDC / OAuth2** | Authorization Code + PKCE; discovery via `.well-known`; `id_token` + `access_token` | ●●● Enterprise default |
| **Enterprise IdPs** | Okta, Azure AD / Entra ID, Google Workspace, Ping, OneLogin, ADFS | Certified connectors → [13 §APIs](./13-api-design.md) |
| **Social IdPs** | Google, Microsoft personal — **gated per tenant** (off by default for regulated tenants) | ● Non-regulated only |
| **SCIM 2.0 provisioning** | Just-in-time + scheduled sync of users/groups; auto-deprovision on IdP disable (critical for offboarding) | ●● Tenant-configurable |
| **Group→Role mapping** | IdP group claims map to Access Genie roles + scopes via admin-defined rules | Deterministic, audited |
| **Home-realm discovery** | Email-domain → tenant/IdP routing at `/login`; forced-SSO per domain | Blocks password path when SSO enforced |
| **IdP failover** | Break-glass local admin retained when IdP is down (audited, alerting) | Availability control |

**Enforcement rule:** a regulated tenant may set **SSO-required** — local password auth is then disabled for all non-break-glass
identities, and SCIM deprovisioning is the single source of truth for offboarding (removes the #1 audit finding: orphaned accounts).

### 16.2.2 Credentials, MFA & passwordless

| Factor | Standard | Use |
|--------|----------|-----|
| **Passkeys / WebAuthn (FIDO2)** | Platform + roaming authenticators; phishing-resistant | **Preferred** factor; passwordless login |
| **TOTP** | RFC 6238 authenticator apps | Baseline MFA |
| **Push / number-matching** | Via IdP or native | Anti-fatigue (number match, not tap-approve) |
| **Hardware security keys** | YubiKey / FIDO2 | Required tier for Platform + Security Admin |
| **SMS/voice OTP** | Fallback only | **Discouraged**; disabled for regulated tenants (NIST SP 800-63B) |
| **Biometric** | Device-local (Face/Touch), never transmitted | Mobile app unlock (→ [14-mobile-apps.md](./14-mobile-apps.md)) |

- **MFA policy is risk-adaptive (ABAC-driven):** step-up challenge triggered by new device, new geo/IP, sensitive action
  (disposal, write-off, role grant, break-glass, bulk export), or elevated asset classification.
- **MFA is mandatory** for all Management/Admin/Platform tiers; **phishing-resistant MFA (WebAuthn/hardware)** mandatory for
  Platform tier and Security Admin (FedRAMP/gov alignment).
- **Recovery:** admin-mediated + backup codes; no self-service SMS reset for privileged roles.

### 16.2.3 Sessions, tokens & device trust

| Control | Specification |
|--------|---------------|
| **Access token** | Short-lived JWT (5–15 min), asymmetric-signed (RS256/ES256), rotating JWKS; claims: `sub, tenant, roles, scope, amr, device, exp` |
| **Refresh token** | Opaque, server-side revocable, rotating (reuse-detection revokes the family) |
| **Session** | Server-tracked session record enabling **remote revoke**, "sign out everywhere", and concurrent-session limits |
| **Idle & absolute timeouts** | Per-tenant policy (e.g., 15 min idle / 8 h absolute for clinical; stricter for gov) |
| **Device trust** | Device registration + posture signals (managed/unmanaged, OS, jailbreak/root) → policy inputs; unmanaged-device restrictions |
| **Continuous auth** | Re-evaluate session on risk change (geo-velocity, IP reputation); force step-up or terminate |
| **IP allow-list / network policy** | Per-tenant CIDR allow-lists; private-link/VPN-only tenants (M16 #209) |
| **Token binding** | Refresh bound to device + client; DPoP/sender-constraint on roadmap for high-assurance tenants |

### 16.2.4 OAuth2 / OIDC flows supported

| Flow | Consumer | Notes |
|------|----------|-------|
| **Authorization Code + PKCE** | Web SPA, mobile app | The only user-interactive flow; no implicit grant |
| **Client Credentials** | Service accounts, ERP/IoT integrations | Machine-to-machine; scoped clients |
| **Device Authorization Grant** | Kiosks, handheld scanners, shared-device sign-in | RFC 8628 |
| **Token Exchange** | Delegation / impersonation (support with consent) | RFC 8693; fully audited |
| **Refresh Token (rotating)** | Long-lived sessions | Reuse-detection |
| ~~Implicit~~ / ~~ROPC~~ | — | **Not supported** (deprecated, insecure) |

### 16.2.5 Machine identity — service accounts & API keys

- **API keys:** least-scope by construction (resource × action × scope), tenant-bound, prefix-identifiable, hashed at rest,
  rotation reminders, last-used telemetry, one-click revoke. Managed at `/admin/api-keys` (→ [00 §0.6-L](./00-master-blueprint.md)).
- **OAuth clients:** per-integration client-credential apps with explicit scopes, secret rotation, and rate-limit quotas
  (→ [13 §rate limits](./13-api-design.md)).
- **Kiosk/service accounts:** location- + action-scoped, time-boxed, cannot browse (persona: Kiosk/Service Account → [02 §2.2](./02-personas.md)).
- **Secrets never in code/logs;** integration credentials live in the secrets vault (§16.5).

---

## 16.3 Authorization (AuthZ) — RBAC + ABAC

The authorization model is the heart of M16 and the enforcement of every persona in [02-personas.md](./02-personas.md).

### 16.3.1 The primitive model

```
Permission  = Resource × Action              e.g.  asset:transfer,  workorder:close,  finance:read
Role        = { set of Permissions }         e.g.  "Facility Manager" = {asset:*, workorder:*, transfer:approve, ...}
Scope       = node in the scope tree         Org ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone ▸ Asset-class
Assignment  = Role × Scope × [time-box]      e.g.  (Technician, Facility=SFO-T2, until=2026-09-30)
```

- **Permission** is the atom: `resource:action` (e.g., `asset:read`, `asset:transfer`, `workorder:close`, `disposal:approve`,
  `finance:read`, `audit:export`, `user:manage`, `role:grant`, `break-glass:invoke`).
- **Role** = a named, versioned bundle of permissions. Ships with **system roles** (mapped to the 16+ personas) plus
  **custom roles** (M12 #160). Roles are additive; no role grants "deny" — denial is absence.
- **Assignment** binds `Role × Scope × time-box` to an identity. A user may hold many assignments; effective permission =
  union, filtered by the scope of each assignment. Time-boxed assignments auto-expire (vendors, temporary elevation).
- **Scope inheritance:** a grant at Facility cascades to its Buildings/Floors/Zones/Assets unless overridden by a narrower deny-scope.

### 16.3.2 ABAC overlays (context & attributes)

RBAC answers "*can this role do this action?*"; ABAC answers "*given the current context and the resource's attributes,
is it still allowed?*" Overlays are evaluated **after** RBAC grants and can only **further constrain** (never widen):

| Attribute source | Example rule |
|------------------|--------------|
| **Time** | "Disposal approvals only during business hours"; "after-hours asset movement requires Security ack" |
| **Location / network** | "Bulk export only from allow-listed CIDR"; "kiosk actions only from the kiosk's zone" |
| **Resource classification** | "`restricted` / `evidence` assets (police) hidden unless `clearance≥restricted`" |
| **Device posture** | "Financial write requires managed device"; "unmanaged device → read-only" |
| **Data sensitivity** | "PHI fields require `hipaa:phi` attribute + purpose-of-use" |
| **Relationship** | "Department Head sees only assets where `department = user.department`" |
| **Assignment state** | "Vendor WO access only while contract `active` and within asset scope" |

**Policy engine:** a central decision point (PDP) evaluates `(subject, action, resource, context) → permit/deny + obligations`
(e.g., obligation = "mask cost field", "require step-up MFA"). Enforcement points (PEP) sit in the API gateway, service layer,
and data layer. Policy is versioned, testable, and dry-runnable ("would this change lock anyone out?"). → [11](./11-technical-architecture.md).

### 16.3.3 Row-level & field-level security (data-layer enforcement)

This is principle 3 of the master blueprint, made concrete:

- **Row-level security (RLS):** every query is rewritten to append `WHERE tenant_id = :t AND scope_path <@ :allowed_scopes AND
  classification <= :clearance`. A user physically cannot retrieve rows outside their tenant + scope, even via a crafted API call,
  a report, an export, or the AI Copilot. RLS predicates are injected at the data-access layer, not trusted from the client.
- **Field-level security (FLS):** sensitive columns are masked per-role/attribute in the projection. Examples: **cost/book-value
  hidden from Technicians** (persona rule → [02 §2.3](./02-personas.md)); **PHI-linked fields** (patient-room, device-on-patient)
  masked unless `hipaa:phi`; **evidence chain-of-custody** fields visible only to cleared roles. Masking applies uniformly to UI,
  API, reports, exports, and AI context windows (the Copilot never "sees" what the user can't).
- **Consistency guarantee:** because RLS/FLS live at the data layer, **every** consumer (UI, REST/GraphQL, streaming, BI explorer,
  generative reports, mobile offline cache) inherits the same enforcement. There is no privileged read path.

### 16.3.4 Segregation of Duties (SoD)

Enforced as a hard constraint at the workflow layer, backed by immutable audit:

| Transition | Rule | Rationale |
|-----------|------|-----------|
| **Asset transfer** | `requester ≠ approver`; approver must hold `transfer:approve` in the destination scope | Prevents self-service asset diversion |
| **Disposal / decommission** | `requester ≠ approver`; Finance co-sign on book-value > threshold | Prevents asset "walk-off" via fake disposal |
| **Write-off / impairment** | `requester ≠ approver`; dual control above materiality threshold | Financial-fraud control (SOX-adjacent) |
| **Role grant / privilege change** | `grantor ≠ grantee`; Security Admin approval for privileged roles | Prevents privilege self-escalation |
| **Break-glass invoke** | requester ≠ the account being elevated where possible; Security Admin notified | Prevents silent super-access |
| **API key / integration creation** | Admin creates, Security Admin approves for cross-tenant/PHI scopes | Supply-chain control |

SoD conflicts are **detected at assignment time** (a toxic-combination checker warns when a single identity would hold both sides
of a controlled transition) and **enforced at execution time** (the second signature is required to commit).

### 16.3.5 Break-glass (emergency access)

For genuine emergencies (Platform incident, locked-out tenant admin, safety event):

1. Eligible principal (Platform tier, or a pre-designated tenant break-glass role) **invokes** break-glass with a **reason**
   and, where policy requires, a **second approver**.
2. A **time-boxed, narrowly-scoped** elevated grant is minted (e.g., 60 min, specific tenant/scope).
3. **Every action under break-glass is tagged, streamed to SIEM, and alerts the tenant Security Admin in real time** (persona
   rule → [02 §2.3](./02-personas.md)).
4. On expiry the grant self-revokes; a **post-hoc review** task is auto-created (evidence for SOC 2 CC6 / ISO A.5.18).
   Break-glass without a reason, without expiry, or without alerting **cannot exist** in the model.

### 16.3.6 Sample permission matrix

Illustrative slice — `✔` grant, `A` approve-only (SoD second-signature), `R` read-only, `M` masked fields, `—` no access.
Rows = system roles (personas → [02](./02-personas.md)); columns = representative `resource:action` permissions. Full matrix is
generated from the role registry and lives in `/admin/roles`.

| Role / Permission | `asset:read` | `asset:write` | `asset:transfer` | `transfer:approve` | `disposal:request` | `disposal:approve` | `finance:read` | `writeoff:approve` | `workorder:close` | `audit:read` | `audit:export` | `user:manage` | `role:grant` | `break-glass` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Super Admin** (Platform) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Org Admin** (Tenant) | ✔ | ✔ | ✔ | A | ✔ | A | ✔ | A | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| **Security Admin** | R | — | — | — | — | — | — | — | — | ✔ | ✔ | ✔ (access) | A | A |
| **Facility Manager** | ✔ | ✔ | ✔ | A | ✔ | — | R | — | ✔ | R | — | — | — | — |
| **Asset Manager** | ✔ | ✔ | ✔ | A | ✔ | A | R | — | R | R | — | — | — | — |
| **Maintenance Manager** | ✔ | ✔ (maint) | — | — | — | — | M | — | ✔ | R | — | — | — | — |
| **Inventory Manager** | ✔ | ✔ (parts) | — | — | — | — | R | — | R | R | — | — | — | — |
| **Technician** (Field) | R (assigned) | ✔ (WO fields) | — | — | — | — | M | — | ✔ (assigned) | — | — | — | — | — |
| **Security Officer** | R + live-track | — | — | — | — | — | — | — | — | R (custody) | — | — | — | — |
| **Finance / Controller** | R | — | — | — | — | A | ✔ | ✔ | — | R | R | — | — | — |
| **Executive / C-Suite** | R (aggregate) | — | — | — | — | — | R | — | — | R | — | — | — | — |
| **Compliance / Audit Officer** | R | — | — | — | — | — | R | — | R | ✔ | ✔ | — | — | — |
| **Vendor / Contractor** (ext.) | R (scoped WO) | ✔ (svc records) | — | — | — | — | — | — | ✔ (assigned) | — | — | — | — | — |
| **Guest / Viewer** (ext.) | R (shared, watermarked) | — | — | — | — | — | — | — | — | — | — | — | — | — |

> Reading notes: **SoD** shows as the `request` grant sitting on one role and the `approve` grant on a *different* role
> (e.g., Asset Manager requests disposal, Finance approves). **FLS** shows as `M` (Technician/Maintenance see masked cost).
> **Scope** narrows every ✔ (a Facility Manager's `asset:write` is only within their facility). **Time-box** is not shown but
> applies to Vendor and any temporary elevation.

---

## 16.4 Data protection

| Layer | Control | Specification |
|-------|---------|---------------|
| **In transit** | TLS 1.2+ (1.3 preferred) everywhere; mTLS service-to-service; HSTS; modern ciphers only | No plaintext internal hops; cert automation |
| **At rest** | AES-256 on all stores (DB, object storage, backups, search, telemetry, event store) | Transparent + envelope encryption |
| **Field-level / app-layer** | Envelope encryption for the most sensitive fields (PHI, evidence metadata, secrets) with per-tenant keys | Decrypt only in-service, behind FLS |
| **Key management (KMS)** | Cloud KMS with **per-tenant CMKs**; envelope keys (DEK wrapped by KEK); optional **BYOK/HYOK** for gov/health | Crypto-shredding = delete tenant key |
| **HSM** | FIPS 140-2/3 validated HSM backing KEKs for high-assurance/gov tenants | FedRAMP alignment |
| **Tokenization** | High-sensitivity identifiers tokenized; format-preserving where needed; token vault isolated | Reduces PHI/PII blast radius |
| **Key rotation** | Automated KEK rotation on schedule; DEK re-wrap without data re-encrypt; emergency rotation runbook | Rotation is auditable evidence |
| **Secrets management** | Central vault (dynamic secrets, short TTL, lease/renew), no secrets in code/env/logs; CI/CD secret scanning | §16.5 |
| **Data residency** | Tenant pinned to a region/geo; multi-region for HA/DR within residency boundary; **data-sovereignty** modes (EU-only, US-gov-only) | GDPR Art. 44+, FedRAMP |
| **Backup encryption** | Encrypted, access-controlled, tested-restore backups; immutable/WORM backup tier for ransomware resilience | DR → [11](./11-technical-architecture.md) |
| **Data minimization** | Collect only what's needed; PHI/PII flagged in the schema; masking + retention applied automatically | GDPR Art. 5 |

**Crypto-shredding** is the deletion primitive for regulated tenants: on right-to-erasure or tenant offboarding, destroy the
per-tenant key and the data is cryptographically irrecoverable — satisfying GDPR erasure even across immutable backups.

---

## 16.5 Secrets management (detail)

- **Central vault** with dynamic, short-TTL secrets (DB creds, integration tokens, signing keys); apps lease + auto-renew.
- **No long-lived secrets in source, images, env files, or logs;** pre-commit + CI secret scanning blocks leaks.
- **Signing keys** (JWT/JWKS) rotated with overlap; old keys retained for verification window only.
- **Integration credentials** (ERP, IdP, IoT gateways) stored encrypted, per-tenant, retrievable only by the owning service.
- **Break-glass secrets** (root/KEK access) split-knowledge / dual-control, HSM-guarded, and logged.

---

## 16.6 Auditability & security event logging

The audit log is a **projection of the immutable event stream** (master principle 1 → [00 §0.4](./00-master-blueprint.md)),
not a mutable table.

| Property | Specification |
|----------|---------------|
| **Immutability** | Append-only event store; audit records cannot be updated or deleted through any API |
| **Tamper-evidence** | Hash-chained records (each entry hashes the prior) + periodic anchored digests; verifiable integrity |
| **Coverage** | AuthN events, AuthZ decisions (permit/deny), data reads of sensitive fields, all writes, config/role changes, break-glass, exports, admin actions, integration calls |
| **Attribution** | Who (identity + service account), what (`resource:action`), when (trusted time), where (IP/device/geo), why (reason on privileged actions), result |
| **Retention** | Per-framework retention (e.g., HIPAA 6 yr, SOC 2 ≥1 yr, gov per contract); legal-hold overrides deletion |
| **SIEM export** | Streaming export (syslog/CEF/OCSF, webhook, or bucket) to Splunk/Sentinel/Chronicle/Elastic; near-real-time |
| **Security event logging** | Failed-auth spikes, impossible travel, privilege changes, anomalous export volume, break-glass → SIEM + alert rules (M9) |
| **User-facing audit** | Compliance Officer reads the immutable log + exports evidence packs (persona → [02 §2.2](./02-personas.md)); pages `/audit-log`, `/audit` (→ [00 §0.6-K](./00-master-blueprint.md)) |
| **AI decision logging** | Every AI score/recommendation that affects access, custody, or disposal is logged with model version + drivers (explainability → [08](./08-ai-intelligence.md)) |

Backing tables (audit, event, security-event) and their partitioning/indexing are specified in
[12-database-design.md](./12-database-design.md); the audit/export API surface in [13-api-design.md](./13-api-design.md).

---

## 16.7 Multi-tenancy & isolation (security view)

- **Isolation model:** logical isolation with hard tenant-scoping (`tenant_id` on every row + RLS predicate); **dedicated
  encryption keys per tenant**; option for **dedicated infrastructure / single-tenant deployment** for gov/high-assurance.
- **Cross-tenant access** exists only for Platform tier, only via break-glass, always audited + tenant-alerted.
- **Noisy-neighbor & abuse controls:** per-tenant rate limits, quotas, and isolation of ingest pipelines (→ [11](./11-technical-architecture.md)).
- **Tenant lifecycle:** provisioning (`/provision-tenant`), suspension, and offboarding with crypto-shredding + evidence export.

---

## 16.8 Compliance frameworks — what each requires of the platform

Each framework is mapped to concrete platform capabilities and the **evidence source** that proves the control at audit time.

| Framework | Applies to (buyer) | What it requires of Access Genie | Platform capability → evidence |
|-----------|--------------------|-----------------------------------|--------------------------------|
| **SOC 2 (Type II)** | All enterprise buyers | Trust Services Criteria: security, availability, confidentiality, processing integrity, privacy; continuous control operation | RBAC/ABAC (§16.3), audit log (§16.6), change mgmt, access reviews, DR (§16.4) → *evidence: immutable audit + access-review reports* |
| **ISO/IEC 27001 + 27017/27018** | Global, EU, gov | ISMS; Annex A controls (access control, crypto, logging, supplier, incident, BC); cloud + PII extensions | §16.2–16.6 map to A.5/A.8; risk register; SoD; key mgmt → *evidence: control mapping + audit* |
| **GDPR** | EU data subjects | Lawful basis, data-subject rights (access/erasure/portability/rectification), DPA, breach notice ≤72 h, residency, DPIA | **DSAR tooling** (§16.8.1), crypto-shredding erasure, EU residency, consent/purpose logging, retention → *evidence: DSAR logs + residency config* |
| **CCPA / CPRA** | California residents | Right to know/delete/opt-out/correct; do-not-sell; disclosure | Same DSAR tooling + opt-out flags + data-inventory → *evidence: request register* |
| **HIPAA (Security + Privacy)** | Healthcare / hospitals (biomed assets) | Safeguards for ePHI; access controls; **audit controls**; encryption; **6-yr retention**; **BAA**; minimum-necessary; breach rule | PHI field-tagging + FLS masking (§16.3.3), encryption + KMS (§16.4), 6-yr audit retention, purpose-of-use, BAA-ready → *evidence: PHI access log* |
| **The Joint Commission (biomed/EC)** | Hospitals (accreditation) | Medical-equipment mgmt: inventory, **PM/inspection compliance**, alert/recall (AEM), risk categorization, calibration records | Maintenance/PM engine (M4), calibration & certification expiry (M11 #151), recall mgmt (#152), audit-ready reports → *evidence: PM-compliance + calibration reports* |
| **FDA 21 CFR Part 11** | Regulated medical/lab | Electronic records/signatures: e-sig, audit trail, record integrity, access control | E-signature on controlled transitions (SoD §16.3.4), tamper-evident audit (§16.6), FLS → *evidence: signed-action log* |
| **FedRAMP / FISMA (NIST 800-53)** | US federal / gov | Authorization (ATO), control baselines (Mod/High), FIPS crypto, boundary, continuous monitoring, US-persons ops | HSM/FIPS (§16.4), gov-region isolation (§16.7), phishing-resistant MFA (§16.2.2), continuous audit/SIEM → *evidence: SSP + ConMon* |
| **CJIS** | Police / law enforcement | Criminal-justice info security: advanced auth, encryption, personnel screening, **evidence chain-of-custody**, audit | Evidence-classification + FLS (§16.3), immutable chain-of-custody (M6 #98), MFA, US-only ops → *evidence: custody + access log* |
| **NERC-CIP / IEC 62443** *(where applicable)* | Critical-infra / OT assets | OT asset inventory, access control, patch/config baseline, logging | Asset registry (M1), RBAC, config-change audit → *evidence: config-change log* |
| **PCI-DSS** *(if billing card data)* | Any (billing) | Cardholder-data protection | **Descoped** via tokenization/3rd-party processor; no PAN stored → *evidence: SAQ* |
| **WCAG 2.1 AA / Section 508** | Gov procurement | Accessibility of the product itself | Design system a11y (→ [15-design-system.md](./15-design-system.md)) → *evidence: VPAT* |

### 16.8.1 Data-subject & privacy tooling (GDPR/CCPA operational)

| Tool | Function |
|------|----------|
| **DSAR workflow** | Intake → identity-verify → locate all data (via the asset graph + PII index) → export/rectify/erase → log; SLA-tracked |
| **Right-to-erasure** | Crypto-shredding + tombstoning; propagates across projections, backups, search, and telemetry |
| **Data portability** | Machine-readable export of subject data |
| **Consent & purpose-of-use** | Recorded per data category; enforced by ABAC (purpose-binding) |
| **Retention & auto-deletion** | Per-category retention schedules (M11 #154) with automated purge; **legal-hold** freezes deletion |
| **Legal hold** | Placed by Compliance Officer; overrides retention/erasure; scoped + audited; release logged |
| **Data inventory / RoPA** | Living record of what PII/PHI is stored, where, why, and residency (Art. 30) |
| **Breach register** | Incident → assessment → ≤72 h notification workflow with regulator + subject templates |

---

## 16.9 SOC 2 / ISO control → capability quick-map

| Control domain | SOC 2 | ISO 27001 (Annex A) | Access Genie capability |
|----------------|-------|---------------------|--------------------------|
| Logical access | CC6.1–6.3 | A.5.15–5.18, A.8.2–8.5 | RBAC+ABAC, SSO/MFA, RLS/FLS, access reviews (§16.2–16.3) |
| Least privilege / SoD | CC6.3 | A.5.3, A.8.2 | Role model, time-box, SoD, break-glass (§16.3) |
| Cryptography | CC6.1 | A.8.24 | TLS/mTLS, AES-256, KMS/HSM, rotation (§16.4) |
| Logging & monitoring | CC7.1–7.3 | A.8.15–8.16 | Immutable tamper-evident audit + SIEM (§16.6) |
| Change management | CC8.1 | A.8.32 | Config-change audit, policy versioning, dry-run |
| Incident response | CC7.4–7.5 | A.5.24–5.28 | IR plan, security-event detection, breach workflow (§16.11) |
| Vendor/supplier | CC9.2 | A.5.19–5.23 | Integration approval, scoped API keys, sub-processor register |
| Availability / BC-DR | A1.1–1.3 | A.5.29–5.30, A.8.13–8.14 | Multi-region HA/DR, tested restore, RTO/RPO (→ [11](./11-technical-architecture.md)) |
| Privacy | P1–P8 / C1 | A.5.34, 27018 | DSAR tooling, residency, retention, minimization (§16.8.1) |

---

## 16.10 Threat model (top threats + mitigations)

Scoped to the assets a regulated buyer cares about: **the asset graph, PHI/evidence data, custody integrity, and admin access.**
STRIDE-informed, prioritized by impact × likelihood for this product.

| # | Threat (STRIDE) | Scenario | Primary mitigations |
|---|-----------------|----------|---------------------|
| T1 | **Cross-tenant data leak** (Info-disclosure) | Bug or crafted query returns another tenant's assets/PHI | Data-layer RLS on every query, per-tenant keys, isolation tests in CI, tenant-scoped tokens (§16.3.3, §16.7) |
| T2 | **Privilege escalation** (Elevation) | User self-grants a role or exploits scope inheritance | `role:grant` SoD (grantor≠grantee), deny-by-default, toxic-combo checker, policy dry-run (§16.3.4) |
| T3 | **Broken authorization / IDOR** (Elevation) | Direct object reference bypasses scope | Central PDP/PEP on every request, RLS defense-in-depth, no client-trusted scope (§16.3.2) |
| T4 | **Account takeover** (Spoofing) | Phished/credential-stuffed login | Phishing-resistant MFA/passkeys, risk-adaptive step-up, impossible-travel detection, rotating refresh + reuse-detection (§16.2) |
| T5 | **Insider asset diversion** (Tampering/Repudiation) | Employee fakes a transfer/disposal to steal an asset | SoD requester≠approver, immutable custody chain, break-glass alerts, audit-anomaly AI (§16.3.4, M6 #98) |
| T6 | **Audit-log tampering** (Repudiation) | Attacker edits logs to hide actions | Append-only + hash-chain + anchored digests + SIEM off-box copy (§16.6) |
| T7 | **Supply-chain / integration compromise** (multiple) | Malicious/over-scoped connector or leaked API key | Least-scope keys, integration approval SoD, secret scanning, dependency scanning/SBOM, key rotation (§16.2.5, §16.5) |
| T8 | **IoT/edge spoofing & injection** (Spoofing/Tampering) | Rogue gateway forges telemetry / location | Device auth + signed telemetry, gateway allow-list, anomaly detection on signal, edge trust (§16.2.3, → [09](./09-tracking-technologies.md)) |
| T9 | **Data exfiltration via export/BI/Copilot** (Info-disclosure) | Bulk export or AI prompt-injection leaks sensitive data | FLS applies to exports + AI context, export volume anomaly alerts, step-up on bulk export, DLP on egress (§16.3.3, §16.6) |
| T10 | **AI prompt injection / model abuse** (Tampering) | Malicious content steers Copilot to act outside scope | Copilot runs *as the user* under the same RLS/ABAC; tool-actions re-authorized; no privileged read path; action audit (§16.3.3, → [08](./08-ai-intelligence.md)) |
| T11 | **Ransomware / destructive attack** (DoS/Tampering) | Encryption or deletion of tenant data | Immutable/WORM backups, tested restore, least-privilege infra, event-sourced replay (§16.4, → [11](./11-technical-architecture.md)) |
| T12 | **DoS / resource abuse** (DoS) | Ingest flood or API abuse degrades tenants | Per-tenant rate limits/quotas, isolation, autoscale, WAF (§16.7) |
| T13 | **Session hijack / token theft** (Spoofing) | Stolen JWT/refresh reused | Short-lived + sender-constrained tokens, device binding, remote revoke, continuous auth (§16.2.3) |
| T14 | **Misconfiguration** (multiple) | Public share left on, role over-granted | Secure defaults, config audit, posture checks, access reviews, policy dry-run (§16.1, §16.9) |

---

## 16.11 Security operations posture — IR, pentest, vuln management

| Program | Commitment |
|---------|------------|
| **Incident response** | Documented IR plan (roles, severities, comms), 24×7 on-call, defined RTO/RPO; breach → ≤72 h GDPR / HIPAA-rule notification workflow; post-incident review + corrective actions logged as evidence |
| **Vulnerability management** | Continuous dependency/container/image scanning, SBOM, SLA'd remediation by severity (e.g., critical ≤ days), patch cadence, coordinated-disclosure channel |
| **Penetration testing** | Independent third-party pentest ≥ annually + on major release; findings tracked to closure; summary/attestation shareable under NDA |
| **Bug bounty / VDP** | Vulnerability-disclosure program (private → public as maturity allows) |
| **Secure SDLC** | Threat modeling per feature, security review gate (see repo `/security-review`), SAST/DAST in CI, secret scanning, mandatory code review, least-privilege CI/CD |
| **Continuous monitoring** | Security-event detection (§16.6) → SIEM → alerting (M9); anomaly detection on auth/export/config; ConMon for FedRAMP tenants |
| **Access reviews** | Periodic recertification of roles/assignments (esp. privileged + vendor); auto-expire stale grants; orphaned-account detection via SCIM |
| **Business continuity / DR** | Multi-region, tested restores, DR runbooks (M19 #231), immutable backups; RTO/RPO per tenant tier (→ [11](./11-technical-architecture.md)) |
| **Sub-processor governance** | Public sub-processor list, DPAs/BAAs, vendor risk assessment, change notification |
| **Compliance operations** | Trust center / audit-artifact portal; annual SOC 2 Type II + ISO 27001 surveillance; framework mapping kept current (§16.8) |

---

## 16.12 Cross-references & open items

- **Where enforced (services, gateway, data layer, edge):** [11-technical-architecture.md](./11-technical-architecture.md)
- **Backing tables (users, roles, assignments, audit, event, security-event, PII index):** [12-database-design.md](./12-database-design.md)
- **Wire contracts (auth flows, scopes, headers, DSAR/audit endpoints, webhooks):** [13-api-design.md](./13-api-design.md)
- **Personas & role definitions that this model enforces:** [02-personas.md](./02-personas.md)
- **AI governance & explainability (a security control here):** [08-ai-intelligence.md](./08-ai-intelligence.md)
- **Product features realizing this section:** [05-feature-matrix.md §M16](./05-feature-matrix.md) (#202–212) + M11 (#147–157)

**Open items for architecture review:** (1) BYOK/HYOK operational model for gov tenants; (2) DPoP vs. mTLS token-binding rollout
tier; (3) single-tenant deployment SKU boundary; (4) OCSF vs. CEF as the canonical SIEM schema; (5) e-signature scope for 21 CFR
Part 11 beyond disposal/write-off.

---

> **Section summary.** Access Genie AI treats security as architecture: zero-trust identity (SSO/OIDC/SAML, SCIM,
> phishing-resistant MFA/passkeys, device-trusted sessions, scoped service accounts) feeds a RBAC+ABAC authorization model whose
> `Permission = Resource × Action`, `Role = permissions`, `Assignment = Role × Scope × time-box` primitives are enforced at the
> **data layer** via row- and field-level security, with Segregation-of-Duties and audited break-glass on every value-bearing
> transition. Data is protected end-to-end (TLS/mTLS, AES-256, per-tenant KMS/HSM keys, tokenization, crypto-shredding, residency)
> and every action lands in an immutable, tamper-evident, SIEM-exported audit log. That single foundation maps directly onto
> SOC 2, ISO 27001, GDPR/CCPA, HIPAA, Joint Commission, and FedRAMP/CJIS requirements, and is backed by a STRIDE threat model plus
> a working IR / pentest / vuln-management program — so compliance is a *byproduct* of the platform, not a bolt-on.

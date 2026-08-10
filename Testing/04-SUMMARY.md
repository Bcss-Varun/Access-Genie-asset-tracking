# QA Summary — Asset Management

**Module:** Asset Management · **Cycle:** 1 · **Verdict:** Conditional Go
**Production Readiness Score: 82 / 100**

---

## 1. Testing summary

| | |
|---|---:|
| Test cases executed | **203** |
| Passed | **200** |
| Failed | **3** |
| Pass rate | **98.5%** |
| Blocked / not run | 0 |
| Automated | 203 (100%) |

### By type

| Type | Passed | Total | Rate |
|---|---:|---:|---:|
| Functional | 52 | 52 | 100% |
| Validation | 37 | 37 | 100% |
| Security | 20 | 20 | 100% |
| Database | 16 | 16 | 100% |
| UI | 15 | 15 | 100% |
| UX | 14 | 14 | 100% |
| Boundary | 12 | 12 | 100% |
| Accessibility | 9 | 10 | 90% |
| API | 9 | 9 | 100% |
| Negative | 8 | 9 | 89% |
| Responsive | 5 | 5 | 100% |
| Performance | 2 | 3 | 67% |
| Permission | 1 | 1 | 100% |
| Cross-browser | 0 | 0 | **not executed** |

### What was exercised

Create · read · update · retire · bulk update · list · filter · multi-value
filter · free-text and partial-serial search · pagination · sort · stats
aggregation · asset-360 profile · registry rendering · search/filter UI · URL
view sharing · no-results state · responsive layout at three breakpoints ·
route guarding · stored-XSS rendering · NoSQL injection (body and query) ·
regex-metacharacter safety · JWT forgery · payload size limits · partial-update
data-loss regression · serial-number uniqueness and empty-serial coexistence ·
health-status derivation.

**Add Asset (rebuilt flow), cycle 2** — the field catalogue · scope-derived site
defaults · the blank, template and clone forms · every validation rule including
the custodian/employee-ID pair and the maintenance toggle · template authoring
and its five rejection rules · archival and the archived-template refusal ·
clone prefill and identity clearing · **minted asset tags and tag IDs**,
including that a client-supplied value cannot override one · **the template's
category winning over anything the caller posts** · the eight-step wizard in a
real browser: per-step rendering, rail error markers, the review cards, the
issued-numbers card, keyboard labelling, and both breakpoints.

### What was not

Cross-browser (only Chromium available) · Bulk Import · Label Printing ·
Asset 360 deep tabs · the six non-admin roles · concurrent editing · volume
behaviour beyond a handful of assets. See [00-TEST-PLAN.md §7](00-TEST-PLAN.md).

---

## 2. Bug summary

| Bug ID | Severity | Priority | Area | Status |
|---|---|---|---|---|
| BUG-001 | High | P1 | API error handling — malformed JSON → 500 | Open |
| BUG-002 | High | P1 | Workspace load ~5 s (pool starvation + gate design) | Open |
| BUG-003 | Medium | P2 | Sortable headers not keyboard operable | Open |

| Severity | Count |
|---|---:|
| Critical | **0** |
| High | 2 |
| Medium | 1 |
| Low | 0 |

---

## 3. Critical issues

**None.** No defect was found that loses data, corrupts a record, exposes data
across an authorisation boundary, or prevents the module being used.

This is the headline result, and it was tested for rather than assumed. The four
highest-risk behaviours all hold:

- **Partial updates do not destroy unsent data** (`AM-API-020`). A `PATCH`
  carrying one field leaves serial, price, health and name intact. This is a
  guarded regression — the failure mode it prevents previously wiped fields
  across 20 update schemas.
- **Serial-number integrity is correct in both directions** (`AM-API-012/013`,
  `AM-DB-001`). An asset created without a serial stores `""` and no invented
  placeholder; any number of assets may have none; two may not share a real one.
- **Authorisation holds at the edge** (`AM-SEC-001…004`, `AM-PERM-001`).
  Unauthenticated reads and writes are refused; forged and malformed JWTs are
  refused; clearing the session stops the registry rendering data.
- **Injection is contained** (`AM-SEC-005/006/013`, `AM-SEC-020`). NoSQL
  operators are rejected in the body and treated as literal text in `?q=`; regex
  metacharacters are escaped; a stored `<img onerror>` in an asset name renders
  as text and does not execute.

---

## 4. Medium issues

**BUG-003 — sortable column headers are mouse-only.** Four headers sort on click
but cannot be focused or operated by keyboard. WCAG 2.1 A failure (2.1.1, 4.1.2).
Contained to one component and fixable in a few lines; the rest of the registry's
accessibility passed.

---

## 5. Low issues

None open. Two observations that did not warrant a bug:

- **Login email input is `type="text"`** (`login-email`) with
  `autoComplete="email"`. On mobile this raises the general keyboard rather than
  the email keyboard. Cosmetic, and possibly deliberate to allow username login.
- **The signed-out login error reads "Please enter your email and password"**
  even when only one field is missing. Observed while building the harness;
  outside this module's scope.

---

## 6. Recommendations

### Before release

1. **Fix BUG-001.** One branch in `error.ts`. Until then every client typo pages
   whoever owns the 5xx alert.
2. **Restore `MONGODB_MAX_POOL_SIZE=10`** once Atlas is stable, then re-measure
   BUG-002. The evidence says this alone recovers most of the five seconds.
3. **Fix BUG-003.** Small, and it is a legal-exposure class of defect for
   enterprise buyers who require a VPAT.

### Before scaling

4. **Take the registry off `/dataset`.** It loads and filters the *entire estate*
   client-side. This is the single largest untested risk in the module: it works
   at 1 asset and at 20, and nothing here says what it does at 10,000. Use the
   paginated `GET /assets` that already exists.
5. **Test the role matrix.** Only super_admin was exercised. `DELETE /assets/:id`
   additionally requires the `admin` grant — worth proving a `technician` is
   actually refused, since that is the one place this module's authorisation
   differs from the rest.
6. **Add optimistic locking or last-write-wins semantics.** Two users editing one
   asset is untested and the update path reads-then-writes.

### Process

7. **Wire these suites into CI.** They are ~99 assertions that run unattended in
   about four minutes and clean up after themselves.
8. **Add a real cross-browser stage.** No case here says anything about Firefox
   or Safari, and the summary should not be read as if it does.
9. **Book a manual accessibility pass.** Automated checks reach perhaps a third
   of WCAG; contrast, focus order and screen-reader semantics need a human.
10. **Complete cycle 2** — Bulk Import and Label Printing are 1,464 lines of
    untested user-facing code.

---

## 7. Production readiness score

**82 / 100 — Conditional Go**

| Dimension | Score | Basis |
|---|---:|---|
| Functional correctness | 19/20 | Every CRUD, filter, search, bulk and aggregation case passed |
| Data integrity | 20/20 | Partial-update, serial-uniqueness and derivation all verified |
| Security | 20/20 | Authn, authz, injection, XSS, payload limits — 20/20 cases |
| Validation & error handling | 13/15 | Schema validation is exemplary; malformed JSON mishandled |
| Performance | 6/15 | 5 s to interactive; client-side registry unproven at volume |
| Accessibility | 7/10 | Strong except keyboard-inoperable sort headers |
| Test coverage breadth | −3 | Import, labels, roles, cross-browser, volume all unexercised |

### What the score means

The **core is genuinely production quality.** The validation layer is the
strongest part of this codebase — 20/20 boundary and validation cases passed
first time, including every off-by-one at min and max. Security is clean across
20 cases. The data-integrity guarantees that matter in an EAM system — you do not
silently lose a field, you do not get a fabricated serial, you cannot duplicate a
real one — are correct and now permanently guarded by tests.

The score is held down by two things, and it is worth being precise about which
is which. **Performance is mostly a configuration wound**, not bad code: a
one-connection pool serialising a 55-query fan-out. Raising it should move this
dimension sharply. **Coverage breadth is the real gap** — Bulk Import and Label
Printing are substantial user-facing surfaces with no test evidence at all, and a
readiness score cannot speak for code nobody exercised.

### Conditions on the Go

1. BUG-001 fixed.
2. `MONGODB_MAX_POOL_SIZE` restored and BUG-002 re-measured below 3 s.
3. BUG-003 fixed, or accepted in writing with a remediation date.
4. Cycle 2 completed before Bulk Import or Label Printing is exposed to users.

Meet 1–3 and this module is ready for a controlled production release. Item 4
gates only those two features, not the registry.

---

*Cycle 1 · 99 automated cases · Evidence: `Testing/evidence/` · Reproduce:
`Testing/README.md`*

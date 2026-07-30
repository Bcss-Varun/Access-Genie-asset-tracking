# 22. Navigation & Information Architecture — the Assets pillar

**Document type:** Information architecture — navigation model, object model, module disposition (pre-UI)
**Version:** 1.0 · **Status:** Proposed · **Owner:** Product / UX Architecture
**Audience:** Product, Design, Engineering (FE + API), Data
**Scope:** The `Passport & Lifecycle` sidebar section and every object it exposes.

> **Finding that settles half the brief.** `Groups & Fleets` and `Kits & Bundles` are not two modules. They are
> **one array rendered through two filters** — `mockGroups` carries `type: 'Group' | 'Fleet' | 'Kit'`, `/groups`
> filters it to `Group|Fleet`, and `/kits` filters *the same array* to `Kit`. The data model merged these three
> concepts long ago; only the navigation still pretends they are separate.
>
> **Finding that overturns the other half.** `/financials`, `/depreciation` and `/lifecycle` all read the entire
> `mockAssets` population. They are **portfolio** views, not per-asset views. Moving them "into Asset 360" would
> not simplify them — it would delete them, and take the Finance Controller's entire job with them.
>
> Net recommendation: **9 sidebar items → 3**, with nothing removed from the product.

Related: [03-information-architecture.md](./03-information-architecture.md) (tenancy tree, current sidebar) ·
[10-asset-360-profile.md](./10-asset-360-profile.md) (object page) · [21-asset-onboarding-ux.md](./21-asset-onboarding-ux.md)
(registration flow — the Add Asset / Bulk Import merge is already built) · [02-personas.md](./02-personas.md) (roles).

---

## 22.0 TL;DR

| Today (9 items) | Verdict | Destination |
|---|---|---|
| IT Asset Registry | **Keep** — renamed | `Registry` |
| Add Asset | **Registry action** | `+ Add Asset ▾` menu — *shipped* |
| Bulk Import | **Registry action** | same menu, as a source — *shipped* |
| Digital Asset Passports | **Merge + rename** | `Asset Classes & Templates` (configuration) |
| Groups & Fleets | **Merge** | `Collections` |
| Kits & Bundles | **Merge — split three ways** | Templates · Registry · Asset 360 ▸ Components |
| Lifecycle Management | **Keep** — re-scoped | `Lifecycle & Disposal` (portfolio only) |
| Asset Financials | **Move out of Assets** | Finance & Analytics (portfolio) + Asset 360 (per-asset) |
| Depreciation Schedules | **Merge** | into Asset Financials |

**Resulting Assets pillar — three items:**

```
ASSETS
├── Registry              every asset, every saved view, every create path
├── Collections           groups + fleets, unified
└── Lifecycle & Disposal  the EOL / retirement / replacement pipeline
```

Two things relocate rather than disappear (`Asset Classes & Templates` → Administration; `Asset Financials` →
Finance & Analytics), because they belong to a different *mode* and a different *persona* — not because they
are unimportant.

---

## 22.1 Your design principle, sharpened

> *"Will users open this page every day? If NO, it probably should not exist in the sidebar."*

The instinct is right — the sidebar is not a table of contents — but applied literally this test misfires in two
directions, and both matter at enterprise scale.

**It deletes things that must exist.** A Finance Controller opens depreciation at quarter close. Four times a
year. It is not daily, and it is not optional — when they need it, it must be *findable without asking someone*.
Frequency conflates "rare" with "unimportant". The correct treatment for rare-but-real is **demotion** — overflow
menu, command palette, Administration — never deletion.

**It keeps things that shouldn't be there.** A Technician opens work orders every day. That does not make
"Work Orders" belong in the Finance Controller's sidebar. Frequency is meaningless without asking *whose*.

So replace one question with four. An item earns a sidebar row only by passing **all four**.

| # | Test | Question | Fails → |
|---|---|---|---|
| **T1** | **Scope** | Does it answer a question about *many* assets, or *one*? | One → **Asset 360** |
| **T2** | **Grammar** | Is it a noun (a place you go) or a verb (a thing you do)? | Verb → **action / menu / ⌘K** |
| **T3** | **Cadence × role** | Would *this role* open it at least weekly? | No → **overflow, ⌘K, or a saved view** |
| **T4** | **Mode** | Is it operating the business, or configuring the system? | Configuring → **Administration** |

**T1 is the one with teeth**, because it is mechanically checkable: *any route carrying an `[id]` parameter must
not have a sidebar entry*. You can lint for it. T2 catches `Add Asset` and `Bulk Import`. T3 is your original
question, corrected for role. T4 catches templates, classes and monitoring profiles — configuration masquerading
as operations, which is how sidebars quietly double in size.

---

## 22.2 Item-by-item verdict

Using your five categories. Reasoning is per-item; the object-model arguments behind Collections and Kits are in
§22.4.

### 1. IT Asset Registry → ① **Keep in Sidebar** (renamed `Registry`)

Passes all four tests: population-scoped, a noun, opened daily by nearly every operational role, operational not
configurational. This is the anchor of the pillar and should be the section's landing page.

**But the name is a defect.** "IT Asset Registry" is wrong the moment a hospital tracks infusion pumps, an airport
tracks ground support equipment, or a police department tracks body cameras. You are building a multi-vertical
platform and the primary nav item names a single vertical. Rename to **Registry**.

The registry also absorbs the onboarding queues as saved views — `Setup incomplete`, `Awaiting approval`,
`Untracked`, `Warranty expiring`, `Unassigned`, `Needs attention` — which is why "Asset Onboarding" does not need
to be a nav item (§22.3).

### 2. Add Asset → ④ **Convert into Registry Action** *(already shipped)*

Fails **T2** outright: it is a verb. A verb in a tree of nouns is the exact symptom your brief is describing.
It now lives as `+ Add Asset ▾` on the Registry, and in the global create menu.

### 3. Bulk Import → ④ **Convert into Registry Action** *(already shipped)*

Your instinct is correct and I would go further: this is the clearest duplication in the pillar. See §22.3.

### 4. Digital Asset Passports → ② **Merge** into `Asset Classes & Templates`, and relocate to Administration

This item has a **label/content mismatch** worth naming. The nav promises "Digital Asset Passports"; the page
behind it is titled *"Categories & Taxonomy — asset classes and their per-class dynamic attribute schemas"*. It is
a class-and-attribute schema editor.

Two consequences:

- **"Digital Asset Passport" is not a page.** It is what Asset 360 *is* — the asset's own record. Keeping it as a
  nav row promises a destination that cannot exist without an asset selected (fails **T1**). Drop it as a nav label
  and keep it as product vocabulary for Asset 360.
- **The real page is configuration** (fails **T4**): classes, attribute schemas, activation policies, monitoring
  profiles, depreciation defaults, PM defaults, document checklists, kit templates. An Asset Administrator sets
  this up during rollout and revisits it monthly.

Rename to **Asset Classes & Templates** and move it under Administration.

> **Do not mistake relocation for demotion.** This is the highest-leverage page in the entire product — it is what
> lets registration be a six-field form instead of a forty-field form, and it is where mandatory-ness, monitoring
> and depreciation are decided once for ten thousand assets ([21 §21.2 P2](./21-asset-onboarding-ux.md)). It is
> being moved because it is *configuration*, not because it is minor. Configuration that lives in operational nav
> gets edited casually; configuration in Administration gets edited deliberately, which is what you want for an
> object with that much blast radius.

### 5. Groups & Fleets → ② **Merge** into `Collections`

Fleet is not a different object from a group. It is a group with an **owner, shared operating KPIs, and fungible
members**. That is three attributes, not a second module — and your schema already agrees, since both are rows in
`mockGroups` distinguished by a string. Full argument in §22.4.2.

### 6. Kits & Bundles → ② **Merge**, then **split three ways**

The hardest item, and the one where "merge or keep?" is the wrong question — because "kit" is currently doing the
work of three genuinely different relationships. Full argument in §22.4.3. Summary:

| Real relationship | Example | Home |
|---|---|---|
| **Assembly** (permanent, parent–child) | Battery inside a UPS; spindle in a CNC | **Asset 360 ▸ Components** |
| **Kit template** (definition of what a kit contains) | "Body-cam kit = camera + dock + 2 batteries + mount" | **Asset Classes & Templates** |
| **Kit instance** (an assembled, issuable unit) | Body-cam kit #14, issued to Officer Rao | **Registry** (an asset of class *Kit*) + **Check-in/out** |

`/kits` as it stands is a filtered view of `/groups`. It should not survive as a nav row under any of the three
readings.

### 7. Lifecycle Management → ① **Keep in Sidebar**, re-scoped and renamed `Lifecycle & Disposal`

**This is where I disagree with you.** Your brief proposes Lifecycle becomes an Asset 360 tab. Half of that is
right and half would remove a job function.

- **Per-asset lifecycle is already in Asset 360** — as the *status chip* in the header (`Draft · Active ·
  Maintenance · Retired`) and as *events on the Timeline*. It does not need a tab; a "Lifecycle" tab would be a
  third rendering of data already in two places (§22.6).
- **Portfolio lifecycle is a different job.** The page reads the whole population and renders a stage board: how
  many assets are approaching end-of-life, what is in the disposal pipeline, what needs replacement budget next
  quarter. An Asset Manager and a Finance Controller live in that view. It is not reachable from any single
  asset — by definition, since its entire value is the cross-asset shape.

So: delete the *idea* of a Lifecycle tab, keep the *page*, rename it to **Lifecycle & Disposal** so it reads as a
pipeline rather than a settings screen. Passes T1 (population), T2 (noun), T3 (weekly for Asset Manager), T4
(operational).

### 8. Asset Financials → ③ + **relocate**: per-asset into Asset 360, portfolio into Finance & Analytics

Same correction as Lifecycle, more sharply. The page computes book value, TCO and category breakdown **across the
whole estate**. The person who opens it is a Finance Controller who never opens a single asset.

- **Per-asset** (purchase, warranty, contracts, depreciation schedule, book value, TCO) → **Asset 360 ▸ Commercial**.
  Correct, and already built.
- **Portfolio** (book value by facility, depreciation run, capex forecast, TCO league table) → stays a page, but
  **not in the Assets pillar**. It belongs where its persona already works: Finance & Analytics.

Leaving it under Assets forces the Controller to navigate through an operational asset section to reach a finance
report — and forces every Technician to scroll past a finance row they will never open (fails T3 for most roles).

### 9. Depreciation Schedules → ② **Merge** into Asset Financials

Depreciation is not a peer of financials; it is a *section* of it. Two rows for one subject is the same
duplication pattern as Groups/Kits. The per-asset schedule is already on Asset 360 ▸ Commercial; the portfolio
schedule is a tab or section within Asset Financials.

---

## 22.3 "Add Asset" vs "Bulk Import" — you are right, and the reason generalises

Your instinct: *both create assets, so why two sidebar items?* Correct. The deeper reason is worth stating because
it prevents the next twenty navigation arguments.

**Bulk Import is not a different capability. It is the same capability at a different cardinality.** Nothing about
the *goal* changes between one asset and five thousand — same object, same validation, same result. Only the input
method differs. Input method is not an information-architecture concept; it is a parameter.

Your proposed menu is right:

```
+ Add Asset ▾
   New asset                    ← blank, or from a class template
   From purchase order / GRN    ← ~60–80% of real enterprise arrivals
   From scan (mobile/handheld)  ← the dock path
   Clone an existing asset
   ─────────────────────────
   Bulk import (CSV / Excel)
   Import from ERP / API
   Adopt an unknown tag         ← a tag reading with no asset behind it
```

Two refinements to what you sketched:

1. **Order by real-world volume, not by novelty.** Purchase-order arrivals dominate in every enterprise deployment;
   blank forms are the fallback, not the headline. The menu should open with the path most people need.
2. **"Import from ERP" is not a menu item in the same sense as the others** — it is a standing background sync
   configured once in Administration, not something a user picks each time. Keep it in the menu as a *discovery
   affordance* (people look for it there) but have it route to the integration settings rather than open a wizard.

**The generalisable rule:** *a capability that differs only in cardinality, input format, or source is a parameter
of one destination — never a second destination.* Applied consistently this also collapses "Export" vs "Bulk
Export", "Print label" vs "Batch print labels", "Transfer" vs "Bulk transfer".

**On "Asset Onboarding" as a nav item** (from your example tree): same failure — it is a verb. But there *is* a
legitimate noun hiding in it: the **onboarding queue**, the population of drafts awaiting setup. That is a
population view, so it belongs where population views live — as a saved view on the Registry (`Setup incomplete`,
`Awaiting approval`), which is already built and already counting.

---

## 22.4 Groups, Fleets and Kits — one question, three different answers

### 22.4.1 Four relationships hiding behind three names

The confusion is not naming. It is that four structurally different relationships have been flattened into one
`memberIds` array. They differ on properties that determine *everything* downstream — where maintenance history
attaches, what can be checked out, what a count means, whether an asset can belong to two at once.

| Relationship | Membership | Physical? | Overlap allowed? | Has own lifecycle? | Maintenance rolls up? |
|---|---|---|---|---|---|
| **Collection** — a saved set | Static list *or* live rule | No | Yes, many | No | No |
| **Fleet** — a managed, fungible pool | Static or rule | No | Usually one primary | No (but has a budget owner) | Reported, not rolled up |
| **Kit** — an issuable assembled unit | Explicit, with a template | Yes | No — a unit is in one kit | **Yes** — assembled, issued, returned, retired | Per-component, plus kit completeness |
| **Assembly** — parent/child components | Explicit, permanent | Yes | No | Inherits parent's | **Yes — rolls up to parent** |

Once separated this way, the answers fall out:

- **Collection and Fleet differ only by attributes** → merge them.
- **Kit and Assembly are genuinely different objects** → but neither is a navigation module.

### 22.4.2 Collections — merge Groups and Fleets

**Recommendation:** one object, `Collection`, with two orthogonal attributes.

| Attribute | Values | What it changes |
|---|---|---|
| **Membership** | `Static` (hand-picked) · `Dynamic` (saved query) | Whether membership is maintained by hand or by rule |
| **Mode** | `Reference` · `Operational` | `Operational` turns on the fleet apparatus: an owner, a cost centre, availability/utilisation KPIs, and a substitution pool |

A "fleet" is simply a Collection with `Mode = Operational`. That is the entire difference, and it is real: what
makes a fleet a fleet is not that it contains vehicles — it is that the members are **fungible** (any unit can
substitute for another), **pooled** (managed as capacity, not individually), and **accountable to one budget owner**.

**Dynamic membership is the more important of the two attributes and is missing today.** At 100,000 assets nobody
hand-maintains a list. `All laptops > 3 years old in Bengaluru HQ` must be a rule that stays true as assets are
registered and retired. A static list of 4,000 IDs is stale the day it is saved. Hand-picked membership should be
the exception, used for genuinely arbitrary sets.

> **"Should Fleets only exist for transportation industries?" — No, and gating on vertical would be a mistake.**
>
> A hospital's 200 infusion pumps satisfy every operational criterion of a fleet: fungible (any pump serves any
> bed), pooled (managed as capacity — "do we have enough pumps for the ICU surge?"), utilisation-managed, and
> owned by one budget holder. So do an airport's ground-support tugs, a retailer's handheld scanners, a
> manufacturer's forklifts, and a police department's patrol cars.
>
> "Fleet" is an **operating model**, not an industry. Restricting the concept to transport would deny hospitals and
> airports the exact capability they need most, while adding a vertical branch to your navigation — the beginning
> of twenty vertical forks nobody can maintain (§22.9).
>
> **Gate the vocabulary, not the capability.** Ship one Collections module; let a tenant's terminology pack render
> `Mode = Operational` as "Fleet" for a logistics tenant and "Pool" for a hospital. One code path, one nav row,
> local language.

**"Should Groups become Collections?"** Yes. "Group" is the weakest word in enterprise software — it collides with
user groups, permission groups and device groups, all of which exist elsewhere in this product. **Collections** is
unambiguous and is what the industry converged on.

### 22.4.3 Kits — split three ways, and none of them is a nav row

Your four examples are helpfully *not* the same thing, which is the whole point:

| Your example | What it actually is | Why |
|---|---|---|
| **Server rack** | **Assembly** | Permanent. The server does not leave the rack and come back. Maintenance and cost roll up to the rack. |
| **Hospital equipment kit** (code cart) | **Kit** | Assembled to a template, issued, consumed, restocked, re-sealed. Has completeness state and an expiry check. |
| **Police body-camera kit** | **Kit** | Issued per officer per shift, returned, docked, re-issued. Custody is the primary lifecycle. |
| **Airport security kit** (screening lane) | **Assembly**, usually | X-ray + WTMD + ETD + trays are installed as a lane and stay. If lanes are struck and rebuilt seasonally, it is a Kit. |

So the deciding question is not "is it a bundle?" — it is **"does it come apart and go back together?"**

- **No, it is built and stays built** → **Assembly.** Parent–child on the asset itself. Lives in **Asset 360 ▸
  Components**. Not a module, because it is a property of one asset (fails T1).
- **Yes, it is assembled/issued/returned repeatedly** → **Kit.** Which needs two objects:
  - **Kit template** — the definition ("a body-cam kit contains 1 camera, 1 dock, 2 batteries, 1 mount"). This is
    configuration (fails T4) → **Asset Classes & Templates**.
  - **Kit instance** — an actual assembled kit with an ID, a location, a custodian and a completeness state. This
    is **an asset** — of class *Kit* — and therefore already has a home: the **Registry**, and its own **Asset 360**
    page. Its day-to-day life is issuance, which belongs to **Check-in / Check-out**.

**Why kit instances must be assets rather than a parallel object type:** the moment a kit has a location, a
custodian, a value, a maintenance history and a retirement date, you have rebuilt the asset model. Building a
second one guarantees two search indexes, two audit trails, two permission models and two things to reconcile. A
kit is not *like* an asset; it *is* an asset whose components are other assets.

**Completeness is the feature that justifies the concept at all.** "Kit 14 is missing a battery" is the question
kits exist to answer — and it is a first-class state, exactly parallel to the readiness gates in the onboarding
model ([21 §21.3.6](./21-asset-onboarding-ux.md)). Same mechanism, same UI grammar, different subject.

### 22.4.4 The model across your verticals

One model; the vocabulary changes, the structure does not.

| Vertical | Collection (reference) | Collection (operational / "fleet") | Kit (issued) | Assembly (built) |
|---|---|---|---|---|
| **Hospital** | Assets under grant #4471 | Infusion pumps — ICU pool | Code cart · surgical tray | MRI + chiller + UPS |
| **Police** | Evidence-room assets | Patrol vehicles | Body-cam kit · patrol loadout | Vehicle + radio + ALPR |
| **Airport** | Assets inside the security perimeter | Ground support equipment | Seasonal screening lane | Jet bridge + controller |
| **Manufacturing** | Line 3 assets | Forklifts | Changeover tooling set | CNC + spindle + controller |
| **Retail** | Store 214 assets | Handheld scanners | New-store opening kit | POS + printer + cash drawer |
| **Smart city** | Ward 7 assets *(dynamic rule)* | Street-light controllers | Field survey kit | Pole + luminaire + sensor + meter |
| **Government** | Assets on budget line 22-B | Pool vehicles | Inspector field kit | Building plant |

Note the smart-city row: `Ward 7 assets` must be a **dynamic** collection — a rule over the location tree — because
ward boundaries and asset counts change constantly. That is the case that proves static membership alone is
insufficient.

---

## 22.5 Financials, Depreciation and Lifecycle — where the brief is half right

You proposed all three become Asset 360 tabs. The correction in one line:

> **These are not modules in the wrong place. They are single-scope views and population-scope views wearing one
> name.** Move the single-scope half into Asset 360. Relocate the population half to the persona that opens it.
> Deleting the population half would remove the Finance Controller's and Asset Manager's entire workspace.

| Subject | Single-asset view → | Population view → | Who opens the population view |
|---|---|---|---|
| **Financials** | Asset 360 ▸ Commercial | **Finance & Analytics** ▸ Asset Financials | Finance Controller, Executive |
| **Depreciation** | Asset 360 ▸ Commercial (schedule) | merged *into* Asset Financials | Finance Controller |
| **Lifecycle** | Header status chip + Timeline (**no tab**) | **Assets** ▸ Lifecycle & Disposal | Asset Manager, Finance |
| **Warranty** | Asset 360 ▸ Commercial (**no separate tab**) | Registry saved view `Warranty expiring` | Asset Administrator |
| **Documents** | Asset 360 ▸ Documents | — | — |
| **Tracking** | Asset 360 ▸ Tracking | Real-Time Tracking pillar (already correct) | Facility Manager, Security |

The test that generates this table every time: **ask who opens it and what they have selected.** If the answer is
"an asset", it is a tab. If the answer is "a facility, a quarter, or the whole estate", it is a page — and the page
belongs in the section that persona lives in, which is frequently *not* Assets.

---

## 22.6 Asset 360 — the target architecture

Your proposed tabs: `Overview · Tracking · Documents · Warranty · Financial · Lifecycle · Maintenance · History ·
AI Insights · Settings`.

### Direct verdicts

| Proposed | Verdict | Reasoning |
|---|---|---|
| Overview | **Keep — and make it the destination, not the doorway** | If most users leave Overview to find things, the tab set has failed. It should surface the top items from every other projection with drill-in, so the common visit ends here. |
| Tracking | **Keep** | Live position, trail, tag bindings, geofences, telemetry. |
| Documents | **Keep** | Users genuinely hunt for "the manual". Earns its own tab. |
| **Warranty** | **Cut as a tab → merge into Commercial** | Six fields and two derived values. A tab implies a workspace; this is a section. |
| Financial | **Keep, renamed `Commercial`** | Purchase · warranty · contracts/AMC · depreciation · TCO · lease terms. |
| **Lifecycle** | **Cut entirely** | Third rendering of data already in the header chip (current state) and the Timeline (transitions). Adds a tab, adds no information. |
| Maintenance | **Keep** | Work orders, PM, inspections, parts, downtime, MTBF/MTTR. |
| **History** | **Keep, renamed `Timeline`, absorbing Activity and Audit** | History/Activity/Audit are one event stream with three facets. Users never learn which holds what. One tab, faceted (Changes · Movement · People · Work · System · AI); the immutable audit view is a facet plus an evidence export. |
| AI Insights | **Keep, renamed `Intelligence`** | Health drivers, risk, RUL, anomalies, recommendations, explainability. AI must *also* appear inline in other tabs — a tab answers "what does AI think?", inline chips answer "should I trust this reading?" |
| **Settings** | **Cut as a tab → header action** | "Settings" on an object page means Edit. A tab that is really a form is a navigation trap; it also reads as though the asset has configuration separate from its data, which it does not. |

### Missing from your list

| Add | Why it has no other home |
|---|---|
| **Ownership & Custody** | Custodian, custody chain, check-in/out log, transfers, reservations. Currently homeless; `/custody/[assetId]` exists as a route but is exposed as a top-level nav section. |
| **Components** | Parent/child, BOM, kit membership, spare-part compatibility. This is where Assemblies land (§22.4.3) — without it, maintenance history attaches to the wrong object. |
| **Monitoring** | Active rules, inherited profile plus any deviation, alert history, suppression windows. Needed for the monitoring model to have a per-asset face. |
| **Compliance** | Certifications, calibration, regulatory obligations, inspection evidence. Mandatory for hospitals, airports, government. |

### The resulting set — and the rule that keeps it usable

Eleven canonical projections; **at most seven render for any given role**, the rest behind `⋯ More`:

```
Overview · Tracking · Maintenance · Commercial · Documents · Ownership & Custody · Timeline
⋯ Intelligence · Monitoring · Components · Compliance
```

**Role-adaptive defaults** — this is what prevents "too many tabs" without deleting capability:

| Role | Default tabs |
|---|---|
| Technician (mobile) | Overview · Maintenance · Documents · Timeline |
| Facility Manager | Overview · Tracking · Maintenance · Ownership · Monitoring · Timeline |
| Asset Administrator | all eleven |
| Finance / Controller | Overview · Commercial · Documents · Timeline |
| Compliance / Auditor | Overview · Compliance · Documents · Timeline |

**Persistent across all tabs** (never a tab): identity header, status/health/risk/criticality chips, live location
with freshness, custodian, and the action bar (`Create WO · Locate · Transfer · Check-in/out · Print label · Edit · ⋯`).

**Never tabs — always actions or drawers:** Edit · Transfer · Retire · Clone · Merge · Split · Replace tag ·
Print label · Reserve · Add component · Share. Each opens over the current tab so context is never lost.

> **Asset 360 must not appear in the sidebar.** Your example tree lists it as a nav row. It has no meaning without
> an asset selected — clicking it would land on "which asset?", which is the Registry. Asset 360 is a *destination*
> reached from the Registry, search, ⌘K, a scan, an alert or an AI insight. It is the most important page in the
> product and it correctly has zero nav rows.

---

## 22.7 The recommended navigation

### The Assets pillar

```
ASSETS
├── Registry                  ← landing page for the section
│     views: All · Setup incomplete · Awaiting approval · Untracked ·
│            Warranty expiring · Unassigned · Needs attention · «saved»
│     actions: + Add Asset ▾ (new · from PO · scan · clone · bulk · ERP · adopt tag)
│              Export · Print labels · Bulk edit · Bulk transfer
│
├── Collections               ← Groups + Fleets, unified
│     membership: Static | Dynamic (rule)
│     mode:       Reference | Operational (owner + KPIs + substitution pool)
│
└── Lifecycle & Disposal      ← portfolio pipeline: EOL, replacement, retirement, disposal certificates
```

### What moves out of Assets, and where

```
ADMINISTRATION
└── Asset Classes & Templates
      ├── Classes & attribute schemas
      ├── Activation policies        (which gates each class requires)
      ├── Monitoring profiles        (authored once, inherited by thousands)
      ├── Depreciation & PM defaults
      └── Kit templates              (what a kit contains)

FINANCE & ANALYTICS
└── Asset Financials
      ├── Book value & TCO
      ├── Depreciation schedules & runs
      └── CapEx forecasting
```

### Everything that used to be a nav row, and where it went

| Was | Now reached by |
|---|---|
| Add Asset | `+ Add Asset ▾` on Registry · global create menu · ⌘K "add asset" |
| Bulk Import | same menu → *Bulk import (CSV/Excel)* |
| Digital Asset Passports | the concept **is** Asset 360; the page is Administration ▸ Asset Classes & Templates |
| Groups & Fleets | Assets ▸ Collections (fleets = `Mode: Operational`) |
| Kits & Bundles | definitions → Templates · instances → Registry (class *Kit*) · assemblies → Asset 360 ▸ Components · issuance → Check-in/out |
| Asset Financials | per-asset → Asset 360 ▸ Commercial · portfolio → Finance & Analytics |
| Depreciation Schedules | merged into Asset Financials · per-asset schedule on Asset 360 ▸ Commercial |
| Lifecycle Management | portfolio → Assets ▸ Lifecycle & Disposal · per-asset → header chip + Timeline |

**Nothing was removed from the product.** Every capability has a named destination. Nine rows became three because
seven of them were verbs, duplicates, configuration, or single-asset views — not because anything was cut.

### Two cross-cutting mechanisms the reduction depends on

The sidebar can only shrink this far if two things absorb the load. Both must ship alongside.

1. **A global create menu (`+ Create`).** Verbs need a home. Add asset · Import assets · Register from PO · Assign
   tag · Create work order · Transfer · Start cycle count · Reserve. This is the direct answer to "think in tasks,
   not modules" at the navigation layer — the sidebar keeps doing what it is good at (browsing nouns) and a task
   launcher handles doing.
2. **Command palette (⌘K) as a first-class destination, not a shortcut.** Every page, every saved view, every
   template, every action, and asset search by name/serial/tag. Once the sidebar is three rows, ⌘K is load-bearing:
   it is how the Finance Controller reaches depreciation without learning where it moved.

---

## 22.8 Why this is better — and what it costs

**Why better:**

1. **Every remaining row passes all four tests.** The structure is now derivable rather than negotiated — when
   someone proposes row four, there is a test to apply instead of an argument to have.
2. **The duplication is provably gone.** Groups/Kits were one array behind two rows; Add Asset/Bulk Import were one
   capability at two cardinalities. Both are now single destinations.
3. **Scope is legible.** Sidebar = many assets. Asset 360 = one asset. A new engineer can place a new page
   correctly without asking, and the rule is lintable (`no [id] route in nav-config`).
4. **Personas stop colliding.** The Technician's sidebar no longer carries depreciation; the Controller no longer
   navigates an operations section to reach a finance report.
5. **Configuration is separated from operation.** Class templates, activation policies and monitoring profiles have
   enormous blast radius. Administration is where objects with blast radius belong.
6. **The object model gets simpler, not just the nav.** Collapsing Group/Fleet into Collection-with-attributes and
   splitting Kit into template/instance/assembly removes an entire class of "which one do I use?" questions —
   from users *and* from the API.

**What it costs — state these before committing:**

| Cost | Mitigation |
|---|---|
| Deep links break (`/groups`, `/kits`, `/financials`, `/depreciation`) | Permanent redirects; keep old paths resolving for at least one major version |
| Muscle memory — people will hunt for moved pages | ⌘K must find them by *old* name too (alias `"fleets" → Collections`, `"depreciation" → Asset Financials`) |
| ⌘K becomes load-bearing | It has to be genuinely good before the sidebar shrinks. Ship the palette first, then cut the rows |
| Kit split needs a data migration | Today's `type: 'Kit'` rows must be classified as template vs instance vs assembly — needs a human pass, not a script |
| Collections needs `mode` + dynamic membership | Real backend work: rule evaluation, materialisation, and cache invalidation as assets change |
| "Fleet" disappears as a word for tenants who use it daily | Terminology packs — the label is per-tenant, the object is not |

---

## 22.9 Scaling the navigation

### By asset count

| Scale | What navigation is actually *for* | Consequence |
|---|---|---|
| **~100** | Browsing. The registry list is comprehensible in full. | Collections are optional — consider hiding until a threshold is crossed. Seed 5–10 classes so templates pay off on day one. |
| **~1,000** | Filtering. Nobody scrolls the list. | Saved views become the primary entry point. Dynamic collections start to matter. |
| **~10,000** | Querying. The list is a result set, never a browse. | Server-side facets and pagination; collections must be rule-based; exception queues become the daily workspace. |
| **~100,000** | **Search *is* the navigation.** | The sidebar's job shrinks to launching queues. Registry becomes a query surface with facets. The most-used control in the product is ⌘K, not the sidebar. Nav rows added at this scale cost more than they return. |

The through-line: **as scale grows, navigation converts from a tree into a query interface.** A structure that adds
rows to cope with growth is scaling the wrong dimension — the answer to more assets is better *views*, not more
*places*.

### By tenancy

- **Multi-facility.** Handled by the **scope chip** (Org ▸ Region ▸ Facility ▸ Building ▸ Zone), never by nav
  duplication. There must never be a "Facility A Assets" row. Scope is a filter dimension, orthogonal to structure.
- **Multi-organisation.** The navigation must not fork per tenant. Vary three things only: which *modules* are
  licensed (role/module gating, already in place), the *terminology pack*, and the *class library* (global → org →
  facility overrides). Structure stays identical, which is what makes support, docs and training tractable.

### By vertical — the important one

**Do not build vertical-specific navigation.** A "Fleets" row for logistics tenants, a "Kits" row for hospitals and
an "Evidence" row for police is the first step toward twenty forks of the IA, twenty test matrices and twenty sets
of documentation. It is the most expensive mistake available in this decision.

Adapt three layers instead, none of which is structure:

| Layer | Varies by vertical | Example |
|---|---|---|
| **Class library** | Yes — heavily | Hospital ships *Infusion Pump*, *Ventilator*, *Imaging*; airport ships *GSE*, *Screening*, *Jet Bridge* |
| **Terminology pack** | Yes | `Collection (Operational)` renders as "Fleet" (logistics), "Pool" (hospital), "Motor Pool" (government) |
| **Default views & policies** | Yes | Police defaults to a custody-first registry view; manufacturing defaults to utilisation |
| **Navigation structure** | **No — identical everywhere** | Registry · Collections · Lifecycle & Disposal |

This is how Maximo ships industry solutions on one core and how ServiceNow ships domain separation without forking
the platform. One structure, configured — never twenty structures, maintained.

---

## 22.10 Migration map

| Old route | Disposition | Redirect |
|---|---|---|
| `/assets` | Keep — becomes the section landing page | — |
| `/assets/new` | Keep as a route; **remove from sidebar** | — |
| `/assets/import` | Keep as a route; **remove from sidebar** | — |
| `/groups` | → `/collections` | 301 |
| `/kits` | → `/collections?type=kit` initially; instances migrate into `/assets` after the data pass | 301 |
| `/taxonomy` | → `/admin/classes` (renamed *Asset Classes & Templates*) | 301 |
| `/lifecycle` | Keep; rename to *Lifecycle & Disposal* | — |
| `/financials` | → Finance & Analytics section (route may stay) | nav move only |
| `/depreciation` | → merged into Asset Financials | 301 |
| `/custody/[assetId]` | → Asset 360 ▸ Ownership tab | 301 to `/assets/[id]?tab=ownership` |
| `/movement/[assetId]` | → Asset 360 ▸ Tracking tab | 301 to `/assets/[id]?tab=tracking` |

**Sequencing — do not do this in one release:**

1. **Ship ⌘K aliases and the `+ Create` menu.** Everything must be findable by name *before* rows disappear.
2. **Merge Collections** (Groups + Fleets). Lowest risk; the data model already agrees.
3. **Relocate Financials + Depreciation** to Finance & Analytics.
4. **Rename and relocate Templates** to Administration.
5. **Split Kits** — needs the data classification pass; do it last and do it with a human in the loop.

---

## 22.11 Open decisions

These change the architecture and are yours to make.

1. **Does `Collections` need `mode` on day one, or can fleets ship as a saved attribute later?** Shipping the merge
   without operational KPIs is honest and fast; shipping it with them is the full promise. Recommendation: merge
   now with `mode` in the schema, KPIs in the following release.
2. **Where does Finance & Analytics live** — a new top-level section, or inside the existing Analytics & Reporting
   pillar? Recommendation: inside Analytics & Reporting, as its own group. A new top-level row for one page fails
   T3 for every non-finance role.
3. **Do kit instances become assets of class *Kit*, or a subtype flag on the asset?** Recommendation: a class,
   because everything else in the platform already keys off class (activation policy, monitoring, PM, documents).
4. **Terminology packs — v1 or later?** They are what makes one nav survive seven verticals. If they slip, the
   pressure to fork the nav returns immediately. Recommendation: v1, even if only three terms ship.
5. **Threshold for hiding Collections on small tenants.** Recommendation: show once a tenant exceeds ~250 assets or
   creates its first collection; before that it is a row with nothing behind it.
6. **Does `Registry` keep the word "Asset"?** Inside an Assets section, "Asset Registry" is redundant
   (`Assets ▸ Asset Registry`). Recommendation: `Registry` in the sidebar, "Asset Registry" as the page title.

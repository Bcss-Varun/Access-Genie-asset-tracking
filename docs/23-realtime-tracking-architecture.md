# 23. Real-Time Tracking — product architecture & functional specification

**Document type:** Product architecture — information architecture, feature hierarchy, workflows, functional spec
**Version:** 1.0 · **Status:** Built · **Owner:** Product / UX Architecture
**Audience:** Design (wireframes), Engineering (FE + API), Data, Security, Support
**Scope:** The `Real-Time Tracking` pillar and every object it exposes — `/tracking/*`, the retired nine routes, and the Digital Twin.

> **Finding that settles the brief.** The nine screens were not nine capabilities. `Live Asset Map`,
> `Movement History`, `Geofencing Zones` and `Zone Heatmaps` were **four renderings of one question** —
> *where is it, and should it be there?* — differing only in whether you drew the answer as a dot, a line, a
> rectangle or a colour ramp. Four rows for one question is how a sidebar reaches nine rows without adding a
> single new job.
>
> **Finding that overturns the naming.** Six of the nine rows named a **technology or a screen**, not a job:
> `Tag & Device Registry`, `Gateways & Readers`, `Telemetry Explorer`, `Zone Heatmaps`, `Digital Twin`,
> `Geofencing Zones`. An operator does not wake up wanting to explore telemetry. They wake up wanting to find
> a laptop, count a room, or answer why a cage says 206 when the book says 210. **The new five rows are named
> after those sentences**, and every retired row survives as a tab inside the module that owns the sentence.
>
> Net result: **9 sidebar rows → 5**, two screens deleted outright, one relocated to another pillar, one demoted
> from a destination to a visualisation.

Related: [22-navigation-ia.md](./22-navigation-ia.md) (the same treatment applied to the Assets pillar — this
document follows its four tests and its voice) · [09-tracking-technologies.md](./09-tracking-technologies.md)
(what the radios actually do, which is exactly what this UI hides) ·
[10-asset-360-profile.md](./10-asset-360-profile.md) (the per-asset Tracking tab) ·
[21-asset-onboarding-ux.md](./21-asset-onboarding-ux.md) (tag binding at registration) ·
[02-personas.md](./02-personas.md) and `src/lib/rbac.ts` (roles).

---

## 23.0 TL;DR

### The disposition of the nine

| Today (9 rows) | Verdict | Destination |
|---|---|---|
| **Live Asset Map** | **Merge** | `Locate Assets ▸ Live Map` — the default tab |
| **Geofencing Zones** | **Merge + rename** | `Locate Assets ▸ Zones & Rules` — policies said out loud, not geofence primitives |
| **Movement History** | **Merge + rename** | `Locate Assets ▸ Movement & Replay` — with a scrubber, because history is a film, not a table |
| **Tag & Device Registry** | **Merge** | `Tracking Infrastructure ▸ Device estate` |
| **Gateways & Readers** | **Merge** | `Tracking Infrastructure ▸ Topology` — the blast-radius view |
| **Zone Heatmaps** | **Remove** | Nothing. Its two real questions are answered better by `Infrastructure ▸ Coverage` and `Inventory Control ▸ Overview` |
| **Digital Twin** | **Relocate — demoted** | `/tracking/twin/[facility]`, launched from the Dashboard and from every facility map. No sidebar row |
| **Telemetry Explorer** | **Remove** | Nothing. An engineering console with no business question attached; its useful half is the per-device **Diagnostics** panel |
| **Label & Tag Printing** | **Relocate** | `Asset Management ▸ /assets/labels`, plus `Print Label` on the Asset 360 overflow menu |

### The resulting pillar — five rows

```
REAL-TIME TRACKING                                    badge: open tracking alerts
├── Dashboard                  /tracking               command center · seven questions, seven hand-offs
├── Locate Assets              /tracking/locate        map · list · movement & replay · zones & rules
├── Inventory Control          /tracking/inventory     overview · rooms & racks · check-in/out · audits · exceptions
├── Alerts & Incidents         /tracking/alerts        action queue · incidents · rules & escalation · analytics
└── Tracking Infrastructure    /tracking/infrastructure fleet health · device estate · topology · coverage · firmware

    Digital Twin               /tracking/twin/[facility]   ← launched, never listed
```

Five rows, twenty-one tabs. **Nothing that a user could do before is gone** except the two screens that
answered no question — and both of those had their answers absorbed, not deleted.

### The three sentences that generated this structure

1. **A module is a job, not a screen.** `Locate Assets` is one page with four tabs because *where is it* and
   *where has it been* are the same investigation, thirty seconds apart. Making them two sidebar rows forces the
   operator to walk back up the tree to change their mind.
2. **The technology is never the workflow.** RFID, BLE, UWB, GPS, QR and LoRaWAN appear on exactly one screen
   in this pillar, as a muted column and a spec line. Everywhere else the platform speaks `LocationPrecision`
   — *Precise · Room · Site · Last scan* — because that is the fact that changes what a person does next (§23.1.1).
3. **Nothing is a dead end.** Every KPI is a filter, every filter is a link, every alert carries a recommended
   next step and a button that performs it. A number you cannot act on is a number that should not be on the screen.

---

## 23.1 Design principles

Doc 22 established four tests for earning a sidebar row. They still apply, and every one of the five survivors
passes all four:

| # | Test | Question | Applied here |
|---|---|---|---|
| **T1** | **Scope** | Many objects, or one? | All five are population views. The per-asset view is `Asset 360 ▸ Tracking`; the per-facility view is the Twin — neither has a row |
| **T2** | **Grammar** | Noun or verb? | All five are nouns. `Locate`, `Verify`, `Check out`, `Report missing`, `Start an audit` are the Dashboard's quick actions — verbs in a task bar, not rows in a tree |
| **T3** | **Cadence × role** | Would *this* role open it weekly? | Facility Manager: all five, daily. Security Officer: Dashboard + Locate + Alerts, daily. Technician: Dashboard + Infrastructure, daily |
| **T4** | **Mode** | Operating, or configuring? | Four operate. `Tracking Infrastructure` configures — and is deliberately kept in-pillar (§23.1.2) because its failures are *operational* failures with a stopwatch running |

Seven further principles are specific to this pillar.

### 23.1.1 Technology transparency — the rule the whole pillar is built on

> **RFID, BLE, UWB, GPS, QR and LoRaWAN are implementation details. The UI exposes `LocationPrecision`.**

The old navigation asked users to think in radios. `Tag & Device Registry` mixed passive labels with
battery-powered beacons; `Gateways & Readers` split one estate along a hardware boundary; `Telemetry Explorer`
exposed raw packets. Every one of those asks the operator to learn the plumbing before they can find a laptop.

The replacement is a single translation, applied once, at the edge of the platform:

| Underlying fix | Rendered as | What it tells the operator | Chip |
|---|---|---|---|
| UWB ranging against an anchor cluster | **Precise** | "Walk to it — ±30 cm" | 3 bars, emerald |
| BLE / RFID read inside a zone | **Room** | "It is in this room; look around" | 2 bars, primary |
| GPS / in-transit bridge | **Site** | "It is at this site, or between sites" | 1 bar, slate |
| QR or handheld scan | **Last scan** | "Nobody has heard it since; this is a memory, not a fix" | 1 bar, slate |

Every precision chip carries a **confidence percentage** alongside it. This is the pair that actually drives
behaviour: `Room-level, 88%` means go look; `Last scan, 22%` means open an investigation. A radio name would
tell the operator neither.

**Three consequences the designer must hold onto:**

1. **There is no technology filter on any operational screen.** Not on Locate, not on Inventory Control, not on
   Alerts. Filters are `Presence`, `Custody`, `Criticality`, `Misplaced only` — outcomes, not mechanisms.
2. **Tag identifiers are stripped of their prefix in operational views.** `RFID-E28011606991` renders as
   `Tag E28011606991` in the exception queue. Somebody working a variance queue does not pick a radio.
3. **Audit method is expressed as a way of working, not a technology.** `Automatic` (the room counts itself),
   `Assisted` (a walk-through with a handheld), `Manual` (eyes and a clipboard). The same count could be RFID,
   BLE or barcode; the operator's decision is *do I need to send a person*, and that is what the control asks.

### 23.1.2 Why Tracking Infrastructure is the one justified exception

`Tracking Infrastructure` is the only screen in the product where the radio is named. Three reasons, and they
are the only three that would ever justify it:

- **The person on this screen is buying, siting and replacing hardware.** A technician dispatched to a dead
  reader needs to know it speaks RFID, because that determines the spare in the van, the antenna alignment and
  the firmware branch. Hiding it would be dishonesty dressed as simplicity.
- **Even here, role leads and technology follows.** The device estate is filtered by `Role`
  (Tag · Reader · Gateway · Anchor · Scan Station · Sensor) — what the device *does*. `Technology` is a muted
  column with a tooltip that says *"Recorded for the administrator only — nobody outside this screen picks a
  radio"*, and on the provisioning form it is the second-to-last field, captioned *"Recorded for the installer.
  It never reaches an operator's screen."*
- **It is not a filter, not a tab, and not a grouping.** You cannot slice the estate by radio. You can slice it
  by role, state, battery and search — the four things that decide whether a person gets in a van.

**Why it stays in the operations pillar rather than moving to Administration** (which T4 would otherwise
demand): a reader that stops reporting is not a configuration problem, it is an **outage with a stopwatch**.
`DEV-RD-09` going dark makes 210 assets unverifiable and blocks a signed audit. That belongs one click from the
alert queue that raised it, not three clicks into Administration. Configuration with blast radius belongs in
Administration; *infrastructure whose failure is an incident* belongs next to the incident.

### 23.1.3 One module is one page with tabs

An operator stays inside `Locate Assets` and changes what they are looking at. They do not walk back up the
sidebar to change tools. Tab state lives in the URL (`?tab=`), so a tab is shareable, bookmarkable and
back-button-safe — which is what makes it a legitimate substitute for the nine routes it replaced.

### 23.1.4 Every number is a filter; nothing is a dead end

Every KPI tile on all five modules is a button. `Missing: 3` does not display three — it *applies* `state=Missing`
to the list beneath it and switches to that tab. Every alert carries a `recommendation` sentence and a
`recommendationAction` button. Every coverage gap carries a remediation sentence with a price. Every blind spot
routes to the team that can close it.

The test: **if a widget's only affordance is "read me", it is a report, and reports go in Analytics.**

### 23.1.5 Scope is a chip, never a row

One `ScopePicker` (`All facilities` · Hyderabad Central Warehouse · Bengaluru HQ · Chennai Data Center) sits in
every module header. It persists across modules through `sessionStorage` (`ag-tracking-scope`) and travels in
the URL as `?facility=`, so `Dashboard → Locate Assets` keeps you in the same building. There is never a
"Hyderabad Assets" nav row. Scope is a dimension orthogonal to structure.

**One honest exception:** a floor-plan needs one building. With `All facilities` selected, the map tabs show a
facility switch and say so in the subtitle — *"Showing Hyderabad WH — a plan needs one building, so pick the
one you are working."* Better to state the constraint than to render three plans nobody asked for.

### 23.1.6 The screen never lies back to you

Every action mutates visible state immediately. Report an asset missing and its row turns `Missing` with a
`Reported` chip, the `Missing` KPI increments, and the map marker changes colour — before any toast appears.
Acknowledge an alert and it leaves the `New` bucket, the state counts re-compute, and the "cleared this
session" sub-label appears on the `Open` tile. A toast that says "done" over a screen that still says
"not done" is the fastest way to lose an operator's trust.

### 23.1.7 One KPI function, one truth

Every headline number in the pillar comes from a single derivation (`trackingKpis(scope)`). The Dashboard's
`Inventory accuracy` tile and Inventory Control's `Inventory accuracy` tile are the *same call*, so they cannot
disagree. Where a module computes something locally — because the user has changed state in-session — it shows
both: `Open: 14 · 3 cleared this session`.

**Definitional decisions baked into that function, which the designer should treat as fixed vocabulary:**

| Term | Definition | Why |
|---|---|---|
| **Not seen** | `Stale` + `Offline`, folded into one number | The distinction is *how long we have been deaf*, not whether anything is wrong. Two numbers invites two interpretations |
| **Misplaced** | `zone ≠ homeZone` **and** `custody = In Place` | A checked-out laptop on a desk is not misplaced. Custody is the licence to be elsewhere |
| **Inventory accuracy** | `(detected − unexpected) ÷ expected` across rooms in scope | Detecting the wrong thing is not accuracy. Unexpected reads must not inflate the score |
| **Today** | Since 00:00 IST, anchored to one clock | "Today" means one thing across every module |
| **Overdue** | Only **open** work can be overdue | A closed alert *missed its target*; it is not *late* |

---

## 23.2 Item-by-item verdict

### 1. Live Asset Map → ② **Merge** into `Locate Assets ▸ Live Map`

The strongest of the nine and still not a row of its own. A map is an *answer format*, not a destination: it
answers "where is it" beautifully and "which forty of them are stale" terribly. Paired with a list in the same
page — hover a row, the marker lights; click a marker, the row scrolls into view — it becomes the front half of
one investigation instead of a screen you bounce out of.

**What it gained by merging:** the same filter set as the list (presence · custody · misplaced), a results rail
that stays legible when 96 markers overlap, and a shared asset drawer. **What it lost:** nothing.

### 2. Geofencing Zones → ② **Merge + rename** → `Locate Assets ▸ Zones & Rules`

Two defects, one merge fixes both.

- **The name described a primitive, not a policy.** "Geofence" is a polygon with a trigger. A facilities manager
  does not say "exit trigger on polygon GF-5"; they say **"nothing leaves without a check-out."** The zone table
  now renders `ZonePolicy` as that sentence, with the geofence machinery invisible:

  | Policy | Rendered as |
  |---|---|
  | `Open` | Anything may come and go |
  | `Authorised only` | Approved people and assets only |
  | `No exit without check-out` | Nothing leaves without a check-out |
  | `Dwell limit` | Flag anything parked too long |
  | `After-hours watch` | Watched outside working hours |

- **A zone is meaningless without what is inside it.** As a standalone screen it listed rectangles. As a tab
  beside the map and the list, clicking a zone opens a drawer showing its policy, expected vs detected, coverage,
  violations, and *the assets currently resolving to it* — with a jump straight into each one.

The `Armed` toggle stays on the table row, because arming a zone is the single most consequential thing on the
tab and should never be two clicks deep.

### 3. Movement History → ② **Merge + rename** → `Locate Assets ▸ Movement & Replay`

A movement history rendered as a table is a list of timestamps nobody reads. Rendered as a **replay** — a
scrubber, a play button, a trail drawing itself across the floor-plan — it becomes the thing a security officer
actually needs at 09:00 the morning after.

The merge also fixes an attribution bug in the old IA. A **coverage gap** — the trail going cold for 45 minutes
— used to read as the asset misbehaving. It is not: it is *a hole in our hearing*. The replay now says so
explicitly and routes to the team that can fix it:

> *"One stretch of this trail is missing. That is a coverage problem where the asset was, not a problem with
> the asset. → Review coverage"*

That link lands on `Infrastructure ▸ Coverage`, not on the custodian. Blame the estate, not the person.

### 4. Tag & Device Registry → ② **Merge** into `Tracking Infrastructure ▸ Device estate`

The name was a technology inventory. The replacement is a **fleet**, organised by what each device does, with
the four operational facts on every row: state, battery, signal, firmware. The registry's real job — "which
device do I need to touch today" — is now the tab's entire proposition, and the `Needs attention` panel on
`Fleet health` ranks it for you: outages first, then batteries, then version drift.

### 5. Gateways & Readers → ② **Merge** into `Tracking Infrastructure ▸ Topology`

Splitting the estate along a hardware boundary answered a question nobody asks. The question people *do* ask is
**"what breaks if this one dies?"** — which is a graph question, not a category question. The Topology tab draws
`facility ▸ parent ▸ children` and, when a parent is offline, states the blast radius in the only units that
matter:

> *"210 assets in Secure Cage became unverifiable. 3 devices lost their uplink when it stopped reporting 14
> hours ago. Until it is back, nothing here can be confirmed present — only remembered."*

### 6. Zone Heatmaps → ⑤ **Remove**

A heatmap over a floor-plan is a chart looking for a question. It had two, and both are answered better
elsewhere:

| The question it was really asked | Answered better by |
|---|---|
| "Where can't we hear?" | `Infrastructure ▸ Coverage` — a ranked table with blind-spot counts, assets at risk, and a costed remediation sentence per zone |
| "Where does the count disagree?" | `Inventory Control ▸ Overview` — the inventory-truth map layer, where zones fill green when detected matches expected |

A colour ramp tells you *roughly where* something is worse. A ranked table with a price tells you *what to do
about it and in what order*. The redirect (`/heatmaps → /tracking/infrastructure?tab=coverage`) preserves the
link; the screen is gone.

### 7. Digital Twin → ③ **Relocate — demoted from a row to a launch**

**This is the change most likely to be argued with, so the reasoning must be explicit.** The Twin is the most
impressive screen in the pillar and it is *not a place you go to do work*. It is where you go to **look at the
building**: one large plan, one layer at a time, a zone inspector, and hand-offs into the four modules that can
act. That is a viewing mode, not a workspace — and a viewing mode with a sidebar row gets opened by accident,
found empty of tasks, and abandoned.

So it holds no row. It is launched from:

- the Dashboard map panel — `🏢 Open Digital Twin`;
- `Inventory Control ▸ Overview` and `Infrastructure ▸ Coverage`, both of which carry the same button;
- `/tracking/twin/[facility]` directly, and the retired `/twin` and `/twin/:facility` routes.

It also fails T1 as a row: it has no meaning without a facility selected, and `TrackedFacility.twinReady`
means some facilities have no twin at all. A row that lands on "which building?" is a row that should be a
launch.

### 8. Telemetry Explorer → ⑤ **Remove**

An engineering console with no business question attached to it. Nobody's job is "explore telemetry"; people
have jobs like "why is Floor 3 imprecise" and "is this tag about to die", and those are answered by the
**per-device Diagnostics panel** — three to five named checks with a traffic-light state and a plain sentence:

```
Anchors reporting     5 of 8                          ●  bad
Ranging error         ±1.8 m (target ±0.3 m)          ●  warn
Firmware              v2.3.7 — upgrade available      ●  warn
```

That is the useful 5% of a telemetry explorer, delivered where the decision is made. Raw streams belong in an
API and a data warehouse, not a nav row.

### 9. Label & Tag Printing → ③ **Relocate** to Asset Management

Printing a label is an **asset** action, not a tracking action. It happens at registration, at re-tagging, and
at bulk rollout — all of which are moments in the asset's life, all of which start from the Registry or from
Asset 360. It has no relationship to live position, zones, alerts or device health.

- Page: `/assets/labels` — the label sheet designer (format `QR | Barcode | RFID`, size `Small | Medium | Large`,
  selection from the registry, print preview).
- Entry points: `Asset 360 ▸ ⋯ ▸ Print Label`, and `Registry ▸ bulk ▸ Print labels`.
- **Not** in the Tracking sidebar, and not in the Assets sidebar either — it is an action, and actions do not
  get rows (T2).

> **The generalisable rule this produces:** *if the object on the screen is the asset, the screen belongs to
> Assets — however much tracking hardware is involved.* Label printing touches tags; it is still about assets.
> Conversely, `Tracking Infrastructure` touches assets; it is still about devices.

---

## 23.3 Information architecture

### 23.3.1 The five modules, and the sentence each one owns

| # | Module | Route | The sentence it owns | Primary persona |
|---|---|---|---|---|
| 1 | **Dashboard** | `/tracking` | *"What needs a person right now?"* | Everyone, first thing |
| 2 | **Locate Assets** | `/tracking/locate` | *"Where is it, who has it, where has it been, does it belong there?"* | Facility Manager, Security Officer |
| 3 | **Inventory Control** | `/tracking/inventory` | *"Does the building agree with the book?"* | Facility Manager, Inventory |
| 4 | **Alerts & Incidents** | `/tracking/alerts` | *"What has the estate raised, and who is on it?"* | Security Officer, Facility Manager |
| 5 | **Tracking Infrastructure** | `/tracking/infrastructure` | *"Can we still hear, and what breaks if this dies?"* | Technician, IoT Platform, Org Admin |

Read top to bottom the five rows tell a story: **see it → find it → count it → fix the exceptions → keep the
estate honest.** That ordering is not decorative; it is the order in which a facility manager's day escalates,
and it is why `Dashboard` leads and `Infrastructure` closes.

### 23.3.2 The route map

| Route | Module | Tabs (`?tab=`) |
|---|---|---|
| `/tracking` | Dashboard | — (role-ordered widget grid) |
| `/tracking/locate` | Locate Assets | `map` · `list` · `journey` · `zones` |
| `/tracking/inventory` | Inventory Control | `overview` · `rooms` · `movements` · `audits` · `exceptions` |
| `/tracking/alerts` | Alerts & Incidents | `queue` · `incidents` · `automation` · `analytics` |
| `/tracking/infrastructure` | Tracking Infrastructure | `health` · `devices` · `network` · `coverage` · `firmware` |
| `/tracking/twin/[facility]` | Digital Twin | layers `presence` · `coverage` · `inventory` (`?mode=`) |

### 23.3.3 Why everything nests under `/tracking` — the collision argument

Two of these modules want names that are already taken at the top level. Both collisions are real, both are
resolved by nesting, and **neither should be resolved by renaming**, because the shorter name is correct in both
places — for different objects.

| Existing route | Its object | Tracking's route | Its object | Why they must not merge |
|---|---|---|---|---|
| `/alerts` — *Security & Compliance ▸ Alert Center* | `Alert` — compliance and asset-health findings. Severity `Critical / Warning / Info`, status `Open / Acknowledged / Escalated / Resolved` | `/tracking/alerts` | `TrackingAlert` — eleven physical-estate categories. Priority `P1–P4`, seven-state lifecycle, response SLA, owning team, incident linkage | Different severity vocabulary, different lifecycle, different owning teams, different SLAs. Merging them would force one taxonomy onto two disciplines and produce a queue neither team trusts |
| `/inventory` — *Inventory & Parts ▸ IT Spares Overview* | `Part` — SKUs, on-hand, reorder point, ABC class, unit cost, warehouse bin | `/tracking/inventory` | `InventoryRoom`, `AuditSession`, `MovementTxn` — rooms, racks, counts, custody | **Spares are consumed; assets are counted.** A part's question is *do we have enough*; an asset's question is *is it where the book says*. One is replenishment, the other is reconciliation |

> **The rule:** *the same word over two different objects is a nesting problem, not a naming problem.* Nesting
> gives each object an unambiguous path and lets the sidebar keep the short, honest label in both pillars.
> `⌘K` disambiguates by group — typing "alerts" offers *Alert Center (Security & Compliance)* and
> *Alerts & Incidents (Real-Time Tracking)*, each labelled with its pillar.

**One more overlap worth naming, resolved differently.** `Mobile Workforce ▸ Check-in / Check-out` (`/checkinout`)
and `Cycle Counts` (`/cycle-counts`) touch the same objects as `Inventory Control ▸ Check-In / Check-Out` and
`▸ Audits`. This is deliberate and is **not** a duplication:

- `/checkinout` is a **kiosk** — a single-purpose console for a person standing at a storeroom desk with a badge
  and a scanner. Big targets, one transaction at a time, no filters.
- `/tracking/inventory?tab=movements` is the **ledger** — the whole movement log, filterable, with approvals,
  overdue chasing and gate-verification state.

Same object (`MovementTxn`), two surfaces, two postures. The kiosk writes; the ledger governs. Both must show
the same rows.

### 23.3.4 Tab structure at a glance

| Module | Tab | Owns | Badge |
|---|---|---|---|
| **Locate** | `Live Map` | Position now, on a plan | — |
| | `Asset List` | The same population as rows, sortable and bulk-actionable | matching count |
| | `Movement & Replay` | Journey playback, dwell, gaps | journeys available |
| | `Zones & Rules` | Policy, arming, zone occupancy | zones with violations (amber) |
| **Inventory** | `Overview` | Estate accuracy, worst rooms | — |
| | `Rooms & Racks` | Room-level truth down to rack unit | rooms with a variance (amber) |
| | `Check-In / Check-Out` | Custody transactions and approvals | overdue returns (red) |
| | `Audits` | Counts, sign-off, evidence | awaiting sign-off (amber) |
| | `Exceptions` | Every unexplained difference, incl. unidentified tags | open exceptions (red) |
| **Alerts** | `Action queue` | The worklist | open alerts (red if any overdue) |
| | `Incidents` | Several alerts that are one event | open incidents (amber) |
| | `Rules & escalation` | Why you are being told this | — |
| | `Analytics` | Is the noise getting better | — |
| **Infrastructure** | `Fleet health` | Is the estate healthy | offline + low battery |
| | `Device estate` | Which device do I touch | device count |
| | `Topology` | What breaks if this dies | offline parents (red) |
| | `Coverage` | Where can we not hear | zones with blind spots (amber) |
| | `Firmware` | What is being rolled out | running + paused campaigns |

Badges show **only when non-zero**, so a quiet tab stays quiet. A permanently-badged tab is decoration.

### 23.3.5 Deep-link grammar

Every cross-module hand-off carries enough state to land the user *on the row*, not on the page. This is the
contract; treat it as API.

| Parameter | Modules | Meaning |
|---|---|---|
| `?facility=<slug>` | all | Sets scope. Also written by the ScopePicker and mirrored to `sessionStorage` |
| `?tab=<key>` | all | Opens a tab. Written on every tab change via `history.replaceState` |
| `?state=<value>` | locate, inventory, alerts, infrastructure | Pre-applies the primary state filter. `Offline`/`Stale` both resolve to `Not seen` on Locate |
| `?asset=<id>` | locate | Selects the asset; opens its drawer, or its journey when `tab=journey` |
| `?zone=<id>` | locate, inventory, twin | Selects the zone; on Inventory resolves to the room whose `zoneId` matches |
| `?room=<id>` | inventory | Opens the room drawer |
| `?alert=<id>` / `?incident=<id>` | alerts | Opens the drawer, switching tab when needed |
| `?device=<id>` | infrastructure | Opens the device drawer |
| `?battery=low` | infrastructure | Applies the sub-20% filter |
| `?mode=<layer>` | twin | Selects presence / coverage / inventory layer |

### 23.3.6 The redirect map — nine retired routes, twelve rules

Temporary (`307`), not permanent, and deliberately so: the old paths are still in bookmarks and saved reports,
and we would rather not bake them into browser caches while the IA settles. Every redirect lands on the **tab
that absorbed the job**, carrying the record id where there was one.

| Old route | Lands on | Note |
|---|---|---|
| `/geofences` | `/tracking/locate?tab=zones` | |
| `/geofences/new` | `/tracking/locate?tab=zones` | Creation is an action on the tab, not a route |
| `/movement` | `/tracking/locate?tab=journey` | |
| `/movement/:assetId` | `/tracking/locate?tab=journey&asset=:assetId` | Carries the asset |
| `/sensors` | `/tracking/infrastructure?tab=devices` | |
| `/sensors/:id` | `/tracking/infrastructure?tab=devices&device=:id` | Opens the drawer |
| `/gateways` | `/tracking/infrastructure?tab=network` | Gateways land on Topology, not the flat list — the graph is why you came |
| `/gateways/:id` | `/tracking/infrastructure?tab=network&device=:id` | |
| `/twin` | `/tracking` | No facility, so land on the Dashboard, which offers the launch |
| `/twin/:facility` | `/tracking/twin/:facility` | Straight through |
| `/heatmaps` | `/tracking/infrastructure?tab=coverage` | **Removed screen** — redirected to the answer, not the replacement |
| `/telemetry` | `/tracking/infrastructure?tab=health` | **Removed screen** — same |

`⌘K` must resolve the old names too: typing *"heatmap"*, *"geofence"*, *"telemetry"*, *"gateways"* or
*"sensors"* returns the destination above, labelled with its new name. Muscle memory is a migration cost you
pay once, in the palette.

---

## 23.4 Module 1 — Dashboard (`/tracking`)

### 23.4.1 Purpose, business value, target users

**Purpose.** The operational command center. It answers seven questions above the fold and hands every answer
off to the module that can act on it. It is a **routing surface, not a reporting one** — nothing on it is a
dead end, and no widget exists purely to be admired.

| The seven questions | Answered by | Hands off to |
|---|---|---|
| How many assets are online? | KPI `Online` | `Locate ▸ Asset List` filtered `state=Online` |
| How many have we lost track of? | KPI `Not seen` | `Locate ▸ Asset List` filtered `state=Offline` |
| Which are missing? | KPI `Missing` | `Locate ▸ Asset List` filtered `state=Missing` |
| What changed today? | Since-midnight band | the relevant module per metric |
| What needs a person right now? | `Needs action now` worklist | `Alerts ▸ Action queue`, on the row |
| Is inventory healthy? | `Inventory health` panel | `Inventory ▸ Rooms & Racks`, on the room |
| Can we still hear? | `Tracking infrastructure` panel | `Infrastructure ▸ Device estate`, filtered |

**Business value.** It compresses the first ten minutes of a facility manager's day into one screen and removes
the single most expensive failure mode in asset tracking — *nobody noticed*. The value-at-risk figure on the
inventory panel (₹ of asset value currently unverified) is the number that gets tracking funded; the
`Needs action now` list is the number that keeps it funded.

**Target users.** All five tracking-enabled roles open it first: Facility Manager, Security Officer, Technician,
Organization Admin, Super Admin. Executives and Maintenance Managers reach it by deep link from a Workspace
dashboard (§23.14).

### 23.4.2 Page hierarchy

The Dashboard is the one module with **no tabs**. Tabs would imply that some of these questions can wait.

```
Tracking Command Center                       [ ● Live ]  [ Facility scope ▾ ]
├── Quick actions              5 verb buttons — the tasks people arrive intending to start
├── KPI strip                  6 tiles, each a link into a pre-filtered destination
├── Since-midnight band        5 deltas + Export today's summary
└── Widget grid (3 columns)    6 panels, ORDERED BY ROLE
```

### 23.4.3 Quick actions

Verbs live here, never in the sidebar. Five, ordered by real-world frequency, each with a hint on hover:

| Action | Icon | Destination | Hint |
|---|---|---|---|
| Locate an asset | 🔎 | `/tracking/locate` | Search the estate and get a position |
| Verify a room | ✅ | `/tracking/inventory?tab=rooms` | Re-count a room on demand |
| Check out an asset | 🎫 | `/tracking/inventory?tab=movements` | Issue an asset to a person |
| Report an asset missing | 🚩 | `/tracking/alerts?tab=queue` | Open a recovery investigation |
| Start an audit | 📋 | `/tracking/inventory?tab=audits` | Run a full or partial count |

### 23.4.4 KPIs

Six tiles, two rows of three on tablet, one row of six on desktop. Each is a link; each carries a sub-label
that says what the number *means* rather than repeating it.

| Tile | Value | Sub-label | Tone rule | Links to |
|---|---|---|---|---|
| **Online** | count | `of N tracked` | always emerald | `locate?tab=list&state=Online` |
| **Not seen** | count | `past their check-in window` | amber above 12, else slate | `locate?tab=list&state=Offline` |
| **Missing** | count | `investigations open` / `nothing unaccounted for` | red if > 0, else emerald | `locate?tab=list&state=Missing` |
| **Inventory accuracy** | `%` + meter | — | ≥99 emerald · ≥97 amber · else red | `/tracking/inventory` |
| **Open alerts** | count | `N critical · N overdue` | red if any P1 · amber if any open · else emerald | `/tracking/alerts` |
| **Infrastructure** | `%` + meter | — | ≥95 emerald · ≥85 amber · else red | `/tracking/infrastructure` |

**Since-midnight band** — a single glass strip beneath the tiles, labelled `SINCE MIDNIGHT`:
`zone movements` · `checked out` (primary) · `checked in` (emerald) · `left site` (amber) ·
`new exceptions` (red), plus a right-aligned **Export today's summary** text button.

### 23.4.5 Widgets

Six panels. All six render for every role; **only the order changes** (§23.4.11).

| Key | Panel | Contents | Actions |
|---|---|---|---|
| `action` | **Needs action now** (2 cols) | Top 6 open alerts, sorted breached-first → priority → age. Each row: priority pill, title, `Response overdue` chip, incident chip, `location · assignee · raised`, and the recommendation in primary text | `Open action center →`; row → alert drawer |
| `map` | **{Facility} — live floor** (2 cols) | `FacilityMap` in presence mode (compact), legend, and six zone tiles showing `detected/expected` and a percentage | `🏢 Open Digital Twin`; zone tile → `locate?tab=zones&zone=` |
| `inventory` | **Inventory health** | Accuracy donut, `open exceptions` and `unidentified tags` delta stats, unverified-value sentence, four worst rooms with split meters | `Open →`; room → `inventory?tab=rooms&room=` |
| `infra` | **Tracking infrastructure** | Health donut, Healthy/Degraded/Offline bar strip, two drill tiles: `not reporting`, `batteries under 20%` | `Open →`; tiles → pre-filtered estate |
| `incidents` | **Open incidents** | One card per open incident: severity chip, title, `N assets · ₹ at risk · commander`, next action | `Open →`; card → incident drawer |
| `feed` | **Recent activity** | Latest 8 `TrackingEvent`s, colour-dotted by tone, with relative timestamps | `● Live` stamp |

### 23.4.6 Filters, search, tables

**Filters:** one — the facility `ScopePicker`. A dashboard with a filter bar is a report.
**Search:** none locally; `⌘K` is the search surface.
**Tables:** none. Every list here is a link list, because a dashboard row's job is to leave.
**Cards:** incidents only — they carry a narrative and four facts, which is more than a row can hold and less
than a page deserves.

### 23.4.7 Actions, context menus, bulk actions

| Kind | Present | Detail |
|---|---|---|
| Primary actions | 5 quick actions | §23.4.3 |
| Row actions | implicit | Every list row is a single-target link; no per-row menus |
| Context menus | **none** | Deliberate. A dashboard that needs a right-click menu has become a workspace |
| Bulk actions | **none** | Deliberate. Bulk work happens where the full population is visible |
| Utility | `Export today's summary` | Queues a PDF digest to the Export Center |

### 23.4.8 Detail panels and empty states

The Dashboard opens **no drawers of its own** — it routes to the module that owns the object, with the drawer
parameter pre-set. This keeps one drawer implementation per object.

| Widget | Empty state |
|---|---|
| Needs action now | ✅ *"Nothing needs your attention — every alert in this scope is resolved or closed."* |
| Open incidents | *"Nothing open in this scope."* |
| Inventory health | Renders at 100% accuracy with a zeroed exception count; never blank |
| Map | Falls back to the first facility when scope is `All`, and says so in the subtitle |
| Whole page | Never empty — a tenant with zero tracked assets sees zeroed tiles and an onboarding CTA into `Infrastructure ▸ Provision device` |

### 23.4.9 Permissions

| Role | Access |
|---|---|
| Super Admin, Organization Admin | Full |
| Facility Manager | Full, scoped to their facilities |
| Security Officer | Full read; quick actions limited to *Locate* and *Report missing* |
| Technician | Full read; quick actions limited to *Locate* and *Verify a room* |
| Maintenance Manager, Executive | Read-only via deep link; no sidebar row |

Value-at-risk figures (₹ unverified, ₹ at risk) are hidden from Technician — they are a finance and security
disclosure, not an operational one.

### 23.4.10 Notifications, automation, approvals, audit, exports

- **Notifications.** The sidebar row carries a badge of open tracking alerts, computed from the same source as
  the `Open alerts` tile. P1 alerts additionally push in-app and, per rule, SMS/email (§23.12).
- **Automation.** None originates here; the Dashboard is a *reader* of automation output.
- **Approvals.** None. Approvals live where their object lives.
- **Audit logging.** `tracking.dashboard.viewed` (actor, scope, role) at a 30-day retention — enough to prove
  who was watching when something went wrong, not enough to become a surveillance log. `tracking.export.requested`
  for the daily digest.
- **Exports & reports.** *Export today's summary* → a one-page PDF (KPI strip, since-midnight deltas, open P1s,
  worst three rooms, infrastructure health) delivered to the Export Center. This is also the payload of the
  **Daily Tracking Digest** subscription in `Analytics & Reporting ▸ Scheduled Subscriptions`.

### 23.4.11 Role-based behaviour

Same widgets, different reading order. Nothing is hidden that the role can act on; only the sequence changes,
and the page states this out loud in a footnote: *"Layout adapts to your role — you are viewing as {role}."*

| Role | Widget order |
|---|---|
| **Security Officer** | action · incidents · map · infra · inventory · feed |
| **Facility Manager** | action · inventory · map · incidents · infra · feed |
| **Organization / Super Admin** | action · map · inventory · infra · incidents · feed |
| **Technician** | action · infra · map · inventory · incidents · feed |
| **Maintenance Manager** | action · infra · inventory · map · incidents · feed |
| **Executive** | inventory · action · map · incidents · infra · feed |

The Executive is the only role that does not lead with the worklist — an executive is not going to acknowledge
an alert, and leading them with a queue they will not work trains them to ignore the page.

### 23.4.12 AI capabilities

| Capability | Surface |
|---|---|
| **Action ranking** | The worklist is ordered breached → priority → age. The next iteration weights by value at risk and predicted recovery probability |
| **Recommendation sentences** | Every alert row shows its `recommendation` in primary text — one sentence, one click from the action that performs it |
| **Missing-asset likelihood** | Feeds the `Missing` tile's tone and promotes at-risk assets into the worklist before a human reports them |
| **Digest narration** | The exported summary opens with a generated paragraph: what changed, what it cost, what to do first |

### 23.4.13 Future scalability

At 100 assets the map is the page. At 100,000 the map is a **sample** and must say so ("showing 500 of 12,480
signals — filter to see the rest"). The KPI strip and the worklist are scale-invariant because they are
aggregates and top-N; the map, the zone tiles and the feed all need server-side windowing. The since-midnight
band becomes a streamed counter rather than a computed one.

---

## 23.5 Module 2 — Locate Assets (`/tracking/locate`)

### 23.5.1 Purpose, business value, target users

**Purpose.** The operational workspace where four retired screens became four tabs, because they were always
four views of one investigation.

| Tab | The question |
|---|---|
| `Live Map` | Where is it? |
| `Asset List` | Which ones, exactly? |
| `Movement & Replay` | Where has it been? |
| `Zones & Rules` | Is it where it should be? |

**Business value.** Search-time collapse. The measurable outcome is *minutes-to-locate* — the difference between
a technician walking three floors and a technician walking to a shelf. Secondarily it is the front door of every
loss investigation: the last known fix, the trail, the gap, and the custodian, in one drawer.

**Target users.** Facility Manager (daily), Security Officer (daily, and hard during an investigation),
Technician (daily, mobile), Organization Admin (weekly).

### 23.5.2 Page hierarchy and tabs

```
Locate Assets                       [ ● Live ] [ Facility scope ▾ ] [ ⤓ Export ]
├── KPI strip — 6 tiles, EVERY ONE A FILTER that switches to the list
└── Tabs
    ├── Live Map              filter rail (3 col) · plan (6 col) · results rail (3 col)
    ├── Asset List            filter bar · bulk bar · table · pagination
    ├── Movement & Replay     replay plan + scrubber (2 col) · stops rail (1 col)
    └── Zones & Rules         zone plan (2 col) · rules table (3 col)
    ├── Asset drawer          shared by map, list and zone drawer
    └── Zone drawer           shared by map and zones table
```

### 23.5.3 KPIs

Six tiles. Clicking one **resets the list filters, applies that one filter, and switches to `Asset List`** —
which is the behaviour that makes them feel like a control rather than a display. The active tile is highlighted
while its filter holds.

| Tile | Filter applied | Sub-label |
|---|---|---|
| **Tracked** | none (clears) | facility name, or `across the estate` |
| **Online** | `state=Online` | seen within their window |
| **Not seen** | `state=Not seen` (Stale + Offline) | no recent detection |
| **Missing** | `state=Missing` | recovery open / all accounted for |
| **Checked out** | `custody=Checked Out` | held by a person |
| **Misplaced** | `misplacedOnly` | outside their home zone |

### 23.5.4 Widgets, per tab

**Live Map.** Three panels side by side, and the interaction between them is the feature:

- **Narrow it down** (left, 3 cols) — free-text search over name/id/zone/custodian; a `Presence` chip filter with
  live counts (`All · Online · Not seen recently · No signal · In transit · Missing`); a `Custody` select; a
  `📍 Only assets outside their home zone` toggle; `Reset filters`.
- **{Facility} — live floor** (centre, 6 cols) — SVG floor-plan, zones as labelled rectangles, one marker per
  asset coloured by presence state, an attention ring on assets carrying open alerts, and a legend. A facility
  switch appears when scope is `All`.
- **Results** (right, 3 cols) — the filtered rows. **Hover a row → the marker lights. Click a marker → the row
  scrolls into view.** This bidirectional binding is what makes 96 overlapping markers usable.

**Asset List.** Filter bar, bulk bar, sortable table, pagination at 15 rows.

**Movement & Replay.** A replay plan with the trail drawn to the scrubber position; play/pause; a range slider
with `n/total`; four stat cards (`Distance`, `Zones visited`, `Total dwell`, `Coverage gaps`); a gap banner when
`gaps > 0` that routes to Infrastructure; and a **Stops** rail where each stop is a button that moves the
scrubber. Stops beyond the current position render at 45% opacity — you can see the future without reading it as
the present.

**Zones & Rules.** A compact plan with zone selection, beside a `Rules in force` table.

### 23.5.5 Filters, search and sort

| Tab | Search | Filters | Sort |
|---|---|---|---|
| Live Map | name · id · zone · custodian | presence chips · custody select · misplaced toggle | state rank, then name |
| Asset List | name · id · zone · custodian · facility | state · custody · criticality · misplaced toggle · `Clear` | `name` `state` `zone` `custodian` `lastSeen` `battery`, asc/desc |
| Movement | asset select | facility scope | chronological |
| Zones | — | facility | table order (plan order) |

State rank is fixed for default sorting: `Missing → Offline → Stale → In Transit → Online`. **Exceptions float.**

### 23.5.6 Tables and columns

**Asset List** — nine columns:

| Column | Content | Notes |
|---|---|---|
| ☐ | Row select | Header selects the page; bulk bar offers `Select all N matching` |
| **Asset** | Category emoji tile, name, `Reported` / `Misplaced` chips, `id · category` | The only wrapping column |
| **Presence** | `PresencePill` | Online / Stale / Offline / In Transit / Missing |
| **Precision** | `PrecisionChip` + confidence tooltip | The technology-transparency surface |
| **Zone** | Zone, plus facility line when scope is `All` | |
| **Custodian** | Person or team | |
| **Custody** | Chip — red `Unaccounted`, emerald `In Place`, primary otherwise | |
| **Last seen** | Relative time, tabular | Sortable; the column that finds stale data |
| **Battery** | `BatteryPill`, or `—` for passive tags | Passive tags show no cell, never `0%` |

**Rules in force (Zones tab)** — six columns: `Zone` (name + kind) · `What it enforces` (the policy sentence +
dwell limit) · `Expected` (`detected / expected`, detected amber when short) · `Coverage` (meter + %) ·
`Violations 24h` (amber chip or `None`) · `Armed` (switch, right-aligned).

### 23.5.7 Cards

None. This module is rows and plans. Cards would cost the vertical density that makes a 96-row estate scannable.

### 23.5.8 Actions, context menus, bulk actions

**Row / marker actions** — clicking anywhere opens the asset drawer. There is no per-row overflow menu:
with a drawer this cheap to open, a context menu is a second, divergent list of actions to maintain.

**Bulk actions** (bar appears when ≥1 row selected):

| Action | Effect |
|---|---|
| `Locate on map` | Switches to the map, centred on the first selection |
| `Assign custodian` | Opens a custody request for each; awaits acceptance |
| `Start transfer` | Creates a draft movement per asset, awaiting sign-off |
| `Export` | Positions and custody → CSV in the Export Center |
| `Report missing` | Destructive styling. Flips each asset to `Missing / Unaccounted` and opens a recovery search |

**Zone actions:** `Arm` / `Disarm` inline on the row and in the drawer. Arming is confirmed with a toast that
restates the policy in words; disarming warns that *"movements are recorded but no longer raise alerts."*

**Header actions:** `⤓ Export` (the current filtered set, with each asset's latest fix).

### 23.5.9 Detail panels

**Asset drawer** — the most-opened panel in the pillar.

```
eyebrow   PresencePill · PrecisionChip · criticality chip · [Moving now]
title     Asset name
subtitle  id · category · ₹ value
────────────────────────────────────────────────
[amber]   Not where it belongs — detected in X, home zone is Y.
          "…but it is checked out, so this may be legitimate."   → Open {home zone}
Live position     Facility · Zone · Home zone · Confidence (meter + %) · Last seen
Custody & condition  Custody chip · Held by · Tag battery
Open alerts       one card per alert id → alerts?tab=queue&alert=
Recent journey    TimelineRail of the last stops
────────────────────────────────────────────────
footer    [Open asset profile] [Replay journey] [Assign custodian]        [Report missing]
```

The misplaced banner's second sentence is the detail worth copying elsewhere: **the system states the innocent
explanation before it states the alarming one.** A checked-out laptop on a desk is not a theft, and a UI that
implies otherwise gets ignored within a week.

**Zone drawer** — policy block (the sentence, plus what arming changes, plus the dwell limit), the four numbers
(`expected · detected · coverage · violations 24h`), and the list of assets currently inside with a jump into
each. Footer: `Arm/Disarm zone` · `Review coverage` → Infrastructure · `Count this zone` → Inventory Control.

### 23.5.10 Empty states

| Situation | State |
|---|---|
| Map filters match nothing | *"Nothing matches — no asset on this plan fits the current filters."* |
| List filters match nothing | *"No assets match these filters — widen the state or custody filter, or clear the search."* + `Clear filters` |
| No journeys in scope | 🛰️ *"No movement history in this scope — journeys are recorded for assets that have moved between zones."* + `View all facilities` |
| Facility has no zones | 🗺️ *"No zones mapped — this facility has no floor-plan zones yet."* |
| Zone contains nothing tracked | *"Nothing individually tracked is resolving to this zone right now."* |

Each empty state names the *reason* and offers the *widening action*. "No results" alone is a dead end, which
§23.1.4 forbids.

### 23.5.11 Permissions and role-based behaviour

| Capability | Super/Org Admin | Facility Mgr | Security Officer | Technician |
|---|---|---|---|---|
| View map, list, journeys, zones | ✅ | ✅ (own facilities) | ✅ | ✅ |
| Export positions | ✅ | ✅ | ✅ | ✕ |
| Assign custodian | ✅ | ✅ | ✕ | ✕ |
| Start transfer | ✅ | ✅ | ✕ | ✕ |
| Report missing | ✅ | ✅ | ✅ | ✅ (single only, no bulk) |
| Arm / disarm a zone | ✅ | ✅ | ✅ | ✕ |
| Edit zone policy or geometry | ✅ | ✕ | ✕ | ✕ |

**Role-based behaviour.** Security Officer lands on `Live Map` with the `Missing` filter pre-armed when any
missing asset exists in scope. Technician lands on `Asset List` — a field user wants a row and a shelf, not a
plan. Everyone else lands on `Live Map`.

### 23.5.12 Notifications, automation, approvals, audit

- **Notifications.** Reporting an asset missing notifies Security in-app and by SMS, and notifies the last known
  custodian by email. Arming or disarming a zone notifies the zone custodian.
- **Automation.** This module is where rule output becomes visible: alert rings on markers, `Misplaced` chips,
  and the gap banner. Rules themselves are edited in `Alerts ▸ Rules & escalation`.
- **Approval workflows.** `Assign custodian` and `Start transfer` both create records that require acceptance /
  sign-off — they do not silently rewrite custody. A transfer above the release threshold enters
  `Pending Approval` in the movement ledger.
- **Audit logging.** `tracking.presence.reported_missing`, `tracking.zone.armed`, `tracking.zone.disarmed`,
  `tracking.custody.requested`, `tracking.transfer.drafted`, `tracking.export.requested` — each with actor,
  subject id, scope, before/after state and the filter set in force at the time.

### 23.5.13 Exports and reports

| Output | Contents |
|---|---|
| **Position export** (CSV) | The filtered set: id, name, category, presence, custody, precision, confidence, facility, zone, home zone, custodian, last seen, battery, value |
| **Journey export** (CSV / PDF) | Every stop with timestamp, zone, kind, dwell, actor, note — the evidence pack for an investigation |
| **Zone policy report** (PDF) | Every zone, its policy sentence, armed state, coverage and 24-hour violation count. Monthly, for compliance |
| **Misplaced assets report** | Scheduled weekly to facility managers — assets outside their home zone with no custody explanation |

### 23.5.14 AI capabilities

| Capability | How it shows up |
|---|---|
| **Missing-asset likelihood** | A predicted-loss score combining last-seen age, precision decay, criticality, custody state and historical recovery rate. Surfaces as row ordering and as a "likely recoverable / likely lost" hint in the drawer before a human decides to report |
| **Dwell anomaly** | Compares each asset's dwell against its own history and its class baseline, not just the zone's static limit. Flags "this pallet has never sat here for 8 hours before" |
| **Journey gap attribution** | Clusters gaps across journeys to distinguish *this asset's tag is failing* from *this corridor cannot hear*, and routes accordingly |
| **Search intent** | `⌘K` and the list search accept "laptops that haven't been seen since Friday" and resolve it to a filter set |

### 23.5.15 Future scalability

- **10k+**: the list becomes server-paginated with server-side facet counts; the KPI tiles become aggregate
  queries, not client-side reductions.
- **100k+**: the map renders a clustered layer (one marker per cluster with a count) that explodes on zoom;
  the results rail becomes virtualised; free-text search moves to the search service with typeahead.
- **Journeys** are the heaviest object: retain full fidelity for 30 days, then down-sample to zone transitions
  only. The replay must degrade to transitions gracefully and label itself as doing so.
- **Zones** scale by count, not by asset count; above ~200 zones per facility the rules table needs grouping by
  building and a policy filter.

---

## 23.6 Module 3 — Inventory Control (`/tracking/inventory`)

### 23.6.1 Purpose, business value, target users

**Purpose.** One comparison runs through every tab: **what the book says should be here, against what the
building actually reports.** Every screen in this module is a cut of that single fact.

| Tab | The question |
|---|---|
| `Overview` | Does the estate agree with itself? |
| `Rooms & Racks` | Which shelf is the variance on? |
| `Check-In / Check-Out` | Who has it, and when is it back? |
| `Audits` | Who signed the count off? |
| `Exceptions` | What is still unexplained? |

**Business value.** This module is where tracking stops being a map and starts being an audit trail with a
rupee value. Three concrete outcomes: (1) the annual physical count collapses from weeks of clipboards to a
signed variance report; (2) `₹ of asset value currently unverified` becomes a number the CFO can watch fall;
(3) custody becomes enforceable — an overdue return is a row with a name on it, not a rumour.

**Target users.** Facility Manager (daily), Inventory / storeroom custodians (hourly), Organization Admin
(monthly sign-off), Security Officer (exception queue), Auditor (read + evidence export).

> **The design decision that shapes the whole module.** *A tag we can hear but cannot name is an inventory
> exception, not a separate discipline.* Unidentified tags therefore queue **with** missing, misplaced,
> duplicate and ghost assets in one worklist, rather than getting a screen of their own. One queue, one
> ranking, one place to be finished for the day.

### 23.6.2 Page hierarchy and tabs

```
Inventory Control                   [ ● Live ] [ Facility scope ▾ ] [ Export variance ]
├── KPI strip — 6 tiles, each opening the tab that acts on it
└── Tabs
    ├── Overview            estate accuracy (1 col) · inventory-truth map (2 col) · rooms needing attention (3 col)
    ├── Rooms & Racks       filter bar · rooms table          → room drawer (with 42U rack monitoring)
    ├── Check-In / Check-Out  transaction form (360px) · movement log
    ├── Audits              start-an-audit panel · sessions table  → audit drawer (sign-off)
    └── Exceptions          kind chips · bulk bar · unified queue table
```

### 23.6.3 KPIs

| Tile | Value | Sub-label | Opens |
|---|---|---|---|
| **Inventory accuracy** | `%` + meter | — | `Overview` |
| **Rooms reconciled** | `verified / total` | `N with a variance` / `every room agrees` | `Rooms & Racks`, variance filter on |
| **Open exceptions** | count | `₹N unverified` | `Exceptions`, all kinds |
| **Unidentified tags** | count | `heard but not named` | `Exceptions`, filtered to `Unidentified` |
| **Checked out** | count | `N awaiting approval` / `all releases approved` | `Check-In / Check-Out`, `Open` |
| **Overdue returns** | count | `past their due-back date` / `nothing late` | `Check-In / Check-Out`, `Overdue` |

### 23.6.4 Widgets, per tab

**Overview.**

- **Estate accuracy** — accuracy donut; a `Matched / Missing / Unexpected` bar strip; three figures
  (`Value not yet verified` in red, `Rooms fully reconciled`, `Counts awaiting sign-off`); and a closing
  sentence that makes the number mean something: *"Every rupee above sits on an asset the estate cannot
  currently confirm. Clearing the queue is what puts it back on the books."*
- **{Facility} — where the count agrees** (2 cols) — the floor-plan in **inventory mode**: zones fill green when
  detected matches expected and redden as the gap widens. Clicking a zone opens its room; clicking a zone with
  no counted room says so rather than doing nothing. Carries `🏢 Open Digital Twin`.
- **Rooms needing attention** (full width) — worst agreement first, five rows, each with missing/unexpected
  chips, an accuracy percentage, a split meter, and the line `facility · detected/expected · counted {when} ·
  custodian`. The room at the top is where a person should physically go.

**Rooms & Racks.** Filter bar (`search`, `Only rooms with a variance` pill, count) over the rooms table.

**Check-In / Check-Out.** A two-column workspace: the **transaction form** on the left, the **movement log** on
the right, so issuing an asset and governing what is already out happen in one place.

**Audits.** A `Start an audit` panel (scope select listing every room with its expected count; a three-way
`Method` toggle with tooltips — *the room counts itself* / *a walk-through with a handheld* / *eyes and a
clipboard*; `📋 Start count`), above the sessions table.

**Exceptions.** Kind chip-filter with live counts, `Show cleared` toggle, bulk bar, and the unified queue.

### 23.6.5 Filters and search

| Tab | Search | Filters |
|---|---|---|
| Rooms & Racks | room · custodian · facility · kind | `Only rooms with a variance` |
| Check-In / Check-Out | asset picker search (scoped to eligible assets for the chosen direction) | state chips: `All · Open · Overdue · Pending approval · Returned · Rejected` |
| Audits | — | facility scope |
| Exceptions | — | kind chips (`Missing · Unexpected · Misplaced · Duplicate · Unverified · Ghost · Unidentified`) + `Show cleared` |

The asset picker is direction-aware: checking **out** searches assets `In Place`; checking **in** searches
assets `Checked Out`. Offering the wrong population is how kiosks generate bad data.

### 23.6.6 Tables and columns

**Rooms** — ten columns: `Room` (name, id, rack count) · `Facility` · `Kind` · `Expected vs detected`
(`d/e` + split meter) · `Accuracy` (≥99.5 emerald, ≥98 amber, else red) · `Unexpected` · `Missing` ·
`Last verified` · `Verification` (`Continuous` / `On demand`) · `Custodian`.

**Movement log** — nine columns: `Asset` (name, `id · purpose`, red left rule when overdue) · `Direction`
(`↗ Out` / `↙ In`) · `Person` · `Department` · `When` · `Due back` · `State` · `Gate` (`Confirmed` /
`Paperwork only`) · `Action`.

> **`Gate` is the column that earns this module its credibility.** It records whether the estate physically
> confirmed the asset at the point of transaction, or whether we only have a form. *Paperwork is only worth as
> much as the gate that confirms it* — and the difference between the two is exactly what an auditor will ask
> about.

**Audit sessions** — twelve columns: `Audit` (name, `id · opened {when}`) · `Scope` · `Method` · `State` ·
`Progress` (meter + %) · `Expected` · `Detected` · `Unexpected` · `Missing` · `Owner` · `Approver`
(`Unsigned` in grey when absent) · `Due`.

**Exception queue** — a single normalised table over two source objects:

| Column | Exceptions | Unidentified tags |
|---|---|---|
| **Item** | Kind chip + asset name; `id · assetId` | `Unidentified` chip + `Tag {id}` (prefix stripped); `id · N detections` |
| **Where** | Room, with `· expected in {room}` appended when misplaced; facility | Zone; facility |
| **Detected** | Relative time | Last seen |
| **Severity** | Critical / High / Medium / Low | Derived: Investigating → High, New → Medium, else Low |
| **State** | Open / Assigned / Resolved | Open / Matched / Registered / Ignored |
| **Value** | ₹ at risk | `—` |
| **Recommendation** | The action sentence | The reason it was raised, **plus the AI best match with a confidence meter** |
| **Actions** | `Assign` · `Resolve` | `Accept match` · `Register` · `Ignore` |

### 23.6.7 Cards

**Rack columns** — the module's one card-like object and the finest grain it reaches. Each rack renders as a
136px card: name, status chip (`Verified` / `Variance` / `Unverified`), a 42-unit column drawn bottom-to-top
with one 5px band per U coloured by slot state, a hover/pin inspector showing what occupies the active U, and a
vitals block (`Load %` with meter, `Inlet °C`, `Occupied n/42U`, `Variance`), closing with `Counted {when}`.

| Slot state | Colour | Means |
|---|---|---|
| `Present` | emerald | On the shelf |
| `Missing` | red | Expected, not detected |
| `Unexpected` | amber | Detected, not expected |
| `Empty` | slate | Empty slot |

A room-level variance means nothing until you know which U it sits on. This card is that answer.

### 23.6.8 Actions, context menus, bulk actions

| Surface | Actions |
|---|---|
| **Room drawer footer** | `✅ Verify now` · `📋 Start an audit here` (pre-sets the audit scope and switches tab) · `Turn continuous verification on/off` |
| **Movement row** | `Approve` / `Reject` when `Pending Approval`; `Chase return` when `Overdue`; `Locate →` otherwise |
| **Transaction form** | `Release asset` / `Confirm return` — disabled until asset, person and purpose are all present |
| **Audit drawer footer** | `✅ Approve variance` / `↩️ Reject and re-count` when in `Review`; otherwise the sign-off provenance line and `Export report` |
| **Exception row** | `Assign` · `Resolve` |
| **Unidentified row** | `Accept match` (only when a suggestion exists) · `Register` · `Ignore` |
| **Bulk (Exceptions)** | `Assign to me` · `Resolve` — resolving an unidentified tag in bulk maps to `Ignored`, never to `Registered`, because registering is an identity claim and must be made one row at a time |
| **Header** | `Export variance` |

**Context menus:** none. Every action is visible on the row or in the drawer footer. In a queue that people work
under time pressure, a hidden action is an unperformed action.

### 23.6.9 Detail panels

**Room drawer** (wide, `max-w-3xl`) — accuracy donut, split meter, the four-number `VarianceStats` block
(`Expected · Detected · Unexpected · Missing`), a field list (`Last verified`, `Custodian`, `Verification`
explained in words, `Racks monitored`), the horizontally scrolling **rack monitoring** strip with its legend,
and `Open exceptions here` pulled from the same queue as the Exceptions tab.

**Audit drawer** — variance block (split meter + the four numbers, flat style), fields
(`Progress`, `Method`, `Owner`, `Approver`, `Due`, `Note`), and, when in `Review`, an amber consent panel that
states exactly what signing means:

> *"This count needs a signature. Approving accepts N missing and M unexpected units against the book and
> stamps your name on the record. Rejecting sends it back to {owner} for a full re-count."*

Below that, the **Lifecycle** rail: opened → counting under way → count complete, variance raised → signed off
(or sign-off due) → closed.

### 23.6.10 Empty states

| Situation | State |
|---|---|
| No room variances | ✅ *"Every room agrees with the book — no variance anywhere in this scope."* |
| Room filters match nothing | *"No rooms match — try a different search or clear the variance filter."* + `Clear filters` |
| No movements in filter | *"No transactions here — change the filter, or check something out to get started."* |
| No audits in scope | 📋 *"No audits in this scope — start one above to open a count."* |
| Empty exception queue | ✅ *"Nothing in the queue — every detection in this scope matches a record."* |
| Room has no exceptions | *"Nothing unexplained in this room."* |

### 23.6.11 Permissions

| Capability | Super/Org Admin | Facility Mgr | Security Officer | Technician |
|---|---|---|---|---|
| View rooms, audits, movements, exceptions | ✅ | ✅ | ✅ | ✅ |
| Check out / check in | ✅ | ✅ | ✕ | ✅ (own department) |
| **Approve a check-out above threshold** | ✅ | ✅ | ✕ | ✕ |
| Chase an overdue return | ✅ | ✅ | ✅ | ✕ |
| `Verify now` a room | ✅ | ✅ | ✕ | ✅ |
| Toggle continuous verification | ✅ | ✅ | ✕ | ✕ |
| Start an audit | ✅ | ✅ | ✕ | ✕ |
| **Approve / reject a variance** | ✅ | ✅ (not their own count) | ✕ | ✕ |
| Assign / resolve an exception | ✅ | ✅ | ✅ | ✕ |
| Register or ignore an unidentified tag | ✅ | ✅ | ✕ | ✕ |
| Export variance / audit evidence | ✅ | ✅ | ✅ | ✕ |

**Segregation of duties is enforced, not advisory:** the owner of an audit cannot approve their own variance.
The approve button renders disabled with the reason on hover — *"You opened this count; someone else must sign
it."*

### 23.6.12 Notifications, automation, approval workflows

**Notifications.**

| Event | Who is told | Channel |
|---|---|---|
| Check-out above the release threshold | The approving manager | in-app + email |
| Check-out approved / rejected | The requester | in-app + email |
| Return overdue (due-back passed) | Holder, then holder's manager at +48h | email |
| Room variance detected | Room custodian; facility manager if value > threshold | in-app |
| Audit reaches `Review` | Nominated approver | in-app + email |
| Variance rejected | Audit owner | in-app + email |
| Unidentified tag crosses 50 detections | Inventory team | in-app |

**Automation.**

- **Continuous verification** — a room with `autoVerify` on re-counts itself and raises a variance without
  waiting for a person. This is the single highest-leverage toggle in the module: turning it on for a storeroom
  converts a monthly clipboard exercise into a standing background fact.
- **Automatic audits** — choosing method `Automatic` produces a count that is *already complete* the moment it
  is started, landing directly in `Review` with the variance ready for signature. `Assisted` and `Manual` land
  in `Scheduled`, because a person has to be sent.
- **Rules** — `TRK-RULE-03` (room count differs from expected → P2 Inventory), `TRK-RULE-04` (unregistered tag
  seen 50+ times in 12h → P3, run the matcher), `TRK-RULE-12` (check-out overdue by 48h → P3, email the holder
  and their manager).

**Approval workflows.**

| Workflow | Trigger | Approver | Outcome |
|---|---|---|---|
| **Release approval** | Check-out where `asset.value ≥ ₹2,00,000` | Facility Manager or above | `Pending Approval` → `Open` or `Rejected`. The form warns *before* submission, naming the threshold |
| **Variance sign-off** | Audit reaches 100% with any variance | Facility Manager or above, not the owner | `Review` → `Approved` (stamped with approver + timestamp) or back to `In Progress` with a re-count note |
| **Tag registration** | Registering an unidentified tag against an asset | Facility Manager or above | Writes a binding; a claimed identity is never created by a technician |

### 23.6.13 Audit logging

This module is the pillar's evidence source; its log is the strictest.

| Event | Payload | Retention |
|---|---|---|
| `tracking.room.verified` | room, actor, expected, detected, unexpected, missing, method | 7 years |
| `tracking.room.autoverify_changed` | room, actor, before/after | 7 years |
| `tracking.audit.opened` | audit id, scope, method, owner, expected | 7 years |
| `tracking.audit.variance_raised` | detected, unexpected, missing, progress | 7 years |
| `tracking.audit.approved` | approver, approvedAt, accepted missing/unexpected counts | **7 years, immutable** |
| `tracking.audit.rejected` | approver, reason, returned-to | 7 years |
| `tracking.custody.checked_out` | asset, person, department, purpose, dueBack, gate-verified flag | 7 years |
| `tracking.custody.checked_in` | asset, person, returnedAt, condition note, gate-verified flag | 7 years |
| `tracking.custody.approval_requested` / `_approved` / `_rejected` | asset, value, requester, approver | 7 years |
| `tracking.custody.chased` | txn, actor, channel | 1 year |
| `tracking.exception.assigned` / `_resolved` | exception, kind, actor, owner | 3 years |
| `tracking.unknown_tag.matched` / `_registered` / `_ignored` | tag id, suggestion, confidence, actor, bound asset | 7 years |

Approved audits write to the **immutable audit log** (`/audit-log`) as well as the module log, and are the
payload of the evidence export. Nothing in this table is editable after the fact; corrections are new events.

### 23.6.14 Exports and reports

| Output | Contents | Cadence |
|---|---|---|
| **Variance report** (CSV + PDF) | Every room in scope with expected/detected/unexpected/missing/accuracy, plus every open exception with its value | On demand (header button); monthly subscription |
| **Audit evidence pack** (PDF) | One audit: scope, method, counts, the variance table, the lifecycle rail, owner and approver signatures with timestamps | On sign-off |
| **Custody ledger** (CSV) | Every movement with person, department, purpose, due-back, return, gate-verification | Monthly, and on demand for an auditor |
| **Overdue returns** | Open check-outs past due, by holder and department, with age and value | Weekly to department heads |
| **Unverified value** | The ₹ figure over time, by facility | Monthly to Finance |

### 23.6.15 Role-based behaviour

| Role | Lands on | Notable difference |
|---|---|---|
| Facility Manager | `Overview` | Approval and sign-off buttons live; the KPI strip leads with accuracy |
| Storeroom custodian *(Facility Manager scoped to one room)* | `Check-In / Check-Out` | The transaction form is the page; the log is secondary |
| Technician | `Rooms & Racks` | `Verify now` available; approvals hidden entirely rather than disabled |
| Security Officer | `Exceptions` | Missing and Ghost kinds pre-filtered |
| Organization Admin | `Audits` | Sign-off queue leads; can approve across facilities |
| Auditor *(read-only)* | `Audits` | No action buttons; `Export report` and evidence pack only |

### 23.6.16 AI capabilities

| Capability | Surface |
|---|---|
| **Match suggestion** | Every unidentified tag carries a best registry match and a confidence meter — *"AST-1120 · Dell PowerEdge R660 (retired 2026-03) · 71% confidence"*. Above 90% the `Accept match` button is primary; below 60% it is offered but not recommended |
| **Audit sampling** | Chooses *which rooms to count next* from variance history, movement volume, coverage quality and value at risk — so a quarterly full count becomes a continuous risk-weighted sample. Renders as a `Suggested next count` prompt on the Start-an-audit panel |
| **Variance explanation** | Clusters a room's missing items and proposes the likeliest cause: *reader outage*, *staff working remotely*, *unposted goods receipt*, *genuine loss* — each with the evidence that supports it |
| **Ghost detection** | Flags assets on the books never once detected (`Ghost` kind) and estimates whether they were ever delivered |
| **Recommendation sentences** | Every exception carries an action sentence, not a diagnosis: *"Re-scan shelf 3 — the cage reader has been offline 14h"* |

### 23.6.17 Future scalability

- **Rooms** scale linearly and stay comfortable to thousands with server-side filtering; the rooms table needs
  grouping by facility above ~50 rows.
- **Racks** are the rendering risk: 42 slots × N racks. Above ~20 racks per room the strip must virtualise and
  offer a "variance only" rack filter.
- **The exception queue is the object that grows fastest at scale.** At 100k assets a 1% exception rate is 1,000
  open rows — unworkable as a flat list. It must become: severity-and-value ranked, auto-assigned by rule,
  bulk-resolvable by pattern ("resolve all 340 unverified label-only assets in one action"), and aged out
  automatically when the underlying detection returns.
- **Audits** move from room-scoped to rule-scoped (*"every Critical asset in South India"*), and sign-off becomes
  a queue in its own right rather than a state on a row.
- **Movements** need archival: hot for 90 days, warm for a year, cold thereafter, with the ledger export reading
  all three.

---

## 23.7 Module 4 — Alerts & Incidents (`/tracking/alerts`)

### 23.7.1 Purpose, business value, target users

**Purpose.** One action center. Whatever raised the signal — a presence monitor, a zone policy, an audit pass, a
device heartbeat, the detection matcher, the coverage analyser — it becomes an alert on **one lifecycle**. The
screen exists to *move work through* that lifecycle, not to display it.

| Tab | The question |
|---|---|
| `Action queue` | What must a person do next? |
| `Incidents` | Which of these alerts are really one event? |
| `Rules & escalation` | Why am I being told this? |
| `Analytics` | Is the noise getting better? |

**Business value.** Two numbers justify the module. **Mean time to acknowledge** — how long a P1 sits unread —
is the difference between recovering an asset and filing a police report. **Suppression ratio** — duplicates
folded into alerts already open — is the difference between a queue people read and a queue people ignore. The
module surfaces both, permanently, on the screen that generates them.

**Target users.** Security Officer (primary; this is their workspace), Facility Manager (daily), Technician
(assigned work), Organization Admin (rules and escalation policy), IoT Platform team (device categories).

### 23.7.2 Page hierarchy and tabs

```
Alerts & Incidents               [ ● Live ] [ Facility scope ▾ ] [ Export digest ]
├── KPI strip — 6 tiles, each focusing the queue
└── Tabs
    ├── Action queue         lifecycle chips · filter bar · bulk bar · table
    ├── Incidents            card grid                              → incident drawer
    ├── Rules & escalation   suppression banner · rules table       → rule drawer
    └── Analytics            volume by category · response performance · noisiest sources
    └── Alert drawer         reachable from every tab and from four other modules
```

### 23.7.3 KPIs

| Tile | Value | Sub-label | Focuses the queue to |
|---|---|---|---|
| **Open** | count of open alerts | `N cleared this session` once you have worked any, else `of N raised in scope` | `state=open` |
| **Critical (P1)** | count | `need a decision now` / `nothing critical open` | `state=open, priority=P1` |
| **Response overdue** | count | `past their response target` | `state=open, overdue only` |
| **Open incidents** | count | `₹N at risk` | `Incidents` tab |
| **Resolved today** | count | `cleared since 00:00 IST` | `state=Resolved` |
| **Mean time to ack** | duration | `across N acknowledged` | `Analytics` tab |

`N cleared this session` is a deliberate piece of feedback: it compares live state against the authored
baseline so an operator can see their own morning's work reflected in the headline number.

### 23.7.4 Widgets, per tab

**Action queue.** A lifecycle chip-filter (`All · Open · New · Acknowledged · Assigned · In Progress ·
Escalated · Resolved · Closed`, each with a live count), a filter bar, a bulk bar, and the queue table. Ordering
is fixed and non-negotiable: **breached response targets first, then priority, then age.** Worked top down.

**Incidents.** A two-column card grid. Each card: severity chip, state chip, `id · opened {when}`, title, a
two-line summary, then three facts (`N linked alerts · N assets affected · ₹N at risk`), the next action in
primary text, and `Commander {name} · {facility}`.

**Rules & escalation.** Opens with the suppression banner — the number nobody asks for and everybody needs:

> *"**11** duplicate signals were folded into alerts that were already open today. Without suppression this
> queue would have grown by **24** rows instead of **13** — that ratio is what keeps people reading it."*

Below it, the rules table: every alert on the screen was raised by one of these sentences.

**Analytics.**

- **Alert volume by category** (2 cols) — a stacked bar per category (`open` in primary, `resolved or closed` in
  slate), each bar a button that focuses the queue on that category. *The queue is the answer to the chart.*
- **Response performance** — an SLA-compliance donut computed only over alerts whose response window has
  actually elapsed, with `Time to acknowledge` and `Time to resolve` means each carrying an explicit `n=`, and
  an `Open / Resolved / Closed` bar strip.
- **Noisiest sources** (full width) — the top five raising sources with counts and share. *Tune the rule, not
  the queue.*

### 23.7.5 Filters, search and sort

| Control | Values |
|---|---|
| Lifecycle chips | `all` · `open` (the roll-up) · each of the seven states |
| Search | id · title · summary · asset name · location · source · assignee · team |
| Category select | `All` + every category present in scope |
| Priority select | `All · P1 · P2 · P3 · P4` |
| `⏱ Overdue only` | Open alerts past their response target |
| `Reset` | Appears only when something is set |

**Sort is not user-controllable in the queue, and that is the point.** A worklist whose order can be changed is a
worklist whose order can be gamed. Sorting lives in Analytics.

### 23.7.6 Tables and columns

**Action queue** — nine columns:

| Column | Content |
|---|---|
| ☐ | Row select; header selects everything in view |
| **Pri** | `PriorityPill` — P1 red, P2 amber, P3 primary, P4 slate |
| **Category** | Category icon + name |
| **Alert** | Title (truncated), incident chip when linked; beneath it `{asset} · {facility} · {location}` |
| **State** | Lifecycle chip with dot |
| **Owner** | Assignee or `Unassigned`, with the owning team beneath |
| **Raised** | Relative time |
| **Response target** | `SlaCell` — `Overdue by 3h 20m` (red) · `1h 40m left` (amber under 2h) · `Met` / `Target missed` once closed |
| *(trailing)* | `Open →` |

**Rules** — eight columns: `Rule` (name + category) · `When…` (the plain-language trigger) · `Then…` (chips, one
per consequence) · `Raises` (priority pill + assign team) · `Escalates after` · `Fired` · `Suppressed`
(emerald when non-zero) · `Enabled` (switch). Paused rules render the whole row at 55% opacity.

### 23.7.7 Cards

Incidents are the only cards in the module, and they earn it: an incident is a **narrative** — several alerts
that turned out to be one event, with a commander, a value at risk and a next action. A row cannot hold a
narrative; a page is too much for something you scan six of.

### 23.7.8 Actions, context menus, bulk actions

**Four lifecycle actions**, available identically from the bulk bar and the alert drawer footer, so there is one
vocabulary regardless of where you work:

| Action | Sets state | Side effects |
|---|---|---|
| `Acknowledge` | `Acknowledged` | Stamps `ackAt` if not already set; stops the ack clock |
| `Assign to me` | `Assigned` | Sets assignee to the current user |
| `Escalate` | `Escalated` | Notifies the escalation path for the rule that raised it |
| `Resolve` | `Resolved` | Stamps `resolvedAt`; the alert leaves the open buckets |

Every one appends a timeline entry (`at`, `actor`, `action`, `note`). Acting on a selection that is already in
the target state is a no-op with an honest toast — *"Nothing to change: everything selected is already
acknowledged or closed."*

**`🧭 Create incident from selected`** — the module's most important composite action. It takes the selection,
derives severity from the highest priority present (`P1 → Sev1`, `P2 → Sev2`, else `Sev3`), sums value at risk,
counts distinct affected assets, writes a summary naming the operator, links every alert to the new incident,
switches to the Incidents tab and opens the new record.

**Incident actions:** `Contain` · `Resolve` · `Close incident`. Containing says *"spread stopped — linked alerts
stay open until each is worked"*, which is the honest distinction between stopping the bleeding and finishing
the job.

**Rule actions:** the `Enabled` switch on the row, and in the drawer `Pause rule` / `Enable rule` plus
`See the alerts it raised` (which focuses the queue on the rule's category).

**Recommendation action:** every alert drawer carries a primary button labelled with its own
`recommendationAction` — `Start recovery search`, `Dispatch technician`, `Open match review`,
`Batch battery swap`, `Start tag replacement`, `Plan coverage fix`, `Check work orders`, `Re-verify room`,
`Schedule re-count`, `Attach to incident`, `Raise tag replacement`, `Add to firmware campaign`, `Retire device`,
`Open zone`, `Open audit`, `View resolution`. **The recommendation is never advice without a button.**

**Context menus:** none. The row opens a drawer; the drawer holds every action.

### 23.7.9 Detail panels

**Alert drawer** (`max-w-2xl`):

```
eyebrow   PriorityPill · category chip · lifecycle chip · [Response overdue]
title     Alert title
subtitle  {id} · raised {when} by {source}
────────────────────────────────────────────────
          Summary — one paragraph of what happened
[primary] Recommended next step
          "{recommendation}"                        [ {recommendationAction} ]
Fields    Asset →locate · Device →infrastructure · Location · Response target ·
          Assignee · Team · Value at risk · Linked incident →
History   TimelineRail: raised (warn) · acknowledged · assigned · escalated (bad) · resolved (good)
────────────────────────────────────────────────
footer    [Acknowledge] [Assign to me] [Escalate] [Resolve]              {team}
```

Timeline tone is derived from the action word, so an escalation is visually red and a resolution green without
anyone having to author a colour.

**Incident drawer** — summary, a primary `Next action` block, fields (`Facility`, `Assets affected`,
`Value at risk`, `Commander`, `Resolved`), and the **linked alerts** list where each row shows its priority,
state, owner and an `Overdue` chip, and clicking one hands off to the alert drawer.

**Rule drawer** — a `When` / `Then` block rendering the rule as a readable sentence and a bulleted consequence
list, then fields: `Raises {priority} to {team}`, `Escalates after {duration} without resolution`,
`Notification channels` (derived from the rule's own consequences so the table and the panel can never
disagree), `Fired today`, `Suppressed today`.

### 23.7.10 Empty states

| Situation | State |
|---|---|
| Filters match nothing | *"Nothing in this bucket — no alert in this scope matches the filters you have set."* + `Show every alert` |
| No incidents in scope | 🧭 *"No incidents in this scope — select alerts in the action queue and group them when they turn out to be one event."* + `Go to the action queue` |
| Incident has no linked alerts | *"No alerts are attached to this incident."* |
| No alerts at all in scope | Analytics panels render *"No alerts in this scope."*; the queue shows the ✅ zero state |

### 23.7.11 Permissions

| Capability | Super/Org Admin | Facility Mgr | Security Officer | Technician |
|---|---|---|---|---|
| View the queue and incidents | ✅ | ✅ | ✅ | ✅ (assigned + their facility) |
| Acknowledge | ✅ | ✅ | ✅ | ✅ |
| Assign to self | ✅ | ✅ | ✅ | ✅ |
| Assign to others | ✅ | ✅ | ✅ | ✕ |
| Escalate | ✅ | ✅ | ✅ | ✕ |
| Resolve | ✅ | ✅ | ✅ | ✅ (own assignments only) |
| Close | ✅ | ✅ | ✕ | ✕ |
| Create an incident | ✅ | ✅ | ✅ | ✕ |
| Command / contain / close an incident | ✅ | ✅ | ✅ | ✕ |
| **Enable or pause an automation rule** | ✅ | ✕ | ✕ | ✕ |
| View rules (read-only) | ✅ | ✅ | ✅ | ✅ |
| View analytics | ✅ | ✅ | ✅ | ✕ |
| Export digest | ✅ | ✅ | ✅ | ✕ |

**Pausing a rule is an Organization Admin action and nothing less.** A paused rule is a category of risk the
tenant has chosen to stop hearing about; that is a governance decision, and it writes an immutable audit event
with the actor's name on it.

### 23.7.12 Notifications, automation, approvals

**Notifications** are the module's output, not its input. Channels are declared by each rule and read back from
its consequences:

| Priority | Channel set | Escalation |
|---|---|---|
| **P1** | In-app + SMS + email, to the assigned team's on-call | Auto-escalate after the rule's window (60–240 min); notify the facility manager |
| **P2** | In-app + email | Auto-escalate after 4–12h |
| **P3** | In-app; email on digest | Digest only |
| **P4** | In-app | None |

**Automation.** Twelve shipped rules (§23.12), each carrying `when`, `then`, priority, assign team, escalation
window, an enabled switch, and today's `fired` and `suppressed` counts. Automation also performs
**auto-resolution**: a device that recovers within its grace window closes its own alert with an
`Auto-resolved` timeline entry — the operator sees that the system cleaned up after itself rather than finding a
stale row.

**Approval workflows.** None inside this module by design. An alert is not approved, it is *worked*. The one
adjacent approval — pausing a rule — is a permission gate, not a workflow, because a two-step approval on
silencing an alarm is a two-step approval nobody completes at 02:00.

### 23.7.13 Audit logging

| Event | Payload | Retention |
|---|---|---|
| `tracking.alert.raised` | id, category, priority, source, subject (asset/device), facility, rule id | 3 years |
| `tracking.alert.acknowledged` / `_assigned` / `_escalated` / `_resolved` / `_closed` | id, actor, from-state, to-state, note, elapsed-since-raised | 3 years |
| `tracking.alert.suppressed` | id of the open alert, the swallowed signal, rule id | 90 days |
| `tracking.alert.auto_resolved` | id, rule, grace window | 3 years |
| `tracking.incident.opened` | id, severity, commander, linked alert ids, value at risk | 7 years |
| `tracking.incident.alert_linked` / `_unlinked` | incident, alert, actor | 7 years |
| `tracking.incident.contained` / `_resolved` / `_closed` | incident, actor, state transition | 7 years |
| `tracking.rule.enabled` / `_paused` | rule, actor, category, priority | **7 years, immutable** |
| `tracking.export.requested` | scope, filter set, row count | 1 year |

Every alert's own `timeline` is the user-facing projection of these events, rendered in the drawer. **The
timeline and the audit log are the same facts at two levels of formality** — never two separately maintained
histories.

### 23.7.14 Exports and reports

| Output | Contents | Cadence |
|---|---|---|
| **Alert digest** (PDF) | Open alerts by priority, overdue list, top categories, MTTA/MTTR, suppression ratio | On demand; daily subscription to facility managers |
| **Incident report** (PDF) | One incident: narrative, timeline, every linked alert with its own timeline, assets affected, value at risk, resolution | On close |
| **SLA compliance** (CSV + dashboard tile) | Per category, per team, per facility: raised, acknowledged in time, resolved in time, breached | Monthly to Operations |
| **Rule effectiveness** | Per rule: fired, suppressed, resolved, false-positive rate (resolutions marked "no action needed") | Quarterly, to tune the ruleset |
| **Security pack** | All `Missing Asset`, `Unauthorized Movement` and `Geofence Violation` alerts with evidence links | On demand, for insurance and police reports |

### 23.7.15 Role-based behaviour

| Role | Lands on | Default filter |
|---|---|---|
| Security Officer | `Action queue` | `open`, with `Missing Asset` + `Unauthorized Movement` + `Geofence Violation` categories promoted to the top of the category select |
| Facility Manager | `Action queue` | `open`, own facility |
| Technician | `Action queue` | `open`, assigned to me |
| Organization Admin | `Action queue` | `open`, all facilities; the `Rules & escalation` tab is the one they visit second |
| Executive *(deep link)* | `Analytics` | Read-only; volume, compliance and value at risk, no queue |

### 23.7.16 AI capabilities

| Capability | Surface |
|---|---|
| **Correlation → incident proposal** | When several alerts share an asset, a zone, a device or a window, the queue offers *"These 3 alerts look like one event — create an incident?"* rather than waiting for a human to notice. `INC-4401` (missing asset + unauthorised exit on the same iPad) is exactly this shape |
| **Suppression** | Duplicate signals folded into an already-open alert. The count is displayed, because a suppression system you cannot audit is a suppression system nobody trusts |
| **Priority tuning** | Learns from resolution outcomes which categories are consistently resolved as "no action needed" and proposes a lower default priority — as a recommendation to an Org Admin, never as a silent change |
| **Recommendation generation** | The one-sentence next step on every alert, grounded in the estate's own state: *"Blocked on the cage reader — re-verify once DEV-RD-09 is back"* |
| **Predicted breach** | Flags open alerts likely to miss their response target before they do, and promotes them in the queue |

### 23.7.17 Future scalability

- **The queue is the object under pressure.** At 100k assets the volume driver is device and battery alerts, not
  asset alerts. Answer: aggressive suppression, category-level aggregation (*"46 low batteries in Chennai DC —
  batch"* as one row that expands), and auto-assignment by rule so the queue arrives pre-owned.
- **Ordering must move server-side** with the same three keys, because client-side sorting over 10k rows breaks
  the promise that the top row is the right row.
- **Incidents** need a proper command surface at scale — a timeline, a comms log, and a post-incident review
  template. The card grid is right for six open incidents, wrong for sixty.
- **Rules** need a simulator: *"if I enable this, how many alerts would it have raised last week?"* Enabling a
  rule blind across 100k assets is how a queue becomes unreadable overnight.
- **Analytics** graduates into `Analytics & Reporting` once trend lines exceed a single scope, leaving this tab
  as the operational read.

---

## 23.8 Module 5 — Tracking Infrastructure (`/tracking/infrastructure`)

### 23.8.1 Purpose, business value, target users

**Purpose.** The administrator's module: the physical estate that makes every other tracking screen possible.
Five questions, five tabs.

| Tab | The question |
|---|---|
| `Fleet health` | Is the fleet healthy? |
| `Device estate` | Which device do I need to touch? |
| `Topology` | What breaks if this one dies? |
| `Coverage` | Where can we not hear? |
| `Firmware` | What is being rolled out? |

**Business value.** Every other module in this pillar is only as truthful as this one. A silent reader does not
produce an error — it produces **confident wrong answers**, which is worse. This module converts that risk into
three visible, budgetable numbers: `% of the fleet healthy`, `% average coverage`, and `assets at risk` per
blind spot, each with a costed remediation sentence. It is also where the replacement queue lives, which is how
tracking hardware stops being an unplanned capital surprise.

**Target users.** Technician / field IoT (daily), Organization Admin (weekly), Facility Manager (coverage and
blast radius), Super Admin (provisioning and campaigns).

### 23.8.2 Page hierarchy and tabs

```
Tracking Infrastructure          [ ● Live ] [ Facility scope ▾ ] [ + Provision device ]
├── KPI strip — 6 tiles, each landing on the list that can act on it
└── Tabs
    ├── Fleet health      health donut · needs attention · uptime distribution · replacement queue
    ├── Device estate     role chips · filter bar · bulk bar · table · pagination
    ├── Topology          parent cards (blast radius) · estate tree
    ├── Coverage          coverage plan · coverage-by-zone table
    └── Firmware          campaigns table
    ├── Device drawer     identity · condition · diagnostics
    └── Provisioning drawer  role-first, radio last
```

### 23.8.3 KPIs

| Tile | Value | Sub-label | Lands on |
|---|---|---|---|
| **Devices** | total | `N awaiting provisioning` | Device estate, unfiltered |
| **Healthy** | `%` + meter | — | Device estate, `state=Healthy` |
| **Offline** | count | `not reporting` / `everything is reporting` | Device estate, `state=Offline` |
| **Degraded** | count | `working, but not to spec` | Device estate, `state=Degraded` |
| **Average coverage** | `%` + meter | — | `Coverage` tab |
| **Low battery** | count | `under 20% — swap due` | Device estate, battery filter on |

### 23.8.4 Widgets, per tab

**Fleet health.**

- **Fleet health** — a health donut and a four-way bar strip (`Healthy · Degraded · Offline · Unprovisioned`),
  closing with the sentence that prevents a misreading: *"Unprovisioned devices are grey, not red — hardware
  that has never been commissioned is a gap in the rollout, not a failure in the field."*
- **Needs attention** (2 cols) — the triage list, ranked by consequence, not by timestamp: **outages first**
  (*"Silent for 14 hours — everything it covers is unverifiable"*), **then batteries** ascending
  (*"Battery 17% — swap it before it goes quiet"*), **then version drift** (*"Running v2.3.7; v2.4.1 is
  available"*). Nine rows, then a count and a link to the full estate.
- **Uptime distribution** — four bands (`99.5%+`, `98–99.5%`, `95–98%`, `below 95%`) against the availability
  target, each clickable into the estate sorted by uptime, and a closing caution: *"Anything below 95% is
  producing false gaps on the floor-plan long before it fails outright."*
- **Replacement queue** — devices reaching end of serviceable life, soonest first, showing days remaining
  (red ≤7, amber ≤30) and the predicted date; manually flagged devices show `Flagged by you`.

**Device estate.** Role chip-filter above a filter bar, bulk bar, table and pagination at 12 rows.

**Topology.** One panel per parent device (Reader / Gateway / Anchor). When a parent is offline it opens with a
red blast-radius block quantified in assets and children. Then three figures (`Uptime`, `Assets depending`,
`Reporting through`), the children as clickable status pills, and actions. Beneath the cards, the **Estate
topology** tree: `facility ▸ parent ▸ n× role`, with an explicit line for orphans — *"4 devices report directly
to the platform with no parent."*

**Coverage.** The facility plan in coverage mode with a facility chip-switch when scope is `All`, and a
`🏢 Open Digital Twin` action; beneath it, coverage by zone **worst first** — *"this is the order the coverage
budget should be spent in."*

**Firmware.** The campaigns table, with a subtitle that explains the most common confusing state: *"A paused
campaign is usually waiting on a device that cannot be reached."*

### 23.8.5 Filters, search and sort

| Control | Values |
|---|---|
| Role chips | `All roles · Tag · Reader · Gateway · Anchor · Scan Station · Sensor`, each with a count |
| Search | device name · id · zone · facility · bound asset · IP |
| State select | `All · Healthy · Degraded · Offline · Maintenance · Unprovisioned` |
| `🔋 Battery under 20%` | Toggle, with the count inline |
| Sort | `name` `role` `state` `zone` `battery` `signal` `uptime` `serves` `lastSeen` |

**There is no technology filter.** Deliberately, permanently, and per §23.1.1.

### 23.8.6 Tables and columns

**Device estate** — eleven columns:

| Column | Content |
|---|---|
| ☐ | Row select (page-level header) |
| **Device** | Role icon, name, `Reboot queued` / `Replace` chips, id |
| **Role** | What it does |
| **State** | Chip with dot |
| **Facility / zone** | Zone above, facility beneath |
| **Technology** | *Muted grey, smallest weight on the row*, with the header tooltip *"Recorded for the administrator only — nobody outside this screen picks a radio"* |
| **Battery** | `BatteryPill`; passive devices show `—`, never `0%` |
| **Signal** | Meter + % |
| **Firmware** | Version, plus an amber `Update` chip when behind and a primary `Scheduled` chip once queued |
| **Serves** | Tags served or assets covered |
| **Last seen** | Relative time — except an uncommissioned device, which reads `Awaiting first check-in`, because *"2 days ago" would be a lie* |

**Coverage by zone** — six columns: `Zone` (link into `Locate ▸ Zones`) · `Coverage` (meter + %) · `Devices`
(clickable, searches the estate for that zone) · `Blind spots` (chip; `None` in emerald) · `Assets at risk` ·
**`What would fix it`** — a plain remediation sentence per row (*"One additional reader would close this."* /
*"Three readers, or one gateway re-sited toward the far wall, would close this."*).

**Firmware campaigns** — nine columns: `Campaign` (name + id) · `Target` (role, clickable into the estate) ·
`Version` (`from → to`) · `Progress` (meter + `done/total`) · `Failures` · `State` · `Window` · `Owner` ·
`Actions`.

### 23.8.7 Cards

**Parent device cards** on the Topology tab. A card here is right because each parent carries a *consequence
paragraph* rather than a set of values — and because the blast-radius block needs room to be alarming.

### 23.8.8 Actions, context menus, bulk actions

| Surface | Actions |
|---|---|
| **Header** | `+ Provision device` |
| **Device drawer footer** | `↻ Reboot` · `🩺 Run diagnostics` · `⬆ Schedule firmware` · `Mark for replacement` (destructive styling, right-aligned) |
| **Bulk bar** | `Reboot` · `Schedule firmware` · `Mark for replacement` · `Export` |
| **Topology card** | `Open device`; when offline, `See the affected assets →` into `Locate ▸ Zones` |
| **Campaign row** | `Pause` (running) · `Resume` (paused or scheduled) · `Retry failed` (when failures > 0) |
| **Estate header** | `Export` — the filtered device set to CSV |

Each action states its own consequence in the toast: *"Reboot queued — 3 devices will drop for roughly 40
seconds"*; *"Firmware scheduled — 12 devices added to the 01:00 window tonight"*; *"{campaign} paused —
in-flight devices will finish; the rest hold."* **Never "Success."**

**Context menus:** none.

### 23.8.9 Detail panels

**Device drawer** — three sections:

```
eyebrow   state chip · role chip · [Replacement queued] [Reboot queued]
title     Device name          subtitle  {id} · {facility} ▸ {zone}
────────────────────────────────────────────────
Identity    Device id · Role · Facility · Zone · Technology (the one spec line) ·
            Reports through → parent · Serving → n devices → Topology · Bound asset → Asset 360
Condition   Uptime | Battery | Signal  (three tiles)
            Firmware (with inline Upgrade) · Serves · Last seen · Installed ·
            Replace by (with days remaining, red ≤7) · Address (IP)
Diagnostics 3–5 named checks, each with an ok/warn/bad dot and a plain value
────────────────────────────────────────────────
footer    [↻ Reboot] [🩺 Run diagnostics] [⬆ Schedule firmware]     [Mark for replacement]
```

**Provisioning drawer** — subtitled *"Role first. The radio is the last thing you pick, and only because the
installer needs it."* Fields in order: **what does it do?** (a six-tile role picker), **name** (optional —
*"leave it blank and we will name it after its zone and role"*), **facility** and **zone**, then
**technology** (captioned *"Recorded for the installer. It never reaches an operator's screen."*) and
**reports through** (parent, defaulting to *"Directly to the platform"*). It closes with a `What happens next`
block: *"It joins the estate as **Unprovisioned** on firmware v4.8.2, and turns Healthy after its first
check-in from site. Nothing counts it toward coverage until then."*

The field order **is** the principle, made physical: role first, radio last, and honest about the fact that the
radio exists.

### 23.8.10 Empty states

| Situation | State |
|---|---|
| Nothing needs attention | ✅ *"Nothing needs a technician — every device in this scope is reporting, charged and current."* |
| No replacements due | 🧰 *"No replacements due — nothing in this scope has hit its predicted end of life."* |
| Estate filters match nothing | *"No devices match these filters — try a different role, state or search term."* + `Clear filters` |
| No parents in scope | 🛰️ *"No parent devices in this scope — readers, gateways and anchors appear here once provisioned."* |
| Nothing to draw in topology | 🗺️ *"Nothing to draw — no devices are registered in this scope."* |
| No zones in coverage scope | 📡 *"No zones in this scope — pick a different facility to see its coverage."* |
| No campaigns | 📦 *"No campaigns — nothing is being rolled out right now."* |
| Parent has no children | *"Nothing reports through this device yet."* |

### 23.8.11 Permissions

| Capability | Super Admin | Org Admin | Facility Mgr | Technician | Security Officer |
|---|---|---|---|---|---|
| View fleet health, estate, topology, coverage | ✅ | ✅ | ✅ | ✅ | ✅ (read) |
| Export the estate | ✅ | ✅ | ✅ | ✕ | ✕ |
| Run diagnostics | ✅ | ✅ | ✅ | ✅ | ✕ |
| Reboot a device | ✅ | ✅ | ✅ | ✅ | ✕ |
| Schedule firmware (single) | ✅ | ✅ | ✕ | ✅ | ✕ |
| Mark for replacement | ✅ | ✅ | ✅ | ✅ | ✕ |
| **Provision a device** | ✅ | ✅ | ✕ | ✕ | ✕ |
| **Decommission / unbind a device** | ✅ | ✅ | ✕ | ✕ | ✕ |
| Create / pause / resume a campaign | ✅ | ✅ | ✕ | ✕ | ✕ |
| Retry failed campaign devices | ✅ | ✅ | ✕ | ✅ | ✕ |
| Edit zone coverage targets | ✅ | ✅ | ✕ | ✕ | ✕ |

A Technician can reboot and re-flash a single device — that is field work. A Technician cannot start a campaign
across 46 devices — that is a change window, and it needs an owner with a rollback plan.

### 23.8.12 Notifications, automation, approvals

**Notifications.**

| Event | Who | Channel |
|---|---|---|
| Reader or gateway silent 30 min | IoT Platform on-call; facility manager if the zone is armed | in-app + SMS |
| Anchor cluster degraded | IoT Platform | in-app |
| Battery below 20% | IoT Platform, batched daily | digest |
| Replacement due in 7 days | Device owner + procurement | email |
| Campaign paused or failing | Campaign owner | in-app + email |
| Device provisioned but never checked in after 48h | Provisioner | in-app |

**Automation.**

- `TRK-RULE-05` — no heartbeat for 30 minutes → **P1 if the zone is armed, else P2**; assign IoT Platform; mark
  dependent zones unverifiable. That last consequence is the important one: the outage propagates into
  Inventory Control as *"blocked on the cage reader"* rather than silently corrupting a count.
- `TRK-RULE-06` — battery under 20% → P3, batch into the next swap round.
- `TRK-RULE-11` — three or more journeys sharing a blind spot longer than 20 minutes → P3, add to the coverage
  plan. Coverage problems are inferred from movement, not just from device density.
- **Auto-resolution** — a device that recovers inside the grace window closes its own alert.
- **Predicted replacement** — `replaceBy` is written by the model, not by a human, from battery decay, uptime
  trend and install age.

**Approval workflows.**

| Workflow | Approver | Why |
|---|---|---|
| **Firmware campaign start** | Organization Admin | A bad firmware push blinds a facility. The change window and the owner are recorded on the campaign |
| **Decommission a device serving > 0 assets** | Organization Admin | Removing a parent orphans its children; the dialog names them and requires re-parenting or explicit acceptance |
| **Coverage capital request** | Facility Manager → Finance | Generated from the coverage table with the remediation sentence and its cost, so the budget ask arrives pre-justified |

### 23.8.13 Audit logging

| Event | Payload | Retention |
|---|---|---|
| `tracking.device.provisioned` | id, role, technology, facility, zone, parent, firmware, actor | 7 years |
| `tracking.device.rebooted` | id, actor, reason | 1 year |
| `tracking.device.diagnostics_run` | id, actor, result summary | 1 year |
| `tracking.device.firmware_scheduled` | id(s), from, to, window, actor | 3 years |
| `tracking.device.marked_for_replacement` | id, actor, predicted vs manual | 3 years |
| `tracking.device.decommissioned` | id, actor, children re-parented, assets affected | 7 years |
| `tracking.tag.bound` / `tracking.tag.unbound` | tag id, asset id, actor, previous binding | **7 years** |
| `tracking.campaign.started` / `_paused` / `_resumed` / `_retried` | campaign, actor, counts | 3 years |
| `tracking.coverage.target_changed` | zone, before/after, actor | 3 years |

`tracking.tag.bound` is retained longest because it is the join between the physical world and the record. Every
location fact the platform has ever asserted depends on that binding being right; when it is wrong, the binding
history is the only way to work out how long it was wrong for.

### 23.8.14 Exports and reports

| Output | Contents | Cadence |
|---|---|---|
| **Device estate** (CSV) | The filtered set: id, name, role, state, technology, facility, zone, firmware, battery, signal, uptime, serves, parent, last seen, installed, replace-by, IP | On demand |
| **Coverage plan** (PDF) | Every zone worst-first with coverage, blind spots, assets at risk, remediation and cost — the capital request | Quarterly |
| **Fleet health report** | Health %, uptime distribution, outage minutes by device, MTBF per role | Monthly to Operations |
| **Replacement forecast** | Devices due in 30 / 60 / 90 days, with cost — feeds CapEx forecasting | Quarterly to Finance |
| **Firmware compliance** | Devices by version against baseline, per role and facility | Monthly to Security |

### 23.8.15 Role-based behaviour

| Role | Lands on | Notable difference |
|---|---|---|
| Technician | `Fleet health` | The `Needs attention` list *is* their work queue; write actions limited to single-device |
| Organization Admin | `Device estate` | Provisioning and campaign controls live |
| Facility Manager | `Coverage` | Reads the estate; owns the budget conversation, not the hardware |
| Security Officer | `Topology` | Read-only; cares about blast radius on armed zones |
| Super Admin | `Fleet health` | Everything, across every facility |

### 23.8.16 AI capabilities

| Capability | Surface |
|---|---|
| **Coverage optimisation** | Turns each zone's blind spots into a costed, ranked remediation — *"One additional reader would close the gap for ₹42,000"* — and orders the whole table as a spend plan. It reasons over journey gaps as well as device density, so it finds corridors nobody thought to instrument |
| **Predicted tag failure** | `replaceBy` per device from battery decay curve, uptime trend, signal degradation and install age, driving the replacement queue and the 7-day notification. Its accuracy is what turns "the tag died" into "the tag was swapped last Tuesday" |
| **Anomaly on the estate** | Detects a reader whose read-rate has quietly halved — degraded long before offline, and invisible to a heartbeat check |
| **Blast-radius simulation** | *"If DEV-GW-02 fails, 118 tags and 4 zones lose their uplink"* — computed before the failure, so redundancy gets budgeted before the outage |
| **Firmware risk scoring** | Ranks which devices to upgrade first and which to hold, from failure rates observed across the campaign so far |

### 23.8.17 Future scalability

- **Devices outnumber assets.** At 100k assets the estate is 100k+ tags plus thousands of parents. The flat table
  must become parent-scoped by default (*"show me what hangs off this gateway"*), with tags reachable through
  their parent or through their bound asset — not through a 100k-row list.
- **Topology** needs a real graph view with collapse/expand and a search-to-node, replacing the card grid above
  ~30 parents.
- **Coverage** moves from zone-granularity to a computed grid, but the *output* must stay a ranked table with a
  price. The heatmap was deleted once already (§23.2.6); it should not return as a scalability answer.
- **Campaigns** need staged rollouts (canary → 10% → all), automatic halt on failure rate, and per-facility
  windows.
- **Diagnostics** stay per-device and on-demand; they must never become a streaming console, which is how
  `Telemetry Explorer` was born the first time.

---

## 23.9 The Digital Twin (`/tracking/twin/[facility]`)

**Not a module. A visualisation, launched from the modules.** It holds no sidebar row (§23.2.7), and it is the
only screen in the pillar organised around a *place* rather than a *job*.

### 23.9.1 Purpose and shape

One building, seen whole: one large plan, **one layer at a time**, a zone inspector, and hand-offs into the four
modules that can act — each pre-scoped to this facility.

| Layer (`?mode=`) | Answers |
|---|---|
| `presence` | Where is everything right now? |
| `coverage` | Where can we hear, and where not? |
| `inventory` | Where does the count disagree with the book? |

```
{Facility name}                                   [ ● Live ] [ 🏭 🏢 🖥️  facility switch ]
├── Live floor plan (main)     layer chips · [Asset markers] [Only exceptions N] · plan · legend
└── Rail (340px)
    ├── Zone inspector         (when a zone is selected)
    ├── 4 stat tiles           Tracked here · Coverage · Rooms reconciled · Open alerts
    ├── What this building is reporting   the facility's activity feed
    └── Work this building     the four modules, already scoped
└── Zone strip                 the plan, read as a list
```

### 23.9.2 Controls, inspector and hand-offs

**Controls.** Layer chips; `Asset markers` toggle (*plot every tracked asset on the plan*); `Only exceptions`
toggle with a live count (*missing, unheard, misplaced or under alert*). The layer, the open zone and the
exceptions filter all travel in the URL, so a twin view is shareable — which is how it gets used in an incident
call.

**One definition of "needs a human"** governs the exceptions filter, the zone tiles and the inspector alike:
`Missing` **or** `Offline` **or** `custody = Unaccounted` **or** any open alert **or** (`zone ≠ homeZone` and
`custody = In Place`). The same asset is never an exception in one place and fine in another.

**Zone inspector.** Policy chips (`🔒 Policy enforced` / `Open zone`, dwell limit, violations, `Re-count
queued`), four stats (`Detected`, `Live signals`, `Coverage`, `Needs a person`), a split meter of the room's
truth, a value sentence (*"₹4.2 L of asset value resolves to this zone · 34 assets sit outside reliable
coverage"*), the assets inside, the **devices serving this zone** with their health, and three actions:
`Locate in this zone` · `Open the room record` · `Re-count this zone`.

**Hand-offs.** `Work this building` lists all four modules with a live hint each — *"14 open · 3 overdue"*,
*"6 of 8 rooms reconciled"* — and every link carries `?facility=`. Nothing in the Twin is a dead end; it is a
lens, and every part of it points back at a workspace.

### 23.9.3 Permissions, empty state, scalability

- **Permissions.** Read-only for every tracking role, with two write affordances that are really requests:
  `Re-count this zone` (queues a verification) and flagging an asset. Value figures hidden from Technician.
- **Empty state.** A facility without `twinReady` shows 🏢 *"No twin for this facility — a building needs a
  floor-plan and live coverage before it can be twinned"* with a route back to the Dashboard. **A building
  without a floor-plan cannot be twinned, and the product says so rather than rendering an empty box.**
- **Audit.** `tracking.twin.viewed` (facility, layer, actor) at 30 days; `tracking.zone.recount_requested` at
  3 years.
- **Scalability.** Markers cluster above ~500 per plan; the zone strip virtualises above ~40 zones; multi-floor
  buildings gain a floor selector rather than a second screen. The twin never becomes a 3D model for its own
  sake — the plan is a working surface, not a demo.

---

## 23.10 The object model

Seventeen entities, four clusters, one spine. The spine is `TrackedFacility ▸ TrackedZone`: **every other object
in the pillar hangs off a zone, and every screen is filtered by facility.**

```
TrackedFacility ─┬─ TrackedZone ─┬─ AssetPresence ── AssetJourney ── JourneyStop
   slug           │   policy      │     precision       stops[]         kind, dwell
   coverage       │   expected    │     confidence      gaps
   twinReady      │   armed       │     homeZone
                  │               │
                  ├─ InventoryRoom ─┬─ Rack ── RackSlot
                  │   expected      │   42U     Present|Missing|Unexpected|Empty
                  │   detected      │
                  │   accuracy      └─ AuditSession ── (approver, approvedAt)
                  │   autoVerify
                  │
                  ├─ CoverageCell        (derived: coverage, blindSpots, assetsAtRisk)
                  │
                  └─ TrackingDevice ──┬── TrackingDevice   (parentId → topology)
                      role, state     │   DeviceDiagnostic[]
                      technology      └── FirmwareCampaign  (by targetRole)

  MovementTxn ── AssetPresence          custody: who has it, when it is back
  UnknownDetection                      a tag we can hear but cannot name
  InventoryException                    every unexplained difference
  TrackingAlert ── AlertTimelineEntry[] ── Incident (many alerts, one event)
  AutomationRule → raises TrackingAlert
  TrackingEvent                         the activity stream every module reads
```

### 23.10.1 Entities

| Entity | Identity | What it is | Key fields | Related to |
|---|---|---|---|---|
| **TrackedFacility** | `slug` | A building in scope | `name`, `short`, `building`, `coverage`, `assetsTracked`, `twinReady` | parent of everything |
| **TrackedZone** | `id` | A rectangle on the plan with a policy | `kind`, `policy`, `x/y/width/height`, `expected`, `detected`, `coverage`, `violations24h`, `armed`, `dwellLimitMin` | facility; rooms; devices; presence |
| **AssetPresence** | `assetId` | Where one asset is *now* | `state`, `custody`, `facility`, `zone`, **`homeZone`**, `position`, **`precision`**, **`confidence`**, `lastSeen`, `custodian`, `movingNow`, `batteryPct`, `criticality`, `valueInr`, `alertIds` | the asset registry; zone; alerts |
| **AssetJourney** | `assetId` | Where it has been, in a window | `windowFrom/To`, `stops[]`, `distanceM`, `zonesVisited`, **`gaps`** | presence |
| **JourneyStop** | — | One event on the trail | `at`, `zone`, `x/y`, `kind`, `dwellMin`, `actor`, `note` | journey |
| **InventoryRoom** | `id` | A countable space | `zoneId`, `kind`, `expected`, `detected`, `unexpected`, `missing`, `accuracy`, `lastVerified`, `custodian`, `rackCount`, `autoVerify` | zone; racks; audits |
| **Rack** | `id` | A 42U column inside a room | `heightU`, `slots[]`, `status`, `lastVerified`, `loadPct`, `inletTempC` | room |
| **RackSlot** | `u` | One rack unit | `state`, `assetId`, `assetName`, `tagId` | rack; asset |
| **AuditSession** | `id` | A count with a signature | `scope`, `state`, `method`, `expected/detected/unexpected/missing`, `progress`, `owner`, **`approver`**, **`approvedAt`**, `note` | room; facility |
| **MovementTxn** | `id` | A custody change | `direction`, `person`, `department`, `at`, `dueBack`, `returnedAt`, `purpose`, `location`, `state`, `approver`, **`verified`** | asset; facility |
| **UnknownDetection** | `id` | A tag heard but not named | `tagId`, `firstSeen`, `lastSeen`, `zone`, `seenCount`, `state`, **`suggestion`**, **`suggestionConfidence`**, `reason` | zone; the matcher |
| **InventoryException** | `id` | An unexplained difference | `kind`, `assetId`/`tagId`, `room`, `expectedRoom`, `ageHours`, `severity`, `state`, `owner`, `valueInr`, `recommendation` | room; asset |
| **TrackingAlert** | `id` | A signal that needs a person | `category`, `priority`, `state`, `assetId`/`deviceId`, `location`, `raisedAt`, `ackAt`, `resolvedAt`, **`slaDueAt`**, `slaBreached`, `assignee`, `team`, `incidentId`, `source`, **`recommendation`** + `recommendationAction`, `valueAtRiskInr`, `timeline[]` | asset; device; incident; rule |
| **AlertTimelineEntry** | — | One step in an alert's life | `at`, `actor`, `action`, `note` | alert |
| **Incident** | `id` | Several alerts, one event | `severity`, `state`, `alertIds[]`, `commander`, `assetsAffected`, `valueAtRiskInr`, `summary`, `nextAction` | alerts |
| **AutomationRule** | `id` | The sentence that raises alerts | `category`, `when`, `then[]`, `priority`, `assignTeam`, `escalateAfterMin`, `enabled`, `firedToday`, **`suppressedToday`** | alerts |
| **TrackingDevice** | `id` | A thing on a wall or a chassis | **`role`**, `state`, `technology`, `facility`, `zone`, `firmware`/`firmwareLatest`, `uptimePct`, `batteryPct`, `signalPct`, `serves`, **`parentId`**, `lastSeen`, `installedAt`, **`replaceBy`**, `ip`, `assetId`, `diagnostics[]` | zone; itself (topology); asset |
| **DeviceDiagnostic** | — | One named check | `label`, `value`, `state: ok\|warn\|bad` | device |
| **CoverageCell** | `zoneId` | Derived hearing quality | `coverage`, `devices`, `blindSpots`, `assetsAtRisk` | zone; devices |
| **FirmwareCampaign** | `id` | A rollout | `targetRole`, `fromVersion`/`toVersion`, `total`/`done`/`failed`, `state`, `window`, `owner` | devices |
| **TrackingEvent** | `id` | The activity stream | `kind`, `title`, `detail`, `assetId`, `zone`, `actor`, `tone` | everything |

### 23.10.2 The five relationships that carry the product

1. **`AssetPresence.zone` vs `AssetPresence.homeZone`.** The whole "misplaced" concept is this one comparison,
   qualified by custody. It is why the asset drawer can say *"detected in X, home zone is Y — but it is checked
   out, so this may be legitimate."* Without `homeZone` there is no exception; without `custody` every checked-out
   asset is a false positive.
2. **`InventoryRoom.zoneId` → `TrackedZone`.** The join that lets a click on the floor-plan open a room record,
   and lets a zone with no counted room say so honestly rather than doing nothing.
3. **`TrackingDevice.parentId` → `TrackingDevice`.** A self-referential edge, and the entire Topology tab. It is
   what turns *"a reader is offline"* into *"210 assets became unverifiable and 3 devices lost their uplink."*
4. **`TrackingAlert.incidentId` → `Incident.alertIds[]`.** Bidirectional by construction. An incident is not a
   bigger alert; it is a **narrative with a commander** over a set of alerts that each stay independently
   workable.
5. **`UnknownDetection.suggestion` → an asset id.** The bridge between the physical world and the registry. When
   accepted it writes a `tracking.tag.bound` event; that binding is the assumption every location fact rests on.

### 23.10.3 Enumerations — the pillar's vocabulary

| Enum | Values | Note |
|---|---|---|
| `LocationPrecision` | `Precise · Room · Site · Last scan` | **The technology-transparency surface.** Never shows a radio |
| `PresenceState` | `Online · Stale · Offline · In Transit · Missing` | `Stale` + `Offline` render as one filter, `Not seen` |
| `CustodyState` | `In Place · Checked Out · In Transit · Unaccounted` | Orthogonal to presence — an asset can be Online and Unaccounted |
| `ZoneKind` | `Storeroom · Data Hall · Office · Dock · Secure Cage · Lab · Transit` | |
| `ZonePolicy` | `Open · Authorised only · No exit without check-out · Dwell limit · After-hours watch` | Rendered as sentences, never as geofence primitives |
| `JourneyEventKind` | `Seen · Entered · Exited · Dwell · Checked Out · Checked In · Gap · Alert` | `Gap` is a statement about *us*, not the asset |
| `RoomKind` | `Storeroom · Data Hall · Secure Cage · Staging · Dock` | |
| `RackSlotState` | `Present · Missing · Unexpected · Empty` | |
| `AuditState` | `Scheduled · In Progress · Review · Approved · Closed` | `Review` is the state that needs a signature |
| `AuditMethod` | `Automatic · Assisted · Manual` | A way of working, not a technology |
| `MovementDirection` / `MovementState` | `Out · In` / `Open · Returned · Overdue · Pending Approval · Rejected` | |
| `UnknownState` | `New · Investigating · Matched · Registered · Ignored` | |
| `ExceptionKind` | `Missing · Unexpected · Misplaced · Duplicate · Unverified · Ghost` | `Ghost` = on the books, never once detected |
| `TrackingAlertCategory` | eleven values — §23.12 | |
| `AlertLifecycle` | `New · Acknowledged · Assigned · In Progress · Escalated · Resolved · Closed` | §23.13 |
| `AlertPriority` | `P1 · P2 · P3 · P4` | |
| `IncidentState` | `Open · Investigating · Contained · Resolved · Closed` | |
| `DeviceRole` | `Tag · Reader · Gateway · Anchor · Scan Station · Sensor` | **What it does.** The only device grouping the UI offers |
| `DeviceState` | `Healthy · Degraded · Offline · Maintenance · Unprovisioned` | `Unprovisioned` is grey, not red |
| `TrackingEventKind` | `Movement · Custody · Detection · Alert · Audit · Device` | |

### 23.10.4 Where this model meets the rest of the platform

| Boundary | Direction | Contract |
|---|---|---|
| **Asset registry** (`Asset`) | Tracking reads | `AssetPresence.assetId` is the asset. Tracking never owns name, category, value or custodian of record — it *projects* them |
| **Asset 360 ▸ Tracking tab** | Assets reads | The single-asset view of `AssetPresence` + `AssetJourney` + bound devices. Same objects, one subject |
| **Maintenance** (`WorkOrder`) | Both | `Asset Removed` alerts check for an open work order before raising; a `Mark for replacement` device action can raise one |
| **Security & Compliance** (`Alert`) | Separate | Different object, different lifecycle (§23.3.3). Cross-linked, never merged |
| **Mobile Workforce** (`/checkinout`) | Shares | Same `MovementTxn`. Kiosk writes; ledger governs |
| **Finance** | Tracking emits | Unverified value, coverage capital requests, replacement forecast |
| **Analytics & Reporting** | Tracking emits | Every export in this document lands in the Export Center |

---

## 23.11 Sixteen end-to-end workflows

Every workflow below is written as **screen · actor · action · system response · audit record**. Where a step
crosses a module boundary the destination is named with its deep link, because the hand-off *is* the design.

### 23.11.1 Locate Asset

*Trigger: a technician needs a specific asset now.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | Dashboard | Technician | `🔎 Locate an asset` | Opens `Locate ▸ Live Map`, scope preserved | `tracking.dashboard.action_used` |
| 2 | Locate ▸ Live Map | Technician | Types the asset name in *Narrow it down* | Marker list filters live; matching markers stay lit, others dim | — |
| 3 | Locate ▸ Live Map | Technician | Clicks the marker | Asset drawer opens: presence pill, **precision chip + confidence**, zone, home zone, last seen, custodian | `tracking.presence.viewed` |
| 4 | Asset drawer | Technician | Reads `Room-level · 88%` and `Server Room Alpha` | No radio is named anywhere; the operator gets the room and a confidence | — |
| 5 | Asset drawer | Technician | *(optional)* `Replay journey` | Switches to `Movement & Replay` with the asset selected | — |
| 6 | Physical | Technician | Walks to the zone and finds it | — | — |
| 7 | Asset drawer | Technician | *(if not found)* `Report missing` → §23.11.8 | Row flips to `Missing / Unaccounted`; KPI increments | `tracking.presence.reported_missing` |

**Failure path.** If precision is `Last scan` and confidence < 40, the drawer leads with the honesty line —
*"this is a memory, not a fix"* — and promotes `Report missing` over `Locate`.

### 23.11.2 Assign Tag

*Trigger: a newly received asset needs a tag bound to it, or a spare tag needs an owner.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | Infrastructure ▸ Device estate | Org Admin | Filters `Role = Tag`, searches for the spare | Table shows unbound tags (`Serves —`, `Bound asset` empty) | — |
| 2 | Device drawer | Org Admin | `Bind to asset` → asset picker | Picker searches the registry; untagged assets are ranked first | — |
| 3 | Device drawer | Org Admin | Selects `AST-2131 · iPad Air (Ops)` | Platform validates: tag is unbound, asset has no active tag, both in the same facility | — |
| 4 | Device drawer | Org Admin | `Confirm binding` | `assetId` written to the device; the asset appears in `Locate` within one detection cycle at `Last scan` precision, rising as the estate hears it | **`tracking.tag.bound`** (tag, asset, actor, previous binding) |
| 5 | Locate ▸ Asset List | Org Admin | Verifies the asset now resolves | Precision climbs `Last scan → Room` on first read; confidence rises | — |
| 6 | Asset 360 ▸ Tracking | — | — | The binding appears on the asset's own record; the label is printed from `Assets ▸ /assets/labels` | `tracking.label.printed` |

**Alternate entry.** From `Inventory ▸ Exceptions`, an unidentified tag with a high-confidence suggestion is
bound in one click via `Accept match` (§23.11.7) — the same event is written.

### 23.11.3 Track Asset (watch a movement in progress)

*Trigger: an asset is on the move and someone needs to follow it.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | Locate ▸ Live Map | Facility Manager | Filters `Presence = In transit` | Markers reduce to moving assets; `Moving now` chips appear in the drawer | — |
| 2 | Locate ▸ Movement & Replay | Facility Manager | Selects the asset | Trail draws to the live end; scrubber parks at the newest stop | — |
| 3 | Replay | Facility Manager | Presses `▶` | Trail animates stop by stop at ~850ms per stop; dwell and zone update as it plays | — |
| 4 | Replay | Facility Manager | Reads `Distance 1,840 m · 4 zones · Total dwell 5h 1m · Gaps 0` | Four stat cards summarise the window | — |
| 5 | Replay | Facility Manager | *(if `Gaps > 0`)* Reads the amber banner | *"That is a coverage problem where the asset was, not a problem with the asset."* → `Review coverage` | — |
| 6 | Infrastructure ▸ Coverage | Facility Manager | Follows the link | Lands on the ranked coverage table with the remediation sentence | `tracking.coverage.viewed` |

### 23.11.4 Check-Out

*Trigger: a person needs to take an asset out of a storeroom.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | Inventory ▸ Check-In / Check-Out | Custodian | Direction is `🎫 Check out` (default) | Asset picker searches only assets `custody = In Place` | — |
| 2 | Transaction form | Custodian | Picks the asset | Card shows the asset and a **gate chip**: `Presence verified at the gate` (emerald) or `Not confirmed at the gate` (amber), with `seen {when}` | — |
| 3 | Transaction form | Custodian | — | If `value ≥ ₹2,00,000`, an amber line appears *before* submission: *"above the ₹2,00,000 release limit, so this needs a manager's approval"* | — |
| 4 | Transaction form | Custodian | Fills `Issued to`, `Department`, `Purpose`, `Due back` | `Release asset` enables only when asset, person and purpose are all set | — |
| 5 | Transaction form | Custodian | `Release asset` | Row appears at the top of the movement log as `Open`, or `Pending Approval` above the threshold. Custody flips to `Checked Out`; the asset stops counting as "misplaced" wherever it goes | `tracking.custody.checked_out` (+ `_approval_requested`) |
| 6 | Notification | Approver | Receives in-app + email | — | — |
| 7 | Movement log | Facility Manager | `Approve` / `Reject` | `Pending Approval → Open` (or `Rejected`), stamped with the approver | `tracking.custody.approval_approved` / `_rejected` |

**Why the gate chip matters.** A check-out where the estate never actually heard the asset is `Paperwork only`,
and it stays visibly so in the log forever. That column is the first thing an auditor asks about.

### 23.11.5 Check-In

*Trigger: an asset comes back.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | Inventory ▸ Check-In / Check-Out | Custodian | Switches direction to `↩️ Check in` | Asset picker now searches only assets `custody = Checked Out` | — |
| 2 | Transaction form | Custodian | Picks the asset, enters `Returned by` and `Condition on return` | `Due back` field hides — irrelevant on return | — |
| 3 | Transaction form | Custodian | `Confirm return` | New `In / Returned` row; `returnedAt` stamped; custody flips to `In Place`; any `Overdue` state on the original check-out clears | `tracking.custody.checked_in` |
| 4 | KPI strip | — | — | `Checked out` decrements; `Overdue returns` decrements if it was late; Dashboard `checked in` delta increments | — |
| 5 | Alerts | Automation | — | Any open `Missing Asset` alert raised by `TRK-RULE-12` for this asset auto-resolves with an `Auto-resolved` timeline entry | `tracking.alert.auto_resolved` |

### 23.11.6 Inventory Audit

*Trigger: a scheduled or ad-hoc count.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | Inventory ▸ Audits | Facility Manager | Picks a room in `Scope`, picks `Method` | Tooltips explain each method in operational terms, never in technology | — |
| 2 | Start panel | Facility Manager | `📋 Start count` | **`Automatic`** → the room has already counted itself: the session lands in `Review` at 100% with the variance ready. **`Assisted` / `Manual`** → lands in `Scheduled` at 0%, because a person must be sent | `tracking.audit.opened` |
| 3 | Physical | Storeroom team | *(Assisted/Manual)* Walks the room | Progress climbs; `In Progress` | `tracking.audit.progress` |
| 4 | Audits table | — | Count reaches 100% | State → `Review`; variance computed (`expected · detected · unexpected · missing`); tab badge increments | `tracking.audit.variance_raised` |
| 5 | Audit drawer | Approver *(not the owner)* | Reads the amber consent panel | *"Approving accepts 4 missing and 1 unexpected units against the book and stamps your name on the record."* | — |
| 6 | Audit drawer | Approver | `✅ Approve variance` | State → `Approved`; `approver` + `approvedAt` stamped; lifecycle rail gains *"Variance signed off"* | **`tracking.audit.approved`** (immutable) |
| 6a | Audit drawer | Approver | `↩️ Reject and re-count` | State → `In Progress`, progress and detected reset to 0, note recorded, returned to the owner | `tracking.audit.rejected` |
| 7 | Export | Approver | `Export report` | Evidence pack: counts, variance table, lifecycle, both signatures | `tracking.export.requested` |

**Segregation of duties.** The owner of a count cannot approve it. The button renders disabled with the reason
on hover.

### 23.11.7 Unknown Asset Detection

*Trigger: the estate reads a tag identity that the registry cannot name.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | — | Automation | Tag read 50+ times in 12h | `TRK-RULE-04` fires: `Unknown Tag` P3 to Inventory; the matcher runs | `tracking.alert.raised` |
| 2 | Inventory ▸ Exceptions | Facility Manager | Opens the queue, filters `Unidentified` | The tag appears as `Tag E28011606991`, prefix stripped — **no radio named** | — |
| 3 | Queue row | Facility Manager | Reads the recommendation and the AI block | *"Best match: AST-1120 · Dell PowerEdge R660 (retired 2026-03)"* with a **71% confidence meter** | — |
| 4a | Queue row | Facility Manager | `Accept match` | State → `Matched`; the binding is proposed against the suggested asset | `tracking.unknown_tag.matched` |
| 4b | Queue row | Facility Manager | `Register` | Opens registration → the asset is created or bound (§23.11.2); state → `Registered` | `tracking.unknown_tag.registered` + **`tracking.tag.bound`** |
| 4c | Queue row | Facility Manager | `Ignore` | State → `Ignored` (e.g. *"vendor demo tag left on site"*); the rule suppresses future reads of this identity | `tracking.unknown_tag.ignored` |
| 5 | Alerts | Automation | — | The linked `Unknown Tag` alert resolves; `Unidentified tags` KPI decrements | `tracking.alert.resolved` |

**Bulk rule.** Bulk `Resolve` on unidentified rows maps to `Ignored`, never to `Registered` — registering is an
identity claim and is made one row at a time.

### 23.11.8 Missing Asset Investigation

*Trigger: an asset has not been detected within its class freshness window, or a human reports it.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | — | Automation | `lastSeen > 24h` and criticality High/Critical | `TRK-RULE-02` fires: **P1** `Missing Asset` to Security; a recovery search opens; escalates after 240 min | `tracking.alert.raised` |
| 1a | Locate ▸ Asset drawer | Any operator | `Report missing` (manual path) | Asset flips to `Missing / Unaccounted` **immediately on screen**; the same alert is raised | `tracking.presence.reported_missing` |
| 2 | Alerts ▸ Action queue | Security Officer | Opens the top row (breached first) | Drawer shows last known position, custodian, time of loss, value at risk, and the recommendation | — |
| 3 | Alert drawer | Security Officer | `Acknowledge`, then `Assign to me` | State `New → Acknowledged → Assigned`; `ackAt` stamped; MTTA clock stops | `tracking.alert.acknowledged`, `_assigned` |
| 4 | Alert drawer | Security Officer | `Start recovery search` (the recommendation action) | Notifies the last known custodian; opens the search record | `tracking.recovery.opened` |
| 5 | Locate ▸ Movement & Replay | Security Officer | Replays the asset | The trail ends at `Main Exit & Reception` with an `Exited` stop, then a `Gap` — *"No detection since. Recovery search open."* | — |
| 6 | Alerts | Security Officer | Selects this alert **and** the related `Unauthorized Movement` → `🧭 Create incident from selected` | `INC-4401 · Sev1 · Suspected theft` opens with both alerts linked, value summed, commander set | `tracking.incident.opened` |
| 7 | Incident drawer | Security Officer | Works the next action | *"Complete CCTV review and file a police report if unrecovered by 18:00 IST"* | `tracking.incident.updated` |
| 8 | Resolution | Security Officer | Asset recovered, or written off | Alert `Resolved`; if recovered, presence returns on first detection; if not, the asset routes to `Assets ▸ Lifecycle & Disposal` as a loss | `tracking.alert.resolved`, `tracking.incident.closed` |

### 23.11.9 Unauthorized Movement

*Trigger: an asset crosses a zone boundary in breach of that zone's policy.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | — | Zone Policy | Exit detected on a `No exit without check-out` zone with no open check-out | `TRK-RULE-01` fires: **P1** to Security · SMS + in-app · **opens an incident automatically** · locks the custodian record. Escalates after 60 min | `tracking.alert.raised` |
| 2 | Notification | Security Officer | Receives SMS | — | — |
| 3 | Alerts ▸ Action queue | Security Officer | Row is top of the queue (P1, breached) | Title: *"Asset left Bengaluru HQ without a check-out"*; summary names the policy and the time | — |
| 4 | Alert drawer | Security Officer | `Acknowledge` | `ackAt` stamped; MTTA recorded | `tracking.alert.acknowledged` |
| 5 | Alert drawer | Security Officer | `Attach to incident` (the recommendation action) | Links to the open `Missing Asset` incident if one exists; otherwise offers to create one | `tracking.incident.alert_linked` |
| 6 | Locate ▸ Zones & Rules | Security Officer | Opens the offending zone | Drawer shows the policy sentence, `armed` state, violations in 24h, and what is currently inside | — |
| 7 | Zone drawer | Security Officer | *(if the policy is wrong)* `Disarm zone` | Toast warns: *"movements are recorded but no longer raise alerts"* | `tracking.zone.disarmed` |
| 8 | Resolution | Security Officer | Confirms cause (theft, approved move, policy error) | `Resolved` with a note. An approved-move resolution proposes a rule refinement to reduce repeats | `tracking.alert.resolved` |

**The false-positive path is first-class.** `TRK-ALT-009` — after-hours cage movement — resolved as *"Matched to
approved move order MO-771."* Resolutions that say "no action needed" feed rule-effectiveness reporting (§23.7.14).

### 23.11.10 Incident Resolution

*Trigger: several alerts turn out to be one event.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | Alerts ▸ Action queue | Security Officer | Selects the related alerts | Bulk bar appears with a count | — |
| 2 | Bulk bar | Security Officer | `🧭 Create incident from selected` | Severity derived from the highest priority (`P1→Sev1`); value at risk summed; distinct assets counted; every alert stamped with the incident id; tab switches and the drawer opens | `tracking.incident.opened` + `tracking.incident.alert_linked` × n |
| 3 | Incident drawer | Commander | Reads summary and `Next action` | Narrative names who opened it and why the alerts are one event | — |
| 4 | Incident drawer | Commander | Works each linked alert (click through, act, return) | Linked-alert rows show state, owner and an `Overdue` chip each | `tracking.alert.*` per alert |
| 5 | Incident drawer | Commander | `Contain` | State → `Contained`. Toast is explicit: *"Spread stopped — linked alerts stay open until each is worked"* | `tracking.incident.contained` |
| 6 | Incident drawer | Commander | `Resolve`, then `Close incident` | State → `Resolved` → `Closed`; `resolvedAt` stamped; the incident leaves the open count and the Dashboard panel | `tracking.incident.resolved`, `_closed` |
| 7 | Export | Commander | Incident report (PDF) | Narrative, timeline, every linked alert with its own history, assets affected, value at risk, resolution | `tracking.export.requested` |

### 23.11.11 Gateway Failure

*Trigger: a gateway or anchor cluster degrades or stops reporting.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | — | Device Health | Uptime falls / heartbeat missed | `TRK-RULE-05` fires: **P2** `Gateway Offline` to IoT Platform (P1 if the zone is armed); dependent zones marked unverifiable | `tracking.alert.raised` |
| 2 | Locate | Any operator | — | Precision on the affected zone **downgrades visibly** — Floor 3 falls from `Precise` to `Room-level`, and the chip says so. Nothing silently gets less accurate | — |
| 3 | Alerts ▸ queue | Technician | Opens the alert | Recommendation: *"Firmware v2.3.7 is two releases behind — schedule the upgrade"* | — |
| 4 | Infrastructure ▸ Topology | Technician | Follows the device link | Parent card shows `5 of 8 anchors reporting`, 28 assets depending, children as status pills | — |
| 5 | Device drawer | Technician | `🩺 Run diagnostics` | Named checks: `Anchors reporting 5 of 8` (bad), `Ranging error ±1.8 m (target ±0.3 m)` (warn), `Firmware — upgrade available` (warn) | `tracking.device.diagnostics_run` |
| 6 | Device drawer | Technician | `⬆ Schedule firmware` (the recommendation action) | Device joins tonight's 01:00 window; a `Scheduled` chip appears on the estate row | `tracking.device.firmware_scheduled` |
| 7 | Alerts | Automation | Device recovers within the grace window | Alert auto-resolves with an `Auto-resolved` entry — *"Heartbeat restored within the grace window"* | `tracking.alert.auto_resolved` |

### 23.11.12 Reader Failure

*Trigger: a reader stops reporting — the highest-consequence infrastructure failure in the pillar.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | — | Device Health | No heartbeat for 30 min on an **armed** zone | `TRK-RULE-05` fires **P1** to IoT Platform; escalates after 120 min; the zone's assets become unverifiable | `tracking.alert.raised` |
| 2 | Alerts ▸ queue | Technician | Opens the alert | *"The cage cannot verify its own contents. 210 assets are currently unverifiable."* · `₹84,00,000` at risk | — |
| 3 | Infrastructure ▸ Topology | Technician | Opens the parent card | Red blast-radius block: *"210 assets in Secure Cage became unverifiable. 3 devices lost their uplink… Until it is back, nothing here can be confirmed present — only remembered."* | — |
| 4 | Topology card | Technician | `See the affected assets →` | `Locate ▸ Zones` opens on that zone with its occupants listed | — |
| 5 | Alert drawer | Technician | `Dispatch technician` (recommendation action) | Site visit booked; timeline entry written | `tracking.alert.assigned` |
| 6 | Inventory | — | Meanwhile | Dependent audits and re-counts show *"Blocked on the cage reader — re-verify once DEV-RD-09 is back"* rather than producing a false variance. A paused firmware campaign explains itself: *"Blocked on DEV-RD-09 being offline"* | — |
| 7 | Physical | Technician | Restores power and uplink | Device returns to `Healthy` on first check-in | `tracking.device.recovered` |
| 8 | Inventory ▸ Rooms | Facility Manager | `✅ Verify now` on the cage | Full re-count runs; variance recomputed against a working reader | `tracking.room.verified` |
| 9 | Alerts | Technician | `Resolve` both the device alert and the blocked missing-asset alert | Incident `INC-4402` moves `Contained → Resolved → Closed` | `tracking.alert.resolved`, `tracking.incident.closed` |

**The design point.** An outage must never look like a loss. Everything downstream of a dead reader says
*"cannot be confirmed"*, not *"missing"* — that distinction is the difference between a maintenance ticket and a
police report.

### 23.11.13 Battery Replacement

*Trigger: a tag battery falls below 20%.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | — | Device Health | `batteryPct < 20` on a bound tag | `TRK-RULE-06` fires **P3** to IoT Platform; batched into the next swap round | `tracking.alert.raised` |
| 2 | Dashboard | Technician | Clicks `batteries under 20%` | Lands on `Infrastructure ▸ Device estate` with the battery filter applied | — |
| 3 | Estate | Technician | Sorts by `Battery` ascending | Worst first; `BatteryPill` reddens under 20%; passive tags show `—` and never appear here | — |
| 4 | Estate | Technician | Selects the Chennai DC group | Bulk bar appears | — |
| 5 | Bulk bar | Technician | `Mark for replacement` | `Replace` chips appear on each row; devices join the replacement queue | `tracking.device.marked_for_replacement` |
| 6 | Alert drawer | Technician | `Batch battery swap` (recommendation action) | *"Batch with the 6 other low-battery tags in Chennai DC"* — one visit, seven swaps | — |
| 7 | Physical | Technician | Swaps the cells | On first check-in battery reads healthy; `replaceBy` clears | `tracking.device.battery_replaced` |
| 8 | Alerts | Automation | — | The P3 alert auto-resolves | `tracking.alert.auto_resolved` |

**Spare-tag exception.** An unassigned spare below 20% recommends `Retire device`, not a swap — *"Retire from the
spare pool rather than swapping the cell."*

### 23.11.14 Tag Replacement

*Trigger: a tag is failing, cloned, or has lost precision.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | — | Detection Matcher / Precision Monitor | Duplicate identity read in two zones within 60s, **or** an asset resolves to the room but no longer to the rack | `TRK-RULE-07` fires **P2** `Duplicate Tag` (suspend the identity, queue a replacement), or a `Tracking Failure` P2 is raised | `tracking.alert.raised` |
| 2 | Alerts ▸ queue | Technician | Opens the alert | *"Two tags report the same identity — retire the cloned tag and re-bind the asset to a fresh identity"* | — |
| 3 | Alert drawer | Technician | `Start tag replacement` (recommendation action) | Opens the device drawer for the failing tag with the replacement flow armed | — |
| 4 | Device drawer | Technician | `Mark for replacement` | Enters the replacement queue with days-remaining; a `Replace` chip shows on the estate row | `tracking.device.marked_for_replacement` |
| 5 | Physical | Technician | Fits the new tag | — | — |
| 6 | Device drawer (new tag) | Org Admin | `Bind to asset` → the same asset | **Old binding is unbound first**, then the new one is written; the platform refuses two live bindings for one asset | **`tracking.tag.unbound`** then **`tracking.tag.bound`** |
| 7 | Old device | Org Admin | `Decommission` | Old tag → `Maintenance` then removed from the estate; suppressed from detection | `tracking.device.decommissioned` |
| 8 | Locate | — | — | Precision recovers on the next read; the `Tracking Failure` alert resolves | `tracking.alert.resolved` |

**Continuity rule.** The asset's `AssetJourney` is continuous across a tag swap, because the journey belongs to
the **asset**, not the tag. The binding history in the audit log is what makes that join defensible.

### 23.11.15 Asset Transfer

*Trigger: an asset moves permanently between facilities.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | Locate ▸ Asset List | Facility Manager | Selects the asset(s) → `Start transfer` | Draft movement created per asset, awaiting sign-off | `tracking.transfer.drafted` |
| 2 | Inventory ▸ Check-In / Check-Out | Facility Manager | The transfer appears as a check-out with `Purpose: transfer` | If value ≥ threshold → `Pending Approval` | `tracking.custody.approval_requested` |
| 3 | Movement log | Approving manager | `Approve` | State → `Open`; transfer id recorded (`AGT-3391`) | `tracking.custody.approval_approved` |
| 4 | Locate | — | Asset leaves the origin zone | Presence → `In Transit`; custody → `In Transit`; precision degrades to `Site`; **the asset stops being counted as misplaced**, because in-transit is a licence to be nowhere | — |
| 5 | Replay | Any operator | Watches the trail | The journey shows `Checked Out · In transit — Bengaluru ▸ Hyderabad · Approved transfer AGT-3391` | — |
| 6 | Destination | Receiving custodian | Asset detected at the destination facility | Presence → `Online`; facility rewritten; **`homeZone` is re-set to the destination zone** — without this the asset is permanently "misplaced" at its new home | `tracking.presence.facility_changed` |
| 7 | Inventory | Both facilities | — | Origin room `expected` decrements; destination `expected` increments; both accuracies recompute | `tracking.room.expected_changed` |
| 8 | Registry | — | — | The asset's facility, custodian and cost centre update on the asset record | `asset.transferred` |

### 23.11.16 Asset Return

*Trigger: a checked-out or transferred asset comes home, on time or late.*

| # | Screen | Actor | Action | System response | Audit record |
|---|---|---|---|---|---|
| 1 | — | Automation | Due-back passes | Movement state → `Overdue`; the row gains a red left rule and floats in the log; `Overdue returns` KPI increments | `tracking.custody.overdue` |
| 2 | Notification | Holder | Reminder email | At +48h `TRK-RULE-12` raises a **P3** `Missing Asset` and emails the holder's manager | `tracking.alert.raised` |
| 3 | Movement log | Facility Manager | `Chase return` | Reminder sent; toast confirms who was reminded about what | `tracking.custody.chased` |
| 4 | Physical | Holder | Returns the asset | Detected by the estate on arrival | — |
| 5 | Inventory ▸ Check-In / Check-Out | Custodian | Direction `↩️ Check in`, picks the asset, records condition | New `Returned` row; original check-out closes; custody → `In Place` | `tracking.custody.checked_in` |
| 6 | Locate | — | — | Asset returns to `Online / In Place`; if it is back in `homeZone`, the `Misplaced` chip clears | — |
| 7 | Alerts | Automation | — | The overdue-driven alert auto-resolves; `Overdue returns` decrements | `tracking.alert.auto_resolved` |
| 8 | Inventory ▸ Rooms | Automation | *(if the room has `autoVerify`)* | The room re-counts itself on the next pass and the accuracy rises without anyone asking | `tracking.room.verified` |

**Damaged return.** If `Condition on return` records damage, the check-in additionally raises a work order in
`Predictive Maintenance` and links it to the movement — the return is closed, the consequence is not lost.

---

## 23.12 Alert taxonomy

Eleven categories. **Eleven and no more** — a taxonomy that grows every time somebody has an idea is a taxonomy
nobody can filter by. New signals map onto an existing category or they change an existing rule; they do not
add a twelfth row.

### 23.12.1 The eleven

| # | Category | Icon | Default priority | Owning team | Response SLA (ack / resolve) | Raised by |
|---|---|---|---|---|---|---|
| 1 | **Missing Asset** | 🚩 | **P1** | Security | 15 min / **4h** | `TRK-RULE-02` — not detected for 24h and criticality High or Critical |
| 2 | **Unauthorized Movement** | 🚪 | **P1** | Security | 15 min / **1h** | `TRK-RULE-01` — exit on a `No exit without check-out` zone with no open check-out |
| 3 | **Reader Offline** | 📡 | **P1** if the zone is armed, else P2 | IoT Platform | 15 min / **2h** | `TRK-RULE-05` — no heartbeat for 30 min |
| 4 | **Gateway Offline** | 📡 | **P2** | IoT Platform | 1h / **8h** | `TRK-RULE-05` — same rule, non-armed scope |
| 5 | **Asset Removed** | 📦 | **P2** | IT Operations | 1h / **8h** | `TRK-RULE-08` — a monitored rack slot empties with no work order open |
| 6 | **Duplicate Tag** | 👯 | **P2** | IoT Platform | 1h / **24h** | `TRK-RULE-07` — one identity read in two zones within 60 seconds |
| 7 | **Inventory Mismatch** | 📋 | **P2** | Inventory | 1h / **24h** *(4h for inbound dock reconciliation — a manifest cannot be held)* | `TRK-RULE-03` — a verification pass detects fewer than expected |
| 8 | **Geofence Violation** | ⛔ | **P2** after-hours · **P3** dwell | Security *(after-hours)* / Inventory *(dwell)* | 1h / **4h**; P3 4h / **24h** | `TRK-RULE-10` — movement in an armed zone outside 08:00–20:00 IST · `TRK-RULE-09` — dwell limit exceeded |
| 9 | **Tracking Failure** | 📉 | **P2** precision loss · **P3** coverage gap | IoT Platform | 1h / **8h**; P3 4h / **48h** | `TRK-RULE-11` — 3+ journeys share a blind spot over 20 min; precision monitor for per-asset loss |
| 10 | **Unknown Tag** | ❓ | **P3** | Inventory | 4h / **48h** | `TRK-RULE-04` — an unmatched identity read 50+ times in 12h |
| 11 | **Battery Low** | 🔋 | **P3** | IoT Platform | 4h / **72h** | `TRK-RULE-06` — `batteryPct < 20` on a bound tag |

### 23.12.2 The SLA spine

Per-category SLAs are overrides on a four-line spine. When a new category is proposed, the first question is
*which line does it sit on* — and if the answer is "a new line", the proposal is wrong.

| Priority | Acknowledge | Resolve | Channels | Auto-escalation |
|---|---|---|---|---|
| **P1** | 15 min | 4h *(tightened per category)* | In-app + SMS + email to on-call | 60–240 min per rule; notifies the facility manager |
| **P2** | 1h | 8h *(24h for mismatch and duplicate)* | In-app + email | 4–12h |
| **P3** | 4h | 48h *(72h for battery)* | In-app; email on digest | Digest only |
| **P4** | Next business day | 5 working days | In-app | None |

**Breach is measured against `slaDueAt`, and only open work can breach** (§23.1.7). An alert that closed late is
recorded as `Target missed` in reporting; it is not shown as `Overdue` in the queue, because it is not work.

### 23.12.3 The twelve automation rules

| Rule | Category | When | Then | Raises | Escalates after |
|---|---|---|---|---|---|
| `TRK-RULE-01` | Unauthorized Movement | Exit on a `No exit without check-out` zone with no open check-out | Raise P1 · notify Security by SMS + in-app · **open an incident** · lock the custodian record | P1 → Security | 1h |
| `TRK-RULE-02` | Missing Asset | Not detected for 24h, criticality High/Critical | Raise P1 · assign Security · start a recovery search | P1 → Security | 4h |
| `TRK-RULE-03` | Inventory Mismatch | A verification pass detects fewer than expected | Raise P2 · assign Inventory · schedule a re-count | P2 → Inventory | 12h |
| `TRK-RULE-04` | Unknown Tag | An unmatched identity read 50+ times in 12h | Raise P3 · run the registry matcher · queue for match review | P3 → Inventory | 24h |
| `TRK-RULE-05` | Reader / Gateway Offline | No heartbeat for 30 min | Raise **P1 if the zone is armed, else P2** · assign IoT Platform · **mark dependent zones unverifiable** | P1/P2 → IoT Platform | 2h |
| `TRK-RULE-06` | Battery Low | `batteryPct < 20` on a bound tag | Raise P3 · batch into the next swap round | P3 → IoT Platform | 72h |
| `TRK-RULE-07` | Duplicate Tag | One identity read in two zones within 60s | Raise P2 · **suspend the identity** · queue a tag replacement | P2 → IoT Platform | 12h |
| `TRK-RULE-08` | Asset Removed | A monitored rack slot empties with no open work order | Raise P2 · assign IT Operations · attach the rack snapshot | P2 → IT Operations | 4h |
| `TRK-RULE-09` | Geofence Violation | An asset stays in a dwell-limited zone past its limit | Raise P3 · notify the zone custodian | P3 → Inventory | 24h |
| `TRK-RULE-10` | Geofence Violation | Movement in an armed zone outside 08:00–20:00 IST | Raise P2 · notify Security · **capture a 5-minute detection window** | P2 → Security | 1h |
| `TRK-RULE-11` | Tracking Failure | 3+ journeys share a blind spot longer than 20 min | Raise P3 · assign IoT Platform · add to the coverage plan | P3 → IoT Platform | 48h |
| `TRK-RULE-12` | Missing Asset | An open check-out passes its due-back by 48h | Raise P3 · email the holder **and their manager** | P3 → Inventory | 48h |

Three properties every rule must have, and the reason each exists:

- **`when` reads as a sentence.** The rules table is the answer to *"why am I being told this?"*, and a boolean
  expression is not an answer a facility manager can act on.
- **`then` is a list of consequences, not a single action.** `TRK-RULE-05` marking dependent zones unverifiable
  is as important as the alert itself — it is what stops an outage from being mistaken for a loss.
- **`suppressedToday` is displayed next to `firedToday`.** Suppression you cannot audit is suppression nobody
  trusts, and a queue nobody trusts is a queue nobody reads.

### 23.12.4 Suppression and de-duplication

| Mechanism | Behaviour |
|---|---|
| **Identity de-dup** | A repeat signal matching an already-open alert on the same subject and category increments `suppressedToday` instead of raising a row |
| **Parent suppression** | When a reader goes offline, per-asset `Missing Asset` alerts for assets in its zones are suppressed and the reader alert carries the count. **One cause, one alert** |
| **Grace window** | Device alerts auto-resolve if the device recovers before the window expires, with an `Auto-resolved` timeline entry |
| **Batching** | P3 device alerts (battery, firmware) batch by facility into a single work item |
| **Rule pause** | An Org Admin can stop a category entirely — an immutable audit event with a name attached (§23.7.13) |

---

## 23.13 The alert lifecycle and the audit-event catalogue

### 23.13.1 The state machine

Every tracking alert follows one lifecycle, whatever raised it. Seven states, one escalation branch, two
terminal states.

```
                    ┌──────────────── Escalated ─────────────────┐
                    │  (SLA breach, or a human decides)          │
                    ▼                                            │
  New ──▶ Acknowledged ──▶ Assigned ──▶ In Progress ──▶ Resolved ──▶ Closed
   │            │              │             │              ▲          │
   │            └──────────────┴─────────────┴──────────────┘          │
   │                     (resolve from any open state)                 │
   └──────────────── Auto-resolved (grace window) ─────────────────────┘
```

| State | Means | Enter by | Clock |
|---|---|---|---|
| **New** | Raised, nobody has looked | Rule fires | Ack clock running |
| **Acknowledged** | A human has seen it | `Acknowledge`; stamps `ackAt` | Ack clock stops; resolve clock running |
| **Assigned** | It has an owner | `Assign to me` / assign to another | Resolve clock running |
| **In Progress** | Work is happening | Owner starts work, or a recommendation action is taken | Resolve clock running |
| **Escalated** | Response target breached, or judged urgent | Automation at `escalateAfterMin`, or `Escalate` | Resolve clock running; escalation notified |
| **Resolved** | The cause is dealt with | `Resolve`; stamps `resolvedAt` | Clocks stop |
| **Closed** | Reviewed and filed | `Close` (Facility Manager+), or automatic 7 days after resolution | — |

**Rules that govern the machine:**

1. **`New → Resolved` directly is permitted.** Forcing an operator through four states to close a five-second
   fix is how queues get abandoned. The timeline records what actually happened.
2. **`Escalated` is a state, not a terminal.** An escalated alert still resolves normally; escalation changes who
   is watching, not what is possible.
3. **Open states are `New · Acknowledged · Assigned · In Progress · Escalated`.** That set defines every "open"
   count in the product — one definition, used everywhere.
4. **Only automation may write `Auto-resolved`,** and it always leaves a timeline entry naming the grace window.
5. **Closing is a separate privilege from resolving.** Resolving says *the problem is handled*; closing says
   *and we have reviewed it*.
6. **Every transition appends to `timeline`** with `at`, `actor`, `action` and an optional note. There is no
   silent transition, including automated ones — `Automation` is a named actor.

### 23.13.2 Incident state machine

```
  Open ──▶ Investigating ──▶ Contained ──▶ Resolved ──▶ Closed
```

`Contained` is the state the product argues for most explicitly: *spread stopped, linked alerts stay open until
each is worked.* An incident closing does not close its alerts, and an alert resolving does not close its
incident. They are deliberately independent, because the narrative and the tasks finish at different times.

### 23.13.3 The audit-event catalogue

Naming is `tracking.<object>.<verb>`, past tense, one event per state change. Every record carries: `eventId`,
`at`, `actor` (user id or the named automation), `role`, `scope` (org ▸ facility ▸ zone), `subjectId`,
`subjectType`, `before`, `after`, `source` (UI · API · automation · mobile), and `correlationId` linking the
events of one workflow.

| Object | Events | Retention |
|---|---|---|
| **Presence** | `viewed` · `reported_missing` · `facility_changed` | 30 days / 3 years / 7 years |
| **Zone** | `armed` · `disarmed` · `policy_changed` · `recount_requested` | 3 years |
| **Room** | `verified` · `autoverify_changed` · `expected_changed` | 7 years |
| **Audit** | `opened` · `progress` · `variance_raised` · **`approved`** · `rejected` · `closed` | 7 years — `approved` **immutable** |
| **Custody** | `checked_out` · `checked_in` · `approval_requested` · `approval_approved` · `approval_rejected` · `overdue` · `chased` | 7 years (`chased` 1 year) |
| **Transfer** | `drafted` · `approved` · `completed` | 7 years |
| **Exception** | `raised` · `assigned` · `resolved` | 3 years |
| **Unknown tag** | `detected` · `matched` · `registered` · `ignored` | 7 years |
| **Tag** | **`bound`** · **`unbound`** | 7 years — the join between the physical world and the record |
| **Alert** | `raised` · `acknowledged` · `assigned` · `escalated` · `resolved` · `closed` · `suppressed` · `auto_resolved` | 3 years (`suppressed` 90 days) |
| **Incident** | `opened` · `alert_linked` · `alert_unlinked` · `contained` · `resolved` · `closed` | 7 years |
| **Rule** | **`enabled`** · **`paused`** · `edited` | 7 years, immutable |
| **Device** | `provisioned` · `rebooted` · `diagnostics_run` · `firmware_scheduled` · `battery_replaced` · `marked_for_replacement` · `recovered` · `decommissioned` | 1–7 years by event |
| **Campaign** | `started` · `paused` · `resumed` · `retried` · `completed` | 3 years |
| **Coverage** | `target_changed` · `viewed` | 3 years / 30 days |
| **Twin** | `viewed` | 30 days |
| **Export** | `requested` · `downloaded` | 1 year |

**Four disciplines this catalogue enforces:**

1. **The alert timeline and the audit log are the same facts** at two levels of formality — never two separately
   maintained histories.
2. **Automation is an actor with a name** (`Presence Monitor`, `Zone Policy`, `Audit Engine`, `Device Health`,
   `Detection Matcher`, `Rack Monitor`, `Coverage Analyser`, `Automation`). "System" is not a name.
3. **Nothing is editable after the fact.** Corrections are new events; the `Noisiest sources` panel exists
   precisely so that a bad source is tuned rather than its history rewritten.
4. **View events are retained short and write events retained long.** A 30-day view log is enough to answer
   *who was watching*; a 7-year view log is a surveillance system nobody asked for.

---

## 23.14 RBAC — role × module × capability

### 23.14.1 Module access

Seven roles ship. Five hold the `tracking` module and therefore see the pillar in the sidebar; two do not.

| Role | Tier | Holds `tracking`? | Sidebar row | Scope |
|---|---|---|---|---|
| **Super Admin** | Platform | ✅ | Yes | All organisations, all facilities |
| **Organization Admin** | Tenant Admin | ✅ | Yes | Their organisation |
| **Facility Manager** | Management | ✅ | Yes | Their facilities |
| **Security Officer** | Field | ✅ | Yes | Their facilities |
| **Technician** | Field | ✅ | Yes | Their facilities, biased to assignments |
| **Maintenance Manager** | Management | ✕ | **No** | Read-only via deep link |
| **Executive** | Business | ✕ | **No** | Read-only via deep link and Workspace dashboards |

> **Hidden, not greyed.** A role without the module does not see a disabled row; it sees no row. A greyed row is
> an advertisement for a permission the user cannot obtain, and it makes every sidebar longer for everybody.
>
> **But hidden is not blocked.** Maintenance Managers and Executives legitimately land on tracking screens from
> a maintenance work order, an AI insight or a Workspace dashboard. They get a **read-only render** — KPIs,
> tables and drawers, with every write control absent and value-at-risk figures shown only to the Executive.
> The Dashboard even carries a defined widget order for both roles (§23.4.11), because arriving by link is a
> supported path, not an accident. Route-level module gating enforces the read-only render; it does not 404.

### 23.14.2 The matrix

`✅` full · `◐` limited (footnoted) · `✕` none · `👁` read-only

| Capability | Super Admin | Org Admin | Facility Mgr | Security Officer | Technician | Maint. Mgr | Executive |
|---|---|---|---|---|---|---|---|
| **Dashboard** |
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 | 👁 |
| Quick actions | ✅ | ✅ | ✅ | ◐ ¹ | ◐ ² | ✕ | ✕ |
| See value at risk (₹) | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✅ |
| Export daily digest | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✅ |
| **Locate Assets** |
| View map, list, journeys, zones | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 | 👁 |
| Export positions / journeys | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ |
| Assign custodian | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ |
| Start transfer | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ |
| Report missing | ✅ | ✅ | ✅ | ✅ | ◐ ³ | ✕ | ✕ |
| Arm / disarm a zone | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ |
| Edit zone policy or geometry | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **Inventory Control** |
| View rooms, racks, audits, ledger, exceptions | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 | 👁 |
| Check out / check in | ✅ | ✅ | ✅ | ✕ | ◐ ⁴ | ✕ | ✕ |
| Approve a release above threshold | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ |
| Chase an overdue return | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ |
| `Verify now` a room | ✅ | ✅ | ✅ | ✕ | ✅ | ✕ | ✕ |
| Toggle continuous verification | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ |
| Start an audit | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ |
| **Approve / reject a variance** | ✅ | ✅ | ◐ ⁵ | ✕ | ✕ | ✕ | ✕ |
| Assign / resolve an exception | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ |
| Register / ignore an unidentified tag | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ |
| Export variance / evidence pack | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✅ |
| **Alerts & Incidents** |
| View queue, incidents, rules | ✅ | ✅ | ✅ | ✅ | ◐ ⁶ | 👁 | 👁 |
| Acknowledge · assign to self | ✅ | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ |
| Assign to others · escalate | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ |
| Resolve | ✅ | ✅ | ✅ | ✅ | ◐ ⁷ | ✕ | ✕ |
| Close | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ |
| Create / command an incident | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ |
| **Enable / pause an automation rule** | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ | ✕ |
| View analytics | ✅ | ✅ | ✅ | ✅ | ✕ | 👁 | 👁 |
| **Tracking Infrastructure** |
| View fleet, estate, topology, coverage, firmware | ✅ | ✅ | ✅ | 👁 | ✅ | 👁 | ✕ |
| Run diagnostics · reboot | ✅ | ✅ | ✅ | ✕ | ✅ | ✕ | ✕ |
| Schedule firmware (single device) | ✅ | ✅ | ✕ | ✕ | ✅ | ✕ | ✕ |
| Mark for replacement | ✅ | ✅ | ✅ | ✕ | ✅ | ✕ | ✕ |
| **Provision a device** | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **Bind / unbind a tag** | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **Decommission a device** | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ | ✕ |
| Create / pause / resume a campaign | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ | ✕ |
| Retry failed campaign devices | ✅ | ✅ | ✕ | ✕ | ✅ | ✕ | ✕ |
| Edit coverage targets | ✅ | ✅ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **Digital Twin** |
| View any layer | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 | 👁 |
| Request a zone re-count | ✅ | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ |

¹ Security Officer: *Locate an asset* and *Report an asset missing* only.
² Technician: *Locate an asset* and *Verify a room* only.
³ Technician: single asset only; no bulk report-missing.
⁴ Technician: their own department's assets.
⁵ Facility Manager: cannot approve a count they own — segregation of duties, enforced not advised.
⁶ Technician: alerts assigned to them, plus everything in their facility, read-only for the rest.
⁷ Technician: their own assignments only.

### 23.14.3 The five permission principles

1. **Read is wide, write is narrow.** Everyone with the module sees everything in their scope. Restricting
   *visibility* produces users who cannot understand what they are being asked to do; restricting *action*
   produces users who cannot break things.
2. **Scope is enforced at the data layer, not the UI.** A Facility Manager's `all` means *all of mine*. The
   ScopePicker never offers a facility the session cannot read.
3. **Segregation of duties is enforced, with the reason visible.** Disabled controls state why on hover —
   *"You opened this count; someone else must sign it."* A disabled control with no explanation is a bug report.
4. **Money is a disclosure.** `₹ value at risk`, `₹ unverified` and asset values are hidden from Technician and
   shown to Facility Manager, Security Officer, Org Admin and Executive.
5. **Anything that stops the platform listening is Org Admin.** Pausing a rule, decommissioning a parent device,
   editing a coverage target, unbinding a tag. Each writes an immutable audit event with a name on it.

---

## 23.15 Scalability and the AI roadmap

### 23.15.1 What changes at each scale

| Scale | What the pillar is actually for | What must change |
|---|---|---|
| **~100 assets** | **Proving it works.** One facility, one storeroom, a handful of tags | Everything renders client-side. The map *is* the product. Continuous verification on every room from day one — at this size there is no reason to count by hand |
| **~1,000** | **Exceptions.** The list is no longer scannable; the queue becomes the workspace | Saved filters matter. The exception queue and the alert queue become the two screens people live in. Coverage becomes a real question — the first blind spots appear |
| **~10,000** | **Querying.** The list is a result set, never a browse | Server-side pagination, sorting and facet counts. Map clustering. Rule-based auto-assignment so queues arrive pre-owned. Audits move from full counts to risk-weighted sampling |
| **~100,000** | **Search is the navigation.** Nobody browses anything | See below |

### 23.15.2 At 100,000 assets — the eleven things that break, and the answer to each

| Breaks | Answer |
|---|---|
| **The map.** 100k markers is not a map, it is a fog | Cluster layer with counts, exploding on zoom; a hard cap with an honest label — *"showing 500 of 12,480 signals — filter to see the rest"* |
| **The asset list.** Client-side filter and sort over 100k rows | Server-side everything, with facet counts returned alongside the page. The KPI tiles become aggregate queries |
| **The exception queue.** A 1% exception rate is 1,000 open rows | Severity-and-value ranking; auto-assignment by rule; **pattern-level bulk resolution** (*"resolve all 340 label-only unverified assets"*); automatic ageing-out when the underlying detection returns |
| **The alert queue.** Device alerts outnumber asset alerts 10:1 | Category aggregation as a single expandable row (*"46 low batteries in Chennai DC — batch"*); parent suppression; server-side ordering on the same three keys |
| **The device estate.** 100k tags plus thousands of parents | Parent-scoped by default. Tags are reached through their parent or their bound asset, never through a 100k-row table |
| **Topology cards.** Fine at 12 parents, useless at 300 | A real graph view with collapse/expand and search-to-node |
| **Journeys.** The heaviest object in the model | Full fidelity 30 days, then down-sample to zone transitions. The replay degrades gracefully **and says that it has** |
| **Audits.** Room-scoped counting does not survive 400 rooms | Rule-scoped audits (*"every Critical asset in South India"*); sign-off becomes its own queue |
| **Racks.** 42 slots × N | Virtualised rendering; a variance-only rack filter |
| **The movement ledger.** Unbounded growth | Hot 90 days · warm 1 year · cold thereafter; exports read all three |
| **Reads of `trackingKpis()`.** One function, recomputed per screen | Materialised per scope, invalidated by event, streamed to the client. The *contract* — one definition per number — must survive the optimisation |

**The through-line, inherited from doc 22:** *as scale grows, navigation converts from a tree into a query
interface.* The five rows do not become six. They become five **query surfaces** with better saved views, and
`⌘K` becomes the most-used control in the pillar.

### 23.15.3 The AI roadmap

Six capabilities, in the order they pay for themselves. Every one obeys the platform rule from
[README](./README.md): **explainable — every score shows its drivers.**

| # | Capability | What it does | Where it surfaces | Input signals | How it is explained | Ship |
|---|---|---|---|---|---|---|
| 1 | **Match suggestion** | Names a tag the registry cannot | `Inventory ▸ Exceptions`, on every unidentified row | Tag id patterns, zone, first/last seen, retired-asset pool, open POs, label print history | Best match + **confidence meter** + the reason (*"Detected before goods receipt was posted"*). ≥90% makes `Accept match` primary; <60% offers it but does not recommend it | **v1 — shipped** |
| 2 | **Missing-asset likelihood** | Predicts which unheard assets are actually lost | `Locate` row ordering; promotes into the Dashboard worklist before a human reports it | Last-seen age vs class freshness window, precision decay, confidence trend, custody state, criticality, zone coverage, historical recovery rate | *"52h unheard · last event was an unauthorised exit · coverage in that zone is 93% → 81% likely lost, not mislaid"* | **v1.1** |
| 3 | **Coverage optimisation** | Turns blind spots into a ranked, costed spend plan | `Infrastructure ▸ Coverage` — the `What would fix it` column; `TRK-RULE-11` alerts | Zone coverage, device density and placement, **journey gap clustering**, asset value at risk, travel routes | *"6 journeys in 24h show a 40–50 min blind spot on this route. One additional reader would close the gap for ₹42,000"* | **v1 — shipped** |
| 4 | **Dwell anomaly** | Flags things parked too long *for them* | `Locate ▸ Zones`, exception queue, `TRK-RULE-09` | Per-asset dwell history, class baseline, zone limit, time of day, shift patterns | *"This pallet has never sat in Staging for more than 3h; it has now been 8h"* — compared against its own history, not just a static limit | **v1.2** |
| 5 | **Predicted tag failure** | Says when a tag will go dark | `Infrastructure ▸ Replacement queue`; `replaceBy` on every device; the 7-day notification | Battery decay curve, uptime trend, signal degradation, read-rate drift, install age, ambient temperature | *"Battery 17%, decaying 2.4%/week, ~6 days left"* with the curve | **v1 — shipped** |
| 6 | **Audit sampling** | Chooses which rooms to count next | `Inventory ▸ Audits` — a `Suggested next count` prompt on the start panel | Variance history, movement volume, coverage quality, value at risk, days since last verified, custodian change | *"Secure Cage: 4 variances in 2 quarters, reader recently offline, ₹84 L exposure → count this before Server Room Beta"* | **v2** |

**Three cross-cutting AI behaviours** that are not on the list because they are not features — they are how the
pillar talks:

- **Recommendation sentences.** Every alert, every exception, every blind spot carries one sentence of what to
  do and a button that does it. Not a diagnosis — a next step.
- **Correlation into incidents.** When alerts share an asset, a zone, a device or a window, the queue proposes
  the incident rather than waiting for a human to notice (§23.7.16).
- **Suppression with a visible ratio.** The system is allowed to hide things from you only if it tells you how
  much it hid.

**What AI must never do here:** silently change a priority, silently bind a tag, silently close an alert, or
silently pause a rule. Every one of those is a human decision with an audit event and a name attached. The model
proposes; the operator disposes.

---

## 23.16 What this cost, and the sequencing

**Why the rebuild is better:**

1. **Every remaining row passes all four tests.** The structure is derivable, not negotiated — when someone
   proposes a sixth row, there is a test to apply instead of an argument to have.
2. **Four screens that were one question are now one screen.** Map, list, replay and zones share a filter set, a
   selection model and a drawer. Changing your mind costs a tab, not a navigation.
3. **The technology vocabulary is gone from operations.** Nobody outside `Tracking Infrastructure` is asked to
   know what a UWB anchor is, and the one screen that names radios does so as a spec line under a role.
4. **Outages stop looking like losses.** A dead reader marks its zones unverifiable and everything downstream
   says *"cannot be confirmed"* rather than *"missing"*.
5. **One alert lifecycle, one open-state definition, one KPI function.** Counts cannot disagree between screens.
6. **Two screens that answered nothing are gone**, and both of their real questions have better homes.

**What it cost — stated plainly:**

| Cost | Mitigation |
|---|---|
| Nine deep links break | Twelve `307` redirects, each landing on the tab that absorbed the job, carrying the record id (§23.3.6) |
| Muscle memory — people hunt for `Heatmaps` and `Telemetry` | `⌘K` resolves the **old** names to the new destinations, labelled with the new name |
| Tab state must be URL-addressable or the merge is a regression | `?tab=`, `?asset=`, `?zone=`, `?room=`, `?alert=`, `?incident=`, `?device=` — the full grammar in §23.3.5 |
| Two modules now nest under names that exist at top level | Nesting, plus `⌘K` disambiguation by pillar (§23.3.3). Not renaming — both short names are correct for their object |
| `Digital Twin` loses its row and some users will not find it | Launch buttons on the Dashboard, Inventory Overview and Infrastructure Coverage; `⌘K` by facility name; the retired `/twin` routes still resolve |
| `Label & Tag Printing` moves pillar | Reachable from Asset 360's overflow menu and the Registry's bulk actions — where the work actually starts |
| One page per module means five large pages | Tab content is code-split; only the active tab's data is computed |
| Tracking and Mobile Workforce both touch custody | Deliberate: kiosk writes, ledger governs (§23.3.3). Both must read the same `MovementTxn` rows — this is a contract, not a coincidence |

**Sequencing — the order this was built, and the order to extend it:**

1. **Types first.** `src/types/tracking.ts` encodes the technology-transparency rule in a comment at the top of
   the file, because a principle that lives only in a document is a principle that erodes in the second sprint.
2. **One derived-KPI function**, before any screen. Every module reads its headline numbers from it.
3. **Dashboard**, so every subsequent module has a caller and a hand-off target.
4. **Locate Assets**, because it retires four routes at once and proves the tab thesis.
5. **Inventory Control** and **Alerts & Incidents**, the two workspaces where people spend their day.
6. **Tracking Infrastructure**, which the other four depend on for their honesty.
7. **Digital Twin** last — it is a lens over everything else, and it cannot be built before the things it looks at.
8. **Redirects and `⌘K` aliases ship with the rename, never after it.** A link that breaks for one release is a
   link users stop trusting for a year.

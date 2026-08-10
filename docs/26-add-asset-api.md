# Add Asset — API reference (rebuilt flow)

The backend contract for the rebuilt registration flow. Written for whoever
builds the frontend against it.

All paths are under `/api/v1`. Every endpoint needs `Authorization: Bearer
<accessToken>` and the `assets` module grant; template **writes** additionally
need the `admin` grant.

---

## 1. The idea in one paragraph

There is a **single catalogue of every field an asset can carry**, grouped into
sections. Each source is a different way of deciding which of those fields to
show:

| Source | Fields shown | Required |
|---|---|---|
| `blank` | the whole catalogue | core only (`name`, `category`, `facilityId`) |
| `template` | the subset a template author chose, less the category it sets itself | core + whatever they marked required |
| `clone` | the whole catalogue, prefilled from another asset | core only; identity fields blanked |
| `import` | (CSV — unchanged, out of scope here) | — |

Two kinds of field are never rendered as inputs and never accepted from a
client. They come back on `derived` so a review screen can still name them:

| Kind | Fields | Where the value comes from |
|---|---|---|
| `generated` | `assetTag`, `trackingId` | minted from an atomic counter on save |
| `template` | `category` | the template's own `category` |

The client asks the server what to render. It does not hold its own copy of the
field list, so adding a field to the catalogue reaches every client without a
frontend deploy.

**Removed:** `po`, `scan`, `erp` and `adopt` are no longer accepted as sources —
sending one returns 422.

---

## 2. Sections

In the order they should be asked:

| Key | Label | Always shown |
|---|---|---|
| `identity` | What is it? | yes |
| `assignment` | Who holds it? | yes |
| `location` | Where is it? | yes |
| `technical` | Technical details | no |
| `commercial` | Purchase & warranty | no |
| `maintenance` | Maintenance contract | no |
| `tracking` | Tag & tracking | no |

`alwaysShown: false` sections should render collapsed. They are genuinely
optional — most assets have no maintenance contract and no tag.

---

## 3. Endpoints

### `GET /assets/registration/catalog`

Every field, grouped by section. This is what a **template editor** picks from.

```jsonc
{ "success": true, "data": {
  "sections": [
    { "key": "identity", "label": "What is it?", "description": "…", "alwaysShown": true,
      "fields": [ { "key": "name", "label": "Asset name", "type": "text",
                    "path": "name", "core": true, "maxLength": 120,
                    "placeholder": "e.g. Dell Latitude 5440 — Finance",
                    "help": "How people will recognise it in a list." } ] }
  ],
  "coreFields": ["name", "facilityId"],
  "identityFields": ["serialNumber", "macAddress", "imei"]
} }
```

Scoped to what a template can decide: `category` is answered by the template's
own header, and `assetTag`/`trackingId` are minted, so none of the three appear
here. `type` is one of `text · textarea · number · money · select · date · boolean`.
Some fields carry `pattern` + `patternHint` (MAC, IMEI) — apply them client-side
for instant feedback; the server enforces them regardless.

### `GET /assets/registration/defaults`

Answers "where am I?" so the user does not have to.

```jsonc
{ "success": true, "data": {
  "location": { "id": "FAC-1", "name": "Hyderabad Warehouse" },
  "facilities": [ { "id": "FAC-1", "name": "Hyderabad Warehouse" } ],
  "department": null,
  "registeredBy": "Raj"
} }
```

`location` is the nearest facility at or beneath the caller's `homeScopeId`.
**Prefill the site field with it.** `facilities` is everything they may file
against, so an asset that lives elsewhere is one dropdown away, not blocked.
`location` is `null` only when the caller's scope contains no facility.

### `GET /assets/registration/form?source=&templateId=`

The field list to render, with the required decision already made.

```jsonc
{ "success": true, "data": {
  "source": "template",
  "templateId": "TPL-3",
  "fields": [ { "key": "serialNumber", "label": "Serial number", "section": "identity",
                "type": "text", "path": "serialNumber", "identity": true,
                "required": true, "defaultValue": undefined } ],
  "derived": [
    { "key": "category", "label": "Category", "section": "identity",
      "origin": "template", "value": "Compute", "note": "Set by the Computer template." },
    { "key": "assetTag", "label": "Asset tag", "section": "identity",
      "origin": "generated", "note": "Issued on save — the next free number…" },
    { "key": "trackingId", "label": "Tag ID", "section": "tracking",
      "origin": "generated", "note": "Issued on save, once a tag type is chosen…" }
  ]
} }
```

- `source=blank` → the full catalogue, `required` true only for core fields.
- `source=template&templateId=…` → the template's fields, in the author's order.
  404 if unknown; **409 if archived**.
- Core fields are injected even if a template omits them, so a badly authored
  template can never produce an unsavable form.
- **`derived` is not optional to render.** Show it on the review step. A person
  told "this is what will be saved" who cannot see an asset tag will conclude
  there isn't one. Only promise a `trackingId` once `trackingTech` has a value.

### `POST /assets/registration/validate`

Check without committing. Call it on section blur to drive progress ticks.

```jsonc
// request
{ "source": "blank", "values": { "name": "Dell 5440", "category": "Compute" } }

// response
{ "success": true, "data": {
  "valid": false,
  "errors": [ { "key": "facilityId", "section": "location", "message": "Site is required." } ],
  "sections": [
    { "key": "identity", "label": "What is it?", "total": 7, "filled": 2,
      "requiredTotal": 2, "requiredFilled": 2, "complete": true, "errors": [] }
  ]
} }
```

Note this returns **200 with `valid: false`** — it is a query, not a failed
write. Sections are returned in canonical order and only include sections that
have at least one field in the current form.

### `POST /assets/registration`

Commit. Same body as `validate`.

- **201** with the created asset on success.
- **422** with `error.details[] = [{ path, message }]` if invalid — `path` is the
  field key, so it maps straight onto the form.

```jsonc
{ "source": "template", "templateId": "TPL-3", "values": {
  "name": "Dell Latitude 5440", "category": "Compute", "facilityId": "FAC-1",
  "serialNumber": "7XKD9M3", "macAddress": "00:1B:44:11:3A:B7",
  "custodianName": "Anita Rao", "custodianEmployeeId": "BCSS-2291"
} }
```

`values` is flat — catalogue keys only, whatever section they belong to. The
server maps each key onto its `path`. **Keys that are not in the resolved form
are ignored**, so a client cannot write to an arbitrary field by inventing one.

### `GET /assets/:id/clone-source`

```jsonc
{ "success": true, "data": {
  "sourceId": "AST-52", "sourceName": "Dell Latitude 5440",
  "values": { "category": "Compute", "manufacturer": "Dell", "model": "Latitude 5440",
              "serialNumber": "", "macAddress": "", "custodianName": "" },
  "clearedFields": [ { "key": "serialNumber", "label": "Serial number" },
                     { "key": "macAddress",   "label": "MAC address" } ]
} }
```

Feed `values` straight into the form. **Surface `clearedFields` prominently** —
"these 5 things identify the unit, you have to type them". The custodian is
cleared too: a new machine is not automatically the same person's.

Then `POST /assets/registration` with `source: "clone"`, `cloneOfId`, and the
completed values.

---

## 4. Templates

| Method | Path | Grant |
|---|---|---|
| `GET` | `/assets/templates?status=active\|archived\|all&category=&q=` | `assets` |
| `GET` | `/assets/templates/:id` | `assets` |
| `POST` | `/assets/templates` | `assets` + `admin` |
| `PATCH` | `/assets/templates/:id` | `assets` + `admin` |
| `DELETE` | `/assets/templates/:id` | `assets` + `admin` — **archives**, does not delete |

```jsonc
{
  "name": "Computer / Laptop",
  "description": "Fields a laptop actually needs",
  "icon": "💻",
  "category": "Compute",
  "classId": "CLS-COMP",              // optional
  "fields": [
    { "key": "name",         "required": true,  "order": 0 },
    { "key": "serialNumber", "required": true,  "order": 3 },
    { "key": "model",        "required": false, "order": 5 },
    { "key": "warrantyAgent","required": false, "order": 8 }
  ],
  "customFields": [
    { "key": "warrantyAgent", "label": "Warranty agent", "section": "commercial",
      "type": "text", "required": false, "order": 8 }
  ]
}
```

Custom fields land in `onboarding.attributes.<key>`. Rules the server enforces
(all 422):

- every `fields[].key` must resolve — catalogue or a `customFields` entry on the
  same template;
- no key selected twice;
- a custom field may not shadow a catalogue key;
- a `select` custom field needs at least one option;
- custom keys match `^[a-zA-Z][a-zA-Z0-9_]*$` — they become Mongo paths.

`usageCount` increments on each asset registered from the template.

**Delete archives.** Assets keep `onboarding.templateId`, and deleting would
leave a record unable to explain the fields it was asked for.

---

## 5. Validation rules the UI should mirror

Enforced server-side; duplicate them client-side only for responsiveness.

| Rule | Message |
|---|---|
| Core fields present | `<Label> is required.` |
| Custodian named without employee ID | `An employee ID is required when the asset is assigned to someone.` |
| Employee ID without a name | `Enter the name this employee ID belongs to.` |
| Maintenance toggle on, no provider | `Name the provider, or turn the contract toggle off.` |
| Tag ID without a tag type | `Choose the tag type for this tag ID.` |
| Serial of 1 character | `A serial number needs at least 2 characters — or leave it blank.` |
| Pattern mismatch | the field's `patternHint` |

**Assignment is optional in whole, mandatory in part.** Leaving it entirely
blank is valid and stores `custodian: "Unassigned"`. Filling half of it is not.

---

## 6. What lands in MongoDB

```jsonc
{
  "_id": "AST-53", "name": "Dell Latitude 5440", "category": "Compute",
  "serialNumber": "7XKD9M3",          // '' when none — never invented
  "custodian": "Anita Rao",           // 'Unassigned' when unassigned
  "location": { "id": "FAC-1", "name": "Hyderabad Warehouse", "zone": "Desk 14" },
  "onboarding": {
    "state": "Active", "source": "template",
    "templateId": "TPL-3", "clonedFromId": "AST-52",
    "classId": "",                    // '' for blank — classify later
    "assetTag": "AG-38",              // minted, never typed — always present
    "custodianEmployeeId": "BCSS-2291",
    "department": "Finance",
    "maintenance": { "hasContract": true, "provider": "Dell ProSupport" },
    "attributes": { "macAddress": "00:1B:44:11:3A:B7", "warrantyAgent": "Redington" },
    "commercial": { "ownership": "Owned" },
    "registeredAt": "…", "registeredBy": "Raj", "activatedAt": "…"
  }
}
```

**Uniqueness** — partial indexes, so any number of assets may have none:

- `serialNumber` unique among non-empty values — typed, so **409** on collision
- `onboarding.assetTag` unique among non-empty values — minted, so a collision
  is a server bug, not user error. `mintUnique()` reserves from an atomic
  counter and re-draws if a seeded or imported row already holds that number.
- `trackingId` likewise, prefixed by the tag technology (`QR-41`, `RFID-42`).

---

## 7. Deliberate changes from the old flow

| Change | Why |
|---|---|
| 8 sources → 4 | `po`, `scan`, `erp`, `adopt` were routes to systems that do not exist yet |
| Criticality removed | Asked of every asset, answered meaningfully for almost none. It is a judgement made later, from usage |
| Approval gate removed | The section rendered empty and did not open. Registration goes straight to `Active` |
| Custodian is free text + employee ID | The old picker only offered registered platform users, so the majority of real custodians could not be recorded at all |
| Site prefilled from scope | A facility manager in Hyderabad should not tell the system where they are on every registration |
| `classId` now optional | A blank registration has no class by definition. Requiring one made "add now, classify later" impossible |
| Maintenance behind a toggle | Most assets have no contract; the section was empty on the majority of records |
| Asset tag and tag ID minted, not typed | They mean nothing except "no other record holds this". Asking a person to invent one asks them to do a database's job badly — they guess the next number, two people guess the same, and the uniqueness the number exists for is gone |
| Template no longer asks for a category | The template *is* the decision about a kind of asset. Asking again only admits the one answer that cannot be right: a Computer template filed under Furniture |

---

## 8. Test coverage

64 automated cases, all passing:

```bash
node Testing/harness/registration-tests.mjs
```

Covers the catalogue, scope defaults, blank/template/clone forms, every
validation rule above, template authoring and its five rejection rules,
archival, clone prefill and identity clearing, both uniqueness indexes, what
lands in MongoDB, and three security cases including unknown-key write-through.

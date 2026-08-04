// ─────────────────────────────────────────────────────────────────────────────
// Onboarding logic — pure helpers behind the registration flow.
//
// Everything here is deterministic and side-effect free: gate evaluation,
// derived warranty/age maths (computed, NEVER captured — docs/21 §21.2 P3),
// identification/duplicate checks, ID minting and location resolution.
// ─────────────────────────────────────────────────────────────────────────────

import { scopeTree } from '@/lib/rbac';
import { getClassTemplate, getMonitoringProfile, GATE_LABELS } from '@/lib/asset-classes';
import { allSensors, TAG_ID_PREFIX } from '@/lib/dataset';
import { nowMs } from '@/lib/utils';
import type { Asset, SensorKind, TrackingTech } from '@access-genie/shared';
import type {
  AssetOnboarding, ClassTemplate, CommercialData, DerivedCommercial,
  GateKey, GateResult, RegisteredAsset, SourceKey,
} from '@access-genie/shared';
import type { ScopeNode } from '@access-genie/shared';

const DAY = 86_400_000;

/** The system node an asset lands in when the registrant skips Place. */
export const UNASSIGNED_LOCATION = 'Unassigned / Receiving';

// ── Location resolution ──────────────────────────────────────────────────────

export interface LocationOption {
  id: string;
  /** Full path, e.g. "Hyderabad Central Warehouse ▸ Building A ▸ Loading Dock". */
  path: string;
  facility: string;
  building?: string;
  zone?: string;
}

/**
 * Flatten the scope tree into pickable locations. One typeahead over full paths
 * replaces the eight cascading dropdowns the original flow asked for — org and
 * region are already carried by the session scope chip (docs/21 §21.1.2 ③).
 */
export function locationOptions(node: ScopeNode = scopeTree): LocationOption[] {
  const out: LocationOption[] = [];

  const walk = (n: ScopeNode, facility?: string, building?: string) => {
    if (n.level === 'facility') {
      out.push({ id: n.id, path: n.name, facility: n.name });
      for (const c of n.children ?? []) walk(c, n.name);
      return;
    }
    if (n.level === 'building' && facility) {
      out.push({ id: n.id, path: `${facility} ▸ ${n.name}`, facility, building: n.name });
      for (const c of n.children ?? []) walk(c, facility, n.name);
      return;
    }
    if ((n.level === 'floor' || n.level === 'zone') && facility) {
      const path = building ? `${facility} ▸ ${building} ▸ ${n.name}` : `${facility} ▸ ${n.name}`;
      out.push({ id: n.id, path, facility, building, zone: n.name });
      for (const c of n.children ?? []) walk(c, facility, building);
      return;
    }
    for (const c of n.children ?? []) walk(c, facility, building);
  };

  walk(node);
  return out;
}

/** Human path for an asset's current location, or the unassigned placeholder. */
export function locationPath(asset: Asset): string {
  const parts = [asset.location.name, asset.location.building, asset.location.zone].filter(Boolean);
  return parts.length ? parts.join(' ▸ ') : UNASSIGNED_LOCATION;
}

export const isLocated = (asset: Asset): boolean =>
  Boolean(asset.location.name) && asset.location.name !== UNASSIGNED_LOCATION;

// ── Derived commercial figures (P3 — computed, never an input) ────────────────

/**
 * Warranty remaining, asset age, depreciation. All folded from the captured
 * dates and cost; none of these is ever rendered as an editable field.
 *
 * Note what is deliberately NOT here: Remaining Useful Life. RUL is a model
 * output needing runtime hours and telemetry, not date arithmetic — it belongs
 * to the AI layer (docs/21 §21.1.4 ①).
 */
export function deriveCommercial(c: CommercialData | undefined, now = nowMs()): DerivedCommercial {
  const empty: DerivedCommercial = {
    ageDays: null, warrantyRemainingDays: null, warrantyStatus: 'Unknown',
    amcRemainingDays: null, bookValue: null, depreciatedToDate: null,
  };
  if (!c) return empty;

  const parse = (iso?: string) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : t;
  };
  const daysFromNow = (t: number | null) => (t === null ? null : Math.round((t - now) / DAY));

  // Age runs from commissioning where known, falling back to purchase.
  const start = parse(c.commissionDate) ?? parse(c.purchaseDate);
  const ageDays = start === null ? null : Math.max(0, Math.round((now - start) / DAY));

  const end = parse(c.warrantyEnd);
  const warrantyRemainingDays = daysFromNow(end);
  const warrantyStatus: DerivedCommercial['warrantyStatus'] =
    warrantyRemainingDays === null ? 'Unknown'
      : warrantyRemainingDays < 0 ? 'Expired'
        : warrantyRemainingDays <= 90 ? 'Expiring'
          : 'Active';

  const amcRemainingDays = daysFromNow(parse(c.amcEnd));

  // Straight-line to zero over the class's useful life. Leased assets are not
  // capitalised, so they carry no book value.
  let bookValue: number | null = null;
  let depreciatedToDate: number | null = null;
  if (c.ownership === 'Owned' && c.purchasePrice && c.usefulLifeYears && ageDays !== null) {
    const lifeDays = c.usefulLifeYears * 365;
    const used = Math.min(1, ageDays / lifeDays);
    depreciatedToDate = Math.round(c.purchasePrice * used);
    bookValue = Math.max(0, c.purchasePrice - depreciatedToDate);
  }

  return { ageDays, warrantyRemainingDays, warrantyStatus, amcRemainingDays, bookValue, depreciatedToDate };
}

/** Warranty end implied by a start date plus a term in months. */
export function warrantyEndFromTerm(start: string, months: number): string {
  const t = Date.parse(start);
  if (Number.isNaN(t) || !months) return '';
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// ── Gate evaluation (the readiness model, docs/21 §21.3.6) ────────────────────

/**
 * Evaluate every gate for an asset against its class's activation policy.
 * A gate can be satisfied by DATA or by an explicit DECISION — "run to failure"
 * and "not tracked by policy" are complete answers, not missing ones.
 */
export function evaluateGates(asset: RegisteredAsset, template?: ClassTemplate): GateResult[] {
  const ob = asset.onboarding;
  const tpl = template ?? getClassTemplate(ob.classId);
  const req = new Set(tpl.activationGates);

  const gate = (key: GateKey, state: GateResult['state'], detail: string): GateResult => ({
    key, label: GATE_LABELS[key], required: req.has(key), state, detail,
  });

  // Identified — the commit condition, so it is met by definition post-commit.
  const idOk = Boolean(asset.name && asset.serialNumber && ob.classId);
  const identified = gate(
    'identified',
    idOk ? 'met' : 'open',
    idOk ? `${[asset.manufacturer, asset.model].filter(Boolean).join(' ') || asset.name} · SN ${asset.serialNumber}` : 'Name, class and serial are required',
  );

  const located = gate(
    'located',
    isLocated(asset) ? 'met' : 'open',
    isLocated(asset) ? locationPath(asset) : 'Sitting at Unassigned / Receiving',
  );

  const accountableOk = Boolean(asset.custodian && ob.department);
  const accountable = gate(
    'accountable',
    accountableOk ? 'met' : 'open',
    accountableOk ? `${asset.custodian} · ${ob.department}` : asset.custodian ? 'Department not resolved' : 'No custodian assigned',
  );

  // Three tracking states — "bound but never read" is visible, not silent.
  const live = ob.bindings.filter((b) => !b.retiredAt);
  const verified = live.filter((b) => b.state === 'Verified');
  const tracked = gate(
    'tracked',
    ob.trackingIntent === 'not-tracked' ? 'met'
      : verified.length > 0 ? 'met'
        : live.length > 0 ? 'pending'
          : 'open',
    ob.trackingIntent === 'not-tracked' ? 'Not tracked — by class policy'
      : verified.length > 0 ? `${verified.length} verified binding${verified.length > 1 ? 's' : ''} · ${verified.map((b) => b.tagId).join(', ')}`
        : live.length > 0 ? `${live[0].tagId} bound — awaiting first read`
          : 'No tag assigned',
  );

  const c = ob.commercial;
  const financialOk = Boolean(c.purchaseDate && c.purchasePrice && c.vendor);
  const financial = gate(
    'financial',
    financialOk ? 'met' : 'open',
    financialOk ? `${c.vendor} · ${c.purchaseDate}` : 'Purchase date, cost and vendor missing',
  );

  const maintainable = gate(
    'maintainable',
    ob.maintenancePlan ? 'met' : 'open',
    ob.maintenancePlan === 'run-to-failure' ? 'Run to failure — deliberate'
      : ob.maintenancePlan === 'class-default' ? (tpl.pmPlan ?? 'Class default PM plan')
        : 'No PM plan and no run-to-failure decision',
  );

  const have = new Set(ob.documents.map((d) => d.type));
  const missingDocs = tpl.documentChecklist.filter((t) => !have.has(t));
  const documented = gate(
    'documented',
    missingDocs.length === 0 ? 'met' : 'open',
    missingDocs.length === 0
      ? `${ob.documents.length} document${ob.documents.length === 1 ? '' : 's'} on file`
      : `Missing: ${missingDocs.join(', ')}`,
  );

  const profile = getMonitoringProfile(ob.monitoringProfileId);
  const monitored = gate(
    'monitored',
    ob.monitoringDecided ? 'met' : 'open',
    !ob.monitoringDecided ? 'No monitoring decision recorded'
      : profile ? `${profile.name}${ob.monitoringOverridden ? ' (customised)' : ' (inherited)'}`
        : 'None — by policy',
  );

  return [identified, located, accountable, tracked, financial, maintainable, documented, monitored];
}

/** Only the gates this class actually demands. */
export const requiredGates = (gates: GateResult[]): GateResult[] => gates.filter((g) => g.required);

export function readiness(gates: GateResult[]): { met: number; total: number; pct: number; ready: boolean } {
  const req = requiredGates(gates);
  const met = req.filter((g) => g.state === 'met').length;
  const total = req.length;
  return { met, total, pct: total === 0 ? 100 : Math.round((met / total) * 100), ready: met === total };
}

/**
 * Approval is triggered by value or by criticality — the only two conditions
 * that earn a review screen (docs/21 §21.3.5). Everything else goes straight
 * from Activate to In-Service.
 */
export function approvalReason(asset: RegisteredAsset, template?: ClassTemplate): string | null {
  const tpl = template ?? getClassTemplate(asset.onboarding.classId);
  const price = asset.onboarding.commercial.purchasePrice ?? 0;
  if (price >= tpl.approvalThreshold) {
    return `Capitalised above the ₹${(tpl.approvalThreshold / 100000).toFixed(0)} L threshold — Finance sign-off required`;
  }
  if (asset.criticality === 'Critical') {
    return 'Business-criticality is Critical — Asset Manager sign-off required';
  }
  return null;
}

// ── Identification & duplicate control (docs/21 §21.3.3, M1) ─────────────────

export interface DuplicateVerdict {
  kind: 'clean' | 'exact' | 'retired' | 'fuzzy';
  matches: Asset[];
  message: string;
}

/** Levenshtein distance, capped — only used on short serial strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Run at the keystroke, not as a cleanup job. Catching a duplicate here costs
 * one dialog; catching it in six months costs a merge of two event streams.
 */
export function checkDuplicate(
  serial: string,
  manufacturer: string,
  assets: RegisteredAsset[],
  selfId?: string,
): DuplicateVerdict {
  const s = serial.trim().toLowerCase();
  if (s.length < 3) return { kind: 'clean', matches: [], message: '' };

  const pool = assets.filter((a) => a.id !== selfId && !a.onboarding.voidedAt);
  const mfr = manufacturer.trim().toLowerCase();

  const exact = pool.filter((a) => a.serialNumber.trim().toLowerCase() === s);
  if (exact.length) {
    const retired = exact.filter((a) => a.status === 'End_Of_Life');
    if (retired.length === exact.length) {
      return {
        kind: 'retired',
        matches: retired,
        message: 'That serial belongs to a retired asset. Reinstating keeps its history — registering again would fork it.',
      };
    }
    return {
      kind: 'exact',
      matches: exact,
      message: 'This serial is already registered. Open the existing record, or declare this a genuinely different unit.',
    };
  }

  const fuzzy = pool.filter((a) => {
    const other = a.serialNumber.trim().toLowerCase();
    if (editDistance(s, other) <= 2) return true;
    // Same manufacturer + model registered today is the other classic dupe.
    return Boolean(mfr) && a.manufacturer?.toLowerCase() === mfr && other.length > 0 && editDistance(s, other) <= 3;
  });

  if (fuzzy.length) {
    return {
      kind: 'fuzzy',
      matches: fuzzy.slice(0, 3),
      message: 'Close match found. Confirm this is a different unit before continuing.',
    };
  }

  return { kind: 'clean', matches: [], message: '' };
}

// ── ID minting & naming ──────────────────────────────────────────────────────

export function mintAssetId(assets: Asset[]): string {
  const max = assets.reduce((m, a) => {
    const n = Number(a.id.replace('AST-', ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 1000);
  return `AST-${max + 1}`;
}

/** Short scan-to-open code (the /a/[shortId] contract in docs/10 §10.2). */
export const shortIdFor = (assetId: string): string => assetId.replace('AST-', 'AG').toLowerCase();

/** The inverse of `shortIdFor` — what the scan landing route resolves. */
export const assetIdFromShortId = (code: string): string =>
  `AST-${code.trim().replace(/^ag/i, '')}`;

/**
 * What a printed code actually carries.
 *
 * An absolute URL rather than the bare asset id: a phone camera opens a URL
 * with no app installed and nothing to configure, which is the entire point of
 * putting a code on the thing. The id is recoverable from the last path
 * segment, so a scanner that only reads text still yields something useful.
 */
export const scanUrlFor = (assetId: string, origin?: string): string => {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/a/${shortIdFor(assetId)}`;
};

/** Never force naming creativity on a dock clerk. */
export function suggestName(manufacturer: string, model: string, serial: string): string {
  const head = [manufacturer.trim(), model.trim()].filter(Boolean).join(' ');
  if (!head) return '';
  const tail = serial.trim().slice(-4);
  return tail ? `${head} — ${tail}` : head;
}

// ── Tag helpers ──────────────────────────────────────────────────────────────

/** Which binding role a technology naturally fills. */
export function roleForKind(kind: SensorKind): 'identity' | 'location' | 'telemetry' {
  if (kind === 'QR Label' || kind === 'RFID Tag') return 'identity';
  if (kind === 'Environmental' || kind === 'LoRaWAN Sensor') return 'telemetry';
  return 'location';
}

/**
 * QR labels verify the moment they are printed and scanned; radio devices have
 * to be heard by a gateway first, so they land in `Bound` and wait.
 */
export const verifiesOnPrint = (kind: SensorKind): boolean => kind === 'QR Label';

/**
 * Every tag id already spoken for, across the seeded estate and the registry.
 * Shared by the Track card and the label printer so a tag minted on one screen
 * can never collide with one minted on the other.
 */
export function takenTagIds(assets: RegisteredAsset[]): Set<string> {
  const s = new Set<string>();
  for (const sensor of allSensors) if (sensor.assetId && sensor.tagId) s.add(sensor.tagId);
  for (const a of assets) for (const b of a.onboarding.bindings) if (!b.retiredAt) s.add(b.tagId);
  return s;
}

/** Mint an unused tag id for a technology. Pass the set from `takenTagIds`. */
export function mintTagId(kind: SensorKind, taken: Set<string>): string {
  const prefix = TAG_ID_PREFIX[kind] ?? 'TAG-';
  for (let n = 9100; n < 9999; n++) {
    const candidate = `${prefix}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}${taken.size + 9999}`;
}

/**
 * The locating technology a tag kind represents.
 *
 * `undefined` for an environmental sensor: it reports temperature and humidity,
 * it does not tell you where the asset is — so recording it as the asset's
 * tracking technology would overstate what the estate can actually answer.
 */
export const trackingTechLabel = (kind: SensorKind): TrackingTech | undefined =>
  kind === 'RFID Tag' ? 'RFID'
    : kind === 'BLE Beacon' ? 'BLE'
      : kind === 'UWB Tag' ? 'UWB'
        : kind === 'GPS Tracker' ? 'GPS'
          : kind === 'QR Label' ? 'QR'
            : kind === 'LoRaWAN Sensor' ? 'LoRaWAN'
              : undefined;

// ── Source metadata (Stage A) ────────────────────────────────────────────────

export interface SourceDef {
  key: SourceKey;
  label: string;
  icon: string;
  blurb: string;
  /** Roughly how much of the form this source fills in for you. */
  prefills: string;
  /** Sources that route elsewhere rather than into Stage B. */
  href?: string;
  disabled?: boolean;
}

export const SOURCES: SourceDef[] = [
  {
    key: 'po', label: 'From Purchase Order', icon: '🧾',
    blurb: 'Register against a received PO line — the invoice already knows the make, model, cost and warranty.',
    prefills: 'Fills ~8 fields',
  },
  {
    key: 'template', label: 'From Template', icon: '🧬',
    blurb: 'Start from an asset class and inherit its attributes, monitoring, depreciation and PM plan.',
    prefills: 'Fills class defaults',
  },
  {
    key: 'clone', label: 'Clone an existing asset', icon: '📑',
    blurb: 'Copy everything except serial, tag and location — for the twelfth identical unit.',
    prefills: 'Fills ~10 fields',
  },
  {
    key: 'scan', label: 'Scan (mobile / handheld)', icon: '📷',
    blurb: 'Read the serial barcode and nameplate at the dock. Location comes from the gateway that saw you.',
    prefills: 'Fills ~5 fields',
  },
  {
    key: 'blank', label: 'Blank', icon: '📝',
    blurb: 'The honest fallback for a legacy asset already in the building. Nothing is pre-filled.',
    prefills: 'Fills nothing',
  },
  {
    key: 'import', label: 'Bulk import (CSV / Excel)', icon: '📥',
    blurb: 'Map columns, dry-run the validation, commit the good rows and get the bad ones back as a file.',
    prefills: 'Many assets at once',
    href: '/assets/import',
  },
  {
    key: 'erp', label: 'ERP / API sync', icon: '🔌',
    blurb: 'Assets flow in from the system of record; the UI becomes an exception queue.',
    prefills: 'Continuous',
    href: '/admin/integrations',
  },
  {
    key: 'adopt', label: 'Adopt an unknown tag', icon: '👻',
    blurb: 'A tag is reading in a zone with no asset behind it. Adopt it into the registry, pre-bound.',
    prefills: 'Fills tag + location',
  },
];

// ── Onboarding record factory ────────────────────────────────────────────────

/** A fresh onboarding record, pre-loaded with everything the class decides. */
export function newOnboarding(classId: string, source: SourceKey, actor: string): AssetOnboarding {
  const tpl = getClassTemplate(classId);
  return {
    state: 'Draft',
    source,
    classId,
    registeredAt: new Date(nowMs()).toISOString(),
    registeredBy: actor,
    attributes: {},
    locationConfirmed: false,
    trackingIntent: 'undecided',
    bindings: [],
    // Monitoring and maintenance are decided by the CLASS, not by whoever is
    // standing at the receiving dock. Where the class supplies an answer we
    // inherit it and close the gate — asking someone to click "yes I agree"
    // with a decision already in the record is ceremony, not a check.
    // The gate still opens honestly when the class has nothing to say, which is
    // a class-library gap worth surfacing rather than papering over.
    monitoringProfileId: tpl.monitoringProfileId,
    monitoringDecided: Boolean(tpl.monitoringProfileId),
    monitoringOverridden: false,
    maintenancePlan: tpl.pmPlan ? 'class-default' : null,
    commercial: {
      ownership: 'Owned',
      depreciationMethod: tpl.depreciationMethod,
      usefulLifeYears: tpl.usefulLifeYears,
    },
    documents: [],
  };
}

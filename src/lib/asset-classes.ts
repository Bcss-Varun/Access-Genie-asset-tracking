// ─────────────────────────────────────────────────────────────────────────────
// Asset class templates & monitoring profiles
//
// This is the highest-leverage config in the onboarding redesign (docs/21 §21.2
// P2). Picking a class decides the attribute set, whether tracking is expected,
// which monitoring profile applies, the depreciation defaults, the PM plan, the
// document checklist — and the ACTIVATION POLICY (which gates this class needs).
//
// Mandatory-ness lives here, per class. Not in the form.
// ─────────────────────────────────────────────────────────────────────────────

import type { MonitoringProfile, GateKey } from '@/types/onboarding';

// The class policy itself now lives in the editable class library. Re-exported
// here so the nine existing call sites keep importing from one place.
export { getClassTemplate, FALLBACK_TEMPLATE } from '@/lib/class-library';

// ── Monitoring profiles (Step 5 collapses to picking one of these) ────────────
// Recipients resolve by ROLE + SCOPE, never by named individual — otherwise a
// staff change orphans a thousand rules.

export const MONITORING_PROFILES: MonitoringProfile[] = [
  {
    id: 'MP-DC-CRIT',
    name: 'Data Centre — Critical',
    summary: '5 rules · escalates to Facility Ops · P1 after 15 min',
    rules: [
      { key: 'temperature', label: 'Inlet temperature', threshold: '> 32 °C for 10 min', recipients: 'Facility Manager @ facility', escalation: 'Ops on-call after 15 min', priority: 'P1', needs: 'temperature' },
      { key: 'humidity', label: 'Relative humidity', threshold: 'outside 40–60 %', recipients: 'Facility Manager @ facility', escalation: 'Ops on-call after 30 min', priority: 'P2', needs: 'humidity' },
      { key: 'tamper', label: 'Enclosure tamper', threshold: 'any tamper event', recipients: 'Security Officer @ facility', escalation: 'Immediate', priority: 'P1' },
      { key: 'movement', label: 'Unexpected movement', threshold: 'leaves assigned rack', recipients: 'Security Officer @ facility', escalation: 'Immediate', priority: 'P1', needs: 'position' },
      { key: 'geofence', label: 'Geofence breach', threshold: 'exits Secure Data Center', recipients: 'Security Officer @ facility', escalation: 'Immediate', priority: 'P1', needs: 'position' },
    ],
  },
  {
    id: 'MP-NET-CORE',
    name: 'Network Core',
    summary: '3 rules · escalates to Network Team · P1 on tamper',
    rules: [
      { key: 'temperature', label: 'Chassis temperature', threshold: '> 45 °C sustained', recipients: 'Maintenance Manager @ facility', escalation: 'Network on-call after 20 min', priority: 'P2', needs: 'temperature' },
      { key: 'tamper', label: 'Port / enclosure tamper', threshold: 'any tamper event', recipients: 'Security Officer @ facility', escalation: 'Immediate', priority: 'P1' },
      { key: 'geofence', label: 'Leaves comms room', threshold: 'exits assigned zone', recipients: 'Facility Manager @ facility', escalation: 'After 5 min', priority: 'P2', needs: 'position' },
    ],
  },
  {
    id: 'MP-IT-STD',
    name: 'IT Endpoint — Standard',
    summary: '3 rules · routed to the IT service desk · P3 default',
    rules: [
      { key: 'movement', label: 'Off-site movement', threshold: 'leaves facility geofence', recipients: 'IT Service Desk @ org', escalation: 'Next business day', priority: 'P3', needs: 'position' },
      { key: 'battery', label: 'Tag battery low', threshold: '< 20 %', recipients: 'IT Service Desk @ org', escalation: 'None — queued task', priority: 'P3', needs: 'battery' },
      { key: 'idle', label: 'Idle / unused', threshold: 'no scan for 30 days', recipients: 'Asset Administrator @ org', escalation: 'None — reclaim review', priority: 'P3' },
    ],
  },
  {
    id: 'MP-INFRA',
    name: 'Infrastructure — Utility',
    summary: '3 rules · escalates to Facility Ops · P1 on tamper',
    rules: [
      { key: 'temperature', label: 'Operating temperature', threshold: '> 40 °C', recipients: 'Facility Manager @ facility', escalation: 'Ops on-call after 15 min', priority: 'P1', needs: 'temperature' },
      { key: 'tamper', label: 'Panel tamper', threshold: 'any tamper event', recipients: 'Security Officer @ facility', escalation: 'Immediate', priority: 'P1' },
      { key: 'idle', label: 'No load reported', threshold: 'idle > 7 days', recipients: 'Maintenance Manager @ facility', escalation: 'None — inspection task', priority: 'P3' },
    ],
  },
  {
    id: 'MP-SENSOR',
    name: 'Sensor Fleet',
    summary: '2 rules · routed to the IoT platform team · P2',
    rules: [
      { key: 'battery', label: 'Cell depletion', threshold: '< 25 %', recipients: 'IT Administrator @ org', escalation: 'Replacement task after 48 h', priority: 'P2', needs: 'battery' },
      { key: 'movement', label: 'Anchor displaced', threshold: 'position drift > 2 m', recipients: 'IT Administrator @ org', escalation: 'After 1 h', priority: 'P2', needs: 'position' },
    ],
  },
];

export const getMonitoringProfile = (id: string | null): MonitoringProfile | undefined =>
  id ? MONITORING_PROFILES.find((p) => p.id === id) : undefined;

// ── Gate labels (shared by the checklist, the registry views and the doc) ─────
export const GATE_LABELS: Record<GateKey, string> = {
  identified: 'Identified',
  located: 'Located',
  accountable: 'Accountable',
  tracked: 'Tracked',
  financial: 'Financial',
  maintainable: 'Maintainable',
  documented: 'Documented',
  monitored: 'Monitored',
};

/** Display order — mirrors the order the Configure cards appear in. */
export const GATE_ORDER: GateKey[] = [
  'identified', 'located', 'accountable', 'tracked', 'financial', 'maintainable', 'documented', 'monitored',
];

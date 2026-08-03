// ─────────────────────────────────────────────────────────────────────────────
// Stage A sources — the things you can register *from*.
//
// All three come from the database: received PO lines, tags the estate can hear
// but cannot name, and handheld scans waiting to be claimed. Adopting a ghost
// tag here closes the same exception the tracking workspace raises, because it
// is the same record.
//
// Roughly 60–80% of enterprise assets arrive through procurement, so the goods
// receipt is the natural starting point: it already holds manufacturer, model,
// cost, vendor and warranty terms. Starting from a blank form throws all of
// that away (docs/21 §21.3.2).
// ─────────────────────────────────────────────────────────────────────────────

import type { ReceivedPoLine, SensorKind } from '@access-genie/shared';
import { allPendingScans, allPoLines, allUnknownTagReads } from '@/lib/dataset';

/** A received PO line that is a capital asset waiting to be registered. */

export const ASSET_PO_LINES = allPoLines;
export const getPoLine = (id: string): ReceivedPoLine | undefined => ASSET_PO_LINES.find((l) => l.id === id);

// ── Ghost tags (S15) ─────────────────────────────────────────────────────────
// A tag reading in a zone with no asset behind it. Adopting it turns a
// data-integrity alert into a one-click registration; silent unknown reads are
// how a registry rots.

export const UNKNOWN_TAG_READS = allUnknownTagReads;
// ── Scan results (S10) ───────────────────────────────────────────────────────
// What a handheld gets off a barcode plus nameplate OCR at the dock. The point
// of the mobile path is that identity + location arrive together, in seconds.

export const SCAN_RESULTS = allPendingScans;

/**
 * The technology behind an unclaimed tag.
 *
 * A tag the estate cannot name has no registered kind — the only thing known
 * about it is the identifier it broadcasts, and each technology mints those
 * under its own prefix. See TAG_ID_PREFIX for the other direction.
 */
export function kindFromTagId(tagId: string): SensorKind {
  if (tagId.startsWith('RFID')) return 'RFID Tag';
  if (tagId.startsWith('BLE')) return 'BLE Beacon';
  if (tagId.startsWith('UWB')) return 'UWB Tag';
  if (tagId.startsWith('GPS')) return 'GPS Tracker';
  if (tagId.startsWith('QR')) return 'QR Label';
  return 'LoRaWAN Sensor';
}

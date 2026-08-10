// ─────────────────────────────────────────────────────────────────────────────
// Class policy defaults.
//
// Asset classes were removed: the editable class library, its Administration
// screen, its API and its collection are gone, because templates now decide
// which fields a kind of asset is asked for — which is what people were
// reaching for a class to do.
//
// What survives is the *policy slice* the legacy registration helpers still
// read: tracking expectation, activation gates, depreciation defaults. With no
// classes to look up, every asset gets the same answer, which is what the
// fallback always returned for the many assets that had no class anyway.
//
// Kept as a module rather than inlined so there is one obvious place to put
// per-class policy back if it returns.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClassTemplate } from '@access-genie/shared';

export const FALLBACK_TEMPLATE: ClassTemplate = {
  classId: '',
  trackingExpected: false,
  preferredTags: ['QR Label'],
  activationGates: ['identified', 'located', 'accountable'],
  monitoringProfileId: null,
  depreciationMethod: 'Straight-line (5yr)',
  usefulLifeYears: 5,
  pmPlan: null,
  documentChecklist: ['Invoice'],
  defaultCriticality: 'Medium',
  approvalThreshold: 500000,
};

/**
 * The policy slice the registration helpers read.
 *
 * `classId` is echoed back so a stored value on an existing asset still
 * round-trips, but it no longer resolves to anything — there is no class
 * library to resolve it against.
 */
export function getClassTemplate(classId: string): ClassTemplate {
  return { ...FALLBACK_TEMPLATE, classId };
}

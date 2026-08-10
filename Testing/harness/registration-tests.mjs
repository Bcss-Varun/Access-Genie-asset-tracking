// Add Asset (rebuilt flow) — API, validation, template, clone and DB tests.
//
//   node Testing/harness/registration-tests.mjs
//
// Covers the four-source registration flow: the field catalogue, scope-derived
// defaults, template authoring and template-driven validation, clone prefill,
// and what actually lands in MongoDB. Cleans up every asset and template it
// creates, including a direct database sweep for templates (the API archives
// rather than deletes, by design).

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { API, login, req, record, results, summarise } from './lib.mjs';

const token = await login();
console.log(`\nAuthenticated. Target ${API}\n${'─'.repeat(78)}`);

const madeAssets = [];
const madeTemplates = [];
const VAL = 422;

const draft = (patch = {}) => ({ source: 'blank', values: {}, ...patch });

/** Register an asset through the new flow and remember it for teardown. */
async function register(body) {
  const r = await req(token, 'POST', '/assets/registration', body);
  if (r.status === 201 && r.body?.data?.id) madeAssets.push(r.body.data.id);
  return r;
}

async function mkTemplate(body) {
  const r = await req(token, 'POST', '/assets/templates', body);
  if (r.status === 201 && r.body?.data?.id) madeTemplates.push(r.body.data.id);
  return r;
}

const errKeys = (r) => (r.body?.error?.details ?? []).map((d) => d.path);
const vErrKeys = (r) => (r.body?.data?.errors ?? []).map((e) => e.key);

// ═══ 1. Field catalogue ═════════════════════════════════════════════════════

let catalog = null;
{
  const r = await req(token, 'GET', '/assets/registration/catalog');
  catalog = r.body?.data;
  const sectionKeys = (catalog?.sections ?? []).map((s) => s.key);
  record({
    id: 'AR-CAT-001', feature: 'GET /registration/catalog returns sectioned field catalogue', type: 'API',
    priority: 'P0', severity: 'Critical',
    expected: 'sections identity, assignment, location, technical, commercial, maintenance, tracking',
    actual: `${r.status} sections=${JSON.stringify(sectionKeys)}`,
    pass: r.status === 200 && ['identity', 'assignment', 'location', 'technical', 'commercial', 'maintenance', 'tracking'].every((k) => sectionKeys.includes(k)),
  });

  const allFields = (catalog?.sections ?? []).flatMap((s) => s.fields.map((f) => f.key));
  record({
    id: 'AR-CAT-002', feature: 'Criticality is absent from the registration catalogue', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'no "criticality" field — it is no longer asked during registration',
    actual: `criticality present = ${allFields.includes('criticality')}`,
    pass: !allFields.includes('criticality'),
  });

  record({
    id: 'AR-CAT-003', feature: 'Catalogue declares core and identity field sets', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'coreFields includes name/facilityId; identityFields includes serialNumber/macAddress',
    actual: `core=${JSON.stringify(catalog?.coreFields)} identity=${JSON.stringify(catalog?.identityFields)}`,
    pass:
      ['name', 'facilityId'].every((k) => catalog?.coreFields?.includes(k)) &&
      ['serialNumber', 'macAddress'].every((k) => catalog?.identityFields?.includes(k)),
  });

  record({
    id: 'AR-CAT-005', feature: 'Template editor is not offered the fields the server mints', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'assetTag and trackingId absent — a template cannot ask for a number it does not own',
    actual: `assetTag=${allFields.includes('assetTag')} trackingId=${allFields.includes('trackingId')}`,
    pass: !allFields.includes('assetTag') && !allFields.includes('trackingId'),
  });

  record({
    id: 'AR-CAT-006', feature: 'Template editor is not offered category — the template sets it', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'category absent from the pickable catalogue and from coreFields',
    actual: `field=${allFields.includes('category')} core=${catalog?.coreFields?.includes('category')}`,
    pass: !allFields.includes('category') && !catalog?.coreFields?.includes('category'),
  });

  record({
    id: 'AR-CAT-004', feature: 'Employee ID exists as a first-class assignment field', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'custodianEmployeeId in the assignment section',
    actual: `present=${allFields.includes('custodianEmployeeId')}`,
    pass: allFields.includes('custodianEmployeeId'),
  });
}

// ═══ 2. Scope-derived defaults ══════════════════════════════════════════════

let defaultFacility = null;
{
  const r = await req(token, 'GET', '/assets/registration/defaults');
  const d = r.body?.data;
  defaultFacility = d?.location?.id ?? d?.facilities?.[0]?.id ?? null;
  record({
    id: 'AR-DEF-001', feature: 'GET /registration/defaults derives site from the caller scope', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'location + facilities[] + registeredBy, derived from the user homeScopeId',
    actual: `${r.status} location=${JSON.stringify(d?.location)} facilities=${d?.facilities?.length} by=${d?.registeredBy}`,
    pass: r.status === 200 && Array.isArray(d?.facilities) && d?.registeredBy === 'Raj',
  });
}

// ═══ 3. Blank form ══════════════════════════════════════════════════════════

{
  const r = await req(token, 'GET', '/assets/registration/form?source=blank');
  const fields = r.body?.data?.fields ?? [];
  const keys = fields.map((f) => f.key);
  const required = fields.filter((f) => f.required).map((f) => f.key);
  record({
    id: 'AR-FRM-001', feature: 'Blank form offers the whole catalogue, requiring only core fields', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'many fields; required set == core set (name, category, facilityId)',
    actual: `${r.status} fields=${fields.length} required=${JSON.stringify(required)}`,
    pass: r.status === 200 && fields.length > 20 && required.length === 3 &&
      ['name', 'category', 'facilityId'].every((k) => required.includes(k)),
  });

  record({
    id: 'AR-FRM-005', feature: 'Blank form never asks for the numbers the server mints', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'no assetTag or trackingId input on the blank form',
    actual: `assetTag=${keys.includes('assetTag')} trackingId=${keys.includes('trackingId')}`,
    pass: !keys.includes('assetTag') && !keys.includes('trackingId'),
  });

  const derived = r.body?.data?.derived ?? [];
  record({
    id: 'AR-FRM-006', feature: 'Minted fields are declared so the review step can name them', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'derived[] carries assetTag and trackingId with origin=generated and a note',
    actual: `derived=${JSON.stringify(derived.map((d) => `${d.key}:${d.origin}`))}`,
    pass:
      ['assetTag', 'trackingId'].every((k) => derived.some((d) => d.key === k && d.origin === 'generated')) &&
      derived.every((d) => typeof d.note === 'string' && d.note.length > 0),
  });
}

// ═══ 4. Validation — blank source ═══════════════════════════════════════════

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({ values: {} }));
  record({
    id: 'AR-VAL-001', feature: 'Empty draft reports each missing core field, per section', type: 'Validation',
    priority: 'P0', severity: 'Critical',
    expected: 'valid=false; errors for name, category, facilityId; sections carry their own errors',
    actual: `${r.status} valid=${r.body?.data?.valid} errors=${JSON.stringify(vErrKeys(r))}`,
    pass: r.status === 200 && r.body?.data?.valid === false &&
      ['name', 'category', 'facilityId'].every((k) => vErrKeys(r).includes(k)),
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'Probe', category: 'Compute', facilityId: defaultFacility, custodianName: 'Anita Rao' },
  }));
  record({
    id: 'AR-VAL-002', feature: 'Custodian named without an employee ID is rejected', type: 'Validation',
    priority: 'P0', severity: 'Critical',
    expected: 'error on custodianEmployeeId',
    actual: `valid=${r.body?.data?.valid} errors=${JSON.stringify(vErrKeys(r))}`,
    pass: r.body?.data?.valid === false && vErrKeys(r).includes('custodianEmployeeId'),
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'Probe', category: 'Compute', facilityId: defaultFacility, custodianEmployeeId: 'EMP-1' },
  }));
  record({
    id: 'AR-VAL-003', feature: 'Employee ID without a name is rejected (half-filled assignment)', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: 'error on custodianName',
    actual: `valid=${r.body?.data?.valid} errors=${JSON.stringify(vErrKeys(r))}`,
    pass: r.body?.data?.valid === false && vErrKeys(r).includes('custodianName'),
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'Probe', category: 'Compute', facilityId: defaultFacility },
  }));
  record({
    id: 'AR-VAL-004', feature: 'Unassigned asset is valid — assignment is optional', type: 'Validation',
    priority: 'P0', severity: 'Critical',
    expected: 'valid=true with no custodian at all',
    actual: `valid=${r.body?.data?.valid} errors=${JSON.stringify(vErrKeys(r))}`,
    pass: r.body?.data?.valid === true,
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'P', category: 'Compute', facilityId: defaultFacility, hasMaintenanceContract: true },
  }));
  record({
    id: 'AR-VAL-005', feature: 'Maintenance contract switched on requires a provider', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: 'error on amcProvider',
    actual: `errors=${JSON.stringify(vErrKeys(r))}`,
    pass: vErrKeys(r).includes('amcProvider'),
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'Probe', category: 'Compute', facilityId: defaultFacility, hasMaintenanceContract: false },
  }));
  record({
    id: 'AR-VAL-006', feature: 'Maintenance section is skippable when there is no contract', type: 'Validation',
    priority: 'P0', severity: 'Critical',
    expected: 'valid=true — most assets have no contract',
    actual: `valid=${r.body?.data?.valid} errors=${JSON.stringify(vErrKeys(r))}`,
    pass: r.body?.data?.valid === true,
  });
}

{
  // A client that still posts a tag ID is describing a field the form no longer
  // has. It must be ignored rather than trusted — accepting it would reopen the
  // duplicate the minting exists to prevent.
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'Probe', category: 'Compute', facilityId: defaultFacility, trackingId: 'QR-TEST-1' },
  }));
  record({
    id: 'AR-VAL-007', feature: 'A client-supplied tag ID is ignored, not trusted', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: 'valid=true and no trackingId error — the field is not asked for and not accepted',
    actual: `valid=${r.body?.data?.valid} errors=${JSON.stringify(vErrKeys(r))}`,
    pass: r.body?.data?.valid === true && !vErrKeys(r).includes('trackingId'),
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'Probe', category: 'Compute', facilityId: defaultFacility, macAddress: 'not-a-mac' },
  }));
  record({
    id: 'AR-VAL-008', feature: 'Malformed MAC address is rejected with a readable hint', type: 'Validation',
    priority: 'P2', severity: 'Medium',
    expected: 'error on macAddress naming the expected format',
    actual: `errors=${JSON.stringify(r.body?.data?.errors)}`,
    pass: vErrKeys(r).includes('macAddress'),
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'Probe', category: 'Compute', facilityId: defaultFacility, serialNumber: 'X' },
  }));
  record({
    id: 'AR-VAL-009', feature: 'One-character serial rejected; blank still allowed', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: 'error on serialNumber',
    actual: `errors=${JSON.stringify(vErrKeys(r))}`,
    pass: vErrKeys(r).includes('serialNumber'),
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', draft({
    values: { name: 'Probe', category: 'Compute', facilityId: 'FAC-DOES-NOT-EXIST' },
  }));
  const rr = await register(draft({ values: { name: 'QA Bad Site', category: 'Compute', facilityId: 'FAC-DOES-NOT-EXIST' } }));
  record({
    id: 'AR-VAL-010', feature: 'Unknown site is refused at commit', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: `${VAL} on register`,
    actual: `validate=${r.status} register=${rr.status}`,
    pass: rr.status === VAL,
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', { source: 'po', values: {} });
  record({
    id: 'AR-VAL-011', feature: 'Retired sources (po/scan/erp/adopt) are refused', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: `${VAL} — only blank, template, clone, import remain`,
    actual: `${r.status}`,
    pass: r.status === VAL,
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', { source: 'template', values: {} });
  record({
    id: 'AR-VAL-012', feature: 'Template source without a templateId is refused', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: `${VAL}`,
    actual: `${r.status}`,
    pass: r.status === VAL,
  });
}

// ═══ 5. Register — blank ════════════════════════════════════════════════════

let blankId = null;
{
  const r = await register(draft({
    values: {
      name: 'QA Blank Asset', category: 'Compute', facilityId: defaultFacility,
      custodianName: 'Anita Rao', custodianEmployeeId: 'BCSS-2291', department: 'Finance',
      manufacturer: 'Dell', model: 'Latitude 5440',
      hasMaintenanceContract: true, amcProvider: 'Dell ProSupport', amcRef: 'AMC-99',
      zone: 'Desk 14',
    },
  }));
  blankId = r.body?.data?.id ?? null;
  record({
    id: 'AR-REG-001', feature: 'Blank registration creates an asset', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: '201 with an AST- id',
    actual: `${r.status} id=${blankId} ${r.status !== 201 ? JSON.stringify(r.body?.error).slice(0, 160) : ''}`,
    pass: r.status === 201 && /^AST-\d+$/.test(blankId ?? ''),
  });
}

{
  const r = await req(token, 'GET', `/assets/${blankId}`);
  const a = r.body?.data;
  record({
    id: 'AR-REG-002', feature: 'Registration writes custodian + employee ID to the asset', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: 'custodian "Anita Rao", onboarding.custodianEmployeeId "BCSS-2291"',
    actual: `custodian=${a?.custodian} employeeId=${a?.onboarding?.custodianEmployeeId}`,
    pass: a?.custodian === 'Anita Rao' && a?.onboarding?.custodianEmployeeId === 'BCSS-2291',
  });

  record({
    id: 'AR-REG-003', feature: 'Maintenance contract persists in its own sub-document', type: 'Database',
    priority: 'P1', severity: 'High',
    expected: 'onboarding.maintenance { hasContract:true, provider:"Dell ProSupport" }',
    actual: JSON.stringify(a?.onboarding?.maintenance),
    pass: a?.onboarding?.maintenance?.hasContract === true && a?.onboarding?.maintenance?.provider === 'Dell ProSupport',
  });

  record({
    id: 'AR-REG-004', feature: 'No serial number is invented when none was given', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: "serialNumber === ''",
    actual: `serialNumber=${JSON.stringify(a?.serialNumber)}`,
    pass: a?.serialNumber === '',
  });

  record({
    id: 'AR-REG-005', feature: 'Site resolves to a named location, not just an id', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: 'location.id and location.name both populated from the scope tree',
    actual: JSON.stringify(a?.location),
    pass: !!a?.location?.id && !!a?.location?.name && a.location.name !== a.location.id,
  });

  record({
    id: 'AR-REG-006', feature: 'Registration is Active with no approval gate', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'onboarding.state === "Active" — the empty approval step is gone',
    actual: `state=${a?.onboarding?.state} source=${a?.onboarding?.source}`,
    pass: a?.onboarding?.state === 'Active' && a?.onboarding?.source === 'blank',
  });

  record({
    id: 'AR-REG-007', feature: 'Blank registration stores no asset class', type: 'Database',
    priority: 'P1', severity: 'High',
    expected: "onboarding.classId === '' — classify later, do not block now",
    actual: `classId=${JSON.stringify(a?.onboarding?.classId)}`,
    pass: a?.onboarding?.classId === '' || a?.onboarding?.classId === undefined,
  });
}

{
  const r = await register(draft({ values: { name: 'QA No Custodian', category: 'Storage', facilityId: defaultFacility } }));
  record({
    id: 'AR-REG-008', feature: 'Unassigned registration stores custodian "Unassigned"', type: 'Database',
    priority: 'P1', severity: 'High',
    expected: '201, custodian "Unassigned"',
    actual: `${r.status} custodian=${r.body?.data?.custodian}`,
    pass: r.status === 201 && r.body?.data?.custodian === 'Unassigned',
  });
}

{
  const r = await register(draft({ values: { name: 'QA Missing Core', facilityId: defaultFacility } }));
  record({
    id: 'AR-REG-009', feature: 'Commit is refused when a core field is missing', type: 'Negative',
    priority: 'P0', severity: 'Critical',
    expected: `${VAL} naming category`,
    actual: `${r.status} details=${JSON.stringify(errKeys(r))}`,
    pass: r.status === VAL && errKeys(r).includes('category'),
  });
}

// ═══ 6. Minted identifiers ══════════════════════════════════════════════════

{
  const a = await register(draft({ values: { name: 'QA Tagged A', category: 'Compute', facilityId: defaultFacility } }));
  const b = await register(draft({ values: { name: 'QA Tagged B', category: 'Compute', facilityId: defaultFacility } }));
  const tagA = a.body?.data?.onboarding?.assetTag;
  const tagB = b.body?.data?.onboarding?.assetTag;
  record({
    id: 'AR-DB-001', feature: 'Every registration is issued its own asset tag', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: 'both 201, both tagged AG-<n>, and the two tags differ',
    actual: `first=${a.status}/${tagA} second=${b.status}/${tagB}`,
    pass: a.status === 201 && b.status === 201 && /^AG-\d+$/.test(tagA ?? '') && /^AG-\d+$/.test(tagB ?? '') && tagA !== tagB,
  });
}

{
  // The tag is ours to issue. A client that sends one is either guessing or
  // replaying, and honouring it is how two assets end up wearing one number.
  const r = await register(draft({
    values: { name: 'QA Tag Override', category: 'Compute', facilityId: defaultFacility, assetTag: 'QA-TAG-001' },
  }));
  const tag = r.body?.data?.onboarding?.assetTag;
  record({
    id: 'AR-DB-002', feature: 'A client-supplied asset tag cannot override the minted one', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '201 with a minted AG- tag, not "QA-TAG-001"',
    actual: `${r.status} assetTag=${tag}`,
    pass: r.status === 201 && /^AG-\d+$/.test(tag ?? ''),
  });
}

{
  const r = await register(draft({
    values: { name: 'QA Tracked', category: 'Compute', facilityId: defaultFacility, trackingTech: 'QR' },
  }));
  const a = r.body?.data;
  record({
    id: 'AR-DB-003', feature: 'Choosing a tag type mints a tag ID carrying that prefix', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'trackingId matches QR-<n>, trackingIntent "bound"',
    actual: `${r.status} trackingId=${a?.trackingId} intent=${a?.onboarding?.trackingIntent}`,
    pass: r.status === 201 && /^QR-\d+$/.test(a?.trackingId ?? '') && a?.onboarding?.trackingIntent === 'bound',
  });
}

{
  const r = await register(draft({ values: { name: 'QA Untracked', category: 'Compute', facilityId: defaultFacility } }));
  const a = r.body?.data;
  record({
    id: 'AR-DB-004', feature: 'No tag type means no tag ID is invented', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'trackingId absent/empty, trackingIntent "not-tracked"',
    actual: `${r.status} trackingId=${JSON.stringify(a?.trackingId)} intent=${a?.onboarding?.trackingIntent}`,
    pass: r.status === 201 && !a?.trackingId && a?.onboarding?.trackingIntent === 'not-tracked',
  });
}

// ═══ 7. Templates ═══════════════════════════════════════════════════════════

let tplId = null;
{
  const r = await mkTemplate({
    name: 'QA Computer Template',
    description: 'Fields a laptop actually needs',
    icon: '💻',
    category: 'Compute',
    fields: [
      { key: 'name', required: true, order: 0 },
      { key: 'category', required: true, order: 1 },
      { key: 'facilityId', required: true, order: 2 },
      { key: 'serialNumber', required: true, order: 3 },
      { key: 'manufacturer', required: true, order: 4 },
      { key: 'model', required: false, order: 5 },
      { key: 'macAddress', required: true, order: 6 },
      { key: 'processor', required: false, order: 7 },
      { key: 'warrantyAgent', required: false, order: 8 },
    ],
    customFields: [
      { key: 'warrantyAgent', label: 'Warranty agent', section: 'commercial', type: 'text', required: false, order: 8 },
    ],
  });
  tplId = r.body?.data?.id ?? null;
  record({
    id: 'AR-TPL-001', feature: 'Create a template selecting catalogue + custom fields', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: '201 with a TPL- id',
    actual: `${r.status} id=${tplId} ${r.status !== 201 ? JSON.stringify(r.body?.error).slice(0, 200) : ''}`,
    pass: r.status === 201 && /^TPL-\d+$/.test(tplId ?? ''),
  });
}

{
  const r = await req(token, 'POST', '/assets/templates', {
    name: 'QA Bad Key', category: 'Compute',
    fields: [{ key: 'nonexistentField', required: true, order: 0 }],
  });
  record({
    id: 'AR-TPL-002', feature: 'Template referencing an unknown field is rejected', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: `${VAL} — the field resolves to nothing`,
    actual: `${r.status}`,
    pass: r.status === VAL,
  });
}

{
  const r = await req(token, 'POST', '/assets/templates', {
    name: 'QA Dup Key', category: 'Compute',
    fields: [{ key: 'name', required: true, order: 0 }, { key: 'name', required: false, order: 1 }],
  });
  record({
    id: 'AR-TPL-003', feature: 'Template selecting the same field twice is rejected', type: 'Validation',
    priority: 'P2', severity: 'Medium',
    expected: `${VAL}`,
    actual: `${r.status}`,
    pass: r.status === VAL,
  });
}

{
  const r = await req(token, 'POST', '/assets/templates', {
    name: 'QA Shadow', category: 'Compute', fields: [],
    customFields: [{ key: 'serialNumber', label: 'Serial', section: 'identity', type: 'text', required: true, order: 0 }],
  });
  record({
    id: 'AR-TPL-004', feature: 'Custom field may not shadow a catalogue field', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: `${VAL} — two paths under one name`,
    actual: `${r.status}`,
    pass: r.status === VAL,
  });
}

{
  const r = await req(token, 'POST', '/assets/templates', {
    name: 'QA Empty Select', category: 'Compute', fields: [],
    customFields: [{ key: 'colour', label: 'Colour', section: 'technical', type: 'select', required: false, order: 0 }],
  });
  record({
    id: 'AR-TPL-005', feature: 'Custom dropdown with no options is rejected', type: 'Validation',
    priority: 'P2', severity: 'Medium',
    expected: `${VAL}`,
    actual: `${r.status}`,
    pass: r.status === VAL,
  });
}

{
  const r = await req(token, 'GET', `/assets/registration/form?source=template&templateId=${tplId}`);
  const fields = r.body?.data?.fields ?? [];
  const keys = fields.map((f) => f.key);
  const required = fields.filter((f) => f.required).map((f) => f.key);
  record({
    id: 'AR-TPL-006', feature: 'Template form asks only the chosen fields, with the author required flags', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'the 9 chosen fields less the category the template answers itself = 8; serialNumber and macAddress required; model optional',
    actual: `n=${fields.length} required=${JSON.stringify(required)}`,
    pass: fields.length === 8 && required.includes('serialNumber') && required.includes('macAddress') && !required.includes('model'),
  });

  const derived = r.body?.data?.derived ?? [];
  const cat = derived.find((d) => d.key === 'category');
  record({
    id: 'AR-TPL-017', feature: 'A template answers the category instead of asking for it', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'no category input; derived carries category=Compute with origin "template"',
    actual: `asked=${keys.includes('category')} derived=${JSON.stringify(cat)}`,
    pass: !keys.includes('category') && cat?.origin === 'template' && cat?.value === 'Compute',
  });

  record({
    id: 'AR-TPL-007', feature: 'Custom template field appears in the resolved form', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'warrantyAgent present, mapped into onboarding.attributes',
    actual: `present=${keys.includes('warrantyAgent')} path=${fields.find((f) => f.key === 'warrantyAgent')?.path}`,
    pass: keys.includes('warrantyAgent') && fields.find((f) => f.key === 'warrantyAgent')?.path === 'onboarding.attributes.warrantyAgent',
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', {
    source: 'template', templateId: tplId,
    values: { name: 'QA T', category: 'Compute', facilityId: defaultFacility },
  });
  record({
    id: 'AR-TPL-008', feature: 'Template-mandated fields are enforced at validation', type: 'Validation',
    priority: 'P0', severity: 'Critical',
    expected: 'errors for serialNumber, manufacturer, macAddress',
    actual: `errors=${JSON.stringify(vErrKeys(r))}`,
    pass: ['serialNumber', 'manufacturer', 'macAddress'].every((k) => vErrKeys(r).includes(k)),
  });
}

let tplAssetId = null;
{
  const r = await register({
    source: 'template', templateId: tplId,
    values: {
      // A deliberately wrong category: the template decides, not the caller.
      name: 'QA Template Laptop', category: 'Furniture', facilityId: defaultFacility,
      serialNumber: 'QA-TPL-SER-1', manufacturer: 'Dell', model: 'Latitude 5440',
      macAddress: '00:1B:44:11:3A:B7', processor: 'Intel i7-1355U', warrantyAgent: 'Redington',
    },
  });
  tplAssetId = r.body?.data?.id ?? null;
  record({
    id: 'AR-TPL-009', feature: 'Registering from a template creates the asset', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: '201',
    actual: `${r.status} ${r.status !== 201 ? JSON.stringify(r.body?.error).slice(0, 180) : ''}`,
    pass: r.status === 201,
  });
}

{
  const r = await req(token, 'GET', `/assets/${tplAssetId}`);
  const a = r.body?.data;
  record({
    id: 'AR-TPL-010', feature: 'Template asset stores templateId and custom attributes', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: `onboarding.templateId=${tplId}; attributes.macAddress + attributes.warrantyAgent persisted`,
    actual: `templateId=${a?.onboarding?.templateId} attrs=${JSON.stringify(a?.onboarding?.attributes)}`,
    pass: a?.onboarding?.templateId === tplId &&
      a?.onboarding?.attributes?.macAddress === '00:1B:44:11:3A:B7' &&
      a?.onboarding?.attributes?.warrantyAgent === 'Redington',
  });

  record({
    id: 'AR-TPL-018', feature: "The template's category wins over anything the caller sends", type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: 'category "Compute" from the template, not the "Furniture" that was posted',
    actual: `category=${a?.category}`,
    pass: a?.category === 'Compute',
  });
}

{
  const r = await req(token, 'GET', `/assets/templates/${tplId}`);
  record({
    id: 'AR-TPL-011', feature: 'Template usage counter increments on use', type: 'Functional',
    priority: 'P2', severity: 'Medium',
    expected: 'usageCount === 1',
    actual: `usageCount=${r.body?.data?.usageCount}`,
    pass: r.body?.data?.usageCount === 1,
  });
}

{
  const list = await req(token, 'GET', '/assets/templates');
  record({
    id: 'AR-TPL-012', feature: 'Template list returns active templates', type: 'API',
    priority: 'P1', severity: 'High',
    expected: '200 with our template present',
    actual: `${list.status} n=${list.body?.data?.length}`,
    pass: list.status === 200 && (list.body?.data ?? []).some((t) => t.id === tplId || t._id === tplId),
  });
}

{
  const r = await req(token, 'PATCH', `/assets/templates/${tplId}`, { description: 'Updated by QA' });
  const after = await req(token, 'GET', `/assets/templates/${tplId}`);
  record({
    id: 'AR-TPL-013', feature: 'Template update preserves unsent fields', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'description changed; fields[] and name intact',
    actual: `${r.status} desc=${after.body?.data?.description} fields=${after.body?.data?.fields?.length} name=${after.body?.data?.name}`,
    pass: r.status === 200 && after.body?.data?.description === 'Updated by QA' &&
      after.body?.data?.fields?.length === 9 && after.body?.data?.name === 'QA Computer Template',
  });
}

{
  const r = await req(token, 'DELETE', `/assets/templates/${tplId}`);
  const after = await req(token, 'GET', `/assets/templates/${tplId}`);
  record({
    id: 'AR-TPL-014', feature: 'Deleting a template archives it rather than destroying it', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'status archived, still readable (assets reference it)',
    actual: `${r.status} status=${after.body?.data?.status}`,
    pass: r.status === 200 && after.body?.data?.status === 'archived',
  });
}

{
  const r = await req(token, 'POST', '/assets/registration/validate', {
    source: 'template', templateId: tplId, values: { name: 'x', category: 'Compute' },
  });
  record({
    id: 'AR-TPL-015', feature: 'Archived template cannot be used for new assets', type: 'Negative',
    priority: 'P1', severity: 'High',
    expected: '409 conflict',
    actual: `${r.status}`,
    pass: r.status === 409,
  });
}

{
  const r = await req(token, 'GET', '/assets/registration/form?source=template&templateId=TPL-999999');
  record({
    id: 'AR-TPL-016', feature: 'Unknown template returns 404', type: 'Negative',
    priority: 'P2', severity: 'Medium',
    expected: '404',
    actual: `${r.status}`,
    pass: r.status === 404,
  });
}

// ═══ 8. Clone ═══════════════════════════════════════════════════════════════

{
  const r = await req(token, 'GET', `/assets/${tplAssetId}/clone-source`);
  const d = r.body?.data;
  const cleared = (d?.clearedFields ?? []).map((c) => c.key);
  record({
    id: 'AR-CLN-001', feature: 'Clone prefill copies shared values', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'manufacturer/model/category copied from the source asset',
    actual: `${r.status} manufacturer=${d?.values?.manufacturer} model=${d?.values?.model} category=${d?.values?.category}`,
    pass: r.status === 200 && d?.values?.manufacturer === 'Dell' && d?.values?.category === 'Compute',
  });

  record({
    id: 'AR-CLN-002', feature: 'Clone clears every identity field the user must type, and names them', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'serialNumber, macAddress, imei blanked and listed; the minted assetTag and trackingId are not asked for at all',
    actual: `cleared=${JSON.stringify(cleared)} serial=${JSON.stringify(d?.values?.serialNumber)} mac=${JSON.stringify(d?.values?.macAddress)}`,
    pass: ['serialNumber', 'macAddress', 'imei'].every((k) => cleared.includes(k)) &&
      !cleared.includes('assetTag') && !cleared.includes('trackingId') &&
      d?.values?.serialNumber === '' && d?.values?.macAddress === '',
  });

  record({
    id: 'AR-CLN-003', feature: 'Clone starts unassigned rather than inheriting the custodian', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: "custodianName === '' — a new unit is not automatically that person's",
    actual: `custodianName=${JSON.stringify(d?.values?.custodianName)}`,
    pass: d?.values?.custodianName === '',
  });
}

{
  const src = await req(token, 'GET', `/assets/${tplAssetId}/clone-source`);
  const values = { ...src.body.data.values, name: 'QA Cloned Laptop', serialNumber: 'QA-CLONE-SER-9', macAddress: '00:1B:44:11:3A:C8' };
  const r = await register({ source: 'clone', cloneOfId: tplAssetId, values });
  record({
    id: 'AR-CLN-004', feature: 'Registering a clone creates a distinct asset', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: '201 with a new id and the typed serial',
    actual: `${r.status} id=${r.body?.data?.id} serial=${r.body?.data?.serialNumber} ${r.status !== 201 ? JSON.stringify(r.body?.error).slice(0, 160) : ''}`,
    pass: r.status === 201 && r.body?.data?.id !== tplAssetId && r.body?.data?.serialNumber === 'QA-CLONE-SER-9',
  });

  const source = await req(token, 'GET', `/assets/${tplAssetId}`);
  record({
    id: 'AR-CLN-008', feature: 'A clone is issued its own asset tag, not the original one', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: 'clone assetTag is an AG- number and differs from the source asset tag',
    actual: `clone=${r.body?.data?.onboarding?.assetTag} source=${source.body?.data?.onboarding?.assetTag}`,
    pass:
      /^AG-\d+$/.test(r.body?.data?.onboarding?.assetTag ?? '') &&
      r.body?.data?.onboarding?.assetTag !== source.body?.data?.onboarding?.assetTag,
  });

  record({
    id: 'AR-CLN-005', feature: 'Clone records its provenance', type: 'Database',
    priority: 'P2', severity: 'Medium',
    expected: `onboarding.clonedFromId === ${tplAssetId}`,
    actual: `clonedFromId=${r.body?.data?.onboarding?.clonedFromId} source=${r.body?.data?.onboarding?.source}`,
    pass: r.body?.data?.onboarding?.clonedFromId === tplAssetId && r.body?.data?.onboarding?.source === 'clone',
  });
}

{
  const src = await req(token, 'GET', `/assets/${tplAssetId}/clone-source`);
  const values = { ...src.body.data.values, name: 'QA Clone Dup Serial', serialNumber: 'QA-TPL-SER-1' };
  const r = await register({ source: 'clone', cloneOfId: tplAssetId, values });
  record({
    id: 'AR-CLN-006', feature: 'Clone reusing the source serial is rejected', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: '409 — two assets cannot claim one serial',
    actual: `${r.status}`,
    pass: r.status === 409,
  });
}

{
  const r = await req(token, 'GET', '/assets/AST-99999999/clone-source');
  record({
    id: 'AR-CLN-007', feature: 'Cloning an unknown asset returns 404', type: 'Negative',
    priority: 'P2', severity: 'Medium',
    expected: '404',
    actual: `${r.status}`,
    pass: r.status === 404,
  });
}

// ═══ 9. Security ════════════════════════════════════════════════════════════

{
  const r = await req(null, 'POST', '/assets/registration', draft({ values: { name: 'x', category: 'Compute' } }));
  record({
    id: 'AR-SEC-001', feature: 'Unauthenticated registration is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401',
    actual: `${r.status}`,
    pass: r.status === 401,
  });
}

{
  const r = await req(null, 'GET', '/assets/registration/catalog');
  record({
    id: 'AR-SEC-002', feature: 'Field catalogue is not public', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: '401',
    actual: `${r.status}`,
    pass: r.status === 401,
  });
}

{
  // A value aimed at a path outside the catalogue must be ignored, not written.
  const r = await register(draft({
    values: { name: 'QA Path Injection', category: 'Compute', facilityId: defaultFacility, 'onboarding.state': 'Active', healthScore: 5, _id: 'AST-HACKED' },
  }));
  const a = r.body?.data;
  record({
    id: 'AR-SEC-003', feature: 'Values for unknown keys are ignored, not written through', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: 'id minted normally; healthScore untouched at 100',
    actual: `${r.status} id=${a?.id} healthScore=${a?.healthScore}`,
    pass: r.status === 201 && a?.id !== 'AST-HACKED' && a?.healthScore === 100,
  });
}

// ═══ Teardown ═══════════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(78)}\nTearing down ${madeAssets.length} assets and ${madeTemplates.length} templates…`);
let removedAssets = 0;
for (const id of [...madeAssets].reverse()) {
  const r = await req(token, 'DELETE', `/assets/${id}`);
  if (r.status === 204) removedAssets++;
}

// Templates are archived by the API on purpose, so the sweep goes direct.
let removedTemplates = 0;
try {
  const env = Object.fromEntries(
    readFileSync(new URL('../../backend/.env', import.meta.url), 'utf8')
      .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
  );
  // Atlas intermittently refuses a fresh TLS handshake in this environment, and
  // a teardown that loses that race leaves test rows behind — which then fail
  // the *next* run against the unique index and look like a product bug.
  let client;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
      await client.connect();
      break;
    } catch (err) {
      client = undefined;
      if (attempt === 6) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!client) throw new Error('could not reach MongoDB for teardown');
  const res = await client.db(env.MONGODB_DB_NAME).collection('assettemplates').deleteMany({ _id: { $in: madeTemplates } });
  removedTemplates = res.deletedCount;
  await client.close();
} catch (e) {
  console.log(`  template sweep failed: ${String(e).split('\n')[0]}`);
}
console.log(`  removed ${removedAssets}/${madeAssets.length} assets, ${removedTemplates}/${madeTemplates.length} templates`);

const sum = summarise();
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../results/registration-results.json', import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), summary: sum, results }, null, 2));
console.log(`\nResults → Testing/results/registration-results.json`);

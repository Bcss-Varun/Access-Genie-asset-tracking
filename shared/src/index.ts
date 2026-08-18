// The contract both sides compile against. A change here that the two sides
// disagree about is a build error, not a runtime surprise.
export * from './platform.js'; // identity, RBAC, the location/scope tree
export * from './domain.js'; // the asset graph: assets, work orders, alerts, tracking
export * from './registry.js'; // classes, collections, PM, MLOps, reporting, admin
export * from './inspections.js'; // Inspections & Checklists: templates and records
export * from './predictive.js'; // Predictive Alerts: the lifecycle an engine will write into
export * from './onboarding.js'; // registration state machine and readiness gates
export * from './registration.js'; // adding an asset: field catalogue, templates, clone
export * from './lifecycle.js'; // the stage workflow: transitions, approvals, board/KPI shapes
export * from './depreciation.js'; // book value and schedules — one implementation, both sides
export * from './tracking-workspace.js'; // the live tracking workspace
export * from './maintenance-dashboard.js'; // the org-wide maintenance read
export * from './label.js'; // labelling and tag printing
export * from './analytics.js'; // the analytics dashboard and the report engine
export * from './api.js'; // envelopes, query contracts, auth payloads

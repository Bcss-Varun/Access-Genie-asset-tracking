// The contract both sides compile against. A change here that the two sides
// disagree about is a build error, not a runtime surprise.
export * from './platform.js'; // identity, RBAC, the location/scope tree
export * from './domain.js'; // the asset graph: assets, work orders, alerts, tracking
export * from './registry.js'; // classes, collections, PM, MLOps, reporting, admin
export * from './onboarding.js'; // registration state machine and readiness gates
export * from './tracking-workspace.js'; // the live tracking workspace
export * from './label.js'; // labelling and tag printing
export * from './api.js'; // envelopes, query contracts, auth payloads

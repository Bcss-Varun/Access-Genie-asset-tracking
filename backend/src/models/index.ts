// Barrel for the data layer. Importing models from one place keeps Mongoose
// model registration order deterministic — every model is defined before the
// first query runs, so a `ref` can never resolve to an unregistered schema.
export { Counter, nextId, syncCounter } from './Counter.js';
export { User, type UserDoc, type UserDocument } from './User.js';
export { RefreshToken, type RefreshTokenDoc } from './RefreshToken.js';
export { Asset, healthStatusFor, type AssetDoc } from './Asset.js';
export { WorkOrder, type WorkOrderDoc } from './WorkOrder.js';
export { Alert, OPEN_ALERT_STATUSES, type AlertDoc } from './Alert.js';
export { AlertRule, type AlertRuleDoc } from './AlertRule.js';
export { Insight, type InsightDoc } from './Insight.js';
export { Sensor, type SensorDoc } from './Sensor.js';
export { Gateway, type GatewayDoc } from './Gateway.js';
export { Geofence, type GeofenceDoc } from './Geofence.js';
export { Zone, type ZoneDoc } from './Zone.js';
export { Activity, type ActivityDoc } from './Activity.js';
export { CustodyRecord, type CustodyDoc } from './CustodyRecord.js';
export { Notification, type NotificationDoc } from './Notification.js';
export { AuditLog, type AuditDoc } from './AuditLog.js';
export { ScopeNodeModel, buildScopeTree, type ScopeNodeDoc } from './ScopeNode.js';
export {
  Part,
  Warehouse,
  Supplier,
  PurchaseOrder,
  type PartDoc,
  type WarehouseDoc,
  type SupplierDoc,
  type PurchaseOrderDoc,
} from './inventory.js';

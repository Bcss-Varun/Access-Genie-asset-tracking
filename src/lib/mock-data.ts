import {
  Asset,
  WorkOrder,
  AIInsight,
  MapZone,
  ActivityEvent,
  UtilizationDowntimePoint,
  CategoryBreakdown,
  TaxonomyClass,
  AssetGroup,
  AssetDoc,
  Sensor,
  Gateway,
  Geofence,
  MovementTrail,
  TrendPoint,
  Part,
  Warehouse,
  Supplier,
  PurchaseOrder,
  PmSchedule,
  Inspection,
  WorkOrderDetail, WoPart, WoLabor,
  Model,
  ForecastSeries,
  AnomalyEvent,
  Report,
  Alert,
  AlertRule,
  Notification,
  AuditRecord,
  CycleCount,
  Certification,
  CustodyRecord,
  Integration,
  ApprovalWorkflow,
} from '@/types/asset';

// All timestamps are anchored to the demo "now" so the build is deterministic
const NOW = '2026-07-23T09:00:00.000Z';
const minsAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();
const hoursAgo = (h: number) => minsAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);
const daysAhead = (d: number) => new Date(Date.parse(NOW) + d * 86_400_000).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// Assets — the unified asset graph (IT Focused)
// ─────────────────────────────────────────────────────────────────────────────
export const mockAssets: Asset[] = [
  {
    id: 'AST-1001',
    name: 'Dell PowerEdge R740 Server',
    category: 'Compute',
    serialNumber: 'SVR-883-XQ',
    status: 'Maintenance',
    healthScore: 30,
    healthStatus: 'Critical',
    manufacturer: 'Dell',
    model: 'PowerEdge R740',
    location: { id: 'LOC-DC-1', name: 'Primary Data Center', building: 'Server Room Alpha', zone: 'Rack 42' },
    custodian: 'IT Ops Team',
    purchaseDate: '2020-01-20',
    purchasePrice: 8500,
    bookValue: 1700,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2025-01-20',
    criticality: 'Critical',
    riskScore: 82,
    utilization: 91,
    trackingTech: 'RFID',
    lifecycleStage: 'EOL Planning',
    mapPosition: { x: 84, y: 62 },
    telemetry: { temperature: 85, vibration: 0.8, lastPing: minsAgo(5) },
    tags: ['RFID', 'Server'],
    healthTrend: [
      { label: 'Feb', value: 61 }, { label: 'Mar', value: 55 }, { label: 'Apr', value: 48 },
      { label: 'May', value: 42 }, { label: 'Jun', value: 36 }, { label: 'Jul', value: 30 },
    ],
  },
  {
    id: 'AST-1002',
    name: 'Cisco Catalyst 9500 Switch',
    category: 'Network',
    serialNumber: 'NET-C95-1120',
    status: 'Active',
    healthScore: 95,
    healthStatus: 'Good',
    manufacturer: 'Cisco',
    model: 'Catalyst 9500',
    location: { id: 'LOC-DC-1', name: 'Primary Data Center', building: 'Server Room Alpha', zone: 'Rack 12' },
    custodian: 'IT Ops Team',
    purchaseDate: '2024-05-22',
    purchasePrice: 24000,
    bookValue: 21600,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2029-05-22',
    criticality: 'Critical',
    riskScore: 9,
    utilization: 67,
    trackingTech: 'RFID',
    lifecycleStage: 'In Service',
    mapPosition: { x: 88, y: 55 },
    telemetry: { temperature: 44, lastPing: minsAgo(1) },
    tags: ['RFID', 'Network'],
    healthTrend: [
      { label: 'Feb', value: 97 }, { label: 'Mar', value: 96 }, { label: 'Apr', value: 96 },
      { label: 'May', value: 95 }, { label: 'Jun', value: 95 }, { label: 'Jul', value: 95 },
    ],
  },
  {
    id: 'AST-1003',
    name: 'Lenovo ThinkPad T14',
    category: 'Compute',
    serialNumber: 'LNV-T14-9982',
    status: 'Active',
    healthScore: 92,
    healthStatus: 'Good',
    manufacturer: 'Lenovo',
    model: 'ThinkPad T14 Gen 4',
    location: { id: 'LOC-HQ-1', name: 'HQ Building', building: 'Floor 3', zone: 'IT Storeroom' },
    custodian: 'Sarah Jenkins',
    purchaseDate: '2023-11-15',
    purchasePrice: 1500,
    bookValue: 1200,
    depreciationMethod: 'Straight-line (3yr)',
    warrantyExpiry: '2026-11-15',
    criticality: 'Medium',
    riskScore: 14,
    utilization: 78,
    trackingTech: 'QR',
    lifecycleStage: 'In Service',
    mapPosition: { x: 12, y: 20 },
    telemetry: { batteryLevel: 85, temperature: 42, lastPing: minsAgo(2) },
    tags: ['QR', 'Endpoint'],
    healthTrend: [
      { label: 'Feb', value: 96 }, { label: 'Mar', value: 95 }, { label: 'Apr', value: 94 },
      { label: 'May', value: 94 }, { label: 'Jun', value: 93 }, { label: 'Jul', value: 92 },
    ],
  },
  {
    id: 'AST-1004',
    name: 'MacBook Pro 16"',
    category: 'Compute',
    serialNumber: 'MAC-BP-0042',
    status: 'Active',
    healthScore: 41,
    healthStatus: 'Warning',
    manufacturer: 'Apple',
    model: 'MacBook Pro M2 Max',
    location: { id: 'LOC-HQ-1', name: 'HQ Building', building: 'Floor 4', zone: 'Design Studio' },
    custodian: 'Alex Designer',
    purchaseDate: '2022-06-01',
    purchasePrice: 3200,
    bookValue: 960,
    depreciationMethod: 'Straight-line (3yr)',
    warrantyExpiry: '2025-06-01',
    criticality: 'High',
    riskScore: 85,
    utilization: 94,
    trackingTech: 'BLE',
    lifecycleStage: 'In Service',
    mapPosition: { x: 45, y: 8 },
    telemetry: { batteryLevel: 12, temperature: 68, lastPing: minsAgo(1) },
    tags: ['BLE', 'High Value', 'Battery Degradation'],
    healthTrend: [
      { label: 'Feb', value: 72 }, { label: 'Mar', value: 68 }, { label: 'Apr', value: 61 },
      { label: 'May', value: 55 }, { label: 'Jun', value: 48 }, { label: 'Jul', value: 41 },
    ],
  },
  {
    id: 'AST-1005',
    name: 'APC Smart-UPS 3000',
    category: 'Infrastructure',
    serialNumber: 'APC-SU-7781',
    status: 'Active',
    healthScore: 88,
    healthStatus: 'Good',
    manufacturer: 'APC',
    model: 'Smart-UPS 3000',
    location: { id: 'LOC-DC-1', name: 'Primary Data Center', building: 'Utility Room', zone: 'Power Row A' },
    custodian: 'Facilities Team',
    purchaseDate: '2023-02-18',
    purchasePrice: 1200,
    bookValue: 800,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2028-02-18',
    criticality: 'Critical',
    riskScore: 22,
    utilization: 84,
    trackingTech: 'BLE',
    lifecycleStage: 'In Service',
    mapPosition: { x: 8, y: 78 },
    telemetry: { batteryLevel: 92, temperature: 26, lastPing: minsAgo(8) },
    tags: ['BLE', 'Power'],
    healthTrend: [
      { label: 'Feb', value: 91 }, { label: 'Mar', value: 90 }, { label: 'Apr', value: 90 },
      { label: 'May', value: 89 }, { label: 'Jun', value: 89 }, { label: 'Jul', value: 88 },
    ],
  },
  {
    id: 'AST-1006',
    name: 'iPad Pro 12.9" (Field Ops)',
    category: 'Endpoints',
    serialNumber: 'IPD-PR-3390',
    status: 'Missing',
    healthScore: 70,
    healthStatus: 'Warning',
    manufacturer: 'Apple',
    model: 'iPad Pro 6th Gen',
    location: { id: 'LOC-HQ-1', name: 'HQ Building', building: 'Floor 1', zone: 'Lobby' },
    custodian: 'Field Tech 2B',
    purchaseDate: '2021-09-30',
    purchasePrice: 1200,
    bookValue: 400,
    depreciationMethod: 'Straight-line (3yr)',
    warrantyExpiry: '2024-09-30',
    criticality: 'High',
    riskScore: 74,
    utilization: 0,
    trackingTech: 'BLE',
    lifecycleStage: 'In Service',
    mapPosition: { x: 76, y: 30 },
    telemetry: { batteryLevel: 12, lastPing: hoursAgo(52) },
    tags: ['BLE', 'Last seen 2d', 'Mobile'],
    healthTrend: [
      { label: 'Feb', value: 78 }, { label: 'Mar', value: 77 }, { label: 'Apr', value: 75 },
      { label: 'May', value: 73 }, { label: 'Jun', value: 72 }, { label: 'Jul', value: 70 },
    ],
  },
  {
    id: 'AST-1007',
    name: 'Aruba AP-515 Access Point',
    category: 'Network',
    serialNumber: 'ARU-AP-6612',
    status: 'Active',
    healthScore: 76,
    healthStatus: 'Warning',
    manufacturer: 'Aruba Networks',
    model: 'AP-515',
    location: { id: 'LOC-HQ-1', name: 'HQ Building', building: 'Floor 3', zone: 'Conference Room A' },
    custodian: 'Network Team',
    purchaseDate: '2021-03-12',
    purchasePrice: 800,
    bookValue: 400,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2026-03-12',
    criticality: 'Medium',
    riskScore: 39,
    utilization: 96,
    trackingTech: 'UWB',
    lifecycleStage: 'In Service',
    mapPosition: { x: 40, y: 45 },
    telemetry: { temperature: 58, lastPing: minsAgo(3) },
    tags: ['UWB', 'Overutilized', 'Wireless'],
    healthTrend: [
      { label: 'Feb', value: 84 }, { label: 'Mar', value: 82 }, { label: 'Apr', value: 81 },
      { label: 'May', value: 79 }, { label: 'Jun', value: 78 }, { label: 'Jul', value: 76 },
    ],
  },
  {
    id: 'AST-1008',
    name: 'Fortinet FortiGate 100F Firewall',
    category: 'Network',
    serialNumber: 'FGT-100F-1120',
    status: 'Active',
    healthScore: 95,
    healthStatus: 'Good',
    manufacturer: 'Fortinet',
    model: 'FortiGate 100F',
    location: { id: 'LOC-DC-1', name: 'Primary Data Center', building: 'Server Room Alpha', zone: 'Rack 1' },
    custodian: 'Security Team',
    purchaseDate: '2024-05-22',
    purchasePrice: 3400,
    bookValue: 3100,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2029-05-22',
    criticality: 'Critical',
    riskScore: 9,
    utilization: 67,
    trackingTech: 'RFID',
    lifecycleStage: 'In Service',
    mapPosition: { x: 88, y: 55 },
    telemetry: { temperature: 44, lastPing: minsAgo(1) },
    tags: ['RFID', 'Security', 'Firewall'],
    healthTrend: [
      { label: 'Feb', value: 97 }, { label: 'Mar', value: 96 }, { label: 'Apr', value: 96 },
      { label: 'May', value: 95 }, { label: 'Jun', value: 95 }, { label: 'Jul', value: 95 },
    ],
  },
  {
    id: 'AST-1009',
    name: 'Synology RS2418+ NAS',
    category: 'Infrastructure',
    serialNumber: 'SYN-RS-4410',
    status: 'Maintenance',
    healthScore: 54,
    healthStatus: 'Warning',
    manufacturer: 'Synology',
    model: 'RS2418+',
    location: { id: 'LOC-DC-1', name: 'Primary Data Center', building: 'Server Room Beta', zone: 'Rack 8' },
    custodian: 'Storage Team',
    purchaseDate: '2022-08-05',
    purchasePrice: 2800,
    bookValue: 1700,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2027-08-05',
    criticality: 'Medium',
    riskScore: 46,
    utilization: 81,
    trackingTech: 'UWB',
    lifecycleStage: 'In Service',
    mapPosition: { x: 30, y: 25 },
    telemetry: { temperature: 38, vibration: 0.5, lastPing: minsAgo(14) },
    tags: ['UWB', 'Storage', 'Degraded Array'],
    healthTrend: [
      { label: 'Feb', value: 70 }, { label: 'Mar', value: 67 }, { label: 'Apr', value: 63 },
      { label: 'May', value: 60 }, { label: 'Jun', value: 57 }, { label: 'Jul', value: 54 },
    ],
  },
  {
    id: 'AST-1010',
    name: 'Dell UltraSharp 32" Monitor',
    category: 'Endpoints',
    serialNumber: 'MON-DL-9021',
    status: 'Active',
    healthScore: 83,
    healthStatus: 'Good',
    manufacturer: 'Dell',
    model: 'U3223QE',
    location: { id: 'LOC-HQ-1', name: 'HQ Building', building: 'Floor 2', zone: 'IT Storeroom' },
    custodian: 'IT Support',
    purchaseDate: '2023-07-19',
    purchasePrice: 900,
    bookValue: 600,
    depreciationMethod: 'Straight-line (3yr)',
    warrantyExpiry: '2026-07-19',
    criticality: 'Low',
    riskScore: 18,
    utilization: 88,
    trackingTech: 'QR',
    lifecycleStage: 'In Service',
    mapPosition: { x: 90, y: 30 },
    telemetry: { lastPing: minsAgo(6) },
    tags: ['QR', 'Peripheral'],
    healthTrend: [
      { label: 'Feb', value: 87 }, { label: 'Mar', value: 86 }, { label: 'Apr', value: 85 },
      { label: 'May', value: 85 }, { label: 'Jun', value: 84 }, { label: 'Jul', value: 83 },
    ],
  },
  {
    id: 'AST-1011',
    name: 'Zebra TC52 Mobile Computer',
    category: 'Endpoints',
    serialNumber: 'ZEB-TC-0071',
    status: 'Active',
    healthScore: 79,
    healthStatus: 'Good',
    manufacturer: 'Zebra',
    model: 'TC52',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Picking Zone' },
    custodian: 'Warehouse Team',
    purchaseDate: '2020-10-11',
    purchasePrice: 1100,
    bookValue: 200,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2025-10-11',
    criticality: 'Medium',
    riskScore: 27,
    utilization: 93,
    trackingTech: 'BLE',
    lifecycleStage: 'In Service',
    mapPosition: { x: 4, y: 60 },
    telemetry: { batteryLevel: 52, lastPing: minsAgo(4) },
    tags: ['BLE', 'Scanner', 'Rugged'],
    healthTrend: [
      { label: 'Feb', value: 83 }, { label: 'Mar', value: 82 }, { label: 'Apr', value: 81 },
      { label: 'May', value: 81 }, { label: 'Jun', value: 80 }, { label: 'Jul', value: 79 },
    ],
  },
  {
    id: 'AST-1012',
    name: 'Zebra RFID Gateway G-4',
    category: 'Sensors',
    serialNumber: 'SEN-ZG4-2205',
    status: 'Active',
    healthScore: 90,
    healthStatus: 'Good',
    manufacturer: 'Zebra',
    model: 'FX9600',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Loading Dock 4' },
    custodian: 'IoT Platform',
    purchaseDate: '2024-01-30',
    purchasePrice: 3200,
    bookValue: 2800,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2027-01-30',
    criticality: 'Medium',
    riskScore: 12,
    utilization: 55,
    trackingTech: 'RFID',
    lifecycleStage: 'In Service',
    mapPosition: { x: 16, y: 12 },
    telemetry: { batteryLevel: 100, temperature: 35, lastPing: minsAgo(1) },
    tags: ['RFID', 'Gateway'],
    healthTrend: [
      { label: 'Feb', value: 93 }, { label: 'Mar', value: 92 }, { label: 'Apr', value: 92 },
      { label: 'May', value: 91 }, { label: 'Jun', value: 91 }, { label: 'Jul', value: 90 },
    ],
  },
  {
    id: 'AST-1013',
    name: 'HP LaserJet Enterprise M507',
    category: 'Endpoints',
    serialNumber: 'HP-LJ-8830',
    status: 'Active',
    healthScore: 58,
    healthStatus: 'Warning',
    manufacturer: 'HP',
    model: 'M507',
    location: { id: 'LOC-HQ-1', name: 'HQ Building', building: 'Floor 3', zone: 'Print Station' },
    custodian: 'IT Support',
    purchaseDate: '2021-11-22',
    purchasePrice: 800,
    bookValue: 175,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2026-11-22',
    criticality: 'Low',
    riskScore: 61,
    utilization: 72,
    trackingTech: 'QR',
    lifecycleStage: 'In Service',
    mapPosition: { x: 10, y: 45 },
    telemetry: { lastPing: minsAgo(2) },
    tags: ['QR', 'Printer', 'Low Toner'],
    healthTrend: [
      { label: 'Feb', value: 71 }, { label: 'Mar', value: 68 }, { label: 'Apr', value: 65 },
      { label: 'May', value: 63 }, { label: 'Jun', value: 61 }, { label: 'Jul', value: 58 },
    ],
  },
  {
    id: 'AST-1014',
    name: 'Fluke Networks DSX-8000',
    category: 'Sensors',
    serialNumber: 'FLK-DSX-5567',
    status: 'Staging',
    healthScore: 97,
    healthStatus: 'Good',
    manufacturer: 'Fluke Networks',
    model: 'DSX-8000 CableAnalyzer',
    location: { id: 'LOC-HQ-1', name: 'HQ Building', building: 'Floor 1', zone: 'IT Tool Room' },
    custodian: 'Network Team',
    purchaseDate: '2026-06-15',
    purchasePrice: 12000,
    bookValue: 11800,
    depreciationMethod: 'Straight-line (5yr)',
    warrantyExpiry: '2031-06-15',
    criticality: 'Medium',
    riskScore: 6,
    utilization: 12,
    trackingTech: 'BLE',
    lifecycleStage: 'Commissioning',
    mapPosition: { x: 55, y: 35 },
    telemetry: { batteryLevel: 96, temperature: 30, lastPing: minsAgo(1) },
    tags: ['BLE', 'New', 'Tester'],
    healthTrend: [
      { label: 'Feb', value: 0 }, { label: 'Mar', value: 0 }, { label: 'Apr', value: 0 },
      { label: 'May', value: 0 }, { label: 'Jun', value: 98 }, { label: 'Jul', value: 97 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Work Orders — IT maintenance pipeline
// ─────────────────────────────────────────────────────────────────────────────
export const mockWorkOrders: WorkOrder[] = [
  {
    id: 'WO-5001', title: 'Investigate Mac battery degradation', assetId: 'AST-1004', assetName: 'MacBook Pro 16"',
    status: 'New', priority: 'High', type: 'Predictive', assignedTo: 'Unassigned',
    createdAt: hoursAgo(3), dueDate: daysAhead(2), estimatedHours: 1, aiGenerated: true,
    description: 'AI predicts battery failure within 14 days. Cycle count exceeds 800.',
  },
  {
    id: 'WO-5002', title: 'Emergency server thermal shutdown risk', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server',
    status: 'In Progress', priority: 'Critical', type: 'Corrective', assignedTo: 'James Park',
    createdAt: hoursAgo(6), dueDate: daysAhead(1), estimatedHours: 3, aiGenerated: false,
    description: 'Inlet temperature at 85°C. Replace failing fan module and reseat thermal sensors in Rack 42.',
  },
  {
    id: 'WO-5003', title: 'Quarterly PM — UPS Battery Check', assetId: 'AST-1005', assetName: 'APC Smart-UPS 3000',
    status: 'Assigned', priority: 'Medium', type: 'Preventive', assignedTo: 'Diego Martinez',
    createdAt: daysAgo(1), dueDate: daysAhead(5), estimatedHours: 2, aiGenerated: false,
    description: 'Scheduled quarterly preventive maintenance: battery impedance test, self-test, firmware review.',
  },
  {
    id: 'WO-5004', title: 'Replace degraded RAID drive', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS',
    status: 'In Progress', priority: 'High', type: 'Corrective', assignedTo: 'Storage Team',
    createdAt: daysAgo(2), dueDate: NOW, estimatedHours: 1.5, aiGenerated: false,
    description: 'Drive 4 SMART status failed. Replace with cold spare and monitor rebuild.',
  },
  {
    id: 'WO-5005', title: 'AP connection drop anomaly', assetId: 'AST-1007', assetName: 'Aruba AP-515 Access Point',
    status: 'Assigned', priority: 'High', type: 'Predictive', assignedTo: 'Network Team',
    createdAt: daysAgo(1), dueDate: daysAhead(3), estimatedHours: 1, aiGenerated: true,
    description: 'Utilization at 96% for 30 days. High collision rate and packet drops detected.',
  },
  {
    id: 'WO-5009', title: 'Locate & recover missing iPad', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)',
    status: 'New', priority: 'Critical', type: 'Corrective', assignedTo: 'Unassigned',
    createdAt: hoursAgo(4), dueDate: daysAhead(1), estimatedHours: 1, aiGenerated: true,
    description: 'Asset not scanned in 52 hours; last seen Lobby. Dispatch RTLS search and verify custody.',
  },
  {
    id: 'WO-5010', title: 'Firmware OTA — Switch', assetId: 'AST-1002', assetName: 'Cisco Catalyst 9500 Switch',
    status: 'Completed', priority: 'Low', type: 'Preventive', assignedTo: 'Network Team',
    createdAt: daysAgo(5), dueDate: daysAgo(1), estimatedHours: 0.5, aiGenerated: false,
    description: 'Push firmware v17.9.3 to core switch; verify link stability post-update.',
  },
  {
    id: 'WO-5012', title: 'Commissioning checklist — Cable Tester', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000',
    status: 'In Progress', priority: 'Low', type: 'Inspection', assignedTo: 'Network Team',
    createdAt: daysAgo(1), dueDate: daysAhead(4), estimatedHours: 2, aiGenerated: false,
    description: 'New-asset commissioning: calibration verification, LinkWare cloud sync setup.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// AI Insights — ranked, explainable recommendations (IT context)
// ─────────────────────────────────────────────────────────────────────────────
export const mockInsights: AIInsight[] = [
  {
    id: 'INS-9001', type: 'Predictive Failure', severity: 'Critical',
    title: 'MacBook Pro — imminent battery swelling risk',
    summary: 'Telemetry shows rapid battery degradation and thermal spikes. High probability of swelling.',
    assetId: 'AST-1004', assetName: 'MacBook Pro 16"',
    confidence: 85, impactUsd: 1200, impactLabel: 'Battery swelling risk',
    drivers: ['Thermal spikes +15°C', 'Cycle count > 800', 'Charge capacity dropped 40%', 'Past 3 models swelled at this signature'],
    recommendedAction: 'Auto-generate a High priority work order to recall device and replace battery.',
    actionLabel: 'Create Work Order', createdAt: hoursAgo(3),
  },
  {
    id: 'INS-9002', type: 'Utilization', severity: 'Opportunity',
    title: 'Rebalance idle ThinkPads (Storeroom → Field Ops)',
    summary: '12 ThinkPad T14 units in IT Storeroom sit at 0% utilization while Field Ops runs short.',
    assetId: 'AST-1003', assetName: 'Lenovo ThinkPad T14',
    confidence: 78, impactUsd: 18000, impactLabel: 'Avoid new purchases',
    drivers: ['Storeroom utilization 0% (30d)', 'Field Ops requests +12 laptops', 'Zero transfer cost'],
    recommendedAction: 'Initiate a bulk transfer to Field Ops to fulfill requests without new POs.',
    actionLabel: 'Initiate Transfer', createdAt: hoursAgo(5),
  },
  {
    id: 'INS-9003', type: 'Theft/Security', severity: 'Critical',
    title: 'iPad Pro missing — possible custody gap',
    summary: 'Asset not scanned in 52 hours and last seen leaving the Lobby outside authorized zone.',
    assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)',
    confidence: 71, impactUsd: 1200, impactLabel: 'Loss risk high',
    drivers: ['No BLE ping 52h', 'Last seen crossing Lobby geofence', 'No custody check-out logged', 'Battery at 12%'],
    recommendedAction: 'Trigger an MDM lock, RTLS recovery search, and open a custody-exception incident.',
    actionLabel: 'Start Recovery & Lock', createdAt: hoursAgo(4),
  },
  {
    id: 'INS-9006', type: 'Lifecycle', severity: 'Warning',
    title: 'Dell R740 Server reaching end-of-life',
    summary: 'Book value near zero, warranty expired, health score 30. Recommend replacement planning this quarter.',
    assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server',
    confidence: 88, impactUsd: 8500, impactLabel: 'EOL this quarter',
    drivers: ['Health score 30 and falling', 'Warranty expired Jan 2025', 'Thermal faults recurring'],
    recommendedAction: 'Add to Q3 replacement plan and stage a workload migration window.',
    actionLabel: 'Plan Replacement', createdAt: daysAgo(1),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// IT specific Facility floor-plan zones
// ─────────────────────────────────────────────────────────────────────────────
export const mockZones: MapZone[] = [
  { id: 'Z1', name: 'IT Storeroom', type: 'warehouse', x: 2, y: 2, width: 28, height: 34 },
  { id: 'Z2', name: 'Office Wing 1', type: 'office', x: 32, y: 2, width: 36, height: 62 },
  { id: 'Z3', name: 'Server Room Alpha', type: 'restricted', x: 2, y: 38, width: 28, height: 30 },
  { id: 'Z4', name: 'Server Room Beta', type: 'restricted', x: 2, y: 70, width: 28, height: 28 },
  { id: 'Z5', name: 'Design Studio', type: 'office', x: 32, y: 66, width: 36, height: 32 },
  { id: 'Z6', name: 'Lobby', type: 'office', x: 70, y: 2, width: 28, height: 44 },
  { id: 'Z7', name: 'Data Center Core', type: 'restricted', x: 70, y: 48, width: 28, height: 50 },
];

export const mockActivity: ActivityEvent[] = [
  { id: 'EV-1', assetId: 'AST-1004', type: 'Alert', description: 'Battery swelling risk alert raised', actor: 'AI Engine', timestamp: hoursAgo(3) },
  { id: 'EV-2', assetId: 'AST-1004', type: 'Telemetry', description: 'Temperature exceeded 65°C threshold', actor: 'MDM Agent', timestamp: hoursAgo(4) },
  { id: 'EV-4', assetId: 'AST-1001', type: 'Alert', description: 'Inlet temperature critical (85°C)', actor: 'AI Engine', timestamp: hoursAgo(6) },
  { id: 'EV-5', assetId: 'AST-1001', type: 'Maintenance', description: 'Work order WO-5002 opened', actor: 'James Park', timestamp: hoursAgo(6) },
  { id: 'EV-7', assetId: 'AST-1003', type: 'Custody', description: 'Custody assigned to Sarah Jenkins', actor: 'IT Manager', timestamp: daysAgo(12) },
  { id: 'EV-10', assetId: 'AST-1006', type: 'Alert', description: 'Signal loss — no ping in 52h', actor: 'RTLS Monitor', timestamp: hoursAgo(4) },
  { id: 'EV-11', assetId: 'AST-1006', type: 'Movement', description: 'Last seen crossing Lobby geofence', actor: 'BLE Beacon', timestamp: hoursAgo(52) },
];

export const utilizationDowntimeSeries: UtilizationDowntimePoint[] = [
  { label: 'Feb', utilization: 68, downtime: 142 },
  { label: 'Mar', utilization: 71, downtime: 128 },
  { label: 'Apr', utilization: 74, downtime: 119 },
  { label: 'May', utilization: 72, downtime: 134 },
  { label: 'Jun', utilization: 79, downtime: 96 },
  { label: 'Jul', utilization: 83, downtime: 74 },
];

export const categoryBreakdown: CategoryBreakdown[] = [
  { category: 'Compute', count: 3120, value: 3_400_000 },
  { category: 'Network', count: 850, value: 1_200_000 },
  { category: 'Endpoints', count: 4180, value: 2_700_000 },
  { category: 'Infrastructure', count: 290, value: 800_000 },
  { category: 'Sensors', count: 870, value: 900_000 },
];

export const getAssetById = (id: string): Asset | undefined => mockAssets.find((a) => a.id === id);
export const getWorkOrdersForAsset = (assetId: string): WorkOrder[] => mockWorkOrders.filter((wo) => wo.assetId === assetId);
export const getActivityForAsset = (assetId: string): ActivityEvent[] => mockActivity.filter((ev) => ev.assetId === assetId).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
export const getInsightsForAsset = (assetId: string): AIInsight[] => mockInsights.filter((ins) => ins.assetId === assetId);

export const mockTaxonomy: TaxonomyClass[] = [
  {
    id: 'CLS-COMP', name: 'Compute', icon: '💻', assetCount: 3120,
    attributes: [
      { key: 'cpu', label: 'Processor', type: 'text', required: true },
      { key: 'ramGB', label: 'RAM (GB)', type: 'number', required: true },
      { key: 'osVersion', label: 'OS Version', type: 'text' },
      { key: 'macAddress', label: 'MAC Address', type: 'text' },
    ],
  },
  {
    id: 'CLS-NET', name: 'Network', icon: '🌐', assetCount: 850,
    attributes: [
      { key: 'ports', label: 'Port Count', type: 'number', required: true },
      { key: 'throughputGbps', label: 'Throughput (Gbps)', type: 'number' },
      { key: 'firmware', label: 'Firmware Version', type: 'text' },
      { key: 'ipAddress', label: 'Management IP', type: 'text' },
    ],
  },
  {
    id: 'CLS-END', name: 'Endpoints', icon: '📱', assetCount: 4180,
    attributes: [
      { key: 'screenSize', label: 'Screen Size', type: 'text' },
      { key: 'batteryHealth', label: 'Battery Health %', type: 'number' },
      { key: 'mdmEnrolled', label: 'MDM Enrolled', type: 'boolean' },
    ],
  },
  {
    id: 'CLS-INF', name: 'Infrastructure', icon: '⚡', assetCount: 290,
    attributes: [
      { key: 'ratedCapacity', label: 'Capacity', type: 'text' },
      { key: 'rackUnit', label: 'Rack Unit', type: 'text' },
      { key: 'lastTested', label: 'Last Tested', type: 'date' },
    ],
  },
  {
    id: 'CLS-SEN', name: 'Sensors', icon: '📡', assetCount: 870,
    attributes: [
      { key: 'protocol', label: 'Protocol', type: 'select', options: ['RFID', 'BLE', 'UWB', 'LoRaWAN', 'WiFi'], required: true },
      { key: 'batteryLevel', label: 'Battery Level %', type: 'number' },
    ],
  },
];

export const getTaxonomyClass = (id: string): TaxonomyClass | undefined => mockTaxonomy.find((c) => c.id === id);

export const mockGroups: AssetGroup[] = [
  { id: 'GRP-1', name: 'Executive Laptops', type: 'Group', description: 'High-priority VIP endpoint devices', memberIds: ['AST-1004'] },
  { id: 'GRP-2', name: 'Core Network Infrastructure', type: 'Group', description: 'Critical switches, routers, and firewalls', memberIds: ['AST-1002', 'AST-1008'] },
  { id: 'GRP-3', name: 'Data Center Rack 42', type: 'Kit', description: 'Server + switch provisioned together', memberIds: ['AST-1001', 'AST-1005'] },
];

export const getGroupsForAsset = (assetId: string): AssetGroup[] => mockGroups.filter((g) => g.memberIds.includes(assetId));

export const mockDocs: AssetDoc[] = [
  { id: 'DOC-1', assetId: 'AST-1001', name: 'Dell R740 Service Manual.pdf', type: 'Manual', sizeKb: 4820, uploadedAt: daysAgo(120), uploadedBy: 'IT Ops Team' },
  { id: 'DOC-2', assetId: 'AST-1002', name: 'Cisco IOS Configuration Guide.pdf', type: 'Manual', sizeKb: 8100, uploadedAt: daysAgo(300), uploadedBy: 'Network Team' },
];

export const getDocsForAsset = (assetId: string): AssetDoc[] => mockDocs.filter((d) => d.assetId === assetId);

export const mockGateways: Gateway[] = [
  { id: 'GW-01', name: 'Server Room Alpha RFID', kind: 'RFID Reader', status: 'Online', connectedDevices: 42, firmwareVersion: 'v4.8.2', uptimePct: 99.9, location: 'Data Center', ip: '10.4.1.11', lastSeen: minsAgo(1) },
  { id: 'GW-02', name: 'HQ BLE Gateway', kind: 'BLE Gateway', status: 'Online', connectedDevices: 118, firmwareVersion: 'v3.2.0', uptimePct: 99.7, location: 'HQ Lobby', ip: '10.4.1.12', lastSeen: minsAgo(1) },
];

export const getGateway = (id: string): Gateway | undefined => mockGateways.find((g) => g.id === id);

export const mockSensors: Sensor[] = [
  { id: 'SEN-01', name: 'Server RFID Tag', kind: 'RFID Tag', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', status: 'Online', signalStrength: 92, firmwareVersion: 'v1.6.3', gatewayId: 'GW-01', zone: 'Server Room Alpha', lastReading: minsAgo(2) },
  { id: 'SEN-02', name: 'MacBook BLE Tag', kind: 'BLE Beacon', assetId: 'AST-1004', assetName: 'MacBook Pro 16"', status: 'Online', batteryLevel: 88, signalStrength: 71, firmwareVersion: 'v3.2.0', gatewayId: 'GW-02', zone: 'Design Studio', lastReading: hoursAgo(1) },
  { id: 'SEN-03', name: 'iPad BLE Beacon', kind: 'BLE Beacon', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', status: 'Offline', batteryLevel: 12, signalStrength: 0, firmwareVersion: 'v3.2.0', gatewayId: 'GW-02', zone: 'Lobby', lastReading: hoursAgo(52) },
];

export const getSensor = (id: string): Sensor | undefined => mockSensors.find((s) => s.id === id);
export const getSensorsForGateway = (gatewayId: string): Sensor[] => mockSensors.filter((s) => s.gatewayId === gatewayId);

export const mockGeofences: Geofence[] = [
  { id: 'GF-1', name: 'Secure Data Center', zoneId: 'Z7', x: 70, y: 48, width: 28, height: 50, rule: 'Restricted', breaches24h: 0, active: true },
  { id: 'GF-2', name: 'IT Storeroom', zoneId: 'Z1', x: 2, y: 2, width: 28, height: 34, rule: 'Exit', breaches24h: 1, active: true },
];

export const mockTrails: MovementTrail[] = [
  {
    assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', distanceM: 320,
    dwellZones: [{ zone: 'Design Studio', minutes: 210 }, { zone: 'Corridor', minutes: 12 }],
    points: [
      { x: 82, y: 18, timestamp: hoursAgo(54), label: 'Design Studio' },
      { x: 78, y: 26, timestamp: hoursAgo(53) },
      { x: 76, y: 30, timestamp: hoursAgo(52), label: 'Last seen (geofence exit)' },
    ],
  },
];

export const getTrailForAsset = (assetId: string): MovementTrail | undefined => mockTrails.find((t) => t.assetId === assetId);

export function getTelemetrySeries(assetId: string, metric: 'temperature' | 'battery' | 'vibration' | 'signal'): TrendPoint[] {
  const asset = getAssetById(assetId);
  const seed = [...assetId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base =
    metric === 'temperature' ? asset?.telemetry?.temperature ?? 45 :
    metric === 'battery' ? asset?.telemetry?.batteryLevel ?? 80 :
    metric === 'vibration' ? (asset?.telemetry?.vibration ?? 0.5) * 10 :
    72;
  const amp = metric === 'battery' ? 6 : metric === 'vibration' ? 4 : 8;
  return Array.from({ length: 24 }, (_, h) => {
    const drift = metric === 'battery' ? -h * 0.4 : 0; 
    const v = base + drift + amp * Math.sin((h + seed) / 3.2) + ((seed + h) % 5) * 0.4;
    return { label: `${String(h).padStart(2, '0')}:00`, value: Math.round(v * 10) / 10 };
  });
}

export const mockWarehouses: Warehouse[] = [
  { id: 'WH-1', name: 'IT Main Storeroom', location: 'HQ · Floor 1', binCount: 480, skuCount: 1240, valueUsd: 2_180_000 },
  { id: 'WH-3', name: 'Data Center Spares', location: 'Primary Data Center', binCount: 60, skuCount: 175, valueUsd: 320_000 },
];
export const getWarehouse = (id: string): Warehouse | undefined => mockWarehouses.find((w) => w.id === id);

export const mockSuppliers: Supplier[] = [
  { id: 'SUP-1', name: 'CDW Technology', category: 'IT / Network', leadTimeDays: 5, rating: 4.7, contact: 'b2b@cdw.com', onTimePct: 97 },
  { id: 'SUP-2', name: 'Dell EMC', category: 'Compute', leadTimeDays: 7, rating: 4.4, contact: 'sales@dell.com', onTimePct: 92 },
];
export const getSupplier = (id: string): Supplier | undefined => mockSuppliers.find((s) => s.id === id);

export const mockParts: Part[] = [
  { id: 'P-04', sku: 'FAN-R740-MOD', name: 'PowerEdge R740 Fan Module', category: 'Hardware', onHand: 2, reorderPoint: 4, unitCost: 210, warehouseId: 'WH-3', bin: 'D-01-4', abcClass: 'A', supplierId: 'SUP-2', leadTimeDays: 5 },
  { id: 'P-08', sku: 'SEN-THRM-42', name: 'Thermal Sensor Rack 42', category: 'Hardware', onHand: 18, reorderPoint: 10, unitCost: 45, warehouseId: 'WH-3', bin: 'D-02-1', abcClass: 'C', supplierId: 'SUP-1', leadTimeDays: 5 },
];
export const getPart = (id: string): Part | undefined => mockParts.find((p) => p.id === id || p.sku === id);
export const getPartsForWarehouse = (warehouseId: string): Part[] => mockParts.filter((p) => p.warehouseId === warehouseId);
export const reorderParts = (): Part[] => mockParts.filter((p) => p.onHand <= p.reorderPoint);

export const mockPurchaseOrders: PurchaseOrder[] = [
  { id: 'PO-2203', supplierId: 'SUP-1', supplierName: 'CDW Technology', status: 'Received', createdAt: daysAgo(6), expectedAt: daysAgo(1), total: 840, lines: [{ sku: 'FAN-R740-MOD', name: 'PowerEdge R740 Fan Module', qty: 4, unitCost: 210 }] },
];
export const getPurchaseOrder = (id: string): PurchaseOrder | undefined => mockPurchaseOrders.find((po) => po.id === id);

export const mockPmSchedules: PmSchedule[] = [
  { id: 'PM-08', title: 'Server Room Thermal Audit', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', frequency: 'Monthly', type: 'Inspection', nextDue: daysAhead(4), lastDone: daysAgo(26), estHours: 1, compliancePct: 82, assignedTeam: 'IT Ops' },
];
export const getPmSchedule = (id: string): PmSchedule | undefined => mockPmSchedules.find((p) => p.id === id);
export const getPmForAsset = (assetId: string): PmSchedule[] => mockPmSchedules.filter((p) => p.assetId === assetId);

export const mockInspections: Inspection[] = [
  {
    id: 'INSP-03', title: 'Data Center Audit', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', template: 'DC Security Standard', status: 'Scheduled', dueDate: daysAhead(9), inspector: 'Security',
    items: [{ label: 'Physical Security', result: 'Pending' }, { label: 'Cable Management', result: 'Pending' }],
  },
];
export const getInspection = (id: string): Inspection | undefined => mockInspections.find((i) => i.id === id);

export function getWorkOrderDetail(id: string): WorkOrderDetail {
  const wo = mockWorkOrders.find((w) => w.id === id);
  const checklist = [{ label: 'Diagnose issue', done: true }, { label: 'Resolve fault', done: false }];
  const parts: WoPart[] = [];
  const laborLog: WoLabor[] = [];
  const comments = [{ author: 'System', text: 'Auto-generated notes.', at: NOW }];
  return { checklist, parts, laborLog, comments };
}

export const mockModels: Model[] = [];
export const getModel = (id: string): Model | undefined => undefined;

export const mockForecasts: ForecastSeries[] = [];
export const mockAnomalies: AnomalyEvent[] = [
  { id: 'AN-02', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', metric: 'Temperature', severity: 'Critical', detectedAt: hoursAgo(6), description: 'Inlet temperature 85°C sustained — 4σ over normal operating envelope.', zScore: 4.0, confidence: 96 },
];

export const getHealthMatrix = () => mockAssets.map((a) => ({ id: a.id, name: a.name, category: a.category, health: a.healthScore, risk: a.riskScore ?? 0, utilization: a.utilization ?? 0, status: a.status }));

export const mockReports: Report[] = [];
export const getReport = (id: string): Report | undefined => mockReports.find((r) => r.id === id);

export const mockAlerts: Alert[] = [
  { id: 'ALT-02', title: 'Server R740 inlet temp 85°C', severity: 'Critical', type: 'Threshold', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', status: 'Acknowledged', createdAt: hoursAgo(6), source: 'Telemetry' },
];
export const getAlert = (id: string): Alert | undefined => mockAlerts.find((a) => a.id === id);

export const mockAlertRules: AlertRule[] = [];
export const mockNotifications: Notification[] = [];

export const mockAuditLog: AuditRecord[] = [
  { id: 'AU-05', actor: 'IT Ops Team', action: 'ASSET_RELOCATE', target: 'AST-1001', category: 'Asset', timestamp: daysAgo(40), ip: '10.4.2.51' },
];

export const mockCycleCounts: CycleCount[] = [];
export const mockCertifications: Certification[] = [];

export const mockCustody: CustodyRecord[] = [
  { id: 'CU-05', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', holder: 'IT Ops Team', action: 'Assigned', at: daysAgo(40), by: 'IT Manager' },
  { id: 'CU-04', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', holder: 'Unknown', action: 'Transferred', at: hoursAgo(52), by: 'System (geofence exit — no check-out)' },
];
export const getCustodyForAsset = (assetId: string): CustodyRecord[] => mockCustody.filter((c) => c.assetId === assetId).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

export const mockIntegrations: Integration[] = [];
export const mockWorkflows: ApprovalWorkflow[] = [];

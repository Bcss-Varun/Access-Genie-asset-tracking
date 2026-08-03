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
    location: { id: 'LOC-DC-1', name: 'Chennai Data Center', building: 'Server Room Alpha', zone: 'Rack 42' },
    custodian: 'IT Ops Team',
    purchaseDate: '2020-01-20',
    purchasePrice: 850000,
    bookValue: 170000,
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
    location: { id: 'LOC-DC-1', name: 'Chennai Data Center', building: 'Server Room Alpha', zone: 'Rack 12' },
    custodian: 'IT Ops Team',
    purchaseDate: '2024-05-22',
    purchasePrice: 1400000,
    bookValue: 1260000,
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
    location: { id: 'LOC-HQ-1', name: 'Bengaluru HQ', building: 'Floor 3', zone: 'IT Storeroom' },
    custodian: 'Sneha Iyer',
    purchaseDate: '2023-11-15',
    purchasePrice: 95000,
    bookValue: 76000,
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
    location: { id: 'LOC-HQ-1', name: 'Bengaluru HQ', building: 'Floor 4', zone: 'Design Studio' },
    custodian: 'Aditya Rao',
    purchaseDate: '2022-06-01',
    purchasePrice: 320000,
    bookValue: 96000,
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
    location: { id: 'LOC-DC-1', name: 'Chennai Data Center', building: 'Utility Room', zone: 'Power Row A' },
    custodian: 'Facilities Team',
    purchaseDate: '2023-02-18',
    purchasePrice: 85000,
    bookValue: 56000,
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
    location: { id: 'LOC-HQ-1', name: 'Bengaluru HQ', building: 'Floor 1', zone: 'Lobby' },
    custodian: 'Field Tech 2B',
    purchaseDate: '2021-09-30',
    purchasePrice: 115000,
    bookValue: 38000,
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
    location: { id: 'LOC-HQ-1', name: 'Bengaluru HQ', building: 'Floor 3', zone: 'Conference Room A' },
    custodian: 'Network Team',
    purchaseDate: '2021-03-12',
    purchasePrice: 65000,
    bookValue: 32000,
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
    location: { id: 'LOC-DC-1', name: 'Chennai Data Center', building: 'Server Room Alpha', zone: 'Rack 1' },
    custodian: 'Security Team',
    purchaseDate: '2024-05-22',
    purchasePrice: 450000,
    bookValue: 410000,
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
    location: { id: 'LOC-DC-1', name: 'Chennai Data Center', building: 'Server Room Beta', zone: 'Rack 8' },
    custodian: 'Storage Team',
    purchaseDate: '2022-08-05',
    purchasePrice: 240000,
    bookValue: 146000,
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
    location: { id: 'LOC-HQ-1', name: 'Bengaluru HQ', building: 'Floor 2', zone: 'IT Storeroom' },
    custodian: 'IT Support',
    purchaseDate: '2023-07-19',
    purchasePrice: 78000,
    bookValue: 52000,
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
    location: { id: 'LOC-WH-1', name: 'Hyderabad Central Warehouse', building: 'Building A', zone: 'Picking Zone' },
    custodian: 'Warehouse Team',
    purchaseDate: '2020-10-11',
    purchasePrice: 92000,
    bookValue: 17000,
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
    location: { id: 'LOC-WH-1', name: 'Hyderabad Central Warehouse', building: 'Building A', zone: 'Loading Dock 4' },
    custodian: 'IoT Platform',
    purchaseDate: '2024-01-30',
    purchasePrice: 260000,
    bookValue: 228000,
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
    location: { id: 'LOC-HQ-1', name: 'Bengaluru HQ', building: 'Floor 3', zone: 'Print Station' },
    custodian: 'IT Support',
    purchaseDate: '2021-11-22',
    purchasePrice: 62000,
    bookValue: 14000,
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
    location: { id: 'LOC-HQ-1', name: 'Bengaluru HQ', building: 'Floor 1', zone: 'IT Tool Room' },
    custodian: 'Network Team',
    purchaseDate: '2026-06-15',
    purchasePrice: 1450000,
    bookValue: 1425000,
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

// Physical tag identifiers, formatted by each asset's tracking technology
// (RFID EPC · BLE MAC · QR code · UWB anchor). Searchable in ⌘K and the registry.
const ASSET_TRACKING_IDS: Record<string, string> = {
  'AST-1001': 'RFID-E28011606001',
  'AST-1002': 'RFID-E28011606002',
  'AST-1003': 'QR-AG-1003',
  'AST-1004': 'BLE-C39A6F2B1004',
  'AST-1005': 'BLE-C39A6F2B1005',
  'AST-1006': 'BLE-C39A6F2B1006',
  'AST-1007': 'UWB-ANCH-1007',
  'AST-1008': 'RFID-E28011606008',
  'AST-1009': 'UWB-ANCH-1009',
  'AST-1010': 'QR-AG-1010',
  'AST-1011': 'BLE-C39A6F2B1011',
  'AST-1012': 'RFID-E28011606012',
  'AST-1013': 'QR-AG-1013',
  'AST-1014': 'BLE-C39A6F2B1014',
};
mockAssets.forEach((a) => { a.trackingId = ASSET_TRACKING_IDS[a.id]; });

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
    status: 'In Progress', priority: 'Critical', type: 'Corrective', assignedTo: 'Arjun Menon',
    createdAt: hoursAgo(6), dueDate: daysAhead(1), estimatedHours: 3, aiGenerated: false,
    description: 'Inlet temperature at 85°C. Replace failing fan module and reseat thermal sensors in Rack 42.',
  },
  {
    id: 'WO-5003', title: 'Quarterly PM — UPS Battery Check', assetId: 'AST-1005', assetName: 'APC Smart-UPS 3000',
    status: 'Assigned', priority: 'Medium', type: 'Preventive', assignedTo: 'Deepak Nair',
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
  {
    id: 'WO-5013', title: 'Replace low UWB tag battery (SEN-09)', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS',
    status: 'Assigned', priority: 'Medium', type: 'Preventive', assignedTo: 'Deepak Nair',
    createdAt: hoursAgo(11), dueDate: daysAhead(2), estimatedHours: 0.5, aiGenerated: true,
    description: 'UWB tag battery at 17%. Swap the cell before the tag drops off the anchor cluster.',
  },
  {
    id: 'WO-5014', title: 'Restore Secure Cage RFID reader (GW-09)', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4',
    status: 'In Progress', priority: 'Critical', type: 'Corrective', assignedTo: 'IoT Platform',
    createdAt: hoursAgo(14), dueDate: NOW, estimatedHours: 2, aiGenerated: false,
    description: 'Reader offline 14h — Secure Cage currently has no RFID coverage. Check PoE run and reader power state.',
  },
  {
    id: 'WO-5015', title: 'Toner replacement — LaserJet M507', assetId: 'AST-1013', assetName: 'HP LaserJet Enterprise M507',
    status: 'On Hold', priority: 'Low', type: 'Preventive', assignedTo: 'IT Support',
    createdAt: daysAgo(3), dueDate: daysAhead(6), estimatedHours: 0.25, aiGenerated: false,
    description: 'Toner below 10%. On hold until PO-2206 for HP 89A cartridges is received.',
  },
  {
    id: 'WO-5016', title: 'RF survey follow-up — HQ Floor 3 anchors', assetId: 'AST-1007', assetName: 'Aruba AP-515 Access Point',
    status: 'New', priority: 'Medium', type: 'Inspection', assignedTo: 'Unassigned',
    createdAt: hoursAgo(9), dueDate: daysAhead(7), estimatedHours: 3, aiGenerated: false,
    description: 'UWB anchor GW-05 degraded to 94.2% uptime. Survey anchor placement and interference on Floor 3.',
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
    confidence: 85, impactInr: 96000, impactLabel: 'Battery swelling risk',
    drivers: ['Thermal spikes +15°C', 'Cycle count > 800', 'Charge capacity dropped 40%', 'Past 3 models swelled at this signature'],
    recommendedAction: 'Auto-generate a High priority work order to recall device and replace battery.',
    actionLabel: 'Create Work Order', createdAt: hoursAgo(3),
  },
  {
    id: 'INS-9002', type: 'Utilization', severity: 'Opportunity',
    title: 'Rebalance idle ThinkPads (Storeroom → Field Ops)',
    summary: '12 ThinkPad T14 units in IT Storeroom sit at 0% utilization while Field Ops runs short.',
    assetId: 'AST-1003', assetName: 'Lenovo ThinkPad T14',
    confidence: 78, impactInr: 1140000, impactLabel: 'Avoid new purchases',
    drivers: ['Storeroom utilization 0% (30d)', 'Field Ops requests +12 laptops', 'Zero transfer cost'],
    recommendedAction: 'Initiate a bulk transfer to Field Ops to fulfill requests without new POs.',
    actionLabel: 'Initiate Transfer', createdAt: hoursAgo(5),
  },
  {
    id: 'INS-9003', type: 'Theft/Security', severity: 'Critical',
    title: 'iPad Pro missing — possible custody gap',
    summary: 'Asset not scanned in 52 hours and last seen leaving the Lobby outside authorized zone.',
    assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)',
    confidence: 71, impactInr: 115000, impactLabel: 'Loss risk high',
    drivers: ['No BLE ping 52h', 'Last seen crossing Lobby geofence', 'No custody check-out logged', 'Battery at 12%'],
    recommendedAction: 'Trigger an MDM lock, RTLS recovery search, and open a custody-exception incident.',
    actionLabel: 'Start Recovery & Lock', createdAt: hoursAgo(4),
  },
  {
    id: 'INS-9006', type: 'Lifecycle', severity: 'Warning',
    title: 'Dell R740 Server reaching end-of-life',
    summary: 'Book value near zero, warranty expired, health score 30. Recommend replacement planning this quarter.',
    assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server',
    confidence: 88, impactInr: 850000, impactLabel: 'EOL this quarter',
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
  { id: 'EV-5', assetId: 'AST-1001', type: 'Maintenance', description: 'Work order WO-5002 opened', actor: 'Arjun Menon', timestamp: hoursAgo(6) },
  { id: 'EV-7', assetId: 'AST-1003', type: 'Custody', description: 'Custody assigned to Sneha Iyer', actor: 'IT Manager', timestamp: daysAgo(12) },
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
  { category: 'Compute', count: 3120, value: 56_00_00_000 },
  { category: 'Network', count: 850, value: 16_00_00_000 },
  { category: 'Endpoints', count: 4180, value: 23_00_00_000 },
  { category: 'Infrastructure', count: 290, value: 7_00_00_000 },
  { category: 'Sensors', count: 870, value: 5_00_00_000 },
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
  { id: 'DOC-3', assetId: 'AST-1001', name: 'Tax Invoice — Dell India (GST).pdf', type: 'Invoice', sizeKb: 210, uploadedAt: daysAgo(2370), uploadedBy: 'Finance' },
  { id: 'DOC-4', assetId: 'AST-1001', name: 'ProSupport Plus Warranty Certificate.pdf', type: 'Warranty', sizeKb: 340, uploadedAt: daysAgo(2370), uploadedBy: 'Finance' },
  { id: 'DOC-5', assetId: 'AST-1005', name: 'BIS CRS Registration — APC.pdf', type: 'Certificate', sizeKb: 512, uploadedAt: daysAgo(1250), uploadedBy: 'Compliance' },
  { id: 'DOC-6', assetId: 'AST-1014', name: 'NABL Calibration Certificate.pdf', type: 'Certificate', sizeKb: 288, uploadedAt: daysAgo(38), uploadedBy: 'Network Team' },
  { id: 'DOC-7', assetId: 'AST-1009', name: 'RAID Rebuild Runbook.pdf', type: 'Manual', sizeKb: 1640, uploadedAt: daysAgo(90), uploadedBy: 'Storage Team' },
  { id: 'DOC-8', assetId: 'AST-1008', name: 'Firewall Rule-base Audit Report.pdf', type: 'Report', sizeKb: 960, uploadedAt: daysAgo(3), uploadedBy: 'Tarun Fernandes' },
  { id: 'DOC-9', assetId: 'AST-1004', name: 'Asset Passport — MacBook Pro 16.pdf', type: 'Report', sizeKb: 420, uploadedAt: daysAgo(12), uploadedBy: 'Sneha Iyer' },
  { id: 'DOC-10', assetId: 'AST-1012', name: 'WPC ETA Approval — Zebra FX9600.pdf', type: 'Certificate', sizeKb: 384, uploadedAt: daysAgo(900), uploadedBy: 'Compliance' },
];

export const getDocsForAsset = (assetId: string): AssetDoc[] => mockDocs.filter((d) => d.assetId === assetId);

// Reader/gateway estate — one per tracking technology, spread across the three
// South India facilities. `connectedDevices` is the live tag count each serves.
export const mockGateways: Gateway[] = [
  { id: 'GW-01', name: 'Server Room Alpha RFID', kind: 'RFID Reader', status: 'Online', connectedDevices: 42, firmwareVersion: 'v4.8.2', uptimePct: 99.9, location: 'Chennai Data Center · Server Room Alpha', ip: '10.4.1.11', lastSeen: minsAgo(1) },
  { id: 'GW-02', name: 'Bengaluru HQ BLE Gateway', kind: 'BLE Gateway', status: 'Online', connectedDevices: 118, firmwareVersion: 'v3.2.0', uptimePct: 99.7, location: 'Bengaluru HQ · Lobby', ip: '10.4.1.12', lastSeen: minsAgo(1) },
  { id: 'GW-03', name: 'Dock 4 RFID Portal', kind: 'RFID Reader', status: 'Online', connectedDevices: 96, firmwareVersion: 'v4.8.2', uptimePct: 99.4, location: 'Hyderabad Central Warehouse · Loading Dock 4', ip: '10.6.1.21', lastSeen: minsAgo(1) },
  { id: 'GW-04', name: 'Warehouse UWB Anchor Cluster', kind: 'UWB Anchor', status: 'Online', connectedDevices: 64, firmwareVersion: 'v2.4.1', uptimePct: 99.1, location: 'Hyderabad Central Warehouse · Building A', ip: '10.6.1.22', lastSeen: minsAgo(2) },
  { id: 'GW-05', name: 'HQ Floor 3 UWB Anchor', kind: 'UWB Anchor', status: 'Degraded', connectedDevices: 28, firmwareVersion: 'v2.3.7', uptimePct: 94.2, location: 'Bengaluru HQ · Floor 3', ip: '10.5.3.14', lastSeen: minsAgo(9) },
  { id: 'GW-06', name: 'DC LoRaWAN Environmental', kind: 'LoRaWAN Gateway', status: 'Online', connectedDevices: 37, firmwareVersion: 'v1.9.4', uptimePct: 99.8, location: 'Chennai Data Center · Utility Room', ip: '10.4.1.31', lastSeen: minsAgo(3) },
  { id: 'GW-07', name: 'In-Transit GPS/LTE Bridge', kind: 'GPS/LTE Bridge', status: 'Online', connectedDevices: 12, firmwareVersion: 'v5.1.0', uptimePct: 98.6, location: 'Mobile · Hyderabad ▸ Bengaluru corridor', ip: '10.9.0.7', lastSeen: minsAgo(6) },
  { id: 'GW-08', name: 'Storeroom QR Scan Station', kind: 'QR Scan Station', status: 'Online', connectedDevices: 210, firmwareVersion: 'v3.0.2', uptimePct: 99.9, location: 'Bengaluru HQ · IT Storeroom', ip: '10.5.1.44', lastSeen: minsAgo(1) },
  { id: 'GW-09', name: 'Secure Cage RFID Reader', kind: 'RFID Reader', status: 'Offline', connectedDevices: 0, firmwareVersion: 'v4.6.0', uptimePct: 81.3, location: 'Hyderabad Central Warehouse · Secure Cage', ip: '10.6.1.29', lastSeen: hoursAgo(14) },
];

export const getGateway = (id: string): Gateway | undefined => mockGateways.find((g) => g.id === id);

// Tag/device registry. Passive tags (RFID EPC, QR label) carry no battery, so
// `batteryLevel` is omitted for them rather than faked.
export const mockSensors: Sensor[] = [
  { id: 'SEN-01', name: 'R740 Server RFID Tag', kind: 'RFID Tag', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', status: 'Online', signalStrength: 92, firmwareVersion: 'v1.6.3', gatewayId: 'GW-01', zone: 'Server Room Alpha', tagId: 'RFID-E28011606001', facility: 'Chennai Data Center', lastReading: minsAgo(2) },
  { id: 'SEN-02', name: 'MacBook BLE Tag', kind: 'BLE Beacon', assetId: 'AST-1004', assetName: 'MacBook Pro 16"', status: 'Online', batteryLevel: 88, signalStrength: 71, firmwareVersion: 'v3.2.0', gatewayId: 'GW-02', zone: 'Design Studio', tagId: 'BLE-C39A6F2B1004', facility: 'Bengaluru HQ', lastReading: hoursAgo(1) },
  { id: 'SEN-03', name: 'iPad BLE Beacon', kind: 'BLE Beacon', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', status: 'Offline', batteryLevel: 12, signalStrength: 0, firmwareVersion: 'v3.2.0', gatewayId: 'GW-02', zone: 'Lobby', tagId: 'BLE-C39A6F2B1006', facility: 'Bengaluru HQ', lastReading: hoursAgo(52) },
  { id: 'SEN-04', name: 'Catalyst 9500 RFID Tag', kind: 'RFID Tag', assetId: 'AST-1002', assetName: 'Cisco Catalyst 9500 Switch', status: 'Online', signalStrength: 95, firmwareVersion: 'v1.6.3', gatewayId: 'GW-01', zone: 'Server Room Alpha', tagId: 'RFID-E28011606002', facility: 'Chennai Data Center', lastReading: minsAgo(1) },
  { id: 'SEN-05', name: 'ThinkPad QR Label', kind: 'QR Label', assetId: 'AST-1003', assetName: 'Lenovo ThinkPad T14', status: 'Online', signalStrength: 100, firmwareVersion: 'n/a', gatewayId: 'GW-08', zone: 'IT Storeroom', tagId: 'QR-AG-1003', facility: 'Bengaluru HQ', lastReading: hoursAgo(5) },
  { id: 'SEN-06', name: 'Smart-UPS BLE Tag', kind: 'BLE Beacon', assetId: 'AST-1005', assetName: 'APC Smart-UPS 3000', status: 'Online', batteryLevel: 92, signalStrength: 84, firmwareVersion: 'v3.2.0', gatewayId: 'GW-06', zone: 'Utility Room', tagId: 'BLE-C39A6F2B1005', facility: 'Chennai Data Center', lastReading: minsAgo(8) },
  { id: 'SEN-07', name: 'Aruba AP UWB Tag', kind: 'UWB Tag', assetId: 'AST-1007', assetName: 'Aruba AP-515 Access Point', status: 'Online', batteryLevel: 64, signalStrength: 77, firmwareVersion: 'v2.4.1', gatewayId: 'GW-05', zone: 'Conference Room A', tagId: 'UWB-ANCH-1007', facility: 'Bengaluru HQ', lastReading: minsAgo(3) },
  { id: 'SEN-08', name: 'FortiGate RFID Tag', kind: 'RFID Tag', assetId: 'AST-1008', assetName: 'Fortinet FortiGate 100F Firewall', status: 'Online', signalStrength: 93, firmwareVersion: 'v1.6.3', gatewayId: 'GW-01', zone: 'Server Room Alpha', tagId: 'RFID-E28011606008', facility: 'Chennai Data Center', lastReading: minsAgo(1) },
  { id: 'SEN-09', name: 'Synology NAS UWB Tag', kind: 'UWB Tag', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', status: 'Low Battery', batteryLevel: 17, signalStrength: 58, firmwareVersion: 'v2.3.7', gatewayId: 'GW-05', zone: 'Server Room Beta', tagId: 'UWB-ANCH-1009', facility: 'Chennai Data Center', lastReading: minsAgo(14) },
  { id: 'SEN-10', name: 'UltraSharp QR Label', kind: 'QR Label', assetId: 'AST-1010', assetName: 'Dell UltraSharp 32" Monitor', status: 'Online', signalStrength: 100, firmwareVersion: 'n/a', gatewayId: 'GW-08', zone: 'IT Storeroom', tagId: 'QR-AG-1010', facility: 'Bengaluru HQ', lastReading: hoursAgo(9) },
  { id: 'SEN-11', name: 'Zebra TC52 BLE Tag', kind: 'BLE Beacon', assetId: 'AST-1011', assetName: 'Zebra TC52 Mobile Computer', status: 'Online', batteryLevel: 52, signalStrength: 81, firmwareVersion: 'v3.2.0', gatewayId: 'GW-04', zone: 'Picking Zone', tagId: 'BLE-C39A6F2B1011', facility: 'Hyderabad Central Warehouse', lastReading: minsAgo(4) },
  { id: 'SEN-12', name: 'FX9600 Gateway RFID Tag', kind: 'RFID Tag', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4', status: 'Online', signalStrength: 97, firmwareVersion: 'v1.6.3', gatewayId: 'GW-03', zone: 'Loading Dock 4', tagId: 'RFID-E28011606012', facility: 'Hyderabad Central Warehouse', lastReading: minsAgo(1) },
  { id: 'SEN-13', name: 'LaserJet QR Label', kind: 'QR Label', assetId: 'AST-1013', assetName: 'HP LaserJet Enterprise M507', status: 'Online', signalStrength: 100, firmwareVersion: 'n/a', gatewayId: 'GW-08', zone: 'Print Station', tagId: 'QR-AG-1013', facility: 'Bengaluru HQ', lastReading: daysAgo(2) },
  { id: 'SEN-14', name: 'Fluke Tester BLE Tag', kind: 'BLE Beacon', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', status: 'Online', batteryLevel: 96, signalStrength: 89, firmwareVersion: 'v3.2.0', gatewayId: 'GW-02', zone: 'IT Tool Room', tagId: 'BLE-C39A6F2B1014', facility: 'Bengaluru HQ', lastReading: minsAgo(1) },
  { id: 'SEN-15', name: 'Rack 42 Thermal Probe', kind: 'Environmental', status: 'Online', batteryLevel: 74, signalStrength: 88, firmwareVersion: 'v1.9.4', gatewayId: 'GW-06', zone: 'Server Room Alpha', tagId: 'LORA-70B3D5-15', facility: 'Chennai Data Center', lastReading: minsAgo(2) },
  { id: 'SEN-16', name: 'Server Room Beta Humidity', kind: 'Environmental', status: 'Online', batteryLevel: 69, signalStrength: 83, firmwareVersion: 'v1.9.4', gatewayId: 'GW-06', zone: 'Server Room Beta', tagId: 'LORA-70B3D5-16', facility: 'Chennai Data Center', lastReading: minsAgo(4) },
  { id: 'SEN-17', name: 'Secure Cage Door Contact', kind: 'LoRaWAN Sensor', status: 'Online', batteryLevel: 81, signalStrength: 76, firmwareVersion: 'v1.9.4', gatewayId: 'GW-06', zone: 'Secure Cage', tagId: 'LORA-70B3D5-17', facility: 'Hyderabad Central Warehouse', lastReading: minsAgo(11) },
  { id: 'SEN-18', name: 'Transit Crate GPS Tracker', kind: 'GPS Tracker', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', status: 'Online', batteryLevel: 58, signalStrength: 62, firmwareVersion: 'v5.1.0', gatewayId: 'GW-07', zone: 'In transit', tagId: 'GPS-IMEI-864350041', facility: 'Mobile', lastReading: minsAgo(6) },
  { id: 'SEN-19', name: 'Spare BLE Tag (unassigned)', kind: 'BLE Beacon', status: 'Online', batteryLevel: 100, signalStrength: 90, firmwareVersion: 'v3.2.0', gatewayId: 'GW-02', zone: 'IT Storeroom', tagId: 'BLE-C39A6F2B9001', facility: 'Bengaluru HQ', lastReading: minsAgo(5) },
  { id: 'SEN-20', name: 'Spare UWB Tag (unassigned)', kind: 'UWB Tag', status: 'Low Battery', batteryLevel: 14, signalStrength: 41, firmwareVersion: 'v2.3.7', gatewayId: 'GW-04', zone: 'Staging Bay', tagId: 'UWB-ANCH-9002', facility: 'Hyderabad Central Warehouse', lastReading: hoursAgo(3) },
];

/** Devices registered through the onboarding form get sequential ids. */
export function nextSensorId(existing: Sensor[]): string {
  const max = existing.reduce((m, s) => {
    const n = Number(s.id.replace('SEN-', ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `SEN-${String(max + 1).padStart(2, '0')}`;
}

/** Tag-id prefix convention per device kind, used to pre-fill the register form. */
export const TAG_ID_PREFIX: Record<string, string> = {
  'RFID Tag': 'RFID-E2801160',
  'BLE Beacon': 'BLE-C39A6F2B',
  'UWB Tag': 'UWB-ANCH-',
  'GPS Tracker': 'GPS-IMEI-',
  'QR Label': 'QR-AG-',
  'LoRaWAN Sensor': 'LORA-70B3D5-',
  Environmental: 'LORA-70B3D5-',
};

export const getSensor = (id: string): Sensor | undefined => mockSensors.find((s) => s.id === id);
export const getSensorsForGateway = (gatewayId: string): Sensor[] => mockSensors.filter((s) => s.gatewayId === gatewayId);

export const mockGeofences: Geofence[] = [
  { id: 'GF-1', name: 'Secure Data Center', zoneId: 'Z7', x: 70, y: 48, width: 28, height: 50, rule: 'Restricted', breaches24h: 0, active: true },
  { id: 'GF-2', name: 'IT Storeroom', zoneId: 'Z1', x: 2, y: 2, width: 28, height: 34, rule: 'Exit', breaches24h: 1, active: true },
  { id: 'GF-3', name: 'Server Room Alpha', zoneId: 'Z3', x: 2, y: 38, width: 28, height: 30, rule: 'Restricted', breaches24h: 2, active: true },
  { id: 'GF-4', name: 'Server Room Beta', zoneId: 'Z4', x: 2, y: 70, width: 28, height: 28, rule: 'Restricted', breaches24h: 0, active: true },
  { id: 'GF-5', name: 'Lobby Exit Watch', zoneId: 'Z6', x: 70, y: 2, width: 28, height: 44, rule: 'Exit', breaches24h: 3, active: true },
  { id: 'GF-6', name: 'Design Studio Dwell', zoneId: 'Z5', x: 32, y: 66, width: 36, height: 32, rule: 'Dwell', breaches24h: 1, active: true },
  { id: 'GF-7', name: 'Office Wing Entry', zoneId: 'Z2', x: 32, y: 2, width: 36, height: 62, rule: 'Entry', breaches24h: 0, active: false },
  { id: 'GF-8', name: 'After-Hours Perimeter', x: 0, y: 0, width: 100, height: 100, rule: 'Exit', breaches24h: 4, active: true },
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
  {
    assetId: 'AST-1011', assetName: 'Zebra TC52 Mobile Computer', distanceM: 1840,
    dwellZones: [{ zone: 'Picking Zone', minutes: 264 }, { zone: 'Loading Dock 4', minutes: 96 }, { zone: 'Staging Bay', minutes: 41 }],
    points: [
      { x: 4, y: 60, timestamp: hoursAgo(9), label: 'Picking Zone' },
      { x: 10, y: 48, timestamp: hoursAgo(7) },
      { x: 16, y: 30, timestamp: hoursAgo(5), label: 'Staging Bay' },
      { x: 16, y: 12, timestamp: hoursAgo(3), label: 'Loading Dock 4' },
      { x: 8, y: 40, timestamp: minsAgo(40) },
      { x: 4, y: 60, timestamp: minsAgo(4), label: 'Picking Zone' },
    ],
  },
  {
    assetId: 'AST-1003', assetName: 'Lenovo ThinkPad T14', distanceM: 410,
    dwellZones: [{ zone: 'IT Storeroom', minutes: 1380 }, { zone: 'Floor 3 Desks', minutes: 118 }],
    points: [
      { x: 12, y: 20, timestamp: hoursAgo(26), label: 'IT Storeroom' },
      { x: 22, y: 24, timestamp: hoursAgo(3) },
      { x: 34, y: 28, timestamp: hoursAgo(2), label: 'Floor 3 Desks (checked out)' },
    ],
  },
  {
    assetId: 'AST-1004', assetName: 'MacBook Pro 16"', distanceM: 260,
    dwellZones: [{ zone: 'Design Studio', minutes: 1290 }, { zone: 'Conference Room A', minutes: 74 }],
    points: [
      { x: 45, y: 8, timestamp: hoursAgo(20), label: 'Design Studio' },
      { x: 42, y: 30, timestamp: hoursAgo(6), label: 'Conference Room A' },
      { x: 45, y: 8, timestamp: minsAgo(1), label: 'Design Studio' },
    ],
  },
  {
    assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', distanceM: 96,
    dwellZones: [{ zone: 'IT Tool Room', minutes: 2160 }],
    points: [
      { x: 58, y: 40, timestamp: daysAgo(2), label: 'Goods Inward' },
      { x: 55, y: 35, timestamp: daysAgo(1), label: 'IT Tool Room (commissioning)' },
      { x: 55, y: 35, timestamp: minsAgo(1) },
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
  { id: 'WH-1', name: 'IT Main Storeroom', location: 'HQ · Floor 1', binCount: 480, skuCount: 1240, valueInr: 9_50_00_000 },
  { id: 'WH-3', name: 'Data Center Spares', location: 'Chennai Data Center', binCount: 60, skuCount: 175, valueInr: 2_20_00_000 },
];
export const getWarehouse = (id: string): Warehouse | undefined => mockWarehouses.find((w) => w.id === id);

export const mockSuppliers: Supplier[] = [
  { id: 'SUP-1', name: 'Redington India Ltd', category: 'IT / Network', leadTimeDays: 5, rating: 4.7, contact: 'b2b@redingtonindia.in', onTimePct: 97 },
  { id: 'SUP-2', name: 'Dell India Pvt Ltd', category: 'Compute', leadTimeDays: 7, rating: 4.4, contact: 'sales@dell.in', onTimePct: 92 },
];
export const getSupplier = (id: string): Supplier | undefined => mockSuppliers.find((s) => s.id === id);

export const mockParts: Part[] = [
  { id: 'P-01', sku: 'SSD-960-ENT', name: 'Enterprise SSD 960 GB', category: 'Storage', onHand: 14, reorderPoint: 8, unitCost: 21500, warehouseId: 'WH-3', bin: 'D-01-1', abcClass: 'A', supplierId: 'SUP-2', leadTimeDays: 7 },
  { id: 'P-02', sku: 'HDD-8TB-NAS', name: 'NAS HDD 8 TB (RAID-rated)', category: 'Storage', onHand: 3, reorderPoint: 4, unitCost: 18900, warehouseId: 'WH-3', bin: 'D-01-2', abcClass: 'A', supplierId: 'SUP-1', leadTimeDays: 6 },
  { id: 'P-03', sku: 'PSU-750-RDN', name: 'Redundant PSU 750 W', category: 'Power', onHand: 6, reorderPoint: 3, unitCost: 14200, warehouseId: 'WH-3', bin: 'D-01-3', abcClass: 'B', supplierId: 'SUP-2', leadTimeDays: 9 },
  { id: 'P-04', sku: 'FAN-R740-MOD', name: 'PowerEdge R740 Fan Module', category: 'Hardware', onHand: 2, reorderPoint: 4, unitCost: 8500, warehouseId: 'WH-3', bin: 'D-01-4', abcClass: 'A', supplierId: 'SUP-2', leadTimeDays: 5 },
  { id: 'P-05', sku: 'UPS-BAT-RBC55', name: 'UPS Battery Cartridge RBC55', category: 'Power', onHand: 5, reorderPoint: 2, unitCost: 12800, warehouseId: 'WH-3', bin: 'D-02-3', abcClass: 'B', supplierId: 'SUP-1', leadTimeDays: 8 },
  { id: 'P-06', sku: 'SFP-10G-SR', name: 'SFP+ 10G SR Transceiver', category: 'Network', onHand: 24, reorderPoint: 12, unitCost: 4600, warehouseId: 'WH-1', bin: 'A-03-2', abcClass: 'B', supplierId: 'SUP-1', leadTimeDays: 4 },
  { id: 'P-07', sku: 'CAT6A-PATCH-2M', name: 'Cat6A Patch Cable 2 m', category: 'Network', onHand: 180, reorderPoint: 60, unitCost: 320, warehouseId: 'WH-1', bin: 'A-04-1', abcClass: 'C', supplierId: 'SUP-1', leadTimeDays: 3 },
  { id: 'P-08', sku: 'SEN-THRM-42', name: 'Thermal Sensor Rack 42', category: 'Hardware', onHand: 18, reorderPoint: 10, unitCost: 3200, warehouseId: 'WH-3', bin: 'D-02-1', abcClass: 'C', supplierId: 'SUP-1', leadTimeDays: 5 },
  { id: 'P-09', sku: 'TAG-BLE-CR2477', name: 'BLE Beacon Tag (CR2477)', category: 'Tracking', onHand: 220, reorderPoint: 100, unitCost: 640, warehouseId: 'WH-1', bin: 'A-01-1', abcClass: 'B', supplierId: 'SUP-1', leadTimeDays: 6 },
  { id: 'P-10', sku: 'TAG-RFID-UHF', name: 'UHF RFID Asset Label (roll of 500)', category: 'Tracking', onHand: 9, reorderPoint: 6, unitCost: 5400, warehouseId: 'WH-1', bin: 'A-01-2', abcClass: 'B', supplierId: 'SUP-1', leadTimeDays: 10 },
  { id: 'P-11', sku: 'TAG-UWB-STD', name: 'UWB Asset Tag (rechargeable)', category: 'Tracking', onHand: 42, reorderPoint: 20, unitCost: 3900, warehouseId: 'WH-1', bin: 'A-01-3', abcClass: 'A', supplierId: 'SUP-1', leadTimeDays: 12 },
  { id: 'P-12', sku: 'TNR-HP-89A', name: 'HP 89A Toner Cartridge', category: 'Consumable', onHand: 4, reorderPoint: 6, unitCost: 9800, warehouseId: 'WH-1', bin: 'A-05-4', abcClass: 'C', supplierId: 'SUP-1', leadTimeDays: 4 },
];
export const getPart = (id: string): Part | undefined => mockParts.find((p) => p.id === id || p.sku === id);
export const getPartsForWarehouse = (warehouseId: string): Part[] => mockParts.filter((p) => p.warehouseId === warehouseId);
export const reorderParts = (): Part[] => mockParts.filter((p) => p.onHand <= p.reorderPoint);

export const mockPurchaseOrders: PurchaseOrder[] = [
  { id: 'PO-2203', supplierId: 'SUP-1', supplierName: 'Redington India Ltd', status: 'Received', createdAt: daysAgo(6), expectedAt: daysAgo(1), total: 34000, lines: [{ sku: 'FAN-R740-MOD', name: 'PowerEdge R740 Fan Module', qty: 4, unitCost: 8500 }] },
  { id: 'PO-2204', supplierId: 'SUP-2', supplierName: 'Dell India Pvt Ltd', status: 'Sent', createdAt: daysAgo(3), expectedAt: daysAhead(4), total: 189000, lines: [{ sku: 'HDD-8TB-NAS', name: 'NAS HDD 8 TB (RAID-rated)', qty: 10, unitCost: 18900 }] },
  { id: 'PO-2205', supplierId: 'SUP-1', supplierName: 'Redington India Ltd', status: 'Approved', createdAt: daysAgo(2), expectedAt: daysAhead(8), total: 156000, lines: [
    { sku: 'TAG-UWB-STD', name: 'UWB Asset Tag (rechargeable)', qty: 30, unitCost: 3900 },
    { sku: 'TAG-BLE-CR2477', name: 'BLE Beacon Tag (CR2477)', qty: 60, unitCost: 640 },
  ] },
  { id: 'PO-2206', supplierId: 'SUP-1', supplierName: 'Redington India Ltd', status: 'Draft', createdAt: daysAgo(1), expectedAt: daysAhead(12), total: 58800, lines: [{ sku: 'TNR-HP-89A', name: 'HP 89A Toner Cartridge', qty: 6, unitCost: 9800 }] },
  { id: 'PO-2207', supplierId: 'SUP-2', supplierName: 'Dell India Pvt Ltd', status: 'Received', createdAt: daysAgo(21), expectedAt: daysAgo(12), total: 215000, lines: [{ sku: 'SSD-960-ENT', name: 'Enterprise SSD 960 GB', qty: 10, unitCost: 21500 }] },
  { id: 'PO-2208', supplierId: 'SUP-1', supplierName: 'Redington India Ltd', status: 'Cancelled', createdAt: daysAgo(30), expectedAt: daysAgo(20), total: 27000, lines: [{ sku: 'TAG-RFID-UHF', name: 'UHF RFID Asset Label (roll of 500)', qty: 5, unitCost: 5400 }] },
];
export const getPurchaseOrder = (id: string): PurchaseOrder | undefined => mockPurchaseOrders.find((po) => po.id === id);

export const mockPmSchedules: PmSchedule[] = [
  { id: 'PM-01', title: 'UPS Battery Impedance Test', assetId: 'AST-1005', assetName: 'APC Smart-UPS 3000', frequency: 'Quarterly', type: 'Preventive', nextDue: daysAhead(5), lastDone: daysAgo(85), estHours: 2, compliancePct: 96, assignedTeam: 'Facilities' },
  { id: 'PM-02', title: 'Core Switch Firmware Review', assetId: 'AST-1002', assetName: 'Cisco Catalyst 9500 Switch', frequency: 'Semi-Annual', type: 'Preventive', nextDue: daysAhead(38), lastDone: daysAgo(142), estHours: 1.5, compliancePct: 100, assignedTeam: 'Network Team' },
  { id: 'PM-03', title: 'NAS RAID Integrity Scrub', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', frequency: 'Monthly', type: 'Preventive', nextDue: daysAhead(2), lastDone: daysAgo(28), estHours: 1, compliancePct: 74, assignedTeam: 'Storage Team' },
  { id: 'PM-04', title: 'Firewall Rule-base Audit', assetId: 'AST-1008', assetName: 'Fortinet FortiGate 100F Firewall', frequency: 'Quarterly', type: 'Inspection', nextDue: daysAhead(19), lastDone: daysAgo(71), estHours: 3, compliancePct: 92, assignedTeam: 'Security Team' },
  { id: 'PM-05', title: 'Access Point RF Survey', assetId: 'AST-1007', assetName: 'Aruba AP-515 Access Point', frequency: 'Semi-Annual', type: 'Inspection', nextDue: daysAgo(6), lastDone: daysAgo(188), estHours: 2, compliancePct: 61, assignedTeam: 'Network Team' },
  { id: 'PM-06', title: 'Printer Roller & Toner Service', assetId: 'AST-1013', assetName: 'HP LaserJet Enterprise M507', frequency: 'Quarterly', type: 'Preventive', nextDue: daysAhead(11), lastDone: daysAgo(79), estHours: 0.5, compliancePct: 88, assignedTeam: 'IT Support' },
  { id: 'PM-07', title: 'Cable Tester Calibration (NABL)', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', frequency: 'Annual', type: 'Inspection', nextDue: daysAhead(326), lastDone: daysAgo(38), estHours: 4, compliancePct: 100, assignedTeam: 'Network Team' },
  { id: 'PM-08', title: 'Server Room Thermal Audit', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', frequency: 'Monthly', type: 'Inspection', nextDue: daysAhead(4), lastDone: daysAgo(26), estHours: 1, compliancePct: 82, assignedTeam: 'IT Ops' },
  { id: 'PM-09', title: 'RFID Portal Read-Rate Verification', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4', frequency: 'Quarterly', type: 'Preventive', nextDue: daysAhead(23), lastDone: daysAgo(68), estHours: 1.5, compliancePct: 94, assignedTeam: 'IoT Platform' },
  { id: 'PM-10', title: 'Rugged Handheld Battery Cycle Check', assetId: 'AST-1011', assetName: 'Zebra TC52 Mobile Computer', frequency: 'Usage-based', type: 'Preventive', nextDue: daysAhead(8), lastDone: daysAgo(52), estHours: 0.5, compliancePct: 79, assignedTeam: 'Warehouse Team' },
];
export const getPmSchedule = (id: string): PmSchedule | undefined => mockPmSchedules.find((p) => p.id === id);
export const getPmForAsset = (assetId: string): PmSchedule[] => mockPmSchedules.filter((p) => p.assetId === assetId);

export const mockInspections: Inspection[] = [
  {
    id: 'INSP-01', title: 'Quarterly Firewall Rule-base Audit', assetId: 'AST-1008', assetName: 'Fortinet FortiGate 100F Firewall', template: 'Network Security Standard', status: 'Passed', dueDate: daysAgo(3), inspector: 'Tarun Fernandes',
    items: [
      { label: 'Rule-base reviewed', result: 'Pass' },
      { label: 'Unused rules removed', result: 'Pass' },
      { label: 'Firmware at supported release', result: 'Pass' },
      { label: 'Admin MFA enforced', result: 'Pass' },
    ],
  },
  {
    id: 'INSP-02', title: 'UPS Load Bank Test', assetId: 'AST-1005', assetName: 'APC Smart-UPS 3000', template: 'Power Resilience Check', status: 'In Progress', dueDate: daysAhead(2), inspector: 'Facilities Team',
    items: [
      { label: 'Battery impedance within spec', result: 'Pass' },
      { label: 'Runtime at full load ≥ 12 min', result: 'Pending' },
      { label: 'Self-test log clean', result: 'Pass' },
      { label: 'Ventilation clearance', result: 'Pending' },
    ],
  },
  {
    id: 'INSP-03', title: 'Data Center Audit', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', template: 'DC Security Standard', status: 'Scheduled', dueDate: daysAhead(9), inspector: 'Security',
    items: [
      { label: 'Physical Security', result: 'Pending' },
      { label: 'Cable Management', result: 'Pending' },
      { label: 'Rack door lock audit', result: 'Pending' },
      { label: 'Asset tag legibility', result: 'Pending' },
    ],
  },
  {
    id: 'INSP-04', title: 'RAID Health & Spare Verification', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', template: 'Storage Integrity Check', status: 'Failed', dueDate: daysAgo(1), inspector: 'Storage Team',
    items: [
      { label: 'All drives SMART-clean', result: 'Fail', note: 'Drive 4 reported reallocated sectors.' },
      { label: 'Cold spare available on site', result: 'Pass' },
      { label: 'Backup job completed in 24h', result: 'Pass' },
      { label: 'Rebuild window agreed', result: 'N/A' },
    ],
  },
  {
    id: 'INSP-05', title: 'RFID Portal Read-Rate Verification', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4', template: 'Tracking Device Standard', status: 'Passed', dueDate: daysAgo(8), inspector: 'IoT Platform',
    items: [
      { label: 'Read rate ≥ 98% at dock speed', result: 'Pass' },
      { label: 'Antenna alignment verified', result: 'Pass' },
      { label: 'WPC ETA certificate on file', result: 'Pass' },
    ],
  },
  {
    id: 'INSP-06', title: 'Endpoint Commissioning — Cable Tester', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', template: 'New Asset Commissioning', status: 'In Progress', dueDate: daysAhead(4), inspector: 'Network Team',
    items: [
      { label: 'NABL calibration certificate filed', result: 'Pass' },
      { label: 'Asset tag applied & scanned', result: 'Pass' },
      { label: 'LinkWare cloud sync configured', result: 'Pending' },
      { label: 'Custodian assigned', result: 'Pending' },
    ],
  },
];
export const getInspection = (id: string): Inspection | undefined => mockInspections.find((i) => i.id === id);

// Per-work-order execution detail: checklist progress, parts consumed, labour
// booked and the comment thread. Anything not listed falls back to a generic
// triage checklist so the detail page never renders empty.
const WO_DETAIL: Record<string, WorkOrderDetail> = {
  'WO-5001': {
    checklist: [
      { label: 'Pull battery cycle count and health report', done: true },
      { label: 'Confirm swelling signature against model drivers', done: true },
      { label: 'Notify custodian and arrange loaner', done: false },
      { label: 'Recall device to IT Storeroom', done: false },
      { label: 'Replace battery and re-certify', done: false },
    ],
    parts: [],
    laborLog: [{ tech: 'Unassigned', hours: 0, note: 'Awaiting assignment — AI-generated work order.', at: hoursAgo(3) }],
    comments: [
      { author: 'AI Engine', text: 'Failure probability 85% within 14 days. Cycle count 812, capacity down 40%.', at: hoursAgo(3) },
      { author: 'Sneha Iyer', text: 'Aditya Rao is travelling until Thursday — schedule the recall for Friday.', at: hoursAgo(2) },
    ],
  },
  'WO-5002': {
    checklist: [
      { label: 'Verify inlet temperature at rack sensor', done: true },
      { label: 'Isolate failing fan module (bay 3)', done: true },
      { label: 'Migrate workloads to standby node', done: true },
      { label: 'Replace fan module', done: false },
      { label: 'Reseat thermal sensors in Rack 42', done: false },
      { label: 'Confirm inlet temp < 30°C for 2 hours', done: false },
    ],
    parts: [
      { sku: 'FAN-R740-MOD', name: 'PowerEdge R740 Fan Module', qty: 1, unitCost: 8500 },
      { sku: 'SEN-THRM-42', name: 'Thermal Sensor Rack 42', qty: 2, unitCost: 3200 },
    ],
    laborLog: [
      { tech: 'Arjun Menon', hours: 1.5, note: 'On-site triage, confirmed fan bay 3 stalled.', at: hoursAgo(5) },
      { tech: 'Arjun Menon', hours: 0.75, note: 'Workload migration to standby node completed.', at: hoursAgo(3) },
    ],
    comments: [
      { author: 'Telemetry', text: 'Inlet temperature crossed 85°C threshold — alert ALT-02 raised.', at: hoursAgo(6) },
      { author: 'Arjun Menon', text: 'Fan module in stock at Chennai DC spares (bin D-01-4). Replacing after the migration window.', at: hoursAgo(4) },
      { author: 'Manoj Reddy', text: 'Approved emergency override — proceed outside the change window.', at: hoursAgo(4) },
    ],
  },
  'WO-5003': {
    checklist: [
      { label: 'Battery impedance test', done: false },
      { label: 'Run UPS self-test', done: false },
      { label: 'Review firmware release notes', done: false },
      { label: 'Log runtime at full load', done: false },
    ],
    parts: [{ sku: 'UPS-BAT-RBC55', name: 'UPS Battery Cartridge RBC55', qty: 1, unitCost: 12800 }],
    laborLog: [],
    comments: [{ author: 'Manoj Reddy', text: 'Quarterly PM — pair this with the INSP-02 load bank test to avoid a second downtime window.', at: daysAgo(1) }],
  },
  'WO-5004': {
    checklist: [
      { label: 'Confirm SMART failure on drive 4', done: true },
      { label: 'Verify backup completed in last 24h', done: true },
      { label: 'Pull cold spare from D-01-2', done: true },
      { label: 'Swap drive and start rebuild', done: false },
      { label: 'Monitor rebuild to completion', done: false },
    ],
    parts: [{ sku: 'HDD-8TB-NAS', name: 'NAS HDD 8 TB (RAID-rated)', qty: 1, unitCost: 18900 }],
    laborLog: [{ tech: 'Storage Team', hours: 0.5, note: 'Backup verified, spare staged at the rack.', at: hoursAgo(20) }],
    comments: [
      { author: 'Telemetry', text: 'Drive 4 reported reallocated sectors above threshold.', at: daysAgo(2) },
      { author: 'Storage Team', text: 'Rebuild will take ~9 hours. Scheduling for tonight to avoid business-hours IO load.', at: hoursAgo(19) },
    ],
  },
  'WO-5005': {
    checklist: [
      { label: 'Capture 24h client-density profile', done: true },
      { label: 'Review collision and retry counters', done: false },
      { label: 'Model a second AP for Conference Room A', done: false },
      { label: 'Raise procurement request if justified', done: false },
    ],
    parts: [],
    laborLog: [{ tech: 'Network Team', hours: 1, note: 'RF survey data collected; density 2.3× peer median.', at: hoursAgo(10) }],
    comments: [{ author: 'AI Engine', text: 'Utilization at 96% for 30 days with rising packet drops — an additional AP is likely cheaper than the support load.', at: daysAgo(1) }],
  },
  'WO-5009': {
    checklist: [
      { label: 'Trigger MDM lock and locate', done: true },
      { label: 'Pull last-known BLE trail', done: true },
      { label: 'Interview last custodian', done: false },
      { label: 'RTLS sweep of Bengaluru HQ Floor 1', done: false },
      { label: 'File custody-exception incident', done: false },
    ],
    parts: [],
    laborLog: [{ tech: 'Unassigned', hours: 0, note: 'Security escalation raised, awaiting field assignment.', at: hoursAgo(4) }],
    comments: [
      { author: 'RTLS Monitor', text: 'No BLE ping in 52 hours. Last read at the Lobby geofence boundary.', at: hoursAgo(4) },
      { author: 'Tarun Fernandes', text: 'MDM lock confirmed. Escalating to ALT-01 and notifying the Field Ops lead.', at: hoursAgo(3) },
    ],
  },
  'WO-5010': {
    checklist: [
      { label: 'Review v17.9.3 release notes', done: true },
      { label: 'Take pre-upgrade config backup', done: true },
      { label: 'Push firmware in maintenance window', done: true },
      { label: 'Verify link stability for 24h', done: true },
    ],
    parts: [],
    laborLog: [
      { tech: 'Network Team', hours: 0.5, note: 'Firmware pushed during the 02:00 IST window.', at: daysAgo(2) },
      { tech: 'Network Team', hours: 0.25, note: 'Post-change verification clean, no flaps.', at: daysAgo(1) },
    ],
    comments: [{ author: 'Network Team', text: 'Completed with no impact. Closing.', at: daysAgo(1) }],
  },
  'WO-5012': {
    checklist: [
      { label: 'Verify NABL calibration certificate', done: true },
      { label: 'Apply and scan asset tag', done: true },
      { label: 'Configure LinkWare cloud sync', done: false },
      { label: 'Assign custodian and tool-room bin', done: false },
    ],
    parts: [{ sku: 'TAG-BLE-CR2477', name: 'BLE Beacon Tag (CR2477)', qty: 1, unitCost: 640 }],
    laborLog: [{ tech: 'Network Team', hours: 1, note: 'Certificate filed as DOC-6; BLE tag SEN-14 bonded.', at: hoursAgo(22) }],
    comments: [{ author: 'Manoj Reddy', text: 'Hold in Staging until the LinkWare sync is verified end-to-end.', at: hoursAgo(20) }],
  },
};

export function getWorkOrderDetail(id: string): WorkOrderDetail {
  const detail = WO_DETAIL[id];
  if (detail) return detail;
  const wo = mockWorkOrders.find((w) => w.id === id);
  return {
    checklist: [
      { label: 'Triage and reproduce the reported fault', done: false },
      { label: 'Identify parts and labour required', done: false },
      { label: 'Carry out the fix', done: false },
      { label: 'Verify and close out', done: false },
    ],
    parts: [] as WoPart[],
    laborLog: [] as WoLabor[],
    comments: [{ author: 'System', text: `Work order opened${wo ? ` against ${wo.assetName}` : ''}. No activity logged yet.`, at: wo?.createdAt ?? NOW }],
  };
}

export const mockModels: Model[] = [
  {
    id: 'MDL-FAIL', name: 'Asset Failure Predictor', task: 'Predictive failure (survival + gradient boosting)',
    status: 'Production', version: 'v4.2.1', accuracy: 93, driftPct: 6, lastTrained: daysAgo(9),
    owner: 'ML Platform', framework: 'XGBoost 2.0', predictionsPerDay: 4820,
    features: [
      { feature: 'Thermal trend (7d)', importance: 0.28 },
      { feature: 'Battery cycle count', importance: 0.22 },
      { feature: 'Vibration variance', importance: 0.18 },
      { feature: 'Age vs. MTBF', importance: 0.16 },
      { feature: 'Prior fault history', importance: 0.16 },
    ],
    versions: [
      { version: 'v4.2.1', trainedAt: daysAgo(9), accuracy: 93, status: 'Production', notes: 'Added thermal-trend feature; +2.1% recall on servers.' },
      { version: 'v4.1.0', trainedAt: daysAgo(48), accuracy: 91, status: 'Retired', notes: 'Baseline gradient-boosted model.' },
    ],
  },
  {
    id: 'MDL-UTIL', name: 'Utilization Optimizer', task: 'Utilization & rebalancing (regression)',
    status: 'Production', version: 'v2.7.0', accuracy: 89, driftPct: 5, lastTrained: daysAgo(14),
    owner: 'ML Platform', framework: 'LightGBM 4.3', predictionsPerDay: 2110,
    features: [
      { feature: 'Idle-time ratio (30d)', importance: 0.34 },
      { feature: 'Location demand index', importance: 0.26 },
      { feature: 'Check-out frequency', importance: 0.22 },
      { feature: 'Peer-group utilization', importance: 0.18 },
    ],
    versions: [
      { version: 'v2.7.0', trainedAt: daysAgo(14), accuracy: 89, status: 'Production', notes: 'Recalibrated demand index for HQ endpoints.' },
    ],
  },
  {
    id: 'MDL-THEFT', name: 'Theft & Custody Anomaly', task: 'Security / custody anomaly (isolation forest)',
    status: 'Production', version: 'v3.1.2', accuracy: 90, driftPct: 8, lastTrained: daysAgo(6),
    owner: 'Security Data Science', framework: 'scikit-learn 1.5', predictionsPerDay: 9600,
    features: [
      { feature: 'Time since last scan', importance: 0.31 },
      { feature: 'Geofence exit w/o checkout', importance: 0.29 },
      { feature: 'After-hours movement', importance: 0.22 },
      { feature: 'Custody chain gaps', importance: 0.18 },
    ],
    versions: [
      { version: 'v3.1.2', trainedAt: daysAgo(6), accuracy: 90, status: 'Production', notes: 'Tuned sensitivity for BLE dropout false positives.' },
      { version: 'v3.0.0', trainedAt: daysAgo(70), accuracy: 87, status: 'Retired', notes: 'Initial isolation-forest rollout.' },
    ],
  },
  {
    id: 'MDL-FORECAST', name: 'CapEx & Demand Forecaster', task: 'Time-series forecasting (temporal fusion)',
    status: 'Staging', version: 'v1.9.0-rc2', accuracy: 86, driftPct: 11, lastTrained: daysAgo(3),
    owner: 'FinOps Analytics', framework: 'PyTorch Forecasting', predictionsPerDay: 340,
    features: [
      { feature: 'Refresh-cycle schedule', importance: 0.30 },
      { feature: 'Warranty-expiry curve', importance: 0.27 },
      { feature: 'Headcount growth', importance: 0.24 },
      { feature: 'Vendor price index', importance: 0.19 },
    ],
    versions: [
      { version: 'v1.9.0-rc2', trainedAt: daysAgo(3), accuracy: 86, status: 'Staging', notes: 'Release candidate — validating drift before promotion.' },
      { version: 'v1.8.0', trainedAt: daysAgo(34), accuracy: 84, status: 'Production', notes: 'Current production CapEx forecaster.' },
    ],
  },
  {
    id: 'MDL-ANOM', name: 'Telemetry Anomaly Detector', task: 'Streaming anomaly detection (autoencoder)',
    status: 'Production', version: 'v5.0.3', accuracy: 94, driftPct: 4, lastTrained: daysAgo(11),
    owner: 'ML Platform', framework: 'TensorFlow 2.16', predictionsPerDay: 128000,
    features: [
      { feature: 'Reconstruction error', importance: 0.40 },
      { feature: 'Temperature z-score', importance: 0.24 },
      { feature: 'Power-draw deviation', importance: 0.20 },
      { feature: 'Signal-strength drop', importance: 0.16 },
    ],
    versions: [
      { version: 'v5.0.3', trainedAt: daysAgo(11), accuracy: 94, status: 'Production', notes: 'Quantized encoder — 3x faster edge inference.' },
    ],
  },
  {
    id: 'MDL-HEALTH', name: 'Asset Health Scorer', task: 'Lifecycle health scoring (ensemble)',
    status: 'Production', version: 'v3.4.0', accuracy: 91, driftPct: 7, lastTrained: daysAgo(20),
    owner: 'ML Platform', framework: 'XGBoost 2.0', predictionsPerDay: 14205,
    features: [
      { feature: 'Composite health trend', importance: 0.33 },
      { feature: 'Warranty / EOL distance', importance: 0.25 },
      { feature: 'Open work-order load', importance: 0.22 },
      { feature: 'Book-value ratio', importance: 0.20 },
    ],
    versions: [
      { version: 'v3.4.0', trainedAt: daysAgo(20), accuracy: 91, status: 'Production', notes: 'Blended lifecycle + telemetry signals.' },
      { version: 'v3.3.1', trainedAt: daysAgo(60), accuracy: 90, status: 'Shadow', notes: 'Shadow-scored against production for two weeks.' },
    ],
  },
];
export const getModel = (id: string): Model | undefined => mockModels.find((m) => m.id === id);

export const mockForecasts: ForecastSeries[] = [
  {
    id: 'FCST-1',
    name: 'Server Utilization',
    unit: '%',
    points: [
      { label: 'Jan', actual: 65, forecast: 68, lower: 60, upper: 75 },
      { label: 'Feb', actual: 70, forecast: 72, lower: 65, upper: 80 },
    ],
  },
  {
    id: 'FC-CAPEX', name: 'Capital Expenditure', unit: '₹ Lakh',
    points: [
      { label: 'Jan', actual: 95, forecast: 92, lower: 86, upper: 99 },
      { label: 'Feb', actual: 108, forecast: 104, lower: 97, upper: 113 },
      { label: 'Mar', actual: 89, forecast: 99, lower: 90, upper: 108 },
      { label: 'Apr', actual: 137, forecast: 131, lower: 119, upper: 142 },
      { label: 'May', actual: 117, forecast: 121, lower: 110, upper: 131 },
      { label: 'Jun', actual: 130, forecast: 126, lower: 115, upper: 137 },
      { label: 'Jul', actual: 140, forecast: 135, lower: 123, upper: 149 },
      { label: 'Aug', forecast: 149, lower: 134, upper: 164 },
      { label: 'Sep', forecast: 158, lower: 141, upper: 176 },
      { label: 'Oct', forecast: 169, lower: 149, upper: 189 },
      { label: 'Nov', forecast: 162, lower: 141, upper: 184 },
      { label: 'Dec', forecast: 179, lower: 155, upper: 203 },
    ],
  },
  {
    id: 'FC-UTIL', name: 'Fleet Utilization', unit: '%',
    points: [
      { label: 'Jan', actual: 68, forecast: 67, lower: 63, upper: 71 },
      { label: 'Feb', actual: 71, forecast: 70, lower: 66, upper: 74 },
      { label: 'Mar', actual: 74, forecast: 73, lower: 69, upper: 77 },
      { label: 'Apr', actual: 72, forecast: 74, lower: 70, upper: 78 },
      { label: 'May', actual: 79, forecast: 77, lower: 72, upper: 82 },
      { label: 'Jun', actual: 83, forecast: 80, lower: 75, upper: 85 },
      { label: 'Jul', actual: 84, forecast: 83, lower: 78, upper: 88 },
      { label: 'Aug', forecast: 85, lower: 79, upper: 90 },
      { label: 'Sep', forecast: 86, lower: 80, upper: 92 },
      { label: 'Oct', forecast: 87, lower: 80, upper: 93 },
      { label: 'Nov', forecast: 88, lower: 81, upper: 94 },
      { label: 'Dec', forecast: 89, lower: 82, upper: 95 },
    ],
  },
  {
    id: 'FC-FAILURE', name: 'Predicted Failures', unit: '/mo',
    points: [
      { label: 'Jan', actual: 12, forecast: 11, lower: 8, upper: 15 },
      { label: 'Feb', actual: 10, forecast: 11, lower: 8, upper: 14 },
      { label: 'Mar', actual: 14, forecast: 12, lower: 9, upper: 16 },
      { label: 'Apr', actual: 9, forecast: 11, lower: 8, upper: 14 },
      { label: 'May', actual: 11, forecast: 10, lower: 7, upper: 13 },
      { label: 'Jun', actual: 8, forecast: 9, lower: 6, upper: 12 },
      { label: 'Jul', actual: 9, forecast: 9, lower: 6, upper: 12 },
      { label: 'Aug', forecast: 8, lower: 5, upper: 12 },
      { label: 'Sep', forecast: 8, lower: 5, upper: 11 },
      { label: 'Oct', forecast: 7, lower: 4, upper: 11 },
      { label: 'Nov', forecast: 7, lower: 4, upper: 10 },
      { label: 'Dec', forecast: 6, lower: 3, upper: 10 },
    ],
  },
];
export const mockAnomalies: AnomalyEvent[] = [
  { id: 'AN-01', assetId: 'AST-1004', assetName: 'MacBook Pro 16"', metric: 'Battery capacity', severity: 'Critical', detectedAt: hoursAgo(3), description: 'Charge capacity fell 40% in 90 days while thermal load rose — matches the pre-swelling signature.', zScore: 3.6, confidence: 91 },
  { id: 'AN-02', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', metric: 'Temperature', severity: 'Critical', detectedAt: hoursAgo(6), description: 'Inlet temperature 85°C sustained — 4σ over normal operating envelope.', zScore: 4.0, confidence: 96 },
  { id: 'AN-03', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', metric: 'Scan cadence', severity: 'Critical', detectedAt: hoursAgo(4), description: 'Expected 14 BLE pings/hour, observed 0 for 52 hours after a Lobby geofence exit.', zScore: 5.2, confidence: 94 },
  { id: 'AN-04', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', metric: 'Vibration', severity: 'Warning', detectedAt: daysAgo(2), description: 'Vibration variance doubled on the drive-4 bay ahead of the SMART failure.', zScore: 2.8, confidence: 87 },
  { id: 'AN-05', assetId: 'AST-1007', assetName: 'Aruba AP-515 Access Point', metric: 'Client density', severity: 'Warning', detectedAt: daysAgo(1), description: 'Associated clients 2.3× the peer-group median for Conference Room A.', zScore: 2.4, confidence: 83 },
  { id: 'AN-06', assetId: 'AST-1013', assetName: 'HP LaserJet Enterprise M507', metric: 'Page volume', severity: 'Info', detectedAt: daysAgo(3), description: 'Print volume spiked 4× above the Floor 3 monthly baseline.', zScore: 2.1, confidence: 78 },
  { id: 'AN-07', assetId: 'AST-1002', assetName: 'Cisco Catalyst 9500 Switch', metric: 'Power draw', severity: 'Info', detectedAt: daysAgo(5), description: 'PoE draw stepped up 60 W after new AP provisioning — expected, flagged for confirmation.', zScore: 1.9, confidence: 72 },
];

export const getHealthMatrix = () => mockAssets.map((a) => ({ id: a.id, name: a.name, category: a.category, health: a.healthScore, risk: a.riskScore ?? 0, utilization: a.utilization ?? 0, status: a.status }));

export const mockReports: Report[] = [
  { id: 'RPT-001', name: 'Executive Asset Summary', category: 'Executive', persona: 'CIO / CFO', description: 'Portfolio value, health and risk at a glance for leadership.', format: 'Dashboard', lastRun: hoursAgo(6), metrics: ['Total value', 'Avg health', 'Critical alerts', 'Utilization'], scheduled: true },
  { id: 'RPT-002', name: 'Depreciation & Book Value', category: 'Financial', persona: 'Finance', description: 'Straight-line depreciation and current book value by category.', format: 'Excel', lastRun: daysAgo(1), metrics: ['Book value', 'Accumulated depreciation', 'CapEx forecast'], scheduled: true },
  { id: 'RPT-003', name: 'Maintenance Backlog & SLA', category: 'Maintenance', persona: 'IT Ops', description: 'Open work orders, ageing and SLA compliance by team.', format: 'PDF', lastRun: hoursAgo(20), metrics: ['Open WOs', 'MTTR', 'SLA %', 'PM compliance'], scheduled: false },
  { id: 'RPT-004', name: 'Utilization & Rebalancing', category: 'Utilization', persona: 'IT Ops', description: 'Idle vs. over-used assets and rebalancing opportunities.', format: 'Dashboard', lastRun: daysAgo(2), metrics: ['Avg utilization', 'Idle assets', 'Rebalance savings'], scheduled: false },
  { id: 'RPT-005', name: 'Compliance & Audit Evidence', category: 'Compliance', persona: 'Risk & Compliance', description: 'Framework coverage (ISO 27001, SOC 2, DPDP Act, CERT-In) with linked evidence.', format: 'PDF', lastRun: daysAgo(3), metrics: ['Coverage %', 'Open findings', 'Evidence count'], scheduled: true },
  { id: 'RPT-006', name: 'Security & Custody Exceptions', category: 'Compliance', persona: 'Security', description: 'Geofence breaches, custody gaps and missing-asset incidents.', format: 'PDF', lastRun: hoursAgo(9), metrics: ['Breaches 24h', 'Custody gaps', 'Missing assets'], scheduled: true },
  { id: 'RPT-007', name: 'AI Model Performance', category: 'AI', persona: 'ML Platform', description: 'Accuracy, drift and prediction volume across the model registry.', format: 'Dashboard', lastRun: daysAgo(1), metrics: ['Avg accuracy', 'Models in drift', 'Predictions/day'], scheduled: false },
  { id: 'RPT-008', name: 'Inventory & Spares Levels', category: 'Inventory', persona: 'IT Ops', description: 'On-hand vs. reorder point for critical spares and consumables.', format: 'Excel', lastRun: daysAgo(4), metrics: ['SKUs below reorder', 'Stock value', 'Lead time'], scheduled: true },
];
export const getReport = (id: string): Report | undefined => mockReports.find((r) => r.id === id);

export const mockAlerts: Alert[] = [
  { id: 'ALT-01', title: 'iPad Pro missing — no BLE ping in 52h', severity: 'Critical', type: 'Custody', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', status: 'Escalated', createdAt: hoursAgo(4), source: 'RTLS Monitor' },
  { id: 'ALT-02', title: 'Server R740 inlet temp 85°C', severity: 'Critical', type: 'Threshold', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', status: 'Acknowledged', createdAt: hoursAgo(6), source: 'Telemetry' },
  { id: 'ALT-03', title: 'MacBook Pro battery swelling predicted', severity: 'Critical', type: 'Predictive', assetId: 'AST-1004', assetName: 'MacBook Pro 16"', status: 'Open', createdAt: hoursAgo(3), source: 'AI Engine' },
  { id: 'ALT-04', title: 'Lobby geofence exit without check-out', severity: 'Critical', type: 'Geofence', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', status: 'Escalated', createdAt: hoursAgo(52), source: 'Geofence GF-5' },
  { id: 'ALT-05', title: 'Secure Cage RFID reader offline 14h', severity: 'Critical', type: 'Device Health', status: 'Open', createdAt: hoursAgo(14), source: 'Gateway GW-09' },
  { id: 'ALT-06', title: 'Synology RAID drive 4 SMART failure', severity: 'Warning', type: 'Threshold', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', status: 'Acknowledged', createdAt: daysAgo(2), source: 'Telemetry' },
  { id: 'ALT-07', title: 'Aruba AP-515 sustained 96% utilization', severity: 'Warning', type: 'Utilization', assetId: 'AST-1007', assetName: 'Aruba AP-515 Access Point', status: 'Open', createdAt: daysAgo(1), source: 'AI Engine' },
  { id: 'ALT-08', title: 'UWB tag SEN-09 battery at 17%', severity: 'Warning', type: 'Device Health', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', status: 'Open', createdAt: hoursAgo(11), source: 'Tag Registry' },
  { id: 'ALT-09', title: 'HQ Floor 3 UWB anchor degraded', severity: 'Warning', type: 'Device Health', status: 'Acknowledged', createdAt: hoursAgo(9), source: 'Gateway GW-05' },
  { id: 'ALT-10', title: 'R740 warranty expired 18 months ago', severity: 'Warning', type: 'Compliance', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', status: 'Open', createdAt: daysAgo(4), source: 'Compliance Engine' },
  { id: 'ALT-11', title: 'HP LaserJet toner below 10%', severity: 'Info', type: 'Consumable', assetId: 'AST-1013', assetName: 'HP LaserJet Enterprise M507', status: 'Resolved', createdAt: daysAgo(3), source: 'Telemetry' },
  { id: 'ALT-12', title: 'Fan module stock below reorder point', severity: 'Info', type: 'Inventory', status: 'Open', createdAt: daysAgo(1), source: 'Inventory Engine' },
];
export const getAlert = (id: string): Alert | undefined => mockAlerts.find((a) => a.id === id);

export const mockAlertRules: AlertRule[] = [
  { id: 'AR-01', name: 'Asset not scanned in 24h', condition: 'lastPing > 24h AND criticality IN (High, Critical)', severity: 'Critical', channels: ['Email', 'SMS', 'In-app'], enabled: true, triggered24h: 2 },
  { id: 'AR-02', name: 'Geofence exit without check-out', condition: 'geofence.exit = true AND custody.checkedOut = false', severity: 'Critical', channels: ['Email', 'SMS', 'Webhook'], enabled: true, triggered24h: 3 },
  { id: 'AR-03', name: 'Server inlet temperature breach', condition: 'telemetry.temperature > 75°C for 10 min', severity: 'Critical', channels: ['Email', 'In-app', 'PagerDuty'], enabled: true, triggered24h: 1 },
  { id: 'AR-04', name: 'Predicted failure within 14 days', condition: 'ai.failureProbability > 0.75', severity: 'Critical', channels: ['Email', 'In-app'], enabled: true, triggered24h: 1 },
  { id: 'AR-05', name: 'Tag battery below 20%', condition: 'sensor.batteryLevel < 20', severity: 'Warning', channels: ['In-app'], enabled: true, triggered24h: 2 },
  { id: 'AR-06', name: 'Gateway offline > 30 min', condition: 'gateway.lastSeen > 30 min', severity: 'Warning', channels: ['Email', 'In-app'], enabled: true, triggered24h: 1 },
  { id: 'AR-07', name: 'Utilization above 90% for 30 days', condition: 'utilization > 90 for 30d', severity: 'Warning', channels: ['In-app'], enabled: true, triggered24h: 1 },
  { id: 'AR-08', name: 'Warranty expiring in 60 days', condition: 'warrantyExpiry - now < 60d', severity: 'Info', channels: ['Email'], enabled: true, triggered24h: 0 },
  { id: 'AR-09', name: 'After-hours movement in Secure Cage', condition: 'movement.detected AND time NOT IN 08:00-20:00 IST', severity: 'Critical', channels: ['SMS', 'Webhook'], enabled: true, triggered24h: 0 },
  { id: 'AR-10', name: 'Spare stock below reorder point', condition: 'part.onHand <= part.reorderPoint', severity: 'Info', channels: ['Email'], enabled: false, triggered24h: 0 },
];

export const mockNotifications: Notification[] = [
  { id: 'NT-01', title: 'Asset AST-1006 escalated to Security', body: 'iPad Pro 12.9" (Field Ops) has not been scanned in 52 hours. Recovery search dispatched.', category: 'Security', read: false, at: hoursAgo(4) },
  { id: 'NT-02', title: 'Work order WO-5002 assigned to you', body: 'Emergency server thermal shutdown risk on Dell PowerEdge R740 — due in 1 day.', category: 'Maintenance', read: false, at: hoursAgo(6) },
  { id: 'NT-03', title: 'New AI insight — ₹11.4 L opportunity', body: '12 idle ThinkPad T14 units in the Bengaluru storeroom can cover Field Ops requests.', category: 'AI', read: false, at: hoursAgo(5) },
  { id: 'NT-04', title: 'Gateway GW-09 went offline', body: 'Secure Cage RFID Reader stopped reporting 14 hours ago. 0 tags currently served.', category: 'Devices', read: false, at: hoursAgo(14) },
  { id: 'NT-05', title: 'Cycle count CC-03 recorded a variance', body: 'Hyderabad Secure Cage counted 208 of 210 expected assets.', category: 'Inventory', read: true, at: daysAgo(1) },
  { id: 'NT-06', title: 'PO-2203 received', body: '4 × PowerEdge R740 Fan Module received from Redington India Ltd.', category: 'Procurement', read: true, at: daysAgo(1) },
  { id: 'NT-07', title: 'DPDP Act evidence pack generated', body: 'Data-bearing asset register exported for the Q2 FY27 assessment.', category: 'Compliance', read: true, at: daysAgo(2) },
  { id: 'NT-08', title: 'Firmware v17.9.3 pushed to core switch', body: 'WO-5010 completed — link stability verified post-update.', category: 'Maintenance', read: true, at: daysAgo(1) },
  { id: 'NT-09', title: 'Tag SEN-09 battery low', body: 'UWB tag on Synology RS2418+ NAS is at 17%. Schedule a swap.', category: 'Devices', read: true, at: hoursAgo(11) },
  { id: 'NT-10', title: 'Monthly depreciation run completed', body: 'Book values refreshed for 14 tracked assets; ₹15.4 L accumulated to date.', category: 'Finance', read: true, at: daysAgo(3) },
];

export const mockAuditLog: AuditRecord[] = [
  { id: 'AU-01', actor: 'Sneha Iyer', action: 'ASSET_CHECKOUT', target: 'AST-1003', category: 'Custody', timestamp: hoursAgo(2), ip: '10.5.3.88' },
  { id: 'AU-02', actor: 'Arjun Menon', action: 'WORKORDER_CREATE', target: 'WO-5002', category: 'Maintenance', timestamp: hoursAgo(6), ip: '10.4.2.19' },
  { id: 'AU-03', actor: 'System (AI Engine)', action: 'INSIGHT_RAISED', target: 'INS-9001', category: 'AI', timestamp: hoursAgo(3), ip: '10.0.0.4' },
  { id: 'AU-04', actor: 'Tarun Fernandes', action: 'ALERT_ESCALATE', target: 'ALT-01', category: 'Security', timestamp: hoursAgo(4), ip: '10.5.1.62' },
  { id: 'AU-05', actor: 'IT Ops Team', action: 'ASSET_RELOCATE', target: 'AST-1001', category: 'Asset', timestamp: daysAgo(40), ip: '10.4.2.51' },
  { id: 'AU-06', actor: 'Manoj Reddy', action: 'PM_SCHEDULE_UPDATE', target: 'PM-08', category: 'Maintenance', timestamp: daysAgo(2), ip: '10.6.1.77' },
  { id: 'AU-07', actor: 'Raj', action: 'ROLE_GRANT', target: 'U-004 → technician', category: 'Administration', timestamp: daysAgo(5), ip: '10.0.0.11' },
  { id: 'AU-08', actor: 'Ananya Sharma', action: 'REPORT_EXPORT', target: 'RPT-001', category: 'Analytics', timestamp: daysAgo(1), ip: '10.5.2.30' },
  { id: 'AU-09', actor: 'Deepak Nair', action: 'DEVICE_REGISTER', target: 'SEN-19', category: 'Devices', timestamp: daysAgo(6), ip: '10.6.1.41' },
  { id: 'AU-10', actor: 'System (Compliance)', action: 'EVIDENCE_PACK_BUILD', target: 'STD-DPDP', category: 'Compliance', timestamp: daysAgo(2), ip: '10.0.0.4' },
  { id: 'AU-11', actor: 'Sneha Iyer', action: 'CYCLE_COUNT_CLOSE', target: 'CC-02', category: 'Inventory', timestamp: daysAgo(4), ip: '10.6.1.12' },
  { id: 'AU-12', actor: 'Raj', action: 'API_KEY_ROTATE', target: 'AK-2291', category: 'Administration', timestamp: daysAgo(9), ip: '10.0.0.11' },
];

export const mockCycleCounts: CycleCount[] = [
  { id: 'CC-01', location: 'Hyderabad Central Warehouse · Main Warehouse', status: 'In Progress', counted: 842, expected: 1180, date: NOW, assignedTo: 'Warehouse Team' },
  { id: 'CC-02', location: 'Bengaluru HQ · IT Storeroom', status: 'Reconciled', counted: 486, expected: 486, date: daysAgo(4), assignedTo: 'Sneha Iyer' },
  { id: 'CC-03', location: 'Hyderabad Central Warehouse · Secure Cage', status: 'Variance', counted: 208, expected: 210, date: daysAgo(1), assignedTo: 'Tarun Fernandes' },
  { id: 'CC-04', location: 'Chennai Data Center · Server Room Alpha', status: 'Scheduled', counted: 0, expected: 640, date: daysAhead(3), assignedTo: 'IT Ops Team' },
  { id: 'CC-05', location: 'Hyderabad Central Warehouse · Loading Dock', status: 'Reconciled', counted: 340, expected: 340, date: daysAgo(9), assignedTo: 'Deepak Nair' },
  { id: 'CC-06', location: 'Bengaluru HQ · Floor 3', status: 'Variance', counted: 1296, expected: 1310, date: daysAgo(12), assignedTo: 'Sneha Iyer' },
  { id: 'CC-07', location: 'Chennai Data Center · Server Room Beta', status: 'Scheduled', counted: 0, expected: 410, date: daysAhead(10), assignedTo: 'Storage Team' },
];

export const mockCertifications: Certification[] = [
  { id: 'CRT-01', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', name: 'ProSupport Plus Warranty', authority: 'Dell India Pvt Ltd', issuedAt: '2020-01-20', expiresAt: '2025-01-20', status: 'Expired' },
  { id: 'CRT-02', assetId: 'AST-1002', assetName: 'Cisco Catalyst 9500 Switch', name: 'SmartNet Total Care', authority: 'Cisco Systems India', issuedAt: '2024-05-22', expiresAt: '2029-05-22', status: 'Valid' },
  { id: 'CRT-03', assetId: 'AST-1005', assetName: 'APC Smart-UPS 3000', name: 'BIS CRS Registration', authority: 'Bureau of Indian Standards', issuedAt: '2023-02-18', expiresAt: '2028-02-18', status: 'Valid' },
  { id: 'CRT-04', assetId: 'AST-1003', assetName: 'Lenovo ThinkPad T14', name: 'Premier Support', authority: 'Lenovo India', issuedAt: '2023-11-15', expiresAt: '2026-11-15', status: 'Expiring' },
  { id: 'CRT-05', assetId: 'AST-1007', assetName: 'Aruba AP-515 Access Point', name: 'WPC ETA Approval', authority: 'WPC Wing, DoT', issuedAt: '2021-03-12', expiresAt: '2026-03-12', status: 'Expired' },
  { id: 'CRT-06', assetId: 'AST-1008', assetName: 'Fortinet FortiGate 100F Firewall', name: 'FortiCare 24x7', authority: 'Fortinet India', issuedAt: '2024-05-22', expiresAt: '2029-05-22', status: 'Valid' },
  { id: 'CRT-07', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4', name: 'WPC ETA Approval', authority: 'WPC Wing, DoT', issuedAt: '2024-01-30', expiresAt: '2029-01-30', status: 'Valid' },
  { id: 'CRT-08', assetId: 'AST-1010', assetName: 'Dell UltraSharp 32" Monitor', name: 'BIS CRS Registration', authority: 'Bureau of Indian Standards', issuedAt: '2023-07-19', expiresAt: '2026-07-19', status: 'Expiring' },
  { id: 'CRT-09', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', name: 'Calibration Certificate (NABL)', authority: 'NABL-accredited lab', issuedAt: '2026-06-15', expiresAt: '2027-06-15', status: 'Valid' },
  { id: 'CRT-10', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', name: 'AppleCare for Enterprise', authority: 'Apple India', issuedAt: '2021-09-30', expiresAt: '2024-09-30', status: 'Expired' },
];

export const mockCustody: CustodyRecord[] = [
  { id: 'CU-01', assetId: 'AST-1003', assetName: 'Lenovo ThinkPad T14', holder: 'Sneha Iyer', action: 'Checked Out', at: hoursAgo(2), by: 'QR Scan Station GW-08' },
  { id: 'CU-02', assetId: 'AST-1011', assetName: 'Zebra TC52 Mobile Computer', holder: 'Warehouse Team', action: 'Checked Out', at: hoursAgo(7), by: 'Kiosk WH-1' },
  { id: 'CU-03', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', holder: 'Network Team', action: 'Assigned', at: daysAgo(1), by: 'Manoj Reddy' },
  { id: 'CU-04', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', holder: 'Unknown', action: 'Transferred', at: hoursAgo(52), by: 'System (geofence exit — no check-out)' },
  { id: 'CU-05', assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server', holder: 'IT Ops Team', action: 'Assigned', at: daysAgo(40), by: 'IT Manager' },
  { id: 'CU-06', assetId: 'AST-1004', assetName: 'MacBook Pro 16"', holder: 'Aditya Rao', action: 'Assigned', at: daysAgo(30), by: 'Sneha Iyer' },
  { id: 'CU-07', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', holder: 'Field Tech 2B', action: 'Checked Out', at: daysAgo(6), by: 'Kiosk HQ-1' },
  { id: 'CU-08', assetId: 'AST-1013', assetName: 'HP LaserJet Enterprise M507', holder: 'IT Support', action: 'Assigned', at: daysAgo(60), by: 'IT Manager' },
  { id: 'CU-09', assetId: 'AST-1011', assetName: 'Zebra TC52 Mobile Computer', holder: 'Deepak Nair', action: 'Checked In', at: daysAgo(2), by: 'Kiosk WH-1' },
  { id: 'CU-10', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', holder: 'Storage Team', action: 'Transferred', at: daysAgo(14), by: 'Manoj Reddy' },
];
export const getCustodyForAsset = (assetId: string): CustodyRecord[] => mockCustody.filter((c) => c.assetId === assetId).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

export const mockIntegrations: Integration[] = [
  { id: 'INT-01', name: 'Microsoft Entra ID (SSO/SCIM)', category: 'Identity', status: 'Connected', lastSync: minsAgo(12), description: 'SAML sign-in and SCIM user provisioning for all 84 seats.' },
  { id: 'INT-02', name: 'ServiceNow ITSM', category: 'Service Desk', status: 'Connected', lastSync: minsAgo(30), description: 'Two-way sync of work orders and incident tickets.' },
  { id: 'INT-03', name: 'SAP S/4HANA (Asset Accounting)', category: 'ERP / Finance', status: 'Connected', lastSync: hoursAgo(4), description: 'Pushes capitalisation, depreciation and disposal postings in INR.' },
  { id: 'INT-04', name: 'Tally Prime', category: 'ERP / Finance', status: 'Connected', lastSync: hoursAgo(8), description: 'GST-compliant purchase and invoice sync for the India entity.' },
  { id: 'INT-05', name: 'Microsoft Intune MDM', category: 'Endpoint', status: 'Connected', lastSync: minsAgo(18), description: 'Device posture, remote lock and wipe for enrolled endpoints.' },
  { id: 'INT-06', name: 'Zebra Savanna (RFID)', category: 'Tracking', status: 'Connected', lastSync: minsAgo(2), description: 'Streams RFID read events from FX9600 portals into the asset graph.' },
  { id: 'INT-07', name: 'Slack', category: 'Notifications', status: 'Connected', lastSync: minsAgo(6), description: 'Routes critical alerts to #it-ops and #security channels.' },
  { id: 'INT-08', name: 'Power BI', category: 'Analytics', status: 'Connected', lastSync: hoursAgo(12), description: 'Scheduled dataset refresh for executive and finance dashboards.' },
  { id: 'INT-09', name: 'CERT-In Log Archive (S3)', category: 'Compliance', status: 'Error', lastSync: daysAgo(2), description: '180-day immutable log retention — last export failed on credential expiry.' },
  { id: 'INT-10', name: 'Freshservice', category: 'Service Desk', status: 'Disconnected', lastSync: daysAgo(21), description: 'Legacy service-desk connector, retired after the ServiceNow migration.' },
];

export const mockWorkflows: ApprovalWorkflow[] = [
  {
    id: 'WF-01', name: 'High-value asset disposal', trigger: 'Lifecycle stage → Disposal AND bookValue > ₹1 L', status: 'Active',
    steps: [
      { name: 'Facility Manager review', approver: 'Sneha Iyer' },
      { name: 'Finance sign-off', approver: 'Ananya Sharma' },
      { name: 'Data sanitisation evidence', approver: 'Tarun Fernandes' },
    ],
  },
  {
    id: 'WF-02', name: 'Inter-facility asset transfer', trigger: 'Transfer request across facilities', status: 'Active',
    steps: [
      { name: 'Origin custodian release', approver: 'Custodian on record' },
      { name: 'Receiving facility accept', approver: 'Sneha Iyer' },
    ],
  },
  {
    id: 'WF-03', name: 'Purchase order above ₹5 L', trigger: 'PO total > ₹5,00,000', status: 'Active',
    steps: [
      { name: 'Maintenance Manager review', approver: 'Manoj Reddy' },
      { name: 'Finance approval', approver: 'Ananya Sharma' },
      { name: 'Org Admin release', approver: 'Raj' },
    ],
  },
  {
    id: 'WF-04', name: 'Emergency work order override', trigger: 'Priority = Critical AND SLA breach imminent', status: 'Active',
    steps: [{ name: 'Maintenance Manager approval', approver: 'Manoj Reddy' }],
  },
  {
    id: 'WF-05', name: 'Missing-asset write-off', trigger: 'Status = Missing for 30 days', status: 'Active',
    steps: [
      { name: 'Security investigation close', approver: 'Tarun Fernandes' },
      { name: 'Finance write-off posting', approver: 'Ananya Sharma' },
    ],
  },
  {
    id: 'WF-06', name: 'New device onboarding', trigger: 'Device registered via tag registry', status: 'Draft',
    steps: [
      { name: 'Commissioning checklist', approver: 'Network Team' },
      { name: 'Facility Manager activation', approver: 'Sneha Iyer' },
    ],
  },
];

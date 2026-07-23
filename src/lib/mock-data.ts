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
  WorkOrderDetail,
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
// (no Date.now() at module load → no server/client hydration drift).
const NOW = '2026-07-23T09:00:00.000Z';
const minsAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();
const hoursAgo = (h: number) => minsAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);
const daysAhead = (d: number) => new Date(Date.parse(NOW) + d * 86_400_000).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// Assets — the unified asset graph (14 records across 6 categories, 3 facilities)
// ─────────────────────────────────────────────────────────────────────────────
export const mockAssets: Asset[] = [
  {
    id: 'AST-1001',
    name: 'Caterpillar Forklift Model X',
    category: 'Heavy Machinery',
    serialNumber: 'CAT-X-998273',
    status: 'Active',
    healthScore: 92,
    healthStatus: 'Good',
    manufacturer: 'Caterpillar',
    model: 'DP40N',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Loading Dock 4' },
    custodian: 'Sarah Jenkins',
    purchaseDate: '2023-11-15',
    purchasePrice: 45000,
    bookValue: 38200,
    depreciationMethod: 'Straight-line (7yr)',
    warrantyExpiry: '2026-11-15',
    criticality: 'High',
    riskScore: 14,
    utilization: 78,
    trackingTech: 'UWB',
    lifecycleStage: 'In Service',
    mapPosition: { x: 12, y: 20 },
    telemetry: { batteryLevel: 85, temperature: 42, vibration: 0.2, lastPing: minsAgo(2) },
    tags: ['RFID', 'GPS', 'Critical'],
    healthTrend: [
      { label: 'Feb', value: 96 }, { label: 'Mar', value: 95 }, { label: 'Apr', value: 94 },
      { label: 'May', value: 94 }, { label: 'Jun', value: 93 }, { label: 'Jul', value: 92 },
    ],
  },
  {
    id: 'AST-1002',
    name: 'Portable X-Ray Machine',
    category: 'Medical',
    serialNumber: 'MED-XR-5542',
    status: 'Active',
    healthScore: 65,
    healthStatus: 'Warning',
    manufacturer: 'GE Healthcare',
    model: 'AMX 240',
    location: { id: 'LOC-HOSP-2', name: 'General Hospital', building: 'North Wing', floor: 'Floor 3', zone: 'Emergency Room' },
    custodian: 'Dr. Robert Chen',
    purchaseDate: '2022-04-10',
    purchasePrice: 120000,
    bookValue: 74000,
    depreciationMethod: 'Straight-line (10yr)',
    warrantyExpiry: '2025-04-10',
    criticality: 'Critical',
    riskScore: 48,
    utilization: 8,
    trackingTech: 'BLE',
    lifecycleStage: 'In Service',
    mapPosition: { x: 82, y: 18 },
    telemetry: { batteryLevel: 45, temperature: 31, lastPing: hoursAgo(1) },
    tags: ['BLE', 'High Value'],
    healthTrend: [
      { label: 'Feb', value: 88 }, { label: 'Mar', value: 84 }, { label: 'Apr', value: 79 },
      { label: 'May', value: 74 }, { label: 'Jun', value: 69 }, { label: 'Jul', value: 65 },
    ],
  },
  {
    id: 'AST-1003',
    name: 'Dell PowerEdge R740 Server',
    category: 'IT',
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
    id: 'AST-1004',
    name: 'HVAC Rooftop Unit B',
    category: 'Facilities',
    serialNumber: 'HVAC-RTU-0042',
    status: 'Active',
    healthScore: 41,
    healthStatus: 'Warning',
    manufacturer: 'Carrier',
    model: '48TC',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', floor: 'Roof', zone: 'Mechanical' },
    custodian: 'Facilities Team',
    purchaseDate: '2019-06-01',
    purchasePrice: 32000,
    bookValue: 9600,
    depreciationMethod: 'Straight-line (15yr)',
    warrantyExpiry: '2024-06-01',
    criticality: 'High',
    riskScore: 85,
    utilization: 64,
    trackingTech: 'LoRaWAN',
    lifecycleStage: 'In Service',
    mapPosition: { x: 45, y: 8 },
    telemetry: { temperature: 68, vibration: 1.9, humidity: 55, lastPing: minsAgo(1) },
    tags: ['LoRaWAN', 'Predictive'],
    healthTrend: [
      { label: 'Feb', value: 72 }, { label: 'Mar', value: 68 }, { label: 'Apr', value: 61 },
      { label: 'May', value: 55 }, { label: 'Jun', value: 48 }, { label: 'Jul', value: 41 },
    ],
  },
  {
    id: 'AST-1005',
    name: 'Ford Transit Delivery Van',
    category: 'Vehicles',
    serialNumber: 'VEH-FT-7781',
    status: 'Active',
    healthScore: 88,
    healthStatus: 'Good',
    manufacturer: 'Ford',
    model: 'Transit 350',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Yard' },
    custodian: 'Marcus Bell',
    purchaseDate: '2023-02-18',
    purchasePrice: 52000,
    bookValue: 43000,
    depreciationMethod: 'Declining balance',
    warrantyExpiry: '2027-02-18',
    criticality: 'Medium',
    riskScore: 22,
    utilization: 84,
    trackingTech: 'GPS',
    lifecycleStage: 'In Service',
    mapPosition: { x: 8, y: 78 },
    telemetry: { batteryLevel: 92, temperature: 26, lastPing: minsAgo(8) },
    tags: ['GPS', 'Fleet'],
    healthTrend: [
      { label: 'Feb', value: 91 }, { label: 'Mar', value: 90 }, { label: 'Apr', value: 90 },
      { label: 'May', value: 89 }, { label: 'Jun', value: 89 }, { label: 'Jul', value: 88 },
    ],
  },
  {
    id: 'AST-1006',
    name: 'Infusion Pump Fleet #12',
    category: 'Medical',
    serialNumber: 'MED-IP-3390',
    status: 'Missing',
    healthScore: 70,
    healthStatus: 'Warning',
    manufacturer: 'Baxter',
    model: 'Sigma Spectrum',
    location: { id: 'LOC-HOSP-2', name: 'General Hospital', building: 'North Wing', floor: 'Floor 2', zone: 'Ward 2B' },
    custodian: 'Nursing Station 2B',
    purchaseDate: '2021-09-30',
    purchasePrice: 4200,
    bookValue: 2100,
    depreciationMethod: 'Straight-line (8yr)',
    warrantyExpiry: '2026-09-30',
    criticality: 'High',
    riskScore: 74,
    utilization: 0,
    trackingTech: 'BLE',
    lifecycleStage: 'In Service',
    mapPosition: { x: 76, y: 30 },
    telemetry: { batteryLevel: 12, lastPing: hoursAgo(52) },
    tags: ['BLE', 'Last seen 2d'],
    healthTrend: [
      { label: 'Feb', value: 78 }, { label: 'Mar', value: 77 }, { label: 'Apr', value: 75 },
      { label: 'May', value: 73 }, { label: 'Jun', value: 72 }, { label: 'Jul', value: 70 },
    ],
  },
  {
    id: 'AST-1007',
    name: 'CNC Milling Machine #3',
    category: 'Heavy Machinery',
    serialNumber: 'CNC-M3-6612',
    status: 'Active',
    healthScore: 76,
    healthStatus: 'Warning',
    manufacturer: 'Haas',
    model: 'VF-2SS',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Production Bay 1' },
    custodian: 'Elena Ortiz',
    purchaseDate: '2021-03-12',
    purchasePrice: 68000,
    bookValue: 44000,
    depreciationMethod: 'Units of production',
    warrantyExpiry: '2026-03-12',
    criticality: 'High',
    riskScore: 39,
    utilization: 96,
    trackingTech: 'UWB',
    lifecycleStage: 'In Service',
    mapPosition: { x: 40, y: 45 },
    telemetry: { temperature: 58, vibration: 1.1, lastPing: minsAgo(3) },
    tags: ['UWB', 'Overutilized'],
    healthTrend: [
      { label: 'Feb', value: 84 }, { label: 'Mar', value: 82 }, { label: 'Apr', value: 81 },
      { label: 'May', value: 79 }, { label: 'Jun', value: 78 }, { label: 'Jul', value: 76 },
    ],
  },
  {
    id: 'AST-1008',
    name: 'Cisco Catalyst 9500 Switch',
    category: 'IT',
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
    id: 'AST-1009',
    name: 'Reach Truck RT-220',
    category: 'Heavy Machinery',
    serialNumber: 'RT-220-4410',
    status: 'Maintenance',
    healthScore: 54,
    healthStatus: 'Warning',
    manufacturer: 'Toyota',
    model: 'RT-220',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Service Bay' },
    custodian: 'Sarah Jenkins',
    purchaseDate: '2022-08-05',
    purchasePrice: 38000,
    bookValue: 27000,
    depreciationMethod: 'Straight-line (7yr)',
    warrantyExpiry: '2025-08-05',
    criticality: 'Medium',
    riskScore: 46,
    utilization: 41,
    trackingTech: 'UWB',
    lifecycleStage: 'In Service',
    mapPosition: { x: 30, y: 25 },
    telemetry: { batteryLevel: 60, temperature: 38, vibration: 0.5, lastPing: minsAgo(14) },
    tags: ['UWB', 'In Service Bay'],
    healthTrend: [
      { label: 'Feb', value: 70 }, { label: 'Mar', value: 67 }, { label: 'Apr', value: 63 },
      { label: 'May', value: 60 }, { label: 'Jun', value: 57 }, { label: 'Jul', value: 54 },
    ],
  },
  {
    id: 'AST-1010',
    name: 'Ultrasound Scanner U-9',
    category: 'Medical',
    serialNumber: 'MED-US-9021',
    status: 'Active',
    healthScore: 83,
    healthStatus: 'Good',
    manufacturer: 'Philips',
    model: 'EPIQ Elite',
    location: { id: 'LOC-HOSP-2', name: 'General Hospital', building: 'South Wing', floor: 'Floor 1', zone: 'Radiology' },
    custodian: 'Dr. Amara Osei',
    purchaseDate: '2023-07-19',
    purchasePrice: 95000,
    bookValue: 76000,
    depreciationMethod: 'Straight-line (10yr)',
    warrantyExpiry: '2028-07-19',
    criticality: 'High',
    riskScore: 18,
    utilization: 88,
    trackingTech: 'BLE',
    lifecycleStage: 'In Service',
    mapPosition: { x: 90, y: 30 },
    telemetry: { batteryLevel: 78, temperature: 29, lastPing: minsAgo(6) },
    tags: ['BLE', 'High Value'],
    healthTrend: [
      { label: 'Feb', value: 87 }, { label: 'Mar', value: 86 }, { label: 'Apr', value: 85 },
      { label: 'May', value: 85 }, { label: 'Jun', value: 84 }, { label: 'Jul', value: 83 },
    ],
  },
  {
    id: 'AST-1011',
    name: 'Diesel Generator 250kW',
    category: 'Facilities',
    serialNumber: 'GEN-250-0071',
    status: 'Active',
    healthScore: 79,
    healthStatus: 'Good',
    manufacturer: 'Cummins',
    model: 'C250D6',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Utility Yard' },
    custodian: 'Facilities Team',
    purchaseDate: '2020-10-11',
    purchasePrice: 41000,
    bookValue: 24600,
    depreciationMethod: 'Straight-line (12yr)',
    warrantyExpiry: '2025-10-11',
    criticality: 'Critical',
    riskScore: 27,
    utilization: 23,
    trackingTech: 'LoRaWAN',
    lifecycleStage: 'In Service',
    mapPosition: { x: 4, y: 60 },
    telemetry: { temperature: 52, vibration: 0.9, lastPing: minsAgo(4) },
    tags: ['LoRaWAN', 'Backup Power'],
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
    name: 'Cold Chain Reefer Unit',
    category: 'Facilities',
    serialNumber: 'CC-REEF-8830',
    status: 'Active',
    healthScore: 58,
    healthStatus: 'Warning',
    manufacturer: 'Thermo King',
    model: 'Precedent S-600',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Cold Storage' },
    custodian: 'Cold Chain Ops',
    purchaseDate: '2021-11-22',
    purchasePrice: 28000,
    bookValue: 17500,
    depreciationMethod: 'Straight-line (10yr)',
    warrantyExpiry: '2026-11-22',
    criticality: 'High',
    riskScore: 61,
    utilization: 72,
    trackingTech: 'LoRaWAN',
    lifecycleStage: 'In Service',
    mapPosition: { x: 10, y: 45 },
    telemetry: { temperature: -18, humidity: 82, vibration: 0.4, lastPing: minsAgo(2) },
    tags: ['LoRaWAN', 'Cold Chain'],
    healthTrend: [
      { label: 'Feb', value: 71 }, { label: 'Mar', value: 68 }, { label: 'Apr', value: 65 },
      { label: 'May', value: 63 }, { label: 'Jun', value: 61 }, { label: 'Jul', value: 58 },
    ],
  },
  {
    id: 'AST-1014',
    name: 'Autonomous Mobile Robot AMR-7',
    category: 'Sensors',
    serialNumber: 'AMR-7-5567',
    status: 'Staging',
    healthScore: 97,
    healthStatus: 'Good',
    manufacturer: 'Locus Robotics',
    model: 'LocusBot',
    location: { id: 'LOC-WH-1', name: 'Central Warehouse', building: 'Building A', zone: 'Commissioning' },
    custodian: 'Automation Team',
    purchaseDate: '2026-06-15',
    purchasePrice: 55000,
    bookValue: 54000,
    depreciationMethod: 'Straight-line (6yr)',
    warrantyExpiry: '2031-06-15',
    criticality: 'Medium',
    riskScore: 6,
    utilization: 12,
    trackingTech: 'UWB',
    lifecycleStage: 'Commissioning',
    mapPosition: { x: 55, y: 35 },
    telemetry: { batteryLevel: 96, temperature: 30, lastPing: minsAgo(1) },
    tags: ['UWB', 'New', 'Autonomous'],
    healthTrend: [
      { label: 'Feb', value: 0 }, { label: 'Mar', value: 0 }, { label: 'Apr', value: 0 },
      { label: 'May', value: 0 }, { label: 'Jun', value: 98 }, { label: 'Jul', value: 97 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Work Orders — maintenance pipeline (New → Assigned → In Progress → On Hold → Completed)
// ─────────────────────────────────────────────────────────────────────────────
export const mockWorkOrders: WorkOrder[] = [
  {
    id: 'WO-5001', title: 'Investigate abnormal vibration', assetId: 'AST-1004', assetName: 'HVAC Rooftop Unit B',
    status: 'New', priority: 'Critical', type: 'Predictive', assignedTo: 'Unassigned',
    createdAt: hoursAgo(3), dueDate: daysAhead(2), estimatedHours: 4, aiGenerated: true,
    description: 'AI predicts 85% probability of compressor failure within 4 days. Vibration signature exceeds baseline by 3.2σ.',
  },
  {
    id: 'WO-5002', title: 'Emergency server thermal shutdown risk', assetId: 'AST-1003', assetName: 'Dell PowerEdge R740 Server',
    status: 'In Progress', priority: 'Critical', type: 'Corrective', assignedTo: 'James Park',
    createdAt: hoursAgo(6), dueDate: daysAhead(1), estimatedHours: 3, aiGenerated: false,
    description: 'Inlet temperature at 85°C. Replace failing fan module and reseat thermal sensors in Rack 42.',
  },
  {
    id: 'WO-5003', title: 'Quarterly PM — Forklift hydraulics', assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X',
    status: 'Assigned', priority: 'Medium', type: 'Preventive', assignedTo: 'Diego Martinez',
    createdAt: daysAgo(1), dueDate: daysAhead(5), estimatedHours: 2, aiGenerated: false,
    description: 'Scheduled 500-hour preventive maintenance: hydraulic fluid, mast chains, fork inspection.',
  },
  {
    id: 'WO-5004', title: 'Replace worn drive belt', assetId: 'AST-1009', assetName: 'Reach Truck RT-220',
    status: 'In Progress', priority: 'High', type: 'Corrective', assignedTo: 'Diego Martinez',
    createdAt: daysAgo(2), dueDate: NOW, estimatedHours: 1.5, aiGenerated: false,
    description: 'Operator reported slipping under load. Drive belt showing cracking; replace and recalibrate.',
  },
  {
    id: 'WO-5005', title: 'Spindle bearing wear inspection', assetId: 'AST-1007', assetName: 'CNC Milling Machine #3',
    status: 'Assigned', priority: 'High', type: 'Predictive', assignedTo: 'Elena Ortiz',
    createdAt: daysAgo(1), dueDate: daysAhead(3), estimatedHours: 3, aiGenerated: true,
    description: 'Utilization at 96% for 30 days. AI recommends bearing inspection before RUL threshold is reached.',
  },
  {
    id: 'WO-5006', title: 'Calibration — Ultrasound Scanner', assetId: 'AST-1010', assetName: 'Ultrasound Scanner U-9',
    status: 'New', priority: 'Medium', type: 'Inspection', assignedTo: 'Unassigned',
    createdAt: hoursAgo(20), dueDate: daysAhead(9), estimatedHours: 2, aiGenerated: false,
    description: 'Annual biomedical calibration and safety inspection due per Joint Commission requirements.',
  },
  {
    id: 'WO-5007', title: 'Reefer refrigerant top-up', assetId: 'AST-1013', assetName: 'Cold Chain Reefer Unit',
    status: 'On Hold', priority: 'High', type: 'Corrective', assignedTo: 'Tom Fisher',
    createdAt: daysAgo(3), dueDate: daysAhead(1), estimatedHours: 2, aiGenerated: false,
    description: 'Temperature drift detected. On hold pending refrigerant delivery (parts shortage).',
  },
  {
    id: 'WO-5008', title: 'Generator load-bank test', assetId: 'AST-1011', assetName: 'Diesel Generator 250kW',
    status: 'Assigned', priority: 'Medium', type: 'Preventive', assignedTo: 'Tom Fisher',
    createdAt: daysAgo(2), dueDate: daysAhead(6), estimatedHours: 4, aiGenerated: false,
    description: 'Monthly backup-power load-bank verification and fuel-polishing check.',
  },
  {
    id: 'WO-5009', title: 'Locate & recover missing infusion pump', assetId: 'AST-1006', assetName: 'Infusion Pump Fleet #12',
    status: 'New', priority: 'Critical', type: 'Corrective', assignedTo: 'Unassigned',
    createdAt: hoursAgo(4), dueDate: daysAhead(1), estimatedHours: 1, aiGenerated: true,
    description: 'Asset not scanned in 52 hours; last seen Ward 2B. Dispatch RTLS search and verify custody.',
  },
  {
    id: 'WO-5010', title: 'Firmware OTA — RFID Gateway', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4',
    status: 'Completed', priority: 'Low', type: 'Preventive', assignedTo: 'IoT Platform',
    createdAt: daysAgo(5), dueDate: daysAgo(1), estimatedHours: 0.5, aiGenerated: false,
    description: 'Push firmware v4.8.2 to gateway fleet; verify read-rate post-update.',
  },
  {
    id: 'WO-5011', title: 'Van brake pad replacement', assetId: 'AST-1005', assetName: 'Ford Transit Delivery Van',
    status: 'Completed', priority: 'Medium', type: 'Corrective', assignedTo: 'Diego Martinez',
    createdAt: daysAgo(6), dueDate: daysAgo(2), estimatedHours: 2, aiGenerated: false,
    description: 'Front brake pads at wear limit. Replaced pads and rotors, road-tested.',
  },
  {
    id: 'WO-5012', title: 'Commissioning checklist — AMR-7', assetId: 'AST-1014', assetName: 'Autonomous Mobile Robot AMR-7',
    status: 'In Progress', priority: 'Low', type: 'Inspection', assignedTo: 'Automation Team',
    createdAt: daysAgo(1), dueDate: daysAhead(4), estimatedHours: 6, aiGenerated: false,
    description: 'New-asset commissioning: map upload, safety-stop validation, dock calibration.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// AI Insights — ranked, explainable recommendations (with drivers + confidence)
// ─────────────────────────────────────────────────────────────────────────────
export const mockInsights: AIInsight[] = [
  {
    id: 'INS-9001', type: 'Predictive Failure', severity: 'Critical',
    title: 'HVAC Rooftop Unit B — imminent compressor failure',
    summary: 'Vibration telemetry shows an accelerating fault signature. 85% probability of failure within 4 days.',
    assetId: 'AST-1004', assetName: 'HVAC Rooftop Unit B',
    confidence: 85, impactUsd: 42000, impactLabel: '4 days to failure',
    drivers: ['Vibration +3.2σ over baseline', 'Bearing temp trending up 6 wks', 'Health score fell to 41 from 72', 'Past 2 units failed at this signature'],
    recommendedAction: 'Auto-generate a Critical predictive work order and dispatch a technician within 48h.',
    actionLabel: 'Create Work Order', createdAt: hoursAgo(3),
  },
  {
    id: 'INS-9002', type: 'Utilization', severity: 'Opportunity',
    title: 'Rebalance idle Portable X-Ray units (North → South Wing)',
    summary: '5 portable X-Ray units in North Wing sit at <10% utilization while South Wing runs over capacity.',
    assetId: 'AST-1002', assetName: 'Portable X-Ray Machine',
    confidence: 78, impactUsd: 18500, impactLabel: '+22% utilization',
    drivers: ['North Wing utilization 8% (30d)', 'South Wing at 104% capacity', '3 pending requests unmet', 'Zero transfer cost (same facility)'],
    recommendedAction: 'Initiate an inter-zone transfer of 3 units to balance demand.',
    actionLabel: 'Initiate Transfer', createdAt: hoursAgo(5),
  },
  {
    id: 'INS-9003', type: 'Theft/Security', severity: 'Critical',
    title: 'Infusion Pump #12 missing — possible custody gap',
    summary: 'Asset not scanned in 52 hours and last seen leaving Ward 2B outside its geofence. Battery near depletion.',
    assetId: 'AST-1006', assetName: 'Infusion Pump Fleet #12',
    confidence: 71, impactUsd: 4200, impactLabel: 'Loss risk high',
    drivers: ['No RTLS ping 52h', 'Last seen crossing Ward 2B geofence', 'No custody check-out logged', 'Battery at 12% (signal loss likely)'],
    recommendedAction: 'Trigger an RTLS recovery search and open a custody-exception incident.',
    actionLabel: 'Start Recovery', createdAt: hoursAgo(4),
  },
  {
    id: 'INS-9004', type: 'Cost Optimization', severity: 'Opportunity',
    title: 'Defer capex — extend Reach Truck RT-220 life 18 months',
    summary: 'Refurbishing the drive assembly costs 12% of replacement and adds ~18 months of service life.',
    assetId: 'AST-1009', assetName: 'Reach Truck RT-220',
    confidence: 69, impactUsd: 31000, impactLabel: 'Capex deferral',
    drivers: ['Chassis health still 80%+', 'Only drive belt/bearings degraded', 'Replacement lead time 14 wks', 'Refurb ROI 4.2×'],
    recommendedAction: 'Add to the capex-deferral plan and schedule a refurbishment work order.',
    actionLabel: 'Plan Refurbishment', createdAt: hoursAgo(9),
  },
  {
    id: 'INS-9005', type: 'Anomaly', severity: 'Warning',
    title: 'CNC Mill #3 sustained overutilization',
    summary: 'Running at 96% utilization for 30 consecutive days — accelerating spindle-bearing wear.',
    assetId: 'AST-1007', assetName: 'CNC Milling Machine #3',
    confidence: 74, impactUsd: 9800, impactLabel: 'RUL shortening',
    drivers: ['Utilization 96% (30d avg)', 'Spindle temp +9°C vs baseline', 'No PM in 90 days', 'Single-point bottleneck for Bay 1'],
    recommendedAction: 'Schedule a predictive bearing inspection and rebalance load to Bay 2.',
    actionLabel: 'Schedule Inspection', createdAt: hoursAgo(14),
  },
  {
    id: 'INS-9006', type: 'Lifecycle', severity: 'Warning',
    title: 'Dell R740 Server reaching end-of-life',
    summary: 'Book value near zero, warranty expired, health score 30. Recommend replacement planning this quarter.',
    assetId: 'AST-1003', assetName: 'Dell PowerEdge R740 Server',
    confidence: 88, impactUsd: 12000, impactLabel: 'EOL this quarter',
    drivers: ['Health score 30 and falling', 'Warranty expired Jan 2025', 'Book value $1.7k of $8.5k', 'Thermal faults recurring'],
    recommendedAction: 'Add to Q3 replacement plan and stage a migration window.',
    actionLabel: 'Plan Replacement', createdAt: daysAgo(1),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Facility floor-plan zones (coords are % of the SVG box; used by the Live Map)
// ─────────────────────────────────────────────────────────────────────────────
export const mockZones: MapZone[] = [
  { id: 'Z1', name: 'Loading Dock', type: 'dock', x: 2, y: 2, width: 28, height: 34 },
  { id: 'Z2', name: 'Main Warehouse', type: 'warehouse', x: 32, y: 2, width: 36, height: 62 },
  { id: 'Z3', name: 'Cold Storage', type: 'lab', x: 2, y: 38, width: 28, height: 30 },
  { id: 'Z4', name: 'Utility Yard', type: 'yard', x: 2, y: 70, width: 28, height: 28 },
  { id: 'Z5', name: 'Production Bay', type: 'warehouse', x: 32, y: 66, width: 36, height: 32 },
  { id: 'Z6', name: 'Office / Clinical Wing', type: 'office', x: 70, y: 2, width: 28, height: 44 },
  { id: 'Z7', name: 'Data Center (Restricted)', type: 'restricted', x: 70, y: 48, width: 28, height: 50 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Per-asset activity log (chain of custody + events, for the 360° profile)
// ─────────────────────────────────────────────────────────────────────────────
export const mockActivity: ActivityEvent[] = [
  { id: 'EV-1', assetId: 'AST-1004', type: 'Alert', description: 'Predictive failure alert raised (85% confidence)', actor: 'AI Engine', timestamp: hoursAgo(3) },
  { id: 'EV-2', assetId: 'AST-1004', type: 'Telemetry', description: 'Vibration exceeded 1.8 mm/s threshold', actor: 'Sensor RTU-0042', timestamp: hoursAgo(4) },
  { id: 'EV-3', assetId: 'AST-1004', type: 'Maintenance', description: 'Filter replacement completed', actor: 'Facilities Team', timestamp: daysAgo(21) },
  { id: 'EV-4', assetId: 'AST-1003', type: 'Alert', description: 'Inlet temperature critical (85°C)', actor: 'AI Engine', timestamp: hoursAgo(6) },
  { id: 'EV-5', assetId: 'AST-1003', type: 'Maintenance', description: 'Work order WO-5002 opened', actor: 'James Park', timestamp: hoursAgo(6) },
  { id: 'EV-6', assetId: 'AST-1003', type: 'Movement', description: 'Relocated to Rack 42', actor: 'IT Ops Team', timestamp: daysAgo(40) },
  { id: 'EV-7', assetId: 'AST-1001', type: 'Custody', description: 'Custody assigned to Sarah Jenkins', actor: 'Facility Manager', timestamp: daysAgo(12) },
  { id: 'EV-8', assetId: 'AST-1001', type: 'Telemetry', description: 'Routine health ping — score 92', actor: 'UWB Tag', timestamp: minsAgo(2) },
  { id: 'EV-9', assetId: 'AST-1001', type: 'Maintenance', description: 'PM scheduled (WO-5003)', actor: 'Maintenance Manager', timestamp: daysAgo(1) },
  { id: 'EV-10', assetId: 'AST-1006', type: 'Alert', description: 'Signal loss — no ping in 52h', actor: 'RTLS Monitor', timestamp: hoursAgo(4) },
  { id: 'EV-11', assetId: 'AST-1006', type: 'Movement', description: 'Last seen crossing Ward 2B geofence', actor: 'BLE Beacon', timestamp: hoursAgo(52) },
  { id: 'EV-12', assetId: 'AST-1002', type: 'Audit', description: 'Utilization flagged low (8%)', actor: 'AI Engine', timestamp: hoursAgo(5) },
  { id: 'EV-13', assetId: 'AST-1007', type: 'Alert', description: 'Sustained overutilization (96%)', actor: 'AI Engine', timestamp: hoursAgo(14) },
  { id: 'EV-14', assetId: 'AST-1014', type: 'Registration', description: 'Asset registered and entered commissioning', actor: 'Automation Team', timestamp: daysAgo(38) },
];

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate series for the Executive Dashboard charts
// ─────────────────────────────────────────────────────────────────────────────
export const utilizationDowntimeSeries: UtilizationDowntimePoint[] = [
  { label: 'Feb', utilization: 68, downtime: 142 },
  { label: 'Mar', utilization: 71, downtime: 128 },
  { label: 'Apr', utilization: 74, downtime: 119 },
  { label: 'May', utilization: 72, downtime: 134 },
  { label: 'Jun', utilization: 79, downtime: 96 },
  { label: 'Jul', utilization: 83, downtime: 74 },
];

export const categoryBreakdown: CategoryBreakdown[] = [
  { category: 'Heavy Machinery', count: 3120, value: 89_400_000 },
  { category: 'Medical', count: 2450, value: 61_200_000 },
  { category: 'IT', count: 4180, value: 38_700_000 },
  { category: 'Vehicles', count: 1290, value: 32_100_000 },
  { category: 'Facilities', count: 1870, value: 18_900_000 },
  { category: 'Sensors', count: 1295, value: 4_900_000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────
export const getAssetById = (id: string): Asset | undefined =>
  mockAssets.find((a) => a.id === id);

export const getWorkOrdersForAsset = (assetId: string): WorkOrder[] =>
  mockWorkOrders.filter((wo) => wo.assetId === assetId);

export const getActivityForAsset = (assetId: string): ActivityEvent[] =>
  mockActivity
    .filter((ev) => ev.assetId === assetId)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

export const getInsightsForAsset = (assetId: string): AIInsight[] =>
  mockInsights.filter((ins) => ins.assetId === assetId);

// ─────────────────────────────────────────────────────────────────────────────
// Taxonomy — asset classes with per-class dynamic attribute schemas
// ─────────────────────────────────────────────────────────────────────────────
export const mockTaxonomy: TaxonomyClass[] = [
  {
    id: 'CLS-HM', name: 'Heavy Machinery', icon: '⚙️', assetCount: 3120,
    attributes: [
      { key: 'loadCapacityKg', label: 'Load Capacity', type: 'number', unit: 'kg', required: true },
      { key: 'powerSource', label: 'Power Source', type: 'select', options: ['Electric', 'Diesel', 'LPG', 'Hybrid'], required: true },
      { key: 'operatingHours', label: 'Operating Hours', type: 'number', unit: 'hrs' },
      { key: 'lastServiceDate', label: 'Last Service', type: 'date' },
    ],
  },
  {
    id: 'CLS-MED', name: 'Medical', icon: '⚕️', assetCount: 2450,
    attributes: [
      { key: 'fdaClass', label: 'FDA Class', type: 'select', options: ['I', 'II', 'III'], required: true },
      { key: 'calibrationDue', label: 'Calibration Due', type: 'date', required: true },
      { key: 'biomedId', label: 'Biomed ID', type: 'text' },
      { key: 'sterilizable', label: 'Sterilizable', type: 'boolean' },
    ],
  },
  {
    id: 'CLS-IT', name: 'IT', icon: '💻', assetCount: 4180,
    attributes: [
      { key: 'ipAddress', label: 'IP Address', type: 'text' },
      { key: 'rackUnit', label: 'Rack Unit', type: 'text' },
      { key: 'cpuCores', label: 'CPU Cores', type: 'number' },
      { key: 'osVersion', label: 'OS / Firmware', type: 'text' },
    ],
  },
  {
    id: 'CLS-VEH', name: 'Vehicles', icon: '🚗', assetCount: 1290,
    attributes: [
      { key: 'vin', label: 'VIN', type: 'text', required: true },
      { key: 'odometerKm', label: 'Odometer', type: 'number', unit: 'km' },
      { key: 'fuelType', label: 'Fuel Type', type: 'select', options: ['Petrol', 'Diesel', 'EV', 'Hybrid'] },
      { key: 'registrationExpiry', label: 'Registration Expiry', type: 'date' },
    ],
  },
  {
    id: 'CLS-FAC', name: 'Facilities', icon: '🏭', assetCount: 1870,
    attributes: [
      { key: 'ratedPowerKw', label: 'Rated Power', type: 'number', unit: 'kW' },
      { key: 'refrigerant', label: 'Refrigerant', type: 'text' },
      { key: 'inspectionDue', label: 'Inspection Due', type: 'date' },
    ],
  },
  {
    id: 'CLS-SEN', name: 'Sensors', icon: '📡', assetCount: 1295,
    attributes: [
      { key: 'protocol', label: 'Protocol', type: 'select', options: ['RFID', 'BLE', 'UWB', 'LoRaWAN', 'WiFi'], required: true },
      { key: 'firmwareVersion', label: 'Firmware', type: 'text' },
      { key: 'reportIntervalS', label: 'Report Interval', type: 'number', unit: 's' },
    ],
  },
];

export const getTaxonomyClass = (id: string): TaxonomyClass | undefined =>
  mockTaxonomy.find((c) => c.id === id);

// ─────────────────────────────────────────────────────────────────────────────
// Groups, fleets & kits
// ─────────────────────────────────────────────────────────────────────────────
export const mockGroups: AssetGroup[] = [
  { id: 'GRP-1', name: 'Warehouse Forklift Fleet', type: 'Fleet', description: 'All powered industrial trucks at Central Warehouse', memberIds: ['AST-1001', 'AST-1009'] },
  { id: 'GRP-2', name: 'Critical Medical Equipment', type: 'Group', description: 'High-value, compliance-tracked medical devices', memberIds: ['AST-1002', 'AST-1006', 'AST-1010'] },
  { id: 'GRP-3', name: 'Data Center Rack 42 Kit', type: 'Kit', description: 'Server + switch + sensors provisioned together', memberIds: ['AST-1003', 'AST-1008'] },
  { id: 'GRP-4', name: 'Cold Chain Assets', type: 'Group', description: 'Temperature-controlled and refrigeration units', memberIds: ['AST-1013', 'AST-1011'] },
  { id: 'GRP-5', name: 'IoT Gateway & Robotics', type: 'Fleet', description: 'Automation and edge devices', memberIds: ['AST-1012', 'AST-1014'] },
];

export const getGroupsForAsset = (assetId: string): AssetGroup[] =>
  mockGroups.filter((g) => g.memberIds.includes(assetId));

// ─────────────────────────────────────────────────────────────────────────────
// Documents / media
// ─────────────────────────────────────────────────────────────────────────────
export const mockDocs: AssetDoc[] = [
  { id: 'DOC-1', assetId: 'AST-1001', name: 'Caterpillar DP40N Operator Manual.pdf', type: 'Manual', sizeKb: 4820, uploadedAt: daysAgo(120), uploadedBy: 'Sarah Jenkins' },
  { id: 'DOC-2', assetId: 'AST-1001', name: 'Purchase Invoice #INV-8842.pdf', type: 'Invoice', sizeKb: 210, uploadedAt: daysAgo(600), uploadedBy: 'Procurement' },
  { id: 'DOC-3', assetId: 'AST-1001', name: 'Extended Warranty Certificate.pdf', type: 'Warranty', sizeKb: 180, uploadedAt: daysAgo(600), uploadedBy: 'Procurement' },
  { id: 'DOC-4', assetId: 'AST-1002', name: 'GE AMX 240 Service Manual.pdf', type: 'Manual', sizeKb: 8100, uploadedAt: daysAgo(300), uploadedBy: 'Dr. Robert Chen' },
  { id: 'DOC-5', assetId: 'AST-1002', name: 'Radiation Safety Certificate.pdf', type: 'Certificate', sizeKb: 320, uploadedAt: daysAgo(90), uploadedBy: 'Biomed' },
  { id: 'DOC-6', assetId: 'AST-1003', name: 'Rack 42 Layout.dwg', type: 'CAD', sizeKb: 1540, uploadedAt: daysAgo(200), uploadedBy: 'IT Ops Team' },
  { id: 'DOC-7', assetId: 'AST-1004', name: 'Carrier 48TC Maintenance Log.pdf', type: 'Report', sizeKb: 640, uploadedAt: daysAgo(21), uploadedBy: 'Facilities Team' },
  { id: 'DOC-8', assetId: 'AST-1010', name: 'Ultrasound Calibration Record.pdf', type: 'Certificate', sizeKb: 280, uploadedAt: daysAgo(45), uploadedBy: 'Biomed' },
];

export const getDocsForAsset = (assetId: string): AssetDoc[] =>
  mockDocs.filter((d) => d.assetId === assetId);

// ─────────────────────────────────────────────────────────────────────────────
// Tracking & IoT: gateways, sensors, geofences, movement trails, telemetry
// ─────────────────────────────────────────────────────────────────────────────
export const mockGateways: Gateway[] = [
  { id: 'GW-01', name: 'Dock Reader North', kind: 'RFID Reader', status: 'Online', connectedDevices: 42, firmwareVersion: 'v4.8.2', uptimePct: 99.9, location: 'Loading Dock', ip: '10.4.1.11', lastSeen: minsAgo(1) },
  { id: 'GW-02', name: 'Warehouse BLE Gateway', kind: 'BLE Gateway', status: 'Online', connectedDevices: 118, firmwareVersion: 'v3.2.0', uptimePct: 99.7, location: 'Main Warehouse', ip: '10.4.1.12', lastSeen: minsAgo(1) },
  { id: 'GW-03', name: 'Yard LoRaWAN Gateway', kind: 'LoRaWAN Gateway', status: 'Degraded', connectedDevices: 27, firmwareVersion: 'v2.9.5', uptimePct: 97.1, location: 'Utility Yard', ip: '10.4.1.13', lastSeen: minsAgo(6) },
  { id: 'GW-04', name: 'Production UWB Anchor A', kind: 'UWB Anchor', status: 'Online', connectedDevices: 14, firmwareVersion: 'v1.6.3', uptimePct: 99.4, location: 'Production Bay', ip: '10.4.1.14', lastSeen: minsAgo(1) },
  { id: 'GW-05', name: 'Data Center RFID Reader', kind: 'RFID Reader', status: 'Offline', connectedDevices: 0, firmwareVersion: 'v4.7.9', uptimePct: 88.2, location: 'Data Center', ip: '10.4.1.15', lastSeen: hoursAgo(3) },
];

export const getGateway = (id: string): Gateway | undefined => mockGateways.find((g) => g.id === id);

// One tracking sensor per telemetry-bearing asset, plus a couple of standalone environmental sensors.
export const mockSensors: Sensor[] = [
  { id: 'SEN-01', name: 'Forklift UWB Tag', kind: 'UWB Tag', assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X', status: 'Online', batteryLevel: 85, signalStrength: 92, firmwareVersion: 'v1.6.3', gatewayId: 'GW-04', zone: 'Loading Dock', lastReading: minsAgo(2) },
  { id: 'SEN-02', name: 'X-Ray BLE Beacon', kind: 'BLE Beacon', assetId: 'AST-1002', assetName: 'Portable X-Ray Machine', status: 'Low Battery', batteryLevel: 18, signalStrength: 61, firmwareVersion: 'v3.2.0', gatewayId: 'GW-02', zone: 'Office / Clinical', lastReading: hoursAgo(1) },
  { id: 'SEN-03', name: 'Server RFID Tag', kind: 'RFID Tag', assetId: 'AST-1003', assetName: 'Dell PowerEdge R740 Server', status: 'Offline', signalStrength: 0, firmwareVersion: 'v4.7.9', gatewayId: 'GW-05', zone: 'Data Center', lastReading: hoursAgo(3) },
  { id: 'SEN-04', name: 'HVAC LoRaWAN Sensor', kind: 'LoRaWAN Sensor', assetId: 'AST-1004', assetName: 'HVAC Rooftop Unit B', status: 'Online', batteryLevel: 74, signalStrength: 70, firmwareVersion: 'v2.9.5', gatewayId: 'GW-03', zone: 'Main Warehouse', lastReading: minsAgo(1) },
  { id: 'SEN-05', name: 'Van GPS Tracker', kind: 'GPS Tracker', assetId: 'AST-1005', assetName: 'Ford Transit Delivery Van', status: 'Online', batteryLevel: 92, signalStrength: 88, firmwareVersion: 'v5.1.0', gatewayId: 'GW-03', zone: 'Utility Yard', lastReading: minsAgo(8) },
  { id: 'SEN-06', name: 'Infusion Pump Beacon', kind: 'BLE Beacon', assetId: 'AST-1006', assetName: 'Infusion Pump Fleet #12', status: 'Offline', batteryLevel: 12, signalStrength: 0, firmwareVersion: 'v3.2.0', gatewayId: 'GW-02', zone: 'Office / Clinical', lastReading: hoursAgo(52) },
  { id: 'SEN-07', name: 'CNC UWB Tag', kind: 'UWB Tag', assetId: 'AST-1007', assetName: 'CNC Milling Machine #3', status: 'Online', batteryLevel: 66, signalStrength: 90, firmwareVersion: 'v1.6.3', gatewayId: 'GW-04', zone: 'Production Bay', lastReading: minsAgo(3) },
  { id: 'SEN-08', name: 'Reefer Temp Sensor', kind: 'Environmental', assetId: 'AST-1013', assetName: 'Cold Chain Reefer Unit', status: 'Online', batteryLevel: 80, signalStrength: 68, firmwareVersion: 'v2.9.5', gatewayId: 'GW-03', zone: 'Cold Storage', lastReading: minsAgo(2) },
  { id: 'SEN-09', name: 'Cold Storage Env Sensor', kind: 'Environmental', status: 'Online', batteryLevel: 95, signalStrength: 72, firmwareVersion: 'v2.9.5', gatewayId: 'GW-03', zone: 'Cold Storage', lastReading: minsAgo(1) },
  { id: 'SEN-10', name: 'AMR-7 UWB Tag', kind: 'UWB Tag', assetId: 'AST-1014', assetName: 'Autonomous Mobile Robot AMR-7', status: 'Online', batteryLevel: 96, signalStrength: 94, firmwareVersion: 'v1.6.3', gatewayId: 'GW-04', zone: 'Main Warehouse', lastReading: minsAgo(1) },
];

export const getSensor = (id: string): Sensor | undefined => mockSensors.find((s) => s.id === id);
export const getSensorsForGateway = (gatewayId: string): Sensor[] => mockSensors.filter((s) => s.gatewayId === gatewayId);

export const mockGeofences: Geofence[] = [
  { id: 'GF-1', name: 'Loading Dock Zone', zoneId: 'Z1', x: 2, y: 2, width: 28, height: 34, rule: 'Dwell', breaches24h: 3, active: true },
  { id: 'GF-2', name: 'Cold Storage Boundary', zoneId: 'Z3', x: 2, y: 38, width: 28, height: 30, rule: 'Exit', breaches24h: 1, active: true },
  { id: 'GF-3', name: 'Restricted Data Center', zoneId: 'Z7', x: 70, y: 48, width: 28, height: 50, rule: 'Restricted', breaches24h: 0, active: true },
  { id: 'GF-4', name: 'Yard Perimeter', zoneId: 'Z4', x: 2, y: 70, width: 28, height: 28, rule: 'Exit', breaches24h: 2, active: false },
];

export const mockTrails: MovementTrail[] = [
  {
    assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X', distanceM: 1840,
    dwellZones: [{ zone: 'Loading Dock', minutes: 142 }, { zone: 'Main Warehouse', minutes: 96 }, { zone: 'Production Bay', minutes: 38 }],
    points: [
      { x: 16, y: 12, timestamp: hoursAgo(6), label: 'Loading Dock' },
      { x: 12, y: 20, timestamp: hoursAgo(5) },
      { x: 30, y: 25, timestamp: hoursAgo(4), label: 'Warehouse' },
      { x: 40, y: 45, timestamp: hoursAgo(2), label: 'Production Bay' },
      { x: 45, y: 30, timestamp: hoursAgo(1) },
      { x: 12, y: 20, timestamp: minsAgo(2), label: 'Loading Dock' },
    ],
  },
  {
    assetId: 'AST-1006', assetName: 'Infusion Pump Fleet #12', distanceM: 320,
    dwellZones: [{ zone: 'Ward 2B', minutes: 210 }, { zone: 'Corridor', minutes: 12 }],
    points: [
      { x: 82, y: 18, timestamp: hoursAgo(54), label: 'Ward 2B' },
      { x: 78, y: 26, timestamp: hoursAgo(53) },
      { x: 76, y: 30, timestamp: hoursAgo(52), label: 'Last seen (geofence exit)' },
    ],
  },
];

export const getTrailForAsset = (assetId: string): MovementTrail | undefined =>
  mockTrails.find((t) => t.assetId === assetId);

/** Deterministic 24-point telemetry series for an asset+metric (no randomness → no hydration drift). */
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
    const drift = metric === 'battery' ? -h * 0.4 : 0; // batteries trend down over the day
    const v = base + drift + amp * Math.sin((h + seed) / 3.2) + ((seed + h) % 5) * 0.4;
    return { label: `${String(h).padStart(2, '0')}:00`, value: Math.round(v * 10) / 10 };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory & Parts
// ─────────────────────────────────────────────────────────────────────────────
export const mockWarehouses: Warehouse[] = [
  { id: 'WH-1', name: 'Central Parts Store', location: 'Central Warehouse · Building A', binCount: 480, skuCount: 1240, valueUsd: 2_180_000 },
  { id: 'WH-2', name: 'Hospital Biomed Store', location: 'General Hospital · North Wing', binCount: 120, skuCount: 410, valueUsd: 890_000 },
  { id: 'WH-3', name: 'Data Center Spares', location: 'Primary Data Center', binCount: 60, skuCount: 175, valueUsd: 320_000 },
];
export const getWarehouse = (id: string): Warehouse | undefined => mockWarehouses.find((w) => w.id === id);

export const mockSuppliers: Supplier[] = [
  { id: 'SUP-1', name: 'Grainger Industrial', category: 'MRO / General', leadTimeDays: 3, rating: 4.6, contact: 'orders@grainger.com', onTimePct: 96 },
  { id: 'SUP-2', name: 'Motion Industries', category: 'Bearings / Drives', leadTimeDays: 7, rating: 4.4, contact: 'sales@motion.com', onTimePct: 92 },
  { id: 'SUP-3', name: 'GE Healthcare Parts', category: 'Medical', leadTimeDays: 14, rating: 4.8, contact: 'parts@gehealth.com', onTimePct: 89 },
  { id: 'SUP-4', name: 'Carrier Supply Co', category: 'HVAC / Refrigeration', leadTimeDays: 10, rating: 4.2, contact: 'supply@carrier.com', onTimePct: 90 },
  { id: 'SUP-5', name: 'CDW Technology', category: 'IT / Network', leadTimeDays: 5, rating: 4.7, contact: 'b2b@cdw.com', onTimePct: 97 },
];
export const getSupplier = (id: string): Supplier | undefined => mockSuppliers.find((s) => s.id === id);

export const mockParts: Part[] = [
  { id: 'P-01', sku: 'HYD-46-20L', name: 'Hydraulic Fluid ISO 46 (20L)', category: 'Fluids', onHand: 42, reorderPoint: 20, unitCost: 78, warehouseId: 'WH-1', bin: 'A-12-3', abcClass: 'B', supplierId: 'SUP-1', leadTimeDays: 3 },
  { id: 'P-02', sku: 'BELT-DR-220', name: 'Drive Belt RT-220', category: 'Drivetrain', onHand: 6, reorderPoint: 8, unitCost: 145, warehouseId: 'WH-1', bin: 'B-04-1', abcClass: 'A', supplierId: 'SUP-2', leadTimeDays: 7 },
  { id: 'P-03', sku: 'FLT-48TC-AIR', name: 'HVAC Air Filter 48TC', category: 'Filters', onHand: 30, reorderPoint: 12, unitCost: 24, warehouseId: 'WH-1', bin: 'C-08-2', abcClass: 'C', supplierId: 'SUP-4', leadTimeDays: 10 },
  { id: 'P-04', sku: 'FAN-R740-MOD', name: 'PowerEdge R740 Fan Module', category: 'IT Hardware', onHand: 2, reorderPoint: 4, unitCost: 210, warehouseId: 'WH-3', bin: 'D-01-4', abcClass: 'A', supplierId: 'SUP-5', leadTimeDays: 5 },
  { id: 'P-05', sku: 'BRK-FT-PAD', name: 'Ford Transit Brake Pad Set', category: 'Vehicle', onHand: 14, reorderPoint: 6, unitCost: 92, warehouseId: 'WH-1', bin: 'B-11-2', abcClass: 'B', supplierId: 'SUP-1', leadTimeDays: 3 },
  { id: 'P-06', sku: 'REF-R404A-12', name: 'Refrigerant R-404A (12kg)', category: 'HVAC', onHand: 3, reorderPoint: 5, unitCost: 320, warehouseId: 'WH-1', bin: 'A-03-1', abcClass: 'A', supplierId: 'SUP-4', leadTimeDays: 10 },
  { id: 'P-07', sku: 'BRG-CNC-SPN', name: 'CNC Spindle Bearing Kit', category: 'Bearings', onHand: 5, reorderPoint: 3, unitCost: 480, warehouseId: 'WH-1', bin: 'B-06-3', abcClass: 'A', supplierId: 'SUP-2', leadTimeDays: 7 },
  { id: 'P-08', sku: 'SEN-THRM-42', name: 'Thermal Sensor Rack 42', category: 'IT Hardware', onHand: 18, reorderPoint: 10, unitCost: 45, warehouseId: 'WH-3', bin: 'D-02-1', abcClass: 'C', supplierId: 'SUP-5', leadTimeDays: 5 },
  { id: 'P-09', sku: 'BAT-BLE-CR', name: 'BLE Beacon Battery (CR2477)', category: 'Consumables', onHand: 120, reorderPoint: 50, unitCost: 3, warehouseId: 'WH-2', bin: 'E-01-1', abcClass: 'C', supplierId: 'SUP-1', leadTimeDays: 3 },
  { id: 'P-10', sku: 'XR-TUBE-240', name: 'X-Ray Tube Assembly AMX 240', category: 'Medical', onHand: 1, reorderPoint: 1, unitCost: 18500, warehouseId: 'WH-2', bin: 'E-04-2', abcClass: 'A', supplierId: 'SUP-3', leadTimeDays: 14 },
];
export const getPart = (id: string): Part | undefined => mockParts.find((p) => p.id === id || p.sku === id);
export const getPartsForWarehouse = (warehouseId: string): Part[] => mockParts.filter((p) => p.warehouseId === warehouseId);
export const reorderParts = (): Part[] => mockParts.filter((p) => p.onHand <= p.reorderPoint);

export const mockPurchaseOrders: PurchaseOrder[] = [
  { id: 'PO-2201', supplierId: 'SUP-2', supplierName: 'Motion Industries', status: 'Sent', createdAt: daysAgo(2), expectedAt: daysAhead(5), total: 1450, lines: [{ sku: 'BELT-DR-220', name: 'Drive Belt RT-220', qty: 10, unitCost: 145 }] },
  { id: 'PO-2202', supplierId: 'SUP-4', supplierName: 'Carrier Supply Co', status: 'Approved', createdAt: daysAgo(1), expectedAt: daysAhead(10), total: 1600, lines: [{ sku: 'REF-R404A-12', name: 'Refrigerant R-404A (12kg)', qty: 5, unitCost: 320 }] },
  { id: 'PO-2203', supplierId: 'SUP-5', supplierName: 'CDW Technology', status: 'Received', createdAt: daysAgo(6), expectedAt: daysAgo(1), total: 840, lines: [{ sku: 'FAN-R740-MOD', name: 'PowerEdge R740 Fan Module', qty: 4, unitCost: 210 }] },
  { id: 'PO-2204', supplierId: 'SUP-3', supplierName: 'GE Healthcare Parts', status: 'Draft', createdAt: hoursAgo(4), expectedAt: daysAhead(14), total: 18500, lines: [{ sku: 'XR-TUBE-240', name: 'X-Ray Tube Assembly AMX 240', qty: 1, unitCost: 18500 }] },
  { id: 'PO-2205', supplierId: 'SUP-1', supplierName: 'Grainger Industrial', status: 'Sent', createdAt: daysAgo(3), expectedAt: daysAhead(1), total: 468, lines: [{ sku: 'HYD-46-20L', name: 'Hydraulic Fluid ISO 46 (20L)', qty: 6, unitCost: 78 }] },
];
export const getPurchaseOrder = (id: string): PurchaseOrder | undefined => mockPurchaseOrders.find((po) => po.id === id);

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance: PM schedules, inspections, and per-WO detail
// ─────────────────────────────────────────────────────────────────────────────
export const mockPmSchedules: PmSchedule[] = [
  { id: 'PM-01', title: '500-hr Forklift Service', assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X', frequency: 'Quarterly', type: 'Preventive', nextDue: daysAhead(5), lastDone: daysAgo(85), estHours: 2, compliancePct: 98, assignedTeam: 'Fleet Maintenance' },
  { id: 'PM-02', title: 'HVAC Filter & Coil Clean', assetId: 'AST-1004', assetName: 'HVAC Rooftop Unit B', frequency: 'Monthly', type: 'Preventive', nextDue: daysAhead(2), lastDone: daysAgo(28), estHours: 1.5, compliancePct: 91, assignedTeam: 'Facilities' },
  { id: 'PM-03', title: 'Ultrasound Calibration', assetId: 'AST-1010', assetName: 'Ultrasound Scanner U-9', frequency: 'Annual', type: 'Inspection', nextDue: daysAhead(20), lastDone: daysAgo(345), estHours: 2, compliancePct: 100, assignedTeam: 'Biomed' },
  { id: 'PM-04', title: 'Generator Load-Bank Test', assetId: 'AST-1011', assetName: 'Diesel Generator 250kW', frequency: 'Monthly', type: 'Preventive', nextDue: daysAhead(6), lastDone: daysAgo(25), estHours: 4, compliancePct: 88, assignedTeam: 'Facilities' },
  { id: 'PM-05', title: 'CNC Spindle Inspection', assetId: 'AST-1007', assetName: 'CNC Milling Machine #3', frequency: 'Usage-based', type: 'Predictive', nextDue: daysAhead(3), lastDone: daysAgo(90), estHours: 3, compliancePct: 76, assignedTeam: 'Production Maint.' },
  { id: 'PM-06', title: 'Reefer Refrigerant Check', assetId: 'AST-1013', assetName: 'Cold Chain Reefer Unit', frequency: 'Quarterly', type: 'Preventive', nextDue: daysAgo(1), lastDone: daysAgo(92), estHours: 2, compliancePct: 84, assignedTeam: 'Cold Chain Ops' },
  { id: 'PM-07', title: 'Van Service & Brakes', assetId: 'AST-1005', assetName: 'Ford Transit Delivery Van', frequency: 'Semi-Annual', type: 'Preventive', nextDue: daysAhead(40), lastDone: daysAgo(140), estHours: 3, compliancePct: 95, assignedTeam: 'Fleet Maintenance' },
  { id: 'PM-08', title: 'Server Room Thermal Audit', assetId: 'AST-1003', assetName: 'Dell PowerEdge R740 Server', frequency: 'Monthly', type: 'Inspection', nextDue: daysAhead(4), lastDone: daysAgo(26), estHours: 1, compliancePct: 82, assignedTeam: 'IT Ops' },
];
export const getPmSchedule = (id: string): PmSchedule | undefined => mockPmSchedules.find((p) => p.id === id);
export const getPmForAsset = (assetId: string): PmSchedule[] => mockPmSchedules.filter((p) => p.assetId === assetId);

export const mockInspections: Inspection[] = [
  {
    id: 'INSP-01', title: 'Forklift Pre-Use Safety', assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X', template: 'OSHA Forklift Daily', status: 'Passed', dueDate: minsAgo(120), inspector: 'Diego Martinez',
    items: [{ label: 'Tires & forks', result: 'Pass' }, { label: 'Hydraulics', result: 'Pass' }, { label: 'Horn & lights', result: 'Pass' }, { label: 'Seatbelt', result: 'Pass' }],
  },
  {
    id: 'INSP-02', title: 'HVAC Quarterly Inspection', assetId: 'AST-1004', assetName: 'HVAC Rooftop Unit B', template: 'HVAC Mechanical', status: 'Failed', dueDate: hoursAgo(4), inspector: 'Facilities Team',
    items: [{ label: 'Compressor vibration', result: 'Fail', note: 'Exceeds 1.8 mm/s' }, { label: 'Refrigerant charge', result: 'Pass' }, { label: 'Belt tension', result: 'Pass' }, { label: 'Coil condition', result: 'Pass' }],
  },
  {
    id: 'INSP-03', title: 'Ultrasound Biomed Check', assetId: 'AST-1010', assetName: 'Ultrasound Scanner U-9', template: 'Joint Commission Biomed', status: 'Scheduled', dueDate: daysAhead(9), inspector: 'Biomed',
    items: [{ label: 'Electrical safety', result: 'Pending' }, { label: 'Image calibration', result: 'Pending' }, { label: 'Probe integrity', result: 'Pending' }],
  },
  {
    id: 'INSP-04', title: 'Generator Monthly Check', assetId: 'AST-1011', assetName: 'Diesel Generator 250kW', template: 'Backup Power', status: 'In Progress', dueDate: NOW, inspector: 'Tom Fisher',
    items: [{ label: 'Fuel level', result: 'Pass' }, { label: 'Coolant', result: 'Pass' }, { label: 'Load test', result: 'Pending' }, { label: 'Battery', result: 'Pending' }],
  },
  {
    id: 'INSP-05', title: 'Cold Chain Temp Audit', assetId: 'AST-1013', assetName: 'Cold Chain Reefer Unit', template: 'Cold Chain Compliance', status: 'Scheduled', dueDate: daysAhead(1), inspector: 'Cold Chain Ops',
    items: [{ label: 'Temp logger', result: 'Pending' }, { label: 'Door seals', result: 'Pending' }, { label: 'Alarm test', result: 'Pending' }],
  },
];
export const getInspection = (id: string): Inspection | undefined => mockInspections.find((i) => i.id === id);

/** Deterministic per-WO detail (checklist/parts/labor/comments) derived from the work order. */
export function getWorkOrderDetail(id: string): WorkOrderDetail {
  const wo = mockWorkOrders.find((w) => w.id === id);
  const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const templates: Record<string, string[]> = {
    Preventive: ['Apply lockout/tagout', 'Inspect wear components', 'Lubricate moving parts', 'Replace filters/fluids', 'Function test', 'Update service log'],
    Corrective: ['Diagnose reported fault', 'Isolate power / make safe', 'Replace failed component', 'Reassemble & torque', 'Verify normal operation', 'Sign off & close'],
    Predictive: ['Review AI prediction & drivers', 'Inspect flagged component', 'Measure vibration / temperature', 'Decide repair vs. monitor', 'Schedule follow-up'],
    Inspection: ['Visual inspection', 'Safety checks', 'Calibration verification', 'Document findings'],
  };
  const items = templates[wo?.type ?? 'Corrective'] ?? templates.Corrective;
  const doneCount = wo?.status === 'Completed' ? items.length : wo?.status === 'In Progress' ? Math.ceil(items.length / 2) : 0;
  const checklist = items.map((label, i) => ({ label, done: i < doneCount }));
  const parts = mockParts.slice(seed % 4, (seed % 4) + 2).map((p) => ({ sku: p.sku, name: p.name, qty: 1 + (seed % 2), unitCost: p.unitCost }));
  const laborLog = wo && wo.status !== 'New'
    ? [{ tech: wo.assignedTo, hours: wo.estimatedHours, note: 'On-site diagnosis and repair', at: wo.createdAt }]
    : [];
  const comments = [
    { author: wo?.aiGenerated ? 'AI Engine' : 'Maintenance Manager', text: wo?.description ?? 'Work order opened.', at: wo?.createdAt ?? NOW },
  ];
  return { checklist, parts, laborLog, comments };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI / MLOps: model registry, forecasts, anomalies
// ─────────────────────────────────────────────────────────────────────────────
export const mockModels: Model[] = [
  {
    id: 'MDL-HEALTH', name: 'Asset Health Score', task: 'Health Scoring', status: 'Production', version: 'v4.2.1',
    accuracy: 94, driftPct: 6, lastTrained: daysAgo(12), owner: 'AI/Data Team', framework: 'XGBoost', predictionsPerDay: 210_000,
    features: [
      { feature: 'Telemetry deviation', importance: 0.31 }, { feature: 'Age / usage hours', importance: 0.24 },
      { feature: 'Maintenance history', importance: 0.19 }, { feature: 'Failure history (class)', importance: 0.14 }, { feature: 'Utilization', importance: 0.12 },
    ],
    versions: [
      { version: 'v4.2.1', trainedAt: daysAgo(12), accuracy: 94, status: 'Production', notes: 'Added vibration spectral features' },
      { version: 'v4.1.0', trainedAt: daysAgo(60), accuracy: 92, status: 'Retired', notes: 'Baseline gradient boosting' },
    ],
  },
  {
    id: 'MDL-FAIL', name: 'Failure Prediction', task: 'Predictive Maintenance', status: 'Production', version: 'v3.5.0',
    accuracy: 89, driftPct: 11, lastTrained: daysAgo(8), owner: 'AI/Data Team', framework: 'LSTM', predictionsPerDay: 84_000,
    features: [
      { feature: 'Vibration trend (σ)', importance: 0.34 }, { feature: 'Temperature trend', importance: 0.22 },
      { feature: 'Duty cycle', importance: 0.2 }, { feature: 'Time since PM', importance: 0.14 }, { feature: 'Similar-asset failures', importance: 0.1 },
    ],
    versions: [
      { version: 'v3.5.0', trainedAt: daysAgo(8), accuracy: 89, status: 'Production', notes: 'Sequence length 720h' },
      { version: 'v3.6.0-rc', trainedAt: daysAgo(2), accuracy: 91, status: 'Shadow', notes: 'Candidate: attention encoder' },
    ],
  },
  {
    id: 'MDL-ANOM', name: 'Anomaly Detection', task: 'Anomaly / Behavioral', status: 'Production', version: 'v2.8.3',
    accuracy: 87, driftPct: 9, lastTrained: daysAgo(15), owner: 'AI/Data Team', framework: 'Isolation Forest', predictionsPerDay: 510_000,
    features: [
      { feature: 'Multivariate residual', importance: 0.4 }, { feature: 'Zone dwell deviation', importance: 0.25 },
      { feature: 'After-hours activity', importance: 0.2 }, { feature: 'Signal-loss pattern', importance: 0.15 },
    ],
    versions: [{ version: 'v2.8.3', trainedAt: daysAgo(15), accuracy: 87, status: 'Production', notes: 'Contamination 0.02' }],
  },
  {
    id: 'MDL-THEFT', name: 'Theft / Loss Prediction', task: 'Security', status: 'Staging', version: 'v1.4.0',
    accuracy: 83, driftPct: 14, lastTrained: daysAgo(20), owner: 'Security/AI', framework: 'Gradient Boosting', predictionsPerDay: 42_000,
    features: [
      { feature: 'Geofence-exit pattern', importance: 0.38 }, { feature: 'Custody gap', importance: 0.27 },
      { feature: 'High-value flag', importance: 0.2 }, { feature: 'Signal-loss + battery', importance: 0.15 },
    ],
    versions: [{ version: 'v1.4.0', trainedAt: daysAgo(20), accuracy: 83, status: 'Staging', notes: 'Awaiting security review' }],
  },
  {
    id: 'MDL-UTIL', name: 'Utilization & Rebalancing', task: 'Optimization', status: 'Production', version: 'v2.1.0',
    accuracy: 91, driftPct: 5, lastTrained: daysAgo(18), owner: 'Ops/AI', framework: 'Time-series + LP', predictionsPerDay: 120_000,
    features: [
      { feature: 'Active-hours ratio', importance: 0.35 }, { feature: 'Zone demand', importance: 0.3 },
      { feature: 'Idle streaks', importance: 0.2 }, { feature: 'Peer utilization', importance: 0.15 },
    ],
    versions: [{ version: 'v2.1.0', trainedAt: daysAgo(18), accuracy: 91, status: 'Production', notes: 'Added LP rebalancer' }],
  },
  {
    id: 'MDL-FORECAST', name: 'Demand & Capex Forecast', task: 'Forecasting', status: 'Production', version: 'v1.9.2',
    accuracy: 88, driftPct: 7, lastTrained: daysAgo(25), owner: 'Finance/AI', framework: 'Prophet + XGB', predictionsPerDay: 6_000,
    features: [
      { feature: 'Historical demand', importance: 0.42 }, { feature: 'Seasonality', importance: 0.26 },
      { feature: 'Asset EOL pipeline', importance: 0.2 }, { feature: 'Budget signals', importance: 0.12 },
    ],
    versions: [{ version: 'v1.9.2', trainedAt: daysAgo(25), accuracy: 88, status: 'Production', notes: 'Quarterly retrain' }],
  },
];
export const getModel = (id: string): Model | undefined => mockModels.find((m) => m.id === id);

// Deterministic forecast series (history + forecast with a confidence band).
function buildForecast(id: string, name: string, unit: string, base: number, growth: number, seed: number): ForecastSeries {
  const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const points = months.map((label, i) => {
    const trend = base + growth * i + 8 * Math.sin((i + seed) / 2);
    const isHistory = i <= 5;
    const forecast = Math.round(trend);
    const spread = Math.round(6 + i * 1.5);
    return {
      label,
      actual: isHistory ? Math.round(trend + ((seed + i) % 5) - 2) : undefined,
      forecast,
      lower: forecast - spread,
      upper: forecast + spread,
    };
  });
  return { id, name, unit, points };
}
export const mockForecasts: ForecastSeries[] = [
  buildForecast('FC-DEMAND', 'Spare-Parts Demand', 'units', 120, 6, 3),
  buildForecast('FC-CAPEX', 'Replacement Capex', '$k', 340, 18, 7),
  buildForecast('FC-EOL', 'Assets Reaching EOL', 'assets', 40, 4, 5),
];

export const mockAnomalies: AnomalyEvent[] = [
  { id: 'AN-01', assetId: 'AST-1004', assetName: 'HVAC Rooftop Unit B', metric: 'Vibration', severity: 'Critical', detectedAt: hoursAgo(3), description: 'Vibration 3.2σ above 6-week baseline; matches pre-failure signature.', zScore: 3.2, confidence: 91 },
  { id: 'AN-02', assetId: 'AST-1003', assetName: 'Dell PowerEdge R740 Server', metric: 'Temperature', severity: 'Critical', detectedAt: hoursAgo(6), description: 'Inlet temperature 85°C sustained — 4σ over normal operating envelope.', zScore: 4.0, confidence: 96 },
  { id: 'AN-03', assetId: 'AST-1007', assetName: 'CNC Milling Machine #3', metric: 'Duty cycle', severity: 'Warning', detectedAt: hoursAgo(14), description: 'Utilization 96% for 30 days — anomalous sustained overload.', zScore: 2.4, confidence: 74 },
  { id: 'AN-04', assetId: 'AST-1006', assetName: 'Infusion Pump Fleet #12', metric: 'Signal', severity: 'Critical', detectedAt: hoursAgo(52), description: 'Signal loss 52h with prior geofence-exit — behavioral anomaly.', zScore: 3.6, confidence: 71 },
  { id: 'AN-05', assetId: 'AST-1013', assetName: 'Cold Chain Reefer Unit', metric: 'Temperature', severity: 'Warning', detectedAt: hoursAgo(20), description: 'Temperature drift +4°C from setpoint over 12h.', zScore: 2.1, confidence: 68 },
];

/** Portfolio health/risk/utilization matrix (drawn from the asset graph). */
export const getHealthMatrix = () =>
  mockAssets.map((a) => ({ id: a.id, name: a.name, category: a.category, health: a.healthScore, risk: a.riskScore ?? 0, utilization: a.utilization ?? 0, status: a.status }));

// ─────────────────────────────────────────────────────────────────────────────
// Analytics & Reporting
// ─────────────────────────────────────────────────────────────────────────────
export const mockReports: Report[] = [
  { id: 'RPT-01', name: 'Executive Asset Portfolio', category: 'Executive', persona: 'Executive / C-Suite', description: 'Portfolio value, risk index, utilization and AI-realized savings.', format: 'PDF', lastRun: daysAgo(1), scheduled: true, metrics: ['Portfolio Value', 'Risk Index', 'Utilization %', 'AI Savings'] },
  { id: 'RPT-02', name: 'Depreciation & Book Value', category: 'Financial', persona: 'Finance / Controller', description: 'Book value, accumulated depreciation and TCO by category.', format: 'Excel', lastRun: daysAgo(3), scheduled: true, metrics: ['Book Value', 'Accum. Depreciation', 'TCO'] },
  { id: 'RPT-03', name: 'Maintenance Reliability', category: 'Maintenance', persona: 'Maintenance Manager', description: 'MTTR, MTBF, PM compliance and backlog age.', format: 'PDF', lastRun: hoursAgo(6), metrics: ['MTTR', 'MTBF', 'PM Compliance %', 'Backlog Age'] },
  { id: 'RPT-04', name: 'Asset Utilization', category: 'Utilization', persona: 'Operations Manager', description: 'Idle vs over-utilized assets and rebalancing opportunity.', format: 'Dashboard', lastRun: daysAgo(2), metrics: ['Utilization %', 'Idle Count', 'Rebalancing $'] },
  { id: 'RPT-05', name: 'Compliance & Audit Pack', category: 'Compliance', persona: 'Compliance Officer', description: 'Chain-of-custody, cert expiry and audit exceptions.', format: 'PDF', lastRun: daysAgo(5), scheduled: true, metrics: ['Custody Coverage', 'Cert Expiry', 'Audit Findings'] },
  { id: 'RPT-06', name: 'AI Prediction Summary', category: 'AI', persona: 'All', description: 'Predicted failures, anomalies and savings identified.', format: 'PDF', lastRun: hoursAgo(12), metrics: ['Predicted Failures', 'Anomalies', 'Savings Identified'] },
  { id: 'RPT-07', name: 'Inventory & Reorder', category: 'Inventory', persona: 'Inventory Manager', description: 'Stock value, below-reorder items and consumption trend.', format: 'Excel', lastRun: daysAgo(1), metrics: ['Stock Value', 'Below Reorder', 'Turnover'] },
  { id: 'RPT-08', name: 'Security & Loss Prevention', category: 'Compliance', persona: 'Security Officer', description: 'Geofence breaches, tamper events and recovered assets.', format: 'PDF', lastRun: daysAgo(2), metrics: ['Breaches', 'Tamper Events', 'Recovered'] },
  { id: 'RPT-09', name: 'Warranty Expiry Exposure', category: 'Financial', persona: 'Finance / Controller', description: 'Assets with warranties expiring in 90 days and cost exposure.', format: 'Excel', lastRun: daysAgo(7), metrics: ['Expiring Warranties', 'Cost Exposure'] },
];
export const getReport = (id: string): Report | undefined => mockReports.find((r) => r.id === id);

// ─────────────────────────────────────────────────────────────────────────────
// Alerts & Notifications
// ─────────────────────────────────────────────────────────────────────────────
export const mockAlerts: Alert[] = [
  { id: 'ALT-01', title: 'HVAC Unit B predicted failure (85%)', severity: 'Critical', type: 'Predictive', assetId: 'AST-1004', assetName: 'HVAC Rooftop Unit B', status: 'Open', createdAt: hoursAgo(3), source: 'AI Engine' },
  { id: 'ALT-02', title: 'Server R740 inlet temp 85°C', severity: 'Critical', type: 'Threshold', assetId: 'AST-1003', assetName: 'Dell PowerEdge R740 Server', status: 'Acknowledged', createdAt: hoursAgo(6), source: 'Telemetry' },
  { id: 'ALT-03', title: 'Infusion Pump #12 signal loss 52h', severity: 'Critical', type: 'Tracking', assetId: 'AST-1006', assetName: 'Infusion Pump Fleet #12', status: 'Escalated', createdAt: hoursAgo(52), source: 'RTLS Monitor' },
  { id: 'ALT-04', title: 'Loading Dock geofence dwell breach', severity: 'Warning', type: 'Geofence', assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X', status: 'Open', createdAt: hoursAgo(2), source: 'Geofence' },
  { id: 'ALT-05', title: 'CNC Mill #3 over-utilization', severity: 'Warning', type: 'Anomaly', assetId: 'AST-1007', assetName: 'CNC Milling Machine #3', status: 'Open', createdAt: hoursAgo(14), source: 'AI Engine' },
  { id: 'ALT-06', title: 'Reefer temperature drift +4°C', severity: 'Warning', type: 'Threshold', assetId: 'AST-1013', assetName: 'Cold Chain Reefer Unit', status: 'Acknowledged', createdAt: hoursAgo(20), source: 'Sensor' },
  { id: 'ALT-07', title: 'Gateway GW-05 offline', severity: 'Warning', type: 'Device', status: 'Open', createdAt: hoursAgo(3), source: 'IoT Platform' },
  { id: 'ALT-08', title: 'X-Ray beacon low battery (18%)', severity: 'Info', type: 'Device', assetId: 'AST-1002', assetName: 'Portable X-Ray Machine', status: 'Resolved', createdAt: daysAgo(1), source: 'Sensor' },
];
export const getAlert = (id: string): Alert | undefined => mockAlerts.find((a) => a.id === id);

export const mockAlertRules: AlertRule[] = [
  { id: 'AR-01', name: 'Predicted failure > 70%', condition: 'ai.failure_probability > 0.7', severity: 'Critical', channels: ['Email', 'Slack', 'Push'], enabled: true, triggered24h: 3 },
  { id: 'AR-02', name: 'Temperature over threshold', condition: 'telemetry.temperature > 80', severity: 'Critical', channels: ['Email', 'SMS'], enabled: true, triggered24h: 2 },
  { id: 'AR-03', name: 'Signal loss > 6h', condition: 'tracking.last_ping_age > 6h', severity: 'Warning', channels: ['Email', 'In-app'], enabled: true, triggered24h: 4 },
  { id: 'AR-04', name: 'Geofence breach (restricted)', condition: 'geofence.rule = restricted AND breach', severity: 'Critical', channels: ['SMS', 'Push'], enabled: true, triggered24h: 0 },
  { id: 'AR-05', name: 'Low battery < 20%', condition: 'device.battery < 20', severity: 'Info', channels: ['In-app'], enabled: false, triggered24h: 1 },
];

export const mockNotifications: Notification[] = [
  { id: 'N-01', title: 'Work order WO-5002 assigned to you', body: 'Emergency server thermal shutdown risk — due in 1 day.', category: 'Maintenance', read: false, at: hoursAgo(1) },
  { id: 'N-02', title: 'AI insight: rebalance idle X-Ray units', body: '3 units in North Wing under 10% utilization.', category: 'AI', read: false, at: hoursAgo(5) },
  { id: 'N-03', title: 'PO-2203 received', body: '4× PowerEdge R740 Fan Module received into WH-3.', category: 'Inventory', read: true, at: daysAgo(1) },
  { id: 'N-04', title: 'Custody exception on Infusion Pump #12', body: 'No check-out logged before geofence exit.', category: 'Compliance', read: false, at: hoursAgo(4) },
  { id: 'N-05', title: 'Ultrasound calibration due in 9 days', body: 'Joint Commission biomed inspection scheduled.', category: 'Compliance', read: true, at: daysAgo(2) },
  { id: 'N-06', title: 'Firmware OTA completed', body: 'Zebra RFID Gateway fleet updated to v4.8.2.', category: 'IoT', read: true, at: daysAgo(3) },
];

// ─────────────────────────────────────────────────────────────────────────────
// Compliance & Audit
// ─────────────────────────────────────────────────────────────────────────────
export const mockAuditLog: AuditRecord[] = [
  { id: 'AU-01', actor: 'Sarah Jenkins', action: 'ASSET_TRANSFER', target: 'AST-1001', category: 'Asset', timestamp: hoursAgo(2), ip: '10.4.2.31' },
  { id: 'AU-02', actor: 'James Park', action: 'WORKORDER_OPEN', target: 'WO-5002', category: 'Maintenance', timestamp: hoursAgo(6), ip: '10.4.2.44' },
  { id: 'AU-03', actor: 'AI Engine', action: 'INSIGHT_GENERATED', target: 'INS-9001', category: 'AI', timestamp: hoursAgo(3), ip: 'system' },
  { id: 'AU-04', actor: 'John Doe', action: 'ROLE_ASSIGNED', target: 'U-004 → Technician', category: 'Admin', timestamp: daysAgo(1), ip: '10.4.2.10' },
  { id: 'AU-05', actor: 'IT Ops Team', action: 'ASSET_RELOCATE', target: 'AST-1003', category: 'Asset', timestamp: daysAgo(40), ip: '10.4.2.51' },
  { id: 'AU-06', actor: 'Diego Martinez', action: 'INSPECTION_SUBMIT', target: 'INSP-01', category: 'Compliance', timestamp: minsAgo(120), ip: '10.4.9.12' },
  { id: 'AU-07', actor: 'Procurement', action: 'PO_APPROVE', target: 'PO-2202', category: 'Inventory', timestamp: daysAgo(1), ip: '10.4.2.77' },
  { id: 'AU-08', actor: 'Security Officer', action: 'ALERT_ESCALATE', target: 'ALT-03', category: 'Security', timestamp: hoursAgo(50), ip: '10.4.9.5' },
  { id: 'AU-09', actor: 'Biomed', action: 'CERT_UPLOAD', target: 'AST-1010', category: 'Compliance', timestamp: daysAgo(45), ip: '10.4.5.22' },
  { id: 'AU-10', actor: 'John Doe', action: 'INTEGRATION_CONNECT', target: 'SAP ERP', category: 'Admin', timestamp: daysAgo(6), ip: '10.4.2.10' },
];

export const mockCycleCounts: CycleCount[] = [
  { id: 'CC-01', location: 'Central Warehouse · Loading Dock', status: 'Reconciled', counted: 338, expected: 340, date: daysAgo(3), assignedTo: 'Sarah Jenkins' },
  { id: 'CC-02', location: 'Central Warehouse · Main Warehouse', status: 'Variance', counted: 1172, expected: 1180, date: daysAgo(1), assignedTo: 'Marcus Bell' },
  { id: 'CC-03', location: 'General Hospital · North Wing', status: 'In Progress', counted: 410, expected: 620, date: NOW, assignedTo: 'Nursing Station 2B' },
  { id: 'CC-04', location: 'Data Center · Rack Rows', status: 'Scheduled', counted: 0, expected: 175, date: daysAhead(2), assignedTo: 'IT Ops Team' },
];

export const mockCertifications: Certification[] = [
  { id: 'CERT-01', assetId: 'AST-1002', assetName: 'Portable X-Ray Machine', name: 'Radiation Safety', authority: 'State Health Dept', issuedAt: daysAgo(300), expiresAt: daysAhead(65), status: 'Valid' },
  { id: 'CERT-02', assetId: 'AST-1010', assetName: 'Ultrasound Scanner U-9', name: 'Biomed Calibration', authority: 'Joint Commission', issuedAt: daysAgo(320), expiresAt: daysAhead(20), status: 'Expiring' },
  { id: 'CERT-03', assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X', name: 'OSHA Operator Cert', authority: 'OSHA', issuedAt: daysAgo(200), expiresAt: daysAhead(160), status: 'Valid' },
  { id: 'CERT-04', assetId: 'AST-1004', assetName: 'HVAC Rooftop Unit B', name: 'EPA Refrigerant Handling', authority: 'EPA', issuedAt: daysAgo(400), expiresAt: daysAgo(35), status: 'Expired' },
  { id: 'CERT-05', assetId: 'AST-1011', assetName: 'Diesel Generator 250kW', name: 'Emissions Compliance', authority: 'State EPA', issuedAt: daysAgo(150), expiresAt: daysAhead(215), status: 'Valid' },
  { id: 'CERT-06', assetId: 'AST-1013', assetName: 'Cold Chain Reefer Unit', name: 'Cold Chain Validation', authority: 'GDP Auditor', issuedAt: daysAgo(280), expiresAt: daysAhead(12), status: 'Expiring' },
];

export const mockCustody: CustodyRecord[] = [
  { id: 'CU-01', assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X', holder: 'Sarah Jenkins', action: 'Assigned', at: daysAgo(12), by: 'Facility Manager' },
  { id: 'CU-02', assetId: 'AST-1001', assetName: 'Caterpillar Forklift Model X', holder: 'Diego Martinez', action: 'Checked Out', at: hoursAgo(6), by: 'Kiosk WH-1' },
  { id: 'CU-03', assetId: 'AST-1006', assetName: 'Infusion Pump Fleet #12', holder: 'Nursing Station 2B', action: 'Assigned', at: daysAgo(30), by: 'Biomed' },
  { id: 'CU-04', assetId: 'AST-1006', assetName: 'Infusion Pump Fleet #12', holder: 'Unknown', action: 'Transferred', at: hoursAgo(52), by: 'System (geofence exit — no check-out)' },
  { id: 'CU-05', assetId: 'AST-1003', assetName: 'Dell PowerEdge R740 Server', holder: 'IT Ops Team', action: 'Assigned', at: daysAgo(40), by: 'IT Manager' },
  { id: 'CU-06', assetId: 'AST-1005', assetName: 'Ford Transit Delivery Van', holder: 'Marcus Bell', action: 'Checked Out', at: hoursAgo(8), by: 'Fleet Kiosk' },
  { id: 'CU-07', assetId: 'AST-1002', assetName: 'Portable X-Ray Machine', holder: 'Dr. Robert Chen', action: 'Assigned', at: daysAgo(90), by: 'Biomed' },
  { id: 'CU-08', assetId: 'AST-1010', assetName: 'Ultrasound Scanner U-9', holder: 'Dr. Amara Osei', action: 'Checked In', at: hoursAgo(30), by: 'Radiology Kiosk' },
];
export const getCustodyForAsset = (assetId: string): CustodyRecord[] =>
  mockCustody.filter((c) => c.assetId === assetId).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

// ─────────────────────────────────────────────────────────────────────────────
// Administration & Platform
// ─────────────────────────────────────────────────────────────────────────────
export const mockIntegrations: Integration[] = [
  { id: 'INT-01', name: 'SAP ERP', category: 'ERP / Finance', status: 'Connected', lastSync: minsAgo(15), description: 'Depreciation & GL sync for asset book values.' },
  { id: 'INT-02', name: 'ServiceNow', category: 'ITSM', status: 'Connected', lastSync: minsAgo(45), description: 'Bi-directional incident & work-order sync.' },
  { id: 'INT-03', name: 'Okta SSO', category: 'Identity', status: 'Connected', lastSync: minsAgo(2), description: 'SAML/OIDC single sign-on + SCIM provisioning.' },
  { id: 'INT-04', name: 'Slack', category: 'Comms', status: 'Connected', lastSync: minsAgo(5), description: 'Alert routing & digest notifications.' },
  { id: 'INT-05', name: 'Zebra RFID Cloud', category: 'IoT / RTLS', status: 'Connected', lastSync: minsAgo(1), description: 'RFID reader fleet ingestion adapter.' },
  { id: 'INT-06', name: 'Twilio SMS', category: 'Comms', status: 'Error', lastSync: hoursAgo(4), description: 'SMS escalation channel — auth token expired.' },
  { id: 'INT-07', name: 'Snowflake', category: 'Data Warehouse', status: 'Connected', lastSync: hoursAgo(1), description: 'Analytics export for BI & benchmarking.' },
  { id: 'INT-08', name: 'Samsara Telematics', category: 'IoT / GPS', status: 'Disconnected', lastSync: daysAgo(2), description: 'Fleet GPS/telematics — pending re-auth.' },
];

export const mockWorkflows: ApprovalWorkflow[] = [
  { id: 'WF-01', name: 'Asset Transfer Approval', trigger: 'asset.transfer requested', status: 'Active', steps: [{ name: 'Requester submits', approver: 'Custodian' }, { name: 'Facility approval', approver: 'Facility Manager' }, { name: 'Receiving confirm', approver: 'Receiving Clerk' }] },
  { id: 'WF-02', name: 'Disposal / Write-off', trigger: 'asset.retire requested', status: 'Active', steps: [{ name: 'Retirement request', approver: 'Asset Manager' }, { name: 'Finance sign-off', approver: 'Finance / Controller' }, { name: 'Disposal certificate', approver: 'Compliance Officer' }] },
  { id: 'WF-03', name: 'Purchase Order Approval', trigger: 'po.total > $5,000', status: 'Active', steps: [{ name: 'PO created', approver: 'Inventory Manager' }, { name: 'Budget approval', approver: 'Department Head' }] },
  { id: 'WF-04', name: 'Break-glass Access', trigger: 'privileged.access requested', status: 'Draft', steps: [{ name: 'Request + justification', approver: 'Requester' }, { name: 'Security review', approver: 'Security Admin' }] },
];

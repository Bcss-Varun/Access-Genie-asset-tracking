import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth, RequireModule } from './RequireAuth';
import { ComingSoon, NotFoundPage } from '@/components/ComingSoon';
import { RouteError } from './RouteError';

import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { AssetsPage } from '@/features/assets/AssetsPage';
import { AssetDetailPage } from '@/features/assets/AssetDetailPage';
import { NewAssetPage } from '@/features/assets/NewAssetPage';
import { LiveMapPage } from '@/features/tracking/LiveMapPage';
import { DevicesPage } from '@/features/tracking/DevicesPage';
import { GeofencesPage } from '@/features/tracking/GeofencesPage';
import { GatewaysPage } from '@/features/tracking/GatewaysPage';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { AlertRulesPage } from '@/features/alerts/AlertRulesPage';
import { WorkOrdersPage } from '@/features/maintenance/WorkOrdersPage';
import { WorkOrderDetailPage } from '@/features/maintenance/WorkOrderDetailPage';
import { NewWorkOrderPage } from '@/features/maintenance/NewWorkOrderPage';
import { InsightsPage } from '@/features/insights/InsightsPage';
import { UsersPage } from '@/features/admin/UsersPage';
import { RolesPage } from '@/features/admin/RolesPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { AuditPage } from '@/features/compliance/AuditPage';
import { CustodyPage } from '@/features/compliance/CustodyPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';

/**
 * The route tree.
 *
 * Everything below `RequireAuth` needs a session; module-gated branches sit
 * behind `RequireModule`, which mirrors the API's `requireModule` guard so a
 * user meets one clear explanation instead of a screen of 403s.
 *
 * Routes specced in the blueprint but not yet built resolve to `ComingSoon`,
 * so the (deliberately short) sidebar never dead-ends.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },

  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          // ── Workspace ──────────────────────────────────────────────────
          { index: true, element: <DashboardPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'dashboards', element: <ComingSoon /> },
          { path: 'copilot', element: <ComingSoon /> },

          // ── Pillar 1: Real-time tracking ───────────────────────────────
          {
            path: 'tracking',
            element: <RequireModule module="tracking" />,
            children: [
              { index: true, element: <LiveMapPage /> },
              { path: 'devices', element: <DevicesPage /> },
              { path: 'geofences', element: <GeofencesPage /> },
              { path: 'gateways', element: <GatewaysPage /> },
              { path: '*', element: <ComingSoon /> },
            ],
          },

          // ── Pillar 2: AI intelligence ──────────────────────────────────
          {
            path: 'insights',
            element: <RequireModule module="ai" />,
            children: [
              { index: true, element: <InsightsPage /> },
              { path: '*', element: <ComingSoon /> },
            ],
          },

          // ── Pillar 3: Passport & lifecycle ─────────────────────────────
          {
            path: 'assets',
            element: <RequireModule module="assets" />,
            children: [
              { index: true, element: <AssetsPage /> },
              // `new` precedes `:id` so it is not swallowed as an asset ID.
              { path: 'new', element: <NewAssetPage /> },
              { path: 'lifecycle', element: <ComingSoon /> },
              { path: 'financials', element: <ComingSoon /> },
              { path: 'import', element: <ComingSoon /> },
              { path: ':id', element: <AssetDetailPage /> },
            ],
          },

          // ── Pillar 4: Predictive maintenance ───────────────────────────
          {
            path: 'maintenance',
            element: <RequireModule module="maintenance" />,
            children: [
              { index: true, element: <WorkOrdersPage /> },
              { path: 'new', element: <NewWorkOrderPage /> },
              { path: 'calendar', element: <ComingSoon /> },
              { path: 'pm', element: <ComingSoon /> },
              { path: 'inspections', element: <ComingSoon /> },
              { path: ':id', element: <WorkOrderDetailPage /> },
            ],
          },

          // ── Pillar 5: Security & compliance ────────────────────────────
          {
            path: 'alerts',
            children: [
              { index: true, element: <AlertsPage /> },
              { path: 'rules', element: <AlertRulesPage /> },
            ],
          },
          { path: 'audit', element: <AuditPage /> },
          { path: 'custody', element: <CustodyPage /> },
          { path: 'compliance/*', element: <ComingSoon /> },

          // ── Pillar 6: Mobile workforce ─────────────────────────────────
          { path: 'field-ops/*', element: <ComingSoon /> },
          { path: 'field-ops', element: <ComingSoon /> },

          // ── Supporting ─────────────────────────────────────────────────
          {
            path: 'inventory',
            element: <RequireModule module="inventory" />,
            children: [
              { index: true, element: <InventoryPage /> },
              { path: '*', element: <ComingSoon /> },
            ],
          },
          { path: 'reports', element: <ComingSoon /> },
          { path: 'reports/*', element: <ComingSoon /> },
          { path: 'settings/*', element: <ComingSoon /> },

          {
            path: 'admin',
            element: <RequireModule module="admin" />,
            children: [
              { index: true, element: <Navigate to="/admin/users" replace /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'roles', element: <RolesPage /> },
              { path: '*', element: <ComingSoon /> },
            ],
          },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

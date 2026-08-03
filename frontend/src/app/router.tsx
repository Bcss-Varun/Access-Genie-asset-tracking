import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth, RequireModule } from './RequireAuth';
import { NotFoundPage } from '@/components/ComingSoon';
import { RouteError } from './RouteError';
import { prototypeRoutes } from './prototype-routes';

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
 * Two sources feed it:
 *
 *  1. **API-backed screens** (below) — these read and write the live MongoDB
 *     through the REST API.
 *  2. **`prototypeRoutes`** — the remaining 99 screens ported from the Next.js
 *     prototype, rendering the fixture dataset. Code-split, so they cost
 *     nothing until visited.
 *
 * The two sets are disjoint: the generator excludes every path declared below,
 * so no path is registered twice. Where both could exist, the live version
 * wins by construction — a fixture-keyed detail page cannot show an asset
 * created through the app, so it must never own that route.
 *
 * Module-gated branches sit behind `RequireModule`, mirroring the API's
 * `requireModule` guard, so a user meets one clear explanation instead of a
 * screen full of 403s.
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
          ...prototypeRoutes,

          // ── Workspace ──────────────────────────────────────────────────
          { index: true, element: <DashboardPage /> },
          { path: 'notifications', element: <NotificationsPage /> },

          // ── Pillar 1: Real-time tracking ───────────────────────────────
          {
            element: <RequireModule module="tracking" />,
            children: [
              { path: 'tracking', element: <LiveMapPage /> },
              { path: 'sensors', element: <DevicesPage /> },
              { path: 'geofences', element: <GeofencesPage /> },
              { path: 'gateways', element: <GatewaysPage /> },
            ],
          },

          // ── Pillar 2: AI intelligence ──────────────────────────────────
          {
            element: <RequireModule module="ai" />,
            children: [{ path: 'ai-insights', element: <InsightsPage /> }],
          },

          // ── Pillar 3: Passport & lifecycle ─────────────────────────────
          {
            element: <RequireModule module="assets" />,
            children: [
              { path: 'assets', element: <AssetsPage /> },
              // `new` precedes `:id` so it is not swallowed as an asset ID.
              { path: 'assets/new', element: <NewAssetPage /> },
              { path: 'assets/:id', element: <AssetDetailPage /> },
            ],
          },

          // ── Pillar 4: Predictive maintenance ───────────────────────────
          {
            element: <RequireModule module="maintenance" />,
            children: [
              { path: 'maintenance', element: <WorkOrdersPage /> },
              { path: 'maintenance/new', element: <NewWorkOrderPage /> },
              { path: 'maintenance/:id', element: <WorkOrderDetailPage /> },
            ],
          },

          // ── Pillar 5: Security & compliance ────────────────────────────
          { path: 'alerts', element: <AlertsPage /> },
          { path: 'alert-rules', element: <AlertRulesPage /> },
          { path: 'audit-log', element: <AuditPage /> },
          { path: 'custody', element: <CustodyPage /> },

          // ── Supporting ─────────────────────────────────────────────────
          {
            element: <RequireModule module="inventory" />,
            children: [{ path: 'inventory', element: <InventoryPage /> }],
          },
          {
            element: <RequireModule module="admin" />,
            children: [
              { path: 'admin/users', element: <UsersPage /> },
              { path: 'admin/roles', element: <RolesPage /> },
            ],
          },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

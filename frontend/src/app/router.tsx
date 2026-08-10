import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from '@/components/providers/AppProviders';
import { RequireAuth } from './RequireAuth';
import { RequireDataset, RequireLabelWorkspace, RequireTrackingWorkspace } from './DataGate';
import { RouteError } from './RouteError';
import { LABELS_PATH, pageRoutes, TRACKING_PREFIX } from './page-routes';

import LoginPage from '@/pages/auth/login/page';
import ForgotPasswordPage from '@/pages/auth/forgot-password/page';
import MfaPage from '@/pages/auth/mfa/page';
import DashboardPage from '@/pages/page';
import ComingSoonPage from '@/pages/coming-soon/page';

/**
 * The route tree.
 *
 * Three concentric guards, outermost first:
 *
 *   RequireAuth      — is there a session? Otherwise → /login.
 *   RequireDataset   — has the reference dataset arrived? The screens read it
 *                      from module bindings, so nothing inside may render first.
 *   AppShell         — the chrome, with the routed screen in its <Outlet/>.
 *
 * The tracking workspace sits behind a fourth guard of its own, because it has a
 * separate (larger, live-refreshing) payload that only its own screens need.
 *
 * Every screen under `pageRoutes` is code-split — see scripts/port-prototype.mjs,
 * which generates that file — so opening the app loads the shell and one route,
 * not a hundred and twenty.
 */
const isTracking = (r: { path?: string }) => String(r.path).startsWith(TRACKING_PREFIX);
const isLabels = (r: { path?: string }) => String(r.path) === LABELS_PATH;

const trackingRoutes = pageRoutes.filter(isTracking);
const labelRoutes = pageRoutes.filter(isLabels);
const generalRoutes = pageRoutes.filter((r) => !isTracking(r) && !isLabels(r));

export const router = createBrowserRouter([
  // ── Public ─────────────────────────────────────────────────────────────────
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  { path: '/forgot-password', element: <ForgotPasswordPage />, errorElement: <RouteError /> },
  { path: '/mfa', element: <MfaPage />, errorElement: <RouteError /> },

  // ── Authenticated ──────────────────────────────────────────────────────────
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <RequireDataset />,
        children: [
          {
            // The data-dependent providers seed from the loaded dataset, so
            // they mount inside the gate and outside the chrome.
            element: (
              <AppProviders>
                <AppShell />
              </AppProviders>
            ),
            children: [
              { index: true, element: <DashboardPage /> },

              // The eight role dashboards and the gallery that listed them are
              // now one screen at `/`. Old links — bookmarks, printed decks,
              // breadcrumbs still in the wild — land there rather than on the
              // "coming soon" catch-all below.
              { path: 'dashboards', element: <Navigate to="/" replace /> },
              { path: 'dashboards/*', element: <Navigate to="/" replace /> },

              // Mobile Workforce's old "Field Operations" screen is now
              // "Workforce Overview" at a route of its own. Same reasoning as
              // the dashboards redirect above: existing links must still land
              // somewhere real.
              { path: 'field-ops', element: <Navigate to="/workforce" replace /> },

              // Scan-to-open. Declared here rather than in the generated route
              // list because it is a contract with something physical — the URL
              // is printed on labels already in the field, so it must not move
              // when the generator is next run.
              {
                path: 'a/:code',
                lazy: async () => ({ Component: (await import('@/pages/a/[code]/page')).default }),
              },

              ...generalRoutes,

              {
                element: <RequireTrackingWorkspace />,
                children: trackingRoutes,
              },
              {
                element: <RequireLabelWorkspace />,
                children: labelRoutes,
              },

              // Routes the blueprint specifies but the build has not reached
              // yet resolve here, so navigation never dead-ends on a 404.
              { path: '*', element: <ComingSoonPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ModuleKey } from '@access-genie/shared';
import { useAuth } from '@/api/auth';
import { ErrorState } from '@/components/ui/primitives';

/** Gate for the whole authenticated tree. */
export function RequireAuth() {
  const { session, isBootstrapping } = useAuth();
  const location = useLocation();

  // Hold the render until the silent refresh settles, otherwise every reload
  // flashes the login screen before restoring the session.
  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-primary-500 animate-spin" />
          Restoring your session…
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <Outlet />;
}

/**
 * Gate for a module's routes. The API refuses these requests anyway; this turns
 * what would be a wall of 403 error states into one clear explanation.
 */
export function RequireModule({ module }: { module: ModuleKey }) {
  const { can } = useAuth();

  if (!can(module)) {
    return (
      <ErrorState
        title="You do not have access to this module"
        description={`Your role does not include the "${module}" grant. An organization admin can change that under Users & Roles.`}
      />
    );
  }

  return <Outlet />;
}

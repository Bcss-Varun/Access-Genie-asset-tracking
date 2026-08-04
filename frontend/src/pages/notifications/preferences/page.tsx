import { Navigate } from 'react-router-dom';

/**
 * Notification preferences live under Settings.
 *
 * There were two of these screens — this one and `/settings/notifications` —
 * with different category lists, different channel lists and separate local
 * state. Whichever you saved last, the other still showed its own defaults, and
 * neither wrote anything anywhere.
 *
 * One screen, one source of truth. This route stays so the link from the
 * notification list keeps working, and redirects to it.
 */
export default function NotificationPreferencesPage() {
  return <Navigate to="/settings/notifications" replace />;
}

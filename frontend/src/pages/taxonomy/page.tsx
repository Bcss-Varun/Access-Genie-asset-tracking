import { Navigate } from 'react-router-dom';

/**
 * The docs/22 §22.10 IA plan renames this to Administration ▸ Asset Classes &
 * Templates at `/admin/classes`, but that page doesn't exist yet — the class
 * editor still lives at `/assets/templates`. Point the old URL there instead
 * of a route with no matching page.
 */
export default function TaxonomyRedirect() {
  return <Navigate to='/assets/templates' replace />;
}

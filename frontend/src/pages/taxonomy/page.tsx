import { Navigate } from 'react-router-dom';

/** Moved to Administration ▸ Asset Classes & Templates (docs/22 §22.10). */
export default function TaxonomyRedirect() {
  return <Navigate to='/admin/classes' replace />;
}

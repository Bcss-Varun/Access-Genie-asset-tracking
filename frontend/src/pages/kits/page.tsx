import { Navigate } from 'react-router-dom';

/** Kits & Bundles retired for IT: permanent composition belongs on
 *  Asset 360 ▸ Components, and issuing several assets to one person is
 *  custody, not a new object type (docs/22 §22.4.3). */
export default function KitsRedirect() {
  return <Navigate to='/assets' replace />;
}

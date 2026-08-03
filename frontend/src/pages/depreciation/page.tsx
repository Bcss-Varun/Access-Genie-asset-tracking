import { Navigate } from 'react-router-dom';

/** Depreciation Schedules retired — Financials already carries book value and
 *  accumulated depreciation; the per-asset schedule is on Asset 360 ▸
 *  Commercial (docs/22 §22.2 item 9). */
export default function DepreciationRedirect() {
  return <Navigate to='/financials' replace />;
}

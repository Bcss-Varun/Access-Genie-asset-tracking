import { Navigate, useParams } from 'react-router-dom';

/** Old per-class route → the class editor. */
export default function TaxonomyClassRedirect() {
  const { class: id = '' } = useParams();
  return <Navigate to={`/admin/classes/${id}`} replace />;
}

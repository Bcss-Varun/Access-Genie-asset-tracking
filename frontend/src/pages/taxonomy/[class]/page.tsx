import { Navigate, useParams } from 'react-router-dom';

/** Old per-class route → the class editor, which still lives under Templates. */
export default function TaxonomyClassRedirect() {
  const { class: id = '' } = useParams();
  return <Navigate to={`/assets/templates/${id}`} replace />;
}

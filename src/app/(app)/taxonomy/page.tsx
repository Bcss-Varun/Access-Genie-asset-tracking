import { redirect } from 'next/navigation';

/** Moved to Administration ▸ Asset Classes & Templates (docs/22 §22.10). */
export default function TaxonomyRedirect() {
  redirect('/admin/classes');
}

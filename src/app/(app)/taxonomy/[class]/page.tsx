import { redirect } from 'next/navigation';

/** Old per-class route → the class editor. */
export default async function TaxonomyClassRedirect({ params }: { params: Promise<{ class: string }> }) {
  const { class: id } = await params;
  redirect(`/admin/classes/${id}`);
}

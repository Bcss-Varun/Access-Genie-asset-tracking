import type {
  AddAssetSource,
  Asset,
  AssetTemplate,
  ClonePrefill,
  DerivedField,
  FieldDef,
  RegistrationDefaults,
  RegistrationValidation,
  SectionKey,
  SectionDef,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';

/**
 * The add-asset flow's API surface.
 *
 * The form is *described by the server*, not by this client: `form()` returns
 * which fields to render and which are required, and that answer depends on a
 * template stored in the database. Keeping the decision server-side is what
 * lets a template author change the form without a frontend deploy — and it is
 * why there is no local copy of the field list anywhere in the frontend.
 */

/** A catalogue field plus the decision the server made about it. */
export type FormField = FieldDef & { required: boolean; defaultValue?: string | number | boolean };

export interface RegistrationForm {
  source: AddAssetSource;
  templateId: string | null;
  fields: FormField[];
  /** Saved but never asked for — minted numbers, and whatever the template fixed. */
  derived: DerivedField[];
}

export interface FieldCatalog {
  sections: (SectionDef & { fields: FieldDef[] })[];
  coreFields: string[];
  identityFields: string[];
}

/** What the form holds while someone is filling it in. */
export type DraftValues = Record<string, string | number | boolean | null>;

export interface DraftBody {
  source: AddAssetSource;
  templateId?: string;
  cloneOfId?: string;
  values: DraftValues;
}

export const registrationApi = {
  /** Every field there is, grouped by section — what the template editor picks from. */
  catalog: () => apiGet<FieldCatalog>('/assets/registration/catalog'),

  /** Your site, your name — so nobody types what the system already knows. */
  defaults: () => apiGet<RegistrationDefaults>('/assets/registration/defaults'),

  /** The fields to render for one source. */
  form: (source: AddAssetSource, templateId?: string) =>
    apiGet<RegistrationForm>('/assets/registration/form', { source, ...(templateId ? { templateId } : {}) }),

  /**
   * Check without committing.
   *
   * Returns 200 with `valid: false` rather than an error status — it is a
   * question, not a failed write, and the form asks it on every section blur.
   */
  validate: (body: DraftBody) => apiPost<RegistrationValidation>('/assets/registration/validate', body),

  /** Commit. 422 carries `details[].path` as the field key. */
  register: (body: DraftBody) => apiPost<Asset>('/assets/registration', body),

  /** Everything about an asset except what identifies that one unit. */
  cloneSource: (id: string) => apiGet<ClonePrefill>(`/assets/${id}/clone-source`),
};

export interface TemplateFilters {
  status?: 'active' | 'archived' | 'all';
  category?: string;
  q?: string;
}

export const templatesApi = {
  list: (filters: TemplateFilters = {}) =>
    apiList<AssetTemplate>('/assets/templates', filters as Record<string, unknown>),
  get: (id: string) => apiGet<AssetTemplate>(`/assets/templates/${id}`),
  create: (input: Record<string, unknown>) => apiPost<AssetTemplate>('/assets/templates', input),
  update: (id: string, input: Record<string, unknown>) =>
    apiPatch<AssetTemplate>(`/assets/templates/${id}`, input),
  /** Archives rather than deletes — assets keep a reference to their template. */
  archive: (id: string) => apiDelete<AssetTemplate>(`/assets/templates/${id}`),
};

/** Section order for rendering, matching the server's canonical order. */
export const SECTION_ORDER: SectionKey[] = [
  'identity',
  'assignment',
  'location',
  'technical',
  'commercial',
  'maintenance',
  'tracking',
];

import { model, Schema } from 'mongoose';
import {
  ASSET_CATEGORIES,
  FIELD_TYPES,
  REGISTRATION_SECTIONS,
  type AssetCategory,
  type FieldType,
  type SectionKey,
  type TemplateCustomField,
  type TemplateField,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * A template: someone's decision about which questions this kind of asset is
 * worth asking, made once instead of on every registration.
 *
 * Kept in its own collection rather than on the asset class. A class is a
 * policy object — depreciation, PM plan, tracking expectation — and it changes
 * rarely and with consequence. A template is a data-entry convenience: people
 * make several per class, rename them, archive them and try again. Binding the
 * two would mean editing depreciation policy to reorder a form.
 *
 * `fields` holds catalogue keys; `customFields` defines anything the catalogue
 * does not cover, and those land in `onboarding.attributes` on the asset. Both
 * carry `required`, which is the template author's call and the reason the
 * feature exists.
 */
export interface AssetTemplateDoc {
  _id: string; // TPL-1
  name: string;
  description: string;
  icon: string;
  category: AssetCategory;
  fields: TemplateField[];
  customFields: TemplateCustomField[];
  status: 'active' | 'archived';
  usageCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const templateFieldSchema = new Schema<TemplateField>(
  {
    key: { type: String, required: true },
    required: { type: Boolean, default: false },
    defaultValue: { type: Schema.Types.Mixed },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const customFieldSchema = new Schema<TemplateCustomField>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    section: { type: String, required: true, enum: REGISTRATION_SECTIONS as unknown as SectionKey[] },
    type: { type: String, required: true, enum: FIELD_TYPES as unknown as FieldType[] },
    options: { type: [String], default: undefined },
    unit: String,
    help: String,
    required: { type: Boolean, default: false },
    identity: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const assetTemplateSchema = new Schema<AssetTemplateDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '📋' },
    category: { type: String, required: true, enum: ASSET_CATEGORIES, index: true },
    fields: { type: [templateFieldSchema], default: [] },
    customFields: { type: [customFieldSchema], default: [] },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    /**
     * Incremented when an asset is registered from this template. Stored rather
     * than counted because the asset keeps only `templateId`, and a template
     * that has been archived should still be able to say how much it was used.
     */
    usageCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

assetTemplateSchema.plugin(baseSchemaPlugin);

// Names are unique among the templates still in use. Archiving one frees its
// name, which is what someone replacing a template actually wants.
assetTemplateSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

export const AssetTemplate = model<AssetTemplateDoc>('AssetTemplate', assetTemplateSchema);

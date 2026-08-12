import { model, Schema } from 'mongoose';
import {
  SHIFT_LABELS,
  TECHNICIAN_SKILLS,
  WEEKDAY_LABELS,
  type ShiftLabel,
  type TechnicianSkill,
  type WeekdayLabel,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * A field technician on the Mobile Workforce roster.
 *
 * `location` mirrors `AssetDoc.location` on purpose — it is what lets the
 * dataset endpoint narrow the roster with the exact same `'location.id': {
 * $in: [...scope.ids] }` filter it already applies to assets, so a facility
 * picked in the org switcher shows the same technicians everywhere it shows
 * anything else. `status` is not stored here at all: it is derived at read
 * time from shift + working days + the technician's open work orders (see
 * frontend `lib/technicians.ts`), so it can never drift from what is actually
 * happening in the field.
 */
export interface TechnicianDoc {
  _id: string; // TECH-01
  name: string;
  title: string;
  department: string;
  skills: TechnicianSkill[];
  location: { id: string; name: string };
  shift: { label: ShiftLabel; start: number; end: number };
  workingDays: WeekdayLabel[];
  email: string;
  phone: string;
  active: boolean;
  onLeaveUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const technicianSchema = new Schema<TechnicianDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true, index: true },
    skills: { type: [String], enum: TECHNICIAN_SKILLS, default: [] },
    location: {
      id: { type: String, required: true },
      name: { type: String, required: true },
    },
    shift: {
      label: { type: String, required: true, enum: SHIFT_LABELS },
      start: { type: Number, required: true, min: 0, max: 24 },
      end: { type: Number, required: true, min: 0, max: 24 },
    },
    workingDays: { type: [String], enum: WEEKDAY_LABELS, default: [] },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
    onLeaveUntil: { type: Date },
  },
  { timestamps: true },
);

technicianSchema.plugin(baseSchemaPlugin);
technicianSchema.index({ name: 'text', department: 'text' }, { name: 'technician_search' });
technicianSchema.index({ 'location.id': 1 });

export const Technician = model<TechnicianDoc>('Technician', technicianSchema);

import { ScopeNodeModel, Technician, WorkOrder, nextId, type TechnicianDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import type { CreateTechnicianInput, UpdateTechnicianInput } from '../validators/technician.validator.js';

/**
 * The Mobile Workforce roster.
 *
 * A technician's `location` is resolved from a scope node id, the same way an
 * asset's is — that is what lets `dataset.service.ts` narrow the roster with
 * the org switcher's own `'location.id'` filter, and what stops a facility
 * from ever having its own disconnected copy of "who works here".
 */

async function resolveLocation(locationId: string): Promise<{ id: string; name: string }> {
  const node = await ScopeNodeModel.findById(locationId).lean();
  if (!node) throw ApiError.badRequest('Unknown facility');
  if (node.level !== 'facility') throw ApiError.badRequest('A technician must be based at a facility');
  return { id: node._id, name: node.name };
}

export async function listTechnicians(): Promise<TechnicianDoc[]> {
  return Technician.find().sort({ name: 1 }).lean();
}

export async function createTechnician(input: CreateTechnicianInput): Promise<TechnicianDoc> {
  const location = await resolveLocation(input.locationId);

  const existing = await Technician.findOne({ email: input.email.toLowerCase() }).lean();
  if (existing) throw ApiError.conflict('A technician with that email already exists');

  const technician = await Technician.create({
    _id: await nextId('technician', 'TECH'),
    name: input.name,
    title: input.title,
    department: input.department,
    skills: input.skills,
    location,
    shift: input.shift,
    workingDays: input.workingDays,
    email: input.email.toLowerCase(),
    phone: input.phone ?? '',
    active: true,
  });

  return technician.toObject();
}

export async function updateTechnician(id: string, input: UpdateTechnicianInput): Promise<TechnicianDoc> {
  const technician = await Technician.findById(id);
  if (!technician) throw ApiError.notFound('Technician');

  const { locationId, onLeaveUntil, ...rest } = input;
  const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  Object.assign(technician, defined);

  if (locationId) technician.location = await resolveLocation(locationId);
  if (onLeaveUntil !== undefined) {
    technician.onLeaveUntil = onLeaveUntil ? new Date(onLeaveUntil) : undefined;
  }

  // Deactivating someone still holding open work is a data-integrity
  // question, not a hard block — the manager may be doing this precisely
  // because the technician has left mid-assignment — so this only warns via
  // the response the controller sends, never refuses the write.
  await technician.save();
  return technician.toObject();
}

export async function openWorkCountFor(name: string): Promise<number> {
  return WorkOrder.countDocuments({ assignedTo: name, status: { $nin: ['Completed', 'Cancelled'] } });
}

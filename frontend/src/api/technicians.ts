import type { ShiftLabel, Technician, TechnicianSkill, WeekdayLabel } from '@access-genie/shared';
import { apiPatch, apiPost } from '@/api/client';

/**
 * The Mobile Workforce roster. Reads come in through the main `/dataset`
 * payload, scoped by the org switcher the same way assets are — see
 * `dataset.service.ts`. This is only the write side: adding someone to the
 * roster, or editing their profile, skills or leave status.
 */
export const technicianApi = {
  create: (input: {
    name: string;
    title: string;
    department: string;
    skills: TechnicianSkill[];
    locationId: string;
    shift: { label: ShiftLabel; start: number; end: number };
    workingDays: WeekdayLabel[];
    email: string;
    phone?: string;
  }) => apiPost<Technician>('/technicians', input),

  update: (
    id: string,
    input: Partial<{
      name: string;
      title: string;
      department: string;
      skills: TechnicianSkill[];
      locationId: string;
      shift: { label: ShiftLabel; start: number; end: number };
      workingDays: WeekdayLabel[];
      email: string;
      phone: string;
      active: boolean;
      /** Empty string clears an existing leave date. */
      onLeaveUntil: string;
    }>,
  ) => apiPatch<Technician>(`/technicians/${id}`, input),
};

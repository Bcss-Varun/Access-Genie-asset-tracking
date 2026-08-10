import { z } from 'zod';
import { LIFECYCLE_STAGES } from '@access-genie/shared';

/** Body of `POST /assets/:id/lifecycle/transition`. */
export const transitionSchema = z.object({
  toStage: z.enum(LIFECYCLE_STAGES),
  reason: z.string().trim().min(3).max(400),
  comments: z.string().trim().max(1000).optional(),
  documentIds: z.array(z.string().trim().min(1)).max(20).optional(),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

/** Body of `POST /assets/lifecycle/bulk-transition`. */
export const bulkTransitionSchema = transitionSchema.extend({
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
});
export type BulkTransitionInput = z.infer<typeof bulkTransitionSchema>;

/** Body of `POST /assets/lifecycle/transitions/:id/decide`. */
export const decideSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
});
export type DecideInput = z.infer<typeof decideSchema>;

import type { Reservation, Transfer, TransferStatus } from '@access-genie/shared';
import { apiGet, apiPost } from '@/api/client';

/**
 * Asset transfers and reservations.
 *
 * The server owns both sets of rules — a transfer cannot be approved by whoever
 * requested it, and a reservation cannot overlap an existing booking — so the
 * screens submit and render the refusal rather than pre-checking.
 */
export const operationsApi = {
  transfers: () => apiGet<Transfer[]>('/operations/transfers'),
  requestTransfer: (input: { assetId: string; to: string; reason: string }) =>
    apiPost<Transfer>('/operations/transfers', input),
  advanceTransfer: (id: string, status: TransferStatus) =>
    apiPost<Transfer>(`/operations/transfers/${id}/status`, { status }),

  reservations: () => apiGet<Reservation[]>('/operations/reservations'),
  reserve: (input: {
    assetId: string;
    reservedBy: string;
    startDay: number;
    endDay: number;
    startLabel: string;
    endLabel: string;
  }) => apiPost<Reservation>('/operations/reservations', input),
  cancelReservation: (id: string) => apiPost<Reservation>(`/operations/reservations/${id}/cancel`),
};

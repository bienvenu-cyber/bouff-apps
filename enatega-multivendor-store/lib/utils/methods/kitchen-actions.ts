export function kitchenAction(status: string | undefined, takeaway: boolean): 'ready' | 'handover' | null {
  if (status === 'ACCEPTED') return 'ready';
  if (status === 'ASSIGNED' && takeaway) return 'handover';
  return null;
}
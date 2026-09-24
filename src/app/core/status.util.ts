import { AccessStatus, PlanState, PlanStatus } from '../models';

export type Tone = 'success' | 'warning' | 'critical' | 'neutral' | 'accent';

export function accessStatusTone(status: AccessStatus): Tone {
  switch (status) {
    case 'ENABLED':
      return 'success';
    case 'HIDDEN':
      return 'warning';
    case 'DISABLED':
    default:
      return 'neutral';
  }
}

export function subscriptionStatusTone(status: PlanStatus): Tone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'UPCOMING':
      return 'accent';
    case 'SUSPENDED':
      return 'warning';
    case 'EXPIRED':
    case 'CANCELLED':
    case 'UNSUBSCRIBED':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function planStateTone(state: PlanState): Tone {
  switch (state) {
    case 'ACTIVE':
      return 'success';
    case 'DRAFT':
      return 'accent';
    case 'ARCHIVED':
      return 'neutral';
  }
}

// null = the subscription has no end date (open-ended). new Date(null) is 1 Jan 1970, which used to
// turn an open-ended subscription into one that expired ~20,000 days ago.
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const target = parsed.setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86_400_000);
}

// For sorting by expiry: open-ended subscriptions (no end date) go after every dated one.
export function sortableDays(iso: string | null | undefined): number {
  return daysUntil(iso) ?? Number.MAX_SAFE_INTEGER;
}

export function countdownTone(days: number | null): Tone {
  if (days === null) return 'neutral';
  if (days < 0) return 'critical';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'success';
}

export function countdownLabel(days: number | null): string {
  if (days === null) return 'no end date';
  if (days === 0) return 'today';
  if (days < 0) return `${Math.abs(days)}d ago`;
  return `in ${days}d`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatLimit(value: number): string {
  return value === -1 ? '∞' : value.toLocaleString('en-US');
}

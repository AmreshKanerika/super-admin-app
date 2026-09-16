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

export function daysUntil(iso: string): number {
  const target = new Date(iso).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86_400_000);
}

export function countdownTone(days: number): Tone {
  if (days < 0) return 'critical';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'success';
}

export function countdownLabel(days: number): string {
  if (days === 0) return 'today';
  if (days < 0) return `${Math.abs(days)}d ago`;
  return `in ${days}d`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatLimit(value: number): string {
  return value === -1 ? '∞' : value.toLocaleString('en-US');
}

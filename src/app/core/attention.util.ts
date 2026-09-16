import type { OrgOverviewRow } from '../services/overview.service';

export interface AttentionReason {
  label: string;
  action: string;
  priority: number;
}

export function attentionReasons(row: OrgOverviewRow): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (row.subscription?.planStatus === 'EXPIRED') {
    reasons.push({ label: 'Subscription expired', action: 'Review the plan and extend or replace the subscription.', priority: 0 });
  }
  if (row.subscription?.planStatus === 'SUSPENDED') {
    reasons.push({ label: 'Subscription suspended', action: 'Review the suspension reason before reactivating access.', priority: 1 });
  }
  if (row.subscription?.planStatus === 'ACTIVE' && row.daysToExpiry !== null && row.daysToExpiry >= 0 && row.daysToExpiry <= 30) {
    reasons.push({ label: `Expires in ${row.daysToExpiry} days`, action: 'Review the renewal and extend the subscription if approved.', priority: 2 });
  }
  if (!row.subscription) {
    reasons.push({ label: 'No subscription assigned', action: 'Assign a suitable plan to this organization.', priority: 3 });
  }
  if (row.org.domainStatus === 'INACTIVE') {
    reasons.push({ label: 'URL not activated', action: 'Review the reserved URL and activate the domain.', priority: 4 });
  }
  if (row.org.domainStatus === 'RELEASED') {
    reasons.push({ label: 'URL reservation released', action: 'Assign a new URL and activate the domain.', priority: 4 });
  }
  return reasons;
}

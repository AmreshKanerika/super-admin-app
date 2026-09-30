import { MigrationSyncStatus, OrgAccessResult, PlanAssignmentResult } from '../../models';
import { Tone } from '../../core/status.util';

const PLAN_ACTION_LABEL: Record<PlanAssignmentResult['action'], string> = {
  ADDED: 'Added to plan',
  ALREADY_ON_PLAN: 'Already on plan',
  REMOVED: 'Removed from plan',
  NOT_ON_PLAN: 'Was not on plan',
  SYNCED: 'Synced',
  BLOCKED: 'Not removed',
  NOT_FOUND: 'Plan not found'
};

const ACCESS_LABEL: Record<OrgAccessResult['access'], string> = {
  GRANTED: 'On plan',
  REVOKED: 'Off plan',
  KEPT_BY_OTHER_PLAN: 'Kept — on another plan',
  SYNCED: 'Synced'
};

const SYNC_LABEL: Record<MigrationSyncStatus, string> = {
  SYNCED: 'Migration details copied',
  REMOVED: 'Migration details removed',
  NOT_PRESENT: 'No migration details to remove',
  SKIPPED_NO_SCHEMA: 'Schema not created yet',
  SKIPPED_NO_TABLE: 'Schema not provisioned yet',
  CONFLICT: 'Conflicting migration type',
  FAILED: 'Sync failed'
};

export function planActionLabel(result: PlanAssignmentResult): string {
  return PLAN_ACTION_LABEL[result.action] ?? result.action;
}

export function planActionTone(result: PlanAssignmentResult): Tone {
  switch (result.action) {
    case 'ADDED':
    case 'REMOVED':
    case 'SYNCED':
      return 'success';
    case 'BLOCKED':
    case 'NOT_FOUND':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function accessLabel(result: OrgAccessResult): string {
  return ACCESS_LABEL[result.access] ?? result.access;
}

export function accessTone(result: OrgAccessResult): Tone {
  return result.access === 'KEPT_BY_OTHER_PLAN' ? 'neutral' : 'success';
}

export function syncLabel(status: MigrationSyncStatus): string {
  return SYNC_LABEL[status] ?? status;
}

export function syncTone(status: MigrationSyncStatus): Tone {
  switch (status) {
    case 'SYNCED':
    case 'REMOVED':
      return 'success';
    case 'NOT_PRESENT':
      return 'neutral';
    case 'SKIPPED_NO_SCHEMA':
    case 'SKIPPED_NO_TABLE':
      return 'warning';
    default:
      return 'critical';
  }
}

/** Not provisioned yet — nothing is wrong; the copy happens once its schema exists and is re-synced. */
export function orgSkipped(result: OrgAccessResult): boolean {
  return result.migrationSync === 'SKIPPED_NO_SCHEMA' || result.migrationSync === 'SKIPPED_NO_TABLE';
}

/** An organization whose migration details genuinely couldn't be written or removed (conflict / failure). */
export function orgNeedsAttention(result: OrgAccessResult): boolean {
  return result.migrationSync === 'CONFLICT' || result.migrationSync === 'FAILED';
}

export function planNeedsAttention(result: PlanAssignmentResult): boolean {
  return result.action === 'BLOCKED' || result.action === 'NOT_FOUND' || result.organizations.some(orgNeedsAttention);
}

/** One-line toast summary, e.g. "Added to 2 plans · reaches 5 organizations · 1 needs attention". */
export function summarisePlans(results: PlanAssignmentResult[], verb: 'Added to' | 'Removed from' | 'Synced'): string {
  const changed = results.filter((r) => r.action === 'ADDED' || r.action === 'REMOVED' || r.action === 'SYNCED');
  const orgCount = new Set(changed.flatMap((r) => r.organizations.map((o) => o.orgId))).size;
  const unchanged = results.filter((r) => r.action === 'ALREADY_ON_PLAN' || r.action === 'NOT_ON_PLAN').length;
  const attention = results.filter(planNeedsAttention).length;
  const skipped = new Set(changed.flatMap((r) => r.organizations.filter(orgSkipped).map((o) => o.orgId))).size;
  const parts =
    verb === 'Synced'
      ? [`Synced to ${orgCount} organization${orgCount === 1 ? '' : 's'}`]
      : [`${verb} ${changed.length} plan${changed.length === 1 ? '' : 's'}`, `${orgCount} organization${orgCount === 1 ? '' : 's'} affected`];
  if (unchanged) parts.push(`${unchanged} unchanged`);
  if (skipped) parts.push(`${skipped} schema${skipped === 1 ? '' : 's'} not provisioned yet`);
  if (attention) parts.push(`${attention} need${attention === 1 ? 's' : ''} attention`);
  return parts.join(' · ');
}

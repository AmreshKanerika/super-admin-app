import { TreeBranchComponent } from '../../core/ui/tree-branch.component';
import { Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApplicationsService } from '../../services/applications.service';
import { AppUsageService } from '../../services/app-usage.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { AccessStatus, Application } from '../../models';
import { formatLimit } from '../../core/status.util';
import { AppDisplayNamePipe } from '../../core/app-name.pipe';
import { displayNameOrFallback } from '../../core/app-name.util';
import { TreeRow, allParentIds, buildTreeRows, collectAncestorIds } from '../../core/ui/app-tree.util';

type LimitKind = 'design' | 'runtime';
type StatusFilter = 'ALL' | 'ENABLED' | 'DISABLED' | 'HIDDEN' | 'MODIFIED';

interface LimitState {
  accessStatus: AccessStatus;
  designTimeLimit: number;
  designTimeUsed: number;
  runtimeLimit: number;
  runtimeUsed: number;
}

export interface LimitTreeRow extends TreeRow<Application> {
  state: LimitState;
  dirty: boolean;
  rollup: { total: number; enabled: number };
}

const BLANK_STATE: LimitState = {
  accessStatus: 'HIDDEN',
  designTimeLimit: -1,
  designTimeUsed: 0,
  runtimeLimit: -1,
  runtimeUsed: 0
};

@Component({
  selector: 'app-limits-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppDisplayNamePipe, TreeBranchComponent],
  templateUrl: './limits-panel.component.html',
  styleUrl: './limits-panel.component.scss'
})
export class LimitsPanelComponent implements OnChanges {
  @Input({ required: true }) orgId!: string;

  private applications = inject(ApplicationsService);
  private appUsage = inject(AppUsageService);
  private subscriptions = inject(SubscriptionsService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  formatLimit = formatLimit;

  private readonly activeOrgId = signal('');
  // Set only after refreshForOrg resolves, so the catalog can tell "still loading" apart
  // from "loaded, and the org genuinely has these apps".
  private readonly loadedOrgId = signal('');
  private readonly overrides = signal<Map<string, LimitState>>(new Map());
  private readonly expandedIds = signal<ReadonlySet<string>>(new Set<string>());

  readonly query = signal('');
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');

  // New catalogue entries are visible to administrators as Hidden, without granting access.
  private readonly catalog = computed<Application[]>(() => this.applications.list()());
  readonly assignedAppIds = computed(() => new Set(this.appUsage.byOrg(this.activeOrgId()).map(row => row.appId)));
  readonly ready = computed(() => this.loadedOrgId() === this.activeOrgId() && !this.loading());

  private readonly baseStates = computed<Map<string, LimitState>>(() => {
    const orgId = this.activeOrgId();
    const usageByAppId = new Map(this.appUsage.byOrg(orgId).map((usage) => [usage.appId, usage]));
    const states = new Map<string, LimitState>();
    for (const app of this.catalog()) {
      const usage = usageByAppId.get(app.appId);
      states.set(app.appId, {
        accessStatus: usage?.accessStatus ?? BLANK_STATE.accessStatus,
        designTimeLimit: usage?.designTimeLimit ?? BLANK_STATE.designTimeLimit,
        designTimeUsed: usage?.designTimeUsed ?? BLANK_STATE.designTimeUsed,
        runtimeLimit: usage?.runtimeLimit ?? BLANK_STATE.runtimeLimit,
        runtimeUsed: usage?.runtimeUsed ?? BLANK_STATE.runtimeUsed
      });
    }
    return states;
  });

  private readonly effectiveStates = computed<Map<string, LimitState>>(() => {
    const states = new Map(this.baseStates());
    for (const [appId, override] of this.overrides()) {
      states.set(appId, override);
    }
    return states;
  });

  private readonly matchedIds = computed<ReadonlySet<string> | null>(() => {
    const term = this.query().trim().toLowerCase();
    const status = this.statusFilter();
    if (!term && status === 'ALL') {
      return null;
    }

    const states = this.effectiveStates();
    const overrides = this.overrides();
    const matched = new Set<string>();
    for (const app of this.catalog()) {
      const nameMatches =
        !term || displayNameOrFallback(app).toLowerCase().includes(term) || app.appName.toLowerCase().includes(term);
      const statusMatches =
        status === 'ALL' ||
        (status === 'MODIFIED'
          ? overrides.has(app.appId)
          : (states.get(app.appId)?.accessStatus ?? BLANK_STATE.accessStatus) === status);
      if (nameMatches && statusMatches) {
        matched.add(app.appId);
      }
    }
    return matched;
  });

  readonly rows = computed<LimitTreeRow[]>(() => {
    const catalog = this.catalog();
    const states = this.effectiveStates();
    const overrides = this.overrides();
    const expandedIds = this.expandedIds();

    return buildTreeRows<Application>(
      catalog,
      { expandedIds, matchedIds: this.matchedIds() },
      (first, second) => displayNameOrFallback(first).localeCompare(displayNameOrFallback(second))
    ).map((row) => {
      const enabled = row.descendantIds.filter(
        (appId) => (states.get(appId)?.accessStatus ?? BLANK_STATE.accessStatus) === 'ENABLED'
      ).length;
      return {
        ...row,
        state: states.get(row.item.appId) ?? BLANK_STATE,
        dirty: overrides.has(row.item.appId),
        rollup: { total: row.descendantIds.length, enabled }
      };
    });
  });

  // Loaded, but the org has no app to configure. Almost always because it has no active
  // subscription (a cancelled/expired plan creates no plan_usage_limit_status rows), which is
  // exactly Kestrel Logistics in the reported case. Without this the panel fell back to the full
  // catalogue and every save failed with a PlanException.
  readonly noConfigurableApps = computed(
    () => this.loadedOrgId() === this.activeOrgId() && this.catalog().length === 0
  );

  readonly hasActiveSubscription = computed(() => {
    // Re-run when the org changes.
    this.activeOrgId();
    return this.subscriptions.byOrg(this.orgId).some(sub => sub.planStatus === 'ACTIVE');
  });

  readonly dirtyCount = computed(() => this.overrides().size);

  readonly summary = computed(() => {
    const states = this.effectiveStates();
    let enabled = 0;
    let disabled = 0;
    let hidden = 0;
    for (const app of this.catalog()) {
      const status = states.get(app.appId)?.accessStatus ?? BLANK_STATE.accessStatus;
      if (status === 'ENABLED') enabled++;
      else if (status === 'HIDDEN') hidden++;
      else disabled++;
    }
    return { total: this.catalog().length, enabled, disabled, hidden };
  });

  async ngOnChanges(): Promise<void> {
    this.activeOrgId.set(this.orgId);
    this.loadedOrgId.set('');
    this.overrides.set(new Map());
    this.expandedIds.set(new Set<string>());
    this.query.set('');
    this.statusFilter.set('ALL');

    this.loading.set(true);
    try {
      await this.appUsage.refreshForOrg(this.orgId);
      this.loadedOrgId.set(this.orgId);
    } catch (error) {
      console.error('Failed to refresh usage for org', this.orgId, error);
      this.toast.show("Couldn't load application limits for this organization — check your connection and try again.", 'critical');
    } finally {
      this.loading.set(false);
    }
  }

  private mutate(appId: string, change: (state: LimitState) => LimitState): void {
    if (!this.ready() || !this.assignedAppIds().has(appId)) return;
    const next = new Map(this.overrides());
    const current = next.get(appId) ?? this.baseStates().get(appId) ?? BLANK_STATE;
    next.set(appId, change({ ...current }));
    this.overrides.set(next);
  }

  toggleExpanded(appId: string): void {
    const next = new Set(this.expandedIds());
    if (next.has(appId)) {
      next.delete(appId);
    } else {
      next.add(appId);
    }
    this.expandedIds.set(next);
  }

  expandAll(): void {
    this.expandedIds.set(new Set(allParentIds(this.catalog())));
  }

  collapseAll(): void {
    this.expandedIds.set(new Set<string>());
  }

  revealApp(appId: string): void {
    const next = new Set(this.expandedIds());
    for (const ancestorId of collectAncestorIds(this.catalog(), appId)) {
      next.add(ancestorId);
    }
    this.expandedIds.set(next);
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
  }

  clearFilters(): void {
    this.query.set('');
    this.statusFilter.set('ALL');
  }


  allowanceTooltip(row: LimitTreeRow, kind: LimitKind): string {
    const label = kind === 'design' ? 'Design-time' : 'Runtime';
    if (row.state.accessStatus !== 'ENABLED') {
      return `${label}: not applied while ${row.state.accessStatus.toLowerCase()}`;
    }
    if (this.isUnlimited(row, kind)) {
      return `${label}: unlimited \u2014 ${this.usedValue(row, kind).toLocaleString()} used`;
    }
    return `${label}: ${this.limitValue(row, kind).toLocaleString()} \u2014 ${this.usageLabel(row, kind)}`;
  }

  isUnlimited(row: LimitTreeRow, kind: LimitKind): boolean {
    return (kind === 'design' ? row.state.designTimeLimit : row.state.runtimeLimit) === -1;
  }

  limitValue(row: LimitTreeRow, kind: LimitKind): number {
    return kind === 'design' ? row.state.designTimeLimit : row.state.runtimeLimit;
  }

  usedValue(row: LimitTreeRow, kind: LimitKind): number {
    return kind === 'design' ? row.state.designTimeUsed : row.state.runtimeUsed;
  }

  setLimit(row: LimitTreeRow, kind: LimitKind, rawValue: number | string): void {
    const parsed = Number(rawValue);
    const value = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    if (value === this.limitValue(row, kind)) {
      return;
    }
    this.mutate(row.item.appId, (state) => ({
      ...state,
      designTimeLimit: kind === 'design' ? value : state.designTimeLimit,
      runtimeLimit: kind === 'runtime' ? value : state.runtimeLimit
    }));
  }

  // Opting an app into a limit. Seeds at whatever it has already consumed (never below that, which
  // would put the app instantly over its own limit) so the number starts somewhere defensible.
  startLimiting(row: LimitTreeRow, kind: LimitKind): void {
    this.mutate(row.item.appId, (state) => {
      const seed = Math.max(kind === 'design' ? state.designTimeUsed : state.runtimeUsed, 0);
      return {
        ...state,
        designTimeLimit: kind === 'design' ? seed : state.designTimeLimit,
        runtimeLimit: kind === 'runtime' ? seed : state.runtimeLimit
      };
    });
  }

  // Back to unlimited, the default every app starts from.
  clearLimit(row: LimitTreeRow, kind: LimitKind): void {
    this.mutate(row.item.appId, (state) => ({
      ...state,
      designTimeLimit: kind === 'design' ? -1 : state.designTimeLimit,
      runtimeLimit: kind === 'runtime' ? -1 : state.runtimeLimit
    }));
  }

  // Access cascades, matching the plan builder. Turning a parent off while its children stayed on
  // left an organization in a state that reads as contradictory on screen and is not what anyone
  // means by "disable this application" - previously cascading was a separate icon button most
  // people never found.
  setAccess(row: LimitTreeRow, accessStatus: AccessStatus): void {
    if (row.state.accessStatus === accessStatus) {
      return;
    }
    this.mutate(row.item.appId, (state) => ({ ...state, accessStatus }));

    if (row.descendantIds.length) {
      for (const descendantId of row.descendantIds) {
        this.mutate(descendantId, (state) => ({ ...state, accessStatus }));
      }
      this.toast.show(
        `${displayNameOrFallback(row.item)} and ${row.descendantIds.length} nested application${row.descendantIds.length === 1 ? '' : 's'} set to ${accessStatus.toLowerCase()}`,
        'success'
      );
    }

    // Enabling a nested application is meaningless while an ancestor is switched off - it would
    // never be reachable - so the chain above it comes back on with it.
    if (accessStatus === 'ENABLED') {
      const ancestorIds = collectAncestorIds(this.catalog(), row.item.appId)
        .filter((appId) => (this.effectiveStates().get(appId)?.accessStatus ?? 'DISABLED') !== 'ENABLED');
      for (const ancestorId of ancestorIds) {
        this.mutate(ancestorId, (state) => ({ ...state, accessStatus: 'ENABLED' }));
      }
      if (ancestorIds.length) {
        this.toast.show(
          `Also enabled ${ancestorIds.length} parent application${ancestorIds.length === 1 ? '' : 's'} so ${displayNameOrFallback(row.item)} is reachable`,
          'success'
        );
      }
    }
  }

  usagePct(row: LimitTreeRow, kind: LimitKind): number {
    const limit = this.limitValue(row, kind);
    const used = this.usedValue(row, kind);
    if (limit === -1 || limit === 0) {
      return 0;
    }
    return Math.min(100, Math.round((used / limit) * 100));
  }

  usageTone(pct: number): string {
    if (pct >= 90) return 'critical';
    if (pct >= 70) return 'warning';
    return 'normal';
  }

  usageLabel(row: LimitTreeRow, kind: LimitKind): string {
    const limit = this.limitValue(row, kind);
    const used = this.usedValue(row, kind);
    if (limit === -1) {
      return `${used.toLocaleString()} used · unlimited`;
    }
    return `${used.toLocaleString()} / ${limit.toLocaleString()}`;
  }

  trackByAppId(_index: number, row: LimitTreeRow): string {
    return row.item.appId;
  }

  discardChanges(): void {
    this.overrides.set(new Map());
    this.saveError.set('');
    this.toast.show('Unsaved limit changes discarded', 'success');
  }

  async saveChanges(): Promise<void> {
    await this.saveEntries(this.pendingEntries());
  }

  async saveRow(row: LimitTreeRow): Promise<void> {
    const state = this.overrides().get(row.item.appId);
    if (!state) return;
    await this.saveEntries([{ app: row.item, state }]);
  }

  revertRow(row: LimitTreeRow): void {
    const next = new Map(this.overrides());
    next.delete(row.item.appId);
    this.overrides.set(next);
  }

  setAccessForAllVisible(accessStatus: AccessStatus): void {
    for (const row of this.rows()) {
      if (row.state.accessStatus !== accessStatus) {
        this.mutate(row.item.appId, (state) => ({ ...state, accessStatus }));
      }
    }
  }

  private async saveEntries(pending: { app: Application; state: LimitState }[]): Promise<void> {
    if (!pending.length) {
      return;
    }

    const result = await this.confirm.open({
      title: pending.length === 1 ? `Save limits for ${displayNameOrFallback(pending[0].app)}` : 'Confirm limit changes',
      message: `You are about to change limits for ${pending.length} application${pending.length > 1 ? 's' : ''} in this organization.`,
      diffLines: pending.map(({ app, state }) => ({
        label: displayNameOrFallback(app),
        from: `${this.formatLimit(this.baseStates().get(app.appId)?.designTimeLimit ?? -1)} design / ${this.formatLimit(this.baseStates().get(app.appId)?.runtimeLimit ?? -1)} runtime`,
        to: `${state.accessStatus} · ${this.formatLimit(state.designTimeLimit)} design / ${this.formatLimit(state.runtimeLimit)} runtime`
      })),
      reasonRequired: true,
      confirmLabel: 'Save changes'
    });
    if (!result.confirmed) {
      return;
    }

    this.saving.set(true);
    this.saveError.set('');
    const failed: string[] = [];
    const saved = new Set<string>();
    try {
      for (const { app, state } of pending) {
        try {
          await this.appUsage.update(
            this.orgId,
            app.appId,
            { designTimeLimit: state.designTimeLimit, runtimeLimit: state.runtimeLimit, accessStatus: state.accessStatus },
            result.reason ?? ''
          );
          saved.add(app.appId);
        } catch (error) {
          console.error('Failed to save limit for app', app.appId, error);
          failed.push(displayNameOrFallback(app));
        }
      }
    } finally {
      const remaining = new Map(this.overrides());
      for (const appId of saved) {
        remaining.delete(appId);
      }
      this.overrides.set(remaining);
      this.saving.set(false);
    }

    if (failed.length) {
      const message = `Failed to save limits for: ${failed.join(', ')}`;
      this.saveError.set(message);
      this.toast.show(message, 'critical');
    } else {
      this.toast.show('Application limits updated', 'success');
    }
  }

  private pendingEntries(): { app: Application; state: LimitState }[] {
    const overrides = this.overrides();
    return this.catalog()
      .filter((app) => overrides.has(app.appId))
      .map((app) => ({ app, state: overrides.get(app.appId)! }));
  }

  async resetUsage(): Promise<void> {
    const subscription = this.subscriptions.activeByOrg(this.orgId);
    if (!subscription) {
      this.toast.show('This organization has no active subscription to reset usage for.', 'critical');
      return;
    }
    const result = await this.confirm.open({
      title: 'Reset usage counters',
      message:
        'This clears all recorded design-time and runtime usage for this organization back to zero. Limits themselves are not changed. This cannot be undone.',
      danger: true,
      requireTypedText: 'RESET',
      confirmLabel: 'Reset usage'
    });
    if (!result.confirmed) {
      return;
    }
    this.appUsage.resetForOrg(this.orgId, subscription.planId);
    this.toast.show('Usage counters reset', 'success');
  }
}

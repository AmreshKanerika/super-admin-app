import { ApplicationExplorerComponent, ExplorerNode } from '../../core/ui/application-explorer.component';
import { Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApplicationsService } from '../../services/applications.service';
import { AppUsageService } from '../../services/app-usage.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { ToggleSwitchComponent } from '../../core/ui/toggle-switch.component';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { AccessStatus, Application } from '../../models';
import { formatLimit } from '../../core/status.util';
import { AppNamePipe } from '../../core/app-name.pipe';
import { formatAppName } from '../../core/app-name.util';
import { TreeRow, allParentIds, buildTreeRows, collectAncestorIds, collectDescendantIds } from '../../core/ui/app-tree.util';

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
  accessStatus: 'DISABLED',
  designTimeLimit: -1,
  designTimeUsed: 0,
  runtimeLimit: -1,
  runtimeUsed: 0
};

@Component({
  selector: 'app-limits-panel',
  standalone: true,
  imports: [ApplicationExplorerComponent, CommonModule, FormsModule, ToggleSwitchComponent, AppNamePipe],
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
  formatAppName = formatAppName;

  private readonly activeOrgId = signal('');
  // Set only after refreshForOrg resolves, so the catalog can tell "still loading" apart
  // from "loaded, and the org genuinely has these apps".
  private readonly loadedOrgId = signal('');
  private readonly overrides = signal<Map<string, LimitState>>(new Map());
  private readonly collapsedIds = signal<ReadonlySet<string>>(new Set<string>());

  readonly query = signal('');
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');

  // The panel edits ONE organization's limits, and the backend can only update an app that has a
  // plan_usage_limit_status row for this org - i.e. an app the org's plan actually includes. The
  // full application catalogue is a superset of that: it also lists apps no subscription of this
  // org grants. Showing those made them look editable, but saving one hit
  // "No plan usage record found for this application in this organization" (PlanException) - the
  // toast in the screenshot. The catalogue is therefore narrowed to the apps the org holds, once
  // that set has loaded; until then the full list stands in so the tree is not momentarily empty.
  private readonly catalog = computed<Application[]>(() => {
    const all = this.applications.list()();
    const orgId = this.activeOrgId();
    if (!orgId || this.loadedOrgId() !== orgId) {
      return all;
    }
    const orgAppIds = new Set(this.appUsage.byOrg(orgId).map((usage) => usage.appId));
    return all.filter((app) => orgAppIds.has(app.appId));
  });

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
        !term || formatAppName(app.appName).toLowerCase().includes(term) || app.appName.toLowerCase().includes(term);
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
    const collapsed = this.collapsedIds();
    const expandedIds = new Set(allParentIds(catalog).filter((appId) => !collapsed.has(appId)));

    return buildTreeRows<Application>(
      catalog,
      { expandedIds, matchedIds: this.matchedIds() },
      (first, second) => formatAppName(first.appName).localeCompare(formatAppName(second.appName))
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
    return !!this.subscriptions.activeByOrg(this.orgId);
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
    this.collapsedIds.set(new Set<string>());
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
    const next = new Map(this.overrides());
    const current = next.get(appId) ?? this.baseStates().get(appId) ?? BLANK_STATE;
    next.set(appId, change({ ...current }));
    this.overrides.set(next);
  }

  toggleExpanded(appId: string): void {
    const next = new Set(this.collapsedIds());
    if (next.has(appId)) {
      next.delete(appId);
    } else {
      next.add(appId);
    }
    this.collapsedIds.set(next);
  }

  expandAll(): void {
    this.collapsedIds.set(new Set<string>());
  }

  collapseAll(): void {
    this.collapsedIds.set(new Set(allParentIds(this.catalog())));
  }

  revealApp(appId: string): void {
    const next = new Set(this.collapsedIds());
    for (const ancestorId of collectAncestorIds(this.catalog(), appId)) {
      next.delete(ancestorId);
    }
    this.collapsedIds.set(next);
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
  }

  clearFilters(): void {
    this.query.set('');
    this.statusFilter.set('ALL');
  }

  // The flat DFS list is what search, filtering and collapse all operate on; grouping it by root
  // here keeps that logic untouched while letting the template render one card per top-level app.
  readonly groups = computed(() => {
    const out: { root: LimitTreeRow; children: LimitTreeRow[] }[] = [];
    for (const row of this.rows()) {
      if (row.depth === 0) {
        out.push({ root: row, children: [] });
      } else if (out.length) {
        out[out.length - 1].children.push(row);
      }
    }
    return out;
  });

  readonly explorerNodes = computed<ExplorerNode[]>(() => this.rows().map(row => ({
    id: row.item.appId, name: formatAppName(row.item.appName), depth: row.depth,
    hasChildren: row.hasChildren, expanded: row.expanded, status: row.state.accessStatus,
    dirty: row.dirty, data: row,
    path: collectAncestorIds(this.catalog(), row.item.appId).reverse().map(id => formatAppName(this.catalog().find(a => a.appId === id)?.appName ?? id)).join(' / ')
  })));

  trackByGroupId = (_: number, group: { root: LimitTreeRow }) => group.root.item.appId;

  // First letter of the display name, so a 63-row tree has something to scan down other than text.
  // Access cascades down and pulls its parent chain up, so a change to one application is never
  // really about one application. Inspecting an app on its own meant making a change here and
  // hunting through the tree to see what else it moved - and left a large panel holding two
  // numbers. The inspector now shows the family the change actually touches: the chain above the
  // selected app, and everything nested beneath it, each editable in place.
  familyAncestors(row: LimitTreeRow): LimitTreeRow[] {
    return this.familyOf(row.item.appId).ancestors;
  }

  familyChildren(row: LimitTreeRow): LimitTreeRow[] {
    return this.familyOf(row.item.appId).children;
  }

  trackFamilyMember = (_: number, member: LimitTreeRow) => member.item.appId;

  // These are read several times per row from the template, on every change-detection pass. The
  // cache lives inside a computed() so it is thrown away and rebuilt the moment the catalogue or
  // any state it derives from changes - there is no staleness to manage, and repeat calls in one
  // pass return the same array instance rather than rebuilding the family each time.
  private readonly familyCache = computed(() => {
    this.catalog();
    this.effectiveStates();
    this.overrides();
    return new Map<string, { ancestors: LimitTreeRow[]; children: LimitTreeRow[] }>();
  });

  private familyOf(appId: string): { ancestors: LimitTreeRow[]; children: LimitTreeRow[] } {
    const cache = this.familyCache();
    const cached = cache.get(appId);
    if (cached) {
      return cached;
    }

    const catalog = this.catalog();
    const present = (candidate: LimitTreeRow | null): candidate is LimitTreeRow => candidate !== null;
    const family = {
      ancestors: collectAncestorIds(catalog, appId).reverse().map((id) => this.rowFor(id)).filter(present),
      children: collectDescendantIds(catalog, appId).map((id) => this.rowFor(id)).filter(present)
    };
    cache.set(appId, family);
    return family;
  }

  // Depth relative to the selected application, so nesting still reads in the inspector even
  // though the family starts partway down the catalogue's own hierarchy.
  relativeDepth(row: LimitTreeRow, member: LimitTreeRow): number {
    return Math.max(0, member.depth - row.depth);
  }

  // Built from the catalogue rather than rows(), which only holds what the tree is currently
  // showing - a collapsed or filtered-out child is still part of the family.
  private rowFor(appId: string): LimitTreeRow | null {
    const catalog = this.catalog();
    const app = catalog.find((candidate) => candidate.appId === appId);
    if (!app) {
      return null;
    }
    const states = this.effectiveStates();
    const descendantIds = collectDescendantIds(catalog, appId);
    const enabled = descendantIds.filter(
      (id) => (states.get(id)?.accessStatus ?? BLANK_STATE.accessStatus) === 'ENABLED'
    ).length;

    return {
      item: app,
      depth: collectAncestorIds(catalog, appId).length,
      hasChildren: descendantIds.length > 0,
      expanded: true,
      childCount: catalog.filter((candidate) => candidate.parentAppId === appId).length,
      descendantIds,
      matched: true,
      rails: [],
      isLastChild: false,
      state: states.get(appId) ?? BLANK_STATE,
      dirty: this.overrides().has(appId),
      rollup: { total: descendantIds.length, enabled }
    };
  }

  appInitial(row: LimitTreeRow): string {
    return (this.formatAppName(row.item.appName) || '?').trim().charAt(0).toUpperCase();
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
        `${formatAppName(row.item.appName)} and ${row.descendantIds.length} nested application${row.descendantIds.length === 1 ? '' : 's'} set to ${accessStatus.toLowerCase()}`,
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
          `Also enabled ${ancestorIds.length} parent application${ancestorIds.length === 1 ? '' : 's'} so ${formatAppName(row.item.appName)} is reachable`,
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
    const pending = this.pendingEntries();
    if (!pending.length) {
      return;
    }

    const result = await this.confirm.open({
      title: 'Confirm limit changes',
      message: `You are about to change limits for ${pending.length} application${pending.length > 1 ? 's' : ''} in this organization.`,
      diffLines: pending.map(({ app, state }) => ({
        label: formatAppName(app.appName),
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
          failed.push(formatAppName(app.appName));
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

import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppUsageService } from '../../services/app-usage.service';
import { ApplicationsService } from '../../services/applications.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { OrgUsageSnapshot, UsageResetScope, UsageResetTarget } from '../../models';
import { displayNameOrFallback, fallbackLabelFromMachineName } from '../../core/app-name.util';

export interface UsageDimension {
  limit: number | null;
  used: number | null;
  remaining: number | null;
  unlimited: boolean;
  resettable: boolean;
  exhausted: boolean;
}

export interface AppUsageRow {
  key: string;
  planId: string;
  appId: string;
  appName: string;
  accessStatus: string;
  designTime: UsageDimension;
  runtime: UsageDimension;
}

@Component({
  selector: 'app-usage-limits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usage-limits.component.html',
  styleUrl: './usage-limits.component.scss'
})
export class UsageLimitsComponent implements OnInit {
  @Input({ required: true }) orgId!: string;
  private appUsage = inject(AppUsageService);
  private applications = inject(ApplicationsService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  // Reset is shared with SALES; see AuthService.canResetUsage.
  readonly isSuperAdmin = computed(() => this.auth.canResetUsage());
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly resetting = signal(false);
  readonly busy = computed(() => this.loading() || this.resetting() || !!this.loadError());
  readonly selectedPlanId = signal<string | null>(null);
  readonly selectedKeys = signal<Set<string>>(new Set());
  readonly query = signal('');
  readonly scope = signal<UsageResetScope>('BOTH');
  readonly scopes: { key: UsageResetScope; label: string }[] = [
    { key: 'DESIGN_TIME', label: 'Design time' },
    { key: 'RUNTIME', label: 'Runtime' },
    { key: 'BOTH', label: 'Both' }
  ];
  readonly unlimitedHint = 'Unlimited: there is no usage cap to restore, so resetting this limit does not make sense.';
  readonly missingHint = 'Read-only: no limit is configured for this counter.';

  readonly snapshot = computed(() => this.appUsage.usageSnapshotFor(this.orgId));
  readonly plans = computed(() => (this.snapshot()?.plans ?? []).map((plan) => ({
    ...plan, planName: plan.planName || 'Unnamed plan',
    pool: this.dimensionOf(plan.limit, plan.used, plan.remaining)
  })));
  readonly selectedPlan = computed(() => this.plans().find((plan) => plan.planId === this.selectedPlanId()) ?? null);
  readonly rows = computed<AppUsageRow[]>(() => {
    const plan = this.selectedPlan();
    if (!plan) return [];
    return plan.apps.map((usage) => this.toRow(plan, usage)).sort((a, b) => a.appName.localeCompare(b.appName));
  });
  readonly visibleRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.rows().filter((row) => row.appName.toLowerCase().includes(query));
  });
  readonly eligibleRows = computed(() => this.rows().filter((row) => this.canResetRow(row)));
  readonly targetedRows = computed(() => this.eligibleRows().filter((row) => this.selectedKeys().has(row.key)));
  readonly allSelected = computed(() => this.eligibleRows().length > 0 && this.targetedRows().length === this.eligibleRows().length);
  readonly partiallySelected = computed(() => this.targetedRows().length > 0 && !this.allSelected());
  readonly canReset = computed(() => this.isSuperAdmin() && !this.busy() && this.targetedRows().length > 0);
  readonly resetHint = computed(() => {
    if (this.loadError()) return 'Refresh usage successfully before resetting.';
    if (!this.selectedPlan()) return 'Choose a plan first.';
    if (!this.eligibleRows().length) return 'No finite limits are available for this reset type. Unlimited limits are read-only.';
    if (!this.targetedRows().length) return 'Select at least one application with a finite limit.';
    return 'Reset the selected finite counters to zero used and the full remaining allowance.';
  });
  readonly counterCount = computed(() => this.targetedRows().reduce((count, row) => count +
    Number(this.scope() !== 'RUNTIME' && row.designTime.resettable) +
    Number(this.scope() !== 'DESIGN_TIME' && row.runtime.resettable), 0));

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      await this.appUsage.refreshUsageSnapshot(this.orgId);
      if (!this.selectedPlan()) this.selectedPlanId.set(null);
      this.pruneSelection();
    } catch {
      this.loadError.set("Couldn't load usage. Refresh to try again.");
    } finally {
      this.loading.set(false);
    }
  }

  selectPlan(planId: string): void {
    if (this.busy() || planId === this.selectedPlanId()) return;
    this.selectedPlanId.set(planId);
    this.clearSelection();
    this.query.set('');
  }

  changeScope(scope: UsageResetScope): void {
    if (this.busy()) return;
    this.scope.set(scope);
    this.pruneSelection();
  }

  canResetRow(row: AppUsageRow): boolean {
    return (this.scope() !== 'RUNTIME' && row.designTime.resettable) ||
      (this.scope() !== 'DESIGN_TIME' && row.runtime.resettable);
  }

  rowHint(row: AppUsageRow): string {
    if (this.canResetRow(row)) return 'Select ' + row.appName + ' to reset its finite counters for this reset type.';
    const dimensions = this.scope() === 'BOTH' ? [row.designTime, row.runtime] :
      [this.scope() === 'RUNTIME' ? row.runtime : row.designTime];
    return dimensions.some((dimension) => dimension.unlimited) ? this.unlimitedHint : this.missingHint;
  }

  dimensionHint(dimension: UsageDimension): string {
    return dimension.unlimited ? this.unlimitedHint : dimension.resettable ? '' : this.missingHint;
  }

  toggleApp(row: AppUsageRow): void {
    if (this.busy() || !this.canResetRow(row)) return;
    this.selectedKeys.update((current) => {
      const next = new Set(current);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });
  }

  selectAll(): void {
    if (!this.busy()) this.selectedKeys.set(new Set(this.eligibleRows().map((row) => row.key)));
  }
  clearSelection(): void { this.selectedKeys.set(new Set()); }
  toggleAll(): void {
    if (this.busy()) return;
    if (this.allSelected()) this.clearSelection();
    else this.selectAll();
  }
  private pruneSelection(): void {
    const eligible = new Set(this.eligibleRows().map((row) => row.key));
    this.selectedKeys.update((current) => new Set([...current].filter((key) => eligible.has(key))));
  }

  format(value: number | null): string {
    return value === null ? '—' : value === -1 ? 'Unlimited' : value.toLocaleString('en-US');
  }
  private dimensionOf(limit: number | null | undefined, used: number | null | undefined, remaining: number | null | undefined): UsageDimension {
    const resettable = limit != null && Number.isFinite(limit) && limit >= 0;
    return { limit: limit ?? null, used: used ?? null, remaining: remaining ?? null,
      unlimited: limit === -1, resettable, exhausted: resettable && remaining != null && remaining <= 0 };
  }
  private toRow(plan: OrgUsageSnapshot['plans'][number], usage: OrgUsageSnapshot['plans'][number]['apps'][number]): AppUsageRow {
    return {
      key: plan.planId + ':' + usage.appId, planId: plan.planId, appId: usage.appId,
      appName: displayNameOrFallback(this.applications.byId(usage.appId))
        || fallbackLabelFromMachineName(usage.appName)
        || usage.appId,
      accessStatus: usage.accessStatus ?? 'NOT TRACKED',
      designTime: this.dimensionOf(usage.designTimeLimit, usage.designTimeUsed, usage.designTimeRemaining),
      runtime: this.dimensionOf(usage.runtimeLimit, usage.runtimeUsed, usage.runtimeRemaining)
    };
  }

  async resetUsage(): Promise<void> {
    if (!this.canReset()) return;
    const plan = this.selectedPlan()!;
    const scope = this.scope();
    const rows = this.targetedRows();
    const targets: UsageResetTarget[] = rows.map((row) => ({ planId: row.planId, appId: row.appId }));
    const diffLines: { label: string; from: string; to: string }[] = [];
    for (const row of rows) {
      for (const [included, dimension, label] of [
        [scope !== 'RUNTIME', row.designTime, 'Design time'],
        [scope !== 'DESIGN_TIME', row.runtime, 'Runtime']
      ] as const) {
        if (!included || !dimension.resettable) continue;
        diffLines.push({
          label: row.appName + ' · ' + label,
          from: 'Used ' + this.format(dimension.used) + ' · Remaining ' + this.format(dimension.remaining),
          to: 'Used 0 · Remaining ' + this.format(dimension.limit)
        });
      }
    }
    // Keep the reviewed selection stable until confirmation finishes.
    this.resetting.set(true);
    try {
      const result = await this.confirm.open({
        title: 'Reset usage · ' + plan.planName,
        message: 'Reset ' + diffLines.length + ' finite counter(s) across ' + rows.length +
          ' selected application(s) on this plan. Used becomes zero and remaining returns to the configured limit. ' +
          'Unlimited counters and the shared plan allowance stay unchanged.' +
          (diffLines.length > 12 ? ' Showing the first 12 of ' + diffLines.length + ' counters below.' : ''),
        diffLines: diffLines.slice(0, 12), reasonRequired: true, confirmLabel: 'Reset selected apps'
      });
      if (!result.confirmed) return;
      const reset = await this.appUsage.resetOrganizationUsage(this.orgId, result.reason ?? 'Application usage reset', scope, targets);
      this.clearSelection();
      await this.load();
      this.toast.show(reset.message, reset.rowsReset > 0 ? 'success' : 'neutral');
    } catch (error: unknown) {
      const httpError = error as { error?: { message?: string }; message?: string };
      this.toast.show(httpError?.error?.message || httpError?.message || 'Failed to reset usage', 'critical');
    } finally {
      this.resetting.set(false);
    }
  }
}

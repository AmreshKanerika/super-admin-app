import { collectAncestorIds, collectDescendantIds } from '../../core/ui/app-tree.util';
import { ApplicationExplorerComponent, ExplorerNode } from '../../core/ui/application-explorer.component';
import { Component, EventEmitter, Injector, Input, OnInit, Output, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ToggleSwitchComponent } from '../../core/ui/toggle-switch.component';
import { ApplicationsService } from '../../services/applications.service';
import { PlansService } from '../../services/plans.service';
import { OverviewService } from '../../services/overview.service';
import { ConfirmService } from '../../core/confirm.service';
import { AccessStatus, Application, BillingMode, SubscriptionPlan } from '../../models';
import { formatLimit } from '../../core/status.util';
import { AppNamePipe } from '../../core/app-name.pipe';
import { formatAppName } from '../../core/app-name.util';
import { FlatTreeMeta, decorateDfsRows , groupByRoot } from '../../core/ui/app-tree.util';

interface AppRowVm {
  app: Application;
  depth: number;
  accessStatus: AccessStatus; // ENABLED | DISABLED | HIDDEN
  designTimeLimit: number;
  runtimeLimit: number;
  designUnlimited: boolean;
  runtimeUnlimited: boolean;
}

@Component({
  selector: 'app-plan-builder',
  standalone: true,
  imports: [ApplicationExplorerComponent, CommonModule, FormsModule, RouterLink, PageHeaderComponent, ToggleSwitchComponent, AppNamePipe],
  templateUrl: './plan-builder.component.html',
  styleUrl: './plan-builder.component.scss'
})
export class PlanBuilderComponent implements OnInit {
  @Input() embedded = false;
  @Output() created = new EventEmitter<SubscriptionPlan>();
  @Output() cancelled = new EventEmitter<void>();

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private applications = inject(ApplicationsService);
  private plans = inject(PlansService);
  private overview = inject(OverviewService);
  private confirm = inject(ConfirmService);
  private injector = inject(Injector);

  formatLimit = formatLimit;
  step = signal(0);
  stepLabels = ['Details', 'Applications', 'Limits & scopes', 'Review'];

  editingPlanId: string | null = null;

  planName = '';
  description = '';
  billingMode: BillingMode = 'PREPAID';
  primaryAppId = '';
  nameError = '';

  rows = signal<AppRowVm[]>([]);
  applicationsRoots: Application[] = [];

  readonly appQuery = signal('');
  readonly collapsedAppIds = signal<ReadonlySet<string>>(new Set<string>());
  formatAppName = formatAppName;

  private matcher(): ((row: AppRowVm) => boolean) | null {
    const term = this.appQuery().trim().toLowerCase();
    if (!term) {
      return null;
    }
    return (row) =>
      formatAppName(row.app.appName).toLowerCase().includes(term) || row.app.appName.toLowerCase().includes(term);
  }

  readonly visibleRows = computed<(AppRowVm & FlatTreeMeta)[]>(() =>
    decorateDfsRows(this.rows(), {
      depthOf: (row) => row.depth,
      idOf: (row) => row.app.appId,
      collapsedIds: this.collapsedAppIds(),
      matches: this.matcher()
    })
  );

  // Both steps render one card per top-level application; the flat lists above stay the source of
  // truth for search, filtering and collapse.
  readonly appGroups = computed(() => groupByRoot(this.visibleRows(), (row) => row.depth));
  readonly limitGroups = computed(() => groupByRoot(this.visibleEnabledRows(), (row) => row.depth));

  readonly explorerNodes = computed<ExplorerNode[]>(() => this.visibleRows().map(row => ({
    id: row.app.appId, name: formatAppName(row.app.appName), depth: row.depth,
    hasChildren: row.hasChildren, expanded: row.expanded, status: row.accessStatus, data: row,
    path: collectAncestorIds(this.rows().map(r => r.app), row.app.appId).reverse().map(id => formatAppName(this.rows().find(r => r.app.appId === id)?.app.appName ?? id)).join(' / ')
  })));

  trackByGroupRow = (_: number, group: { root: { app: { appId: string } } }) => group.root.app.appId;

  readonly visibleEnabledRows = computed<(AppRowVm & FlatTreeMeta)[]>(() =>
    decorateDfsRows(
      this.rows().filter((row) => row.accessStatus === 'ENABLED'),
      {
        depthOf: (row) => row.depth,
        idOf: (row) => row.app.appId,
        collapsedIds: new Set<string>(),
        matches: null
      }
    )
  );

  toggleAppCollapsed(appId: string): void {
    const next = new Set(this.collapsedAppIds());
    if (next.has(appId)) {
      next.delete(appId);
    } else {
      next.add(appId);
    }
    this.collapsedAppIds.set(next);
  }

  expandAllApps(): void {
    this.collapsedAppIds.set(new Set<string>());
  }

  collapseAllApps(): void {
    this.collapsedAppIds.set(new Set(this.rows().filter((row) => row.depth === 0).map((row) => row.app.appId)));
  }

  trackByAppRow(_index: number, row: AppRowVm & FlatTreeMeta): string {
    return row.app.appId;
  }

  // public so template can show a loading indicator while the plan is awaited
  loadedEditingPlan = false;

  ngOnInit(): void {
    if (!this.embedded) {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) this.editingPlanId = id;
    }

    // If not editing a specific plan, schedule initial build now
    if (!this.editingPlanId) {
      this.scheduleBuildRows(undefined);
    }

    // Rebuild rows when applications or plans list loads or editing id changes.
    // ngOnInit runs outside an injection context, so effect() needs the injector passed explicitly
    // (otherwise Angular throws NG0203 and the whole route fails to render — this was breaking
    // both "Create custom plan" and "Edit plan").
    effect(
      () => {
        // touch applications list and plans list to react to their changes
        const apps = this.applications.list()();
        const plans = this.plans.list() && this.plans.list()();
        const id = this.editingPlanId;
        // when either changes, reconstruct rows (keeps existing edit selection)
        this.scheduleBuildRows(id ? this.plans.byId(id) : undefined);
      },
      { injector: this.injector }
    );

    // If we are editing, wait for the plans store to contain the plan, then populate once
    effect(
      () => {
        if (!this.editingPlanId || this.loadedEditingPlan) return;
        const plan = this.plans.byId(this.editingPlanId);
        if (plan) {
          this.scheduleBuildRows(plan);
          this.loadedEditingPlan = true;
        }
      },
      { injector: this.injector }
    );
  }

  private scheduleBuildRows(existing?: SubscriptionPlan): void {
    // defer heavy work to next microtask to avoid blocking UI
    Promise.resolve().then(() => this._buildRows(existing));
  }

  private _buildRows(existing?: SubscriptionPlan): void {
    if (existing) {
      this.planName = existing.planName;
      this.description = existing.description;
      this.billingMode = existing.billingMode;
      this.primaryAppId = existing.primaryAppId ?? '';
    }
    const byAppId = new Map(existing?.apps?.map((a: any) => [a.appId, a]) ?? []);
    const vms: AppRowVm[] = [];

    // recursive traversal to include all nested sub-applications
    const visit = (app: Application, depth: number) => {
      vms.push(this.toVm(app, byAppId, depth));
      const children = this.applications.childrenOf(app.appId) || [];
      for (const c of children) visit(c, depth + 1);
    };

    for (const root of this.applications.roots()) {
      visit(root, 0);
    }

    // Also include any orphaned apps (no root found) to ensure full coverage
    const seen = new Set(vms.map((v) => v.app.appId));
    for (const a of this.applications.list()()) {
      if (!seen.has(a.appId)) visit(a, 0);
    }

    this.rows.set(vms);
  }

  private toVm(app: Application, byAppId: Map<string, any>, depth: number): AppRowVm {
    const cfg = byAppId.get(app.appId);
    const status: AccessStatus = cfg?.accessStatus ?? 'DISABLED';
    return {
      app,
      depth,
      accessStatus: status,
      designTimeLimit: cfg?.designTimeLimit ?? 0,
      runtimeLimit: cfg?.runtimeLimit ?? 0,
      designUnlimited: (cfg?.designTimeLimit ?? -1) === -1,
      runtimeUnlimited: (cfg?.runtimeLimit ?? -1) === -1
    };
  }

  // visibleRows()/visibleEnabledRows() hand the template decorated COPIES of these rows, so every
  // mutation has to be applied to the row still held in the signal — writing to the copy would be
  // silently discarded on the next recompute.
  private sourceRow(appId: string): AppRowVm | undefined {
    return this.rows().find((candidate) => candidate.app.appId === appId);
  }

  setAccessStatus(rowRef: AppRowVm, status: AccessStatus): void {
    const row = this.sourceRow(rowRef.app.appId);
    if (!row) {
      return;
    }
    row.accessStatus = status;
    const catalog = this.rows().map(r => r.app);
    const descendants = new Set(collectDescendantIds(catalog, row.app.appId));
    const ancestors = new Set(status === 'ENABLED' ? collectAncestorIds(catalog, row.app.appId) : []);
    for (const candidate of this.rows()) {
      if (descendants.has(candidate.app.appId)) candidate.accessStatus = status;
      if (ancestors.has(candidate.app.appId)) candidate.accessStatus = 'ENABLED';
    }
    this.rows.set([...this.rows()]);
  }

  // Opting an application into a limit. Same model as the per-organization Limits screen so both
  // places read identically: unlimited is the resting state, a number is a deliberate choice.
  startLimiting(rowRef: AppRowVm, kind: 'design' | 'runtime'): void {
    const row = this.sourceRow(rowRef.app.appId);
    if (!row) return;
    if (kind === 'design') {
      row.designUnlimited = false;
      if (row.designTimeLimit < 0) row.designTimeLimit = 0;
    } else {
      row.runtimeUnlimited = false;
      if (row.runtimeLimit < 0) row.runtimeLimit = 0;
    }
    this.rows.set([...this.rows()]);
  }

  clearLimit(rowRef: AppRowVm, kind: 'design' | 'runtime'): void {
    const row = this.sourceRow(rowRef.app.appId);
    if (!row) return;
    if (kind === 'design') {
      row.designUnlimited = true;
      row.designTimeLimit = -1;
    } else {
      row.runtimeUnlimited = true;
      row.runtimeLimit = -1;
    }
    this.rows.set([...this.rows()]);
  }

  setRowLimit(rowRef: AppRowVm, kind: 'design' | 'runtime', rawValue: number | string): void {
    const row = this.sourceRow(rowRef.app.appId);
    if (!row) {
      return;
    }
    const parsed = Number(rawValue);
    const value = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    if (kind === 'design') row.designTimeLimit = value;
    else row.runtimeLimit = value;
    this.rows.set([...this.rows()]);
  }

  enabledRows = computed(() => this.rows().filter((r) => r.accessStatus === 'ENABLED'));

  // primary_app_id is the accelerator a subscription is billed and de-duplicated against in the
  // multi-subscription model, so a plan without one can never be onboarded. Nothing in the builder
  // used to set it, which produced plans the onboarding wizard had to reject.
  primaryAppOptions(): AppRowVm[] {
    return this.rows().filter((row) => row.accessStatus === 'ENABLED');
  }

  private ensurePrimaryAppSelected(): void {
    const options = this.primaryAppOptions();
    if (!options.some((row) => row.app.appId === this.primaryAppId)) {
      this.primaryAppId = options.length ? options[0].app.appId : '';
    }
  }

  scopesLabel(app: Application): string {
    return app.scopes.join(', ');
  }

  canGoNext(): boolean {
    if (this.step() === 0) {
      return !!this.planName.trim() && this.plans.nameAvailable(this.planName, this.editingPlanId ?? undefined);
    }
    if (this.step() === 1) {
      if (!this.enabledRows().length) {
        return false;
      }
      this.ensurePrimaryAppSelected();
      return !!this.primaryAppId;
    }
    return true;
  }

  checkName(): void {
    if (!this.planName.trim()) {
      this.nameError = '';
      return;
    }
    this.nameError = this.plans.nameAvailable(this.planName, this.editingPlanId ?? undefined) ? '' : 'A plan with this name already exists.';
  }

  next(): void {
    if (!this.canGoNext()) return;
    this.step.set(Math.min(this.step() + 1, this.stepLabels.length - 1));
  }

  back(): void {
    this.step.set(Math.max(this.step() - 1, 0));
  }

  goToStep(i: number): void {
    if (i <= this.step()) this.step.set(i);
  }

  // Every application in the catalog gets a row here, whatever its status — a DISABLED app must
  // still be recorded as DISABLED in apps_by_plan, not silently omitted. Dropping the row entirely
  // (the previous behaviour) meant apps_by_plan only ever reflected ENABLED/HIDDEN apps, leaving no
  // record that a DISABLED app was even considered for this plan.
  private buildApps() {
    return this.rows().map((r) => ({
      appId: r.app.appId,
      accessStatus: r.accessStatus,
      designTimeLimit: r.designUnlimited ? -1 : r.designTimeLimit,
      runtimeLimit: r.runtimeUnlimited ? -1 : r.runtimeLimit
    }));
  }

  saving = false;

  async save(): Promise<void> {
    const apps = this.buildApps();
    const draft = { planName: this.planName, description: this.description, billingMode: this.billingMode, primaryAppId: this.primaryAppId, apps };

    if (this.editingPlanId) {
      const affectedOrgNames = this.overview
        .rows()
        .filter((r) => r.subscription?.planId === this.editingPlanId)
        .map((r) => r.org.organizationName);
      if (affectedOrgNames.length > 0) {
        const result = await this.toastConfirmEdit(affectedOrgNames);
        if (!result) return;
      }
      this.saving = true;
      try {
        // PlansService.update() already shows the success/failure toast for this action — don't
        // toast again here, that was producing a confusing duplicate on every save.
        await this.plans.update(this.editingPlanId, draft);
        if (!this.embedded) this.router.navigate(['/plans', this.editingPlanId]);
      } catch (err) {
        // already toasted by the service; nothing else to do here.
      } finally {
        this.saving = false;
      }
      return;
    }

    this.saving = true;
    try {
      const plan = await this.plans.create(draft);
      if (this.embedded) {
        this.created.emit(plan);
      } else {
        this.router.navigate(['/plans', (plan as any)?.planId || '']);
      }
    } catch (err) {
      // already toasted by the service; nothing else to do here.
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    if (this.embedded) this.cancelled.emit();
    else this.router.navigate(['/plans']);
  }

  private async toastConfirmEdit(orgNames: string[]): Promise<boolean> {
    // Cap the inline list so a plan assigned to dozens of organizations doesn't blow up the dialog.
    const shown = orgNames.slice(0, 8);
    const rest = orgNames.length - shown.length;
    const list = shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '');

    const result = await this.confirm.open({
      title: 'Apply changes to existing subscriptions?',
      message: `This plan is currently assigned to ${orgNames.length} organization${orgNames.length > 1 ? 's' : ''} — ${list}. Changes will affect their subscriptions. Do you want to proceed?`,
      danger: true,
      confirmLabel: 'Apply changes'
    });
    return result.confirmed;
  }
}

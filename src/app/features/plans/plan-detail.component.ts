import { TreeBranchComponent } from '../../core/ui/tree-branch.component';
import { PlanDisplayNamePipe } from '../../core/plan-name.pipe';
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { ApplicationsService } from '../../services/applications.service';
import { PlansService } from '../../services/plans.service';
import { OverviewService } from '../../services/overview.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { accessStatusTone, formatDate, formatLimit, planStateTone, subscriptionStatusTone } from '../../core/status.util';
import { FlatTreeMeta, decorateDfsRows , groupByRoot } from '../../core/ui/app-tree.util';
import { AppLimitConfig } from '../../models';

type PlanAppRow = AppLimitConfig & { depth: number; sortIndex: number };
type PlanAppTreeRow = PlanAppRow & FlatTreeMeta;

@Component({
  selector: 'app-plan-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusPillComponent, TreeBranchComponent, PlanDisplayNamePipe],
  templateUrl: './plan-detail.component.html',
  styleUrl: './plan-detail.component.scss'
})
export class PlanDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  applications = inject(ApplicationsService);
  plans = inject(PlansService);
  private overview = inject(OverviewService);
  private subscriptions = inject(SubscriptionsService);

  tone = planStateTone;
  accessTone = accessStatusTone;
  subscriptionTone = subscriptionStatusTone;
  formatDate = formatDate;
  formatLimit = formatLimit;

  planId = this.route.snapshot.paramMap.get('id') ?? '';
  plan = computed(() => this.plans.byId(this.planId));

  usingOrgs = computed(() => this.overview.rows().filter((r) => r.subscription?.planId === this.planId));
  // Driven by the same live subscriptions data as delete()'s own guard (not the plan's
  // server-computed assignedOrgCount), so the button's disabled state can never disagree with
  // what actually happens on click.
  canEditOrDelete = computed(() => this.usingOrgs().length === 0);

  deleting = signal(false);
  assignOpen = signal(false);
  assignSubmitting = signal(false);
  assignOrgId = '';
  unassignedOrgs = computed(() => this.overview.rows().filter((r) => !r.subscription).map((r) => r.org));

  // p.apps comes back from the server in whatever order the query happened to return — not grouped
  // by hierarchy — and carries no depth of its own. flattenedTree() gives the canonical parent-first
  // ordering and depth for every app in the catalog; reusing its order here means a nested app (e.g.
  // Migration's own "SSAS to Fabric" children) renders directly under its parent and indented,
  // instead of anywhere the server happened to place it with no indication it's a sub-application.
  sortedApps = computed(() => {
    const plan = this.plan();
    if (!plan) return [];
    const order = new Map<string, { depth: number; index: number }>();
    this.applications.flattenedTree().forEach(({ app, depth }, index) => {
      order.set(app.appId, { depth, index });
    });
    return [...plan.apps]
      .map((a) => {
        const meta = order.get(a.appId);
        return {
          ...a,
          depth: meta?.depth ?? 0,
          sortIndex: meta?.index ?? Number.MAX_SAFE_INTEGER
        };
      })
      .sort((x, y) => x.sortIndex - y.sortIndex);
  });

  readonly appQuery = signal('');
  expandAllApps(): void { this.expandedAppIds.set(new Set(this.parentAppIds())); }
  collapseAllApps(): void { this.expandedAppIds.set(new Set<string>()); }

  readonly expandedAppIds = signal<ReadonlySet<string>>(new Set<string>());

  private readonly parentAppIds = computed<string[]>(() => {
    const rows = this.sortedApps();
    return rows
      .filter((row, index) => {
        const next = rows[index + 1];
        return !!next && next.depth === row.depth + 1;
      })
      .map((row) => row.appId);
  });

  private readonly collapsedAppIds = computed<ReadonlySet<string>>(() => {
    const expanded = this.expandedAppIds();
    return new Set(this.parentAppIds().filter((appId) => !expanded.has(appId)));
  });

  readonly appTreeRows = computed<PlanAppTreeRow[]>(() =>
    decorateDfsRows<PlanAppRow>(this.sortedApps(), {
      depthOf: (row) => row.depth,
      idOf: (row) => row.appId,
      collapsedIds: this.collapsedAppIds(),
      matches: this.appQuery().trim() ? row => this.appDisplayName(row.appId).toLowerCase().includes(this.appQuery().trim().toLowerCase()) : null
    })
  );

  toggleAppCollapsed(appId: string): void {
    const next = new Set(this.expandedAppIds());
    if (next.has(appId)) {
      next.delete(appId);
    } else {
      next.add(appId);
    }
    this.expandedAppIds.set(next);
  }

  // One card per top-level application, matching the Limits panel and the plan builder.
  readonly appGroups = computed(() => groupByRoot(this.appTreeRows(), (row) => row.depth));

  appPath(id: string): string {
    const names:string[] = [], seen=new Set<string>();
    let parent=this.applications.byId(id)?.parentAppId;
    while(parent && !seen.has(parent)) { seen.add(parent); names.unshift(this.appDisplayName(parent)); parent=this.applications.byId(parent)?.parentAppId; }
    return names.join(' / ');
  }

  trackByGroupApp = (_: number, group: { root: { appId: string } }) => group.root.appId;

  appInitial(row: { appId: string }): string {
    return (this.appDisplayName(row.appId) || '?').trim().charAt(0).toUpperCase();
  }

  trackByPlanAppId(_index: number, row: { appId: string }): string {
    return row.appId;
  }

  allowanceLabel(row: { accessStatus: string; designTimeLimit: number; runtimeLimit: number }, kind: 'design' | 'runtime'): string {
    if (row.accessStatus !== 'ENABLED') return 'Inactive';
    const limit = kind === 'design' ? row.designTimeLimit : row.runtimeLimit;
    return limit === -1 ? '∞ Unlimited' : limit.toLocaleString();
  }

  appDisplayName(appId: string | null): string {
    if (!appId) return '—';
    return this.applications.displayNameForAppId(appId);
  }

  openAssign(): void {
    this.assignOrgId = '';
    this.assignOpen.set(true);
  }

  closeAssign(): void {
    this.assignOpen.set(false);
  }

  async confirmAssign(): Promise<void> {
    if (!this.assignOrgId) return;
    this.assignSubmitting.set(true);
    try {
      await this.subscriptions.assignPlan(this.assignOrgId, this.planId);
      this.toast.show('Plan assigned to organization', 'success');
      this.assignOpen.set(false);
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to assign plan'), 'critical');
    } finally {
      this.assignSubmitting.set(false);
    }
  }

  async delete(): Promise<void> {
    const plan = this.plan();
    if (!plan) return;

    const orgs = this.usingOrgs();
    if (orgs.length > 0) {
      const names = orgs.map(o => o.org.organizationName).join(', ');
      await this.confirm.open({
        title: 'Cannot delete plan while assigned',
        message: `This plan is currently assigned to the following organization(s): ${names}.\n\nPlease unassign it from these organizations before deleting.`,
        danger: true,
        confirmLabel: 'Got it'
      });
      return;
    }

    const result = await this.confirm.open({
      title: 'Delete this plan?',
      message: `"${plan.planName}" will be permanently deleted. This can't be undone.`,
      danger: true,
      confirmLabel: 'Delete plan'
    });
    if (!result.confirmed) return;

    this.deleting.set(true);
    try {
      // PlansService.remove() owns the optimistic removal and its rollback, so it is also the one
      // that reports the outcome - re-reporting here put the same toast on screen twice.
      await this.plans.remove(this.planId);
      this.router.navigate(['/plans']);
    } catch {
      // Already surfaced by the service; staying on the page is the recovery.
    } finally {
      this.deleting.set(false);
    }
  }

  private errorMessage(err: unknown, fallback: string): string {
    const message = (err as { error?: { message?: string } })?.error?.message;
    return message || fallback;
  }

  readonly cloning = signal(false);

  async clone(): Promise<void> {
    this.cloning.set(true);
    try {
      // Persists server-side now, so the id we navigate to is a real plan id that Edit, Delete and
      // Assign can all act on.
      const clone = await this.plans.clone(this.planId);
      if (clone) {
        this.router.navigate(['/plans', clone.planId]);
      }
    } catch {
      // Reported by the service.
    } finally {
      this.cloning.set(false);
    }
  }

  async setArchived(archived: boolean): Promise<void> {
    const plan = this.plan();
    if (!plan) return;
    if (archived && this.usingOrgs().length > 0) {
      const result = await this.confirm.open({
        title: 'Archive this plan?',
        message: `${this.usingOrgs().length} organization(s) are still subscribed to this plan. Archiving prevents it from being selected for new subscriptions but does not affect existing ones.`,
        danger: true,
        confirmLabel: 'Archive plan'
      });
      if (!result.confirmed) return;
    }
    this.plans.setState(this.planId, archived ? 'ARCHIVED' : 'ACTIVE');
    this.toast.show(archived ? 'Plan archived' : 'Plan reactivated', 'success');
  }
}

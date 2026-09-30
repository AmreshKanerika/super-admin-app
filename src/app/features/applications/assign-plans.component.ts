import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalShellComponent } from '../../core/ui/modal-shell.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { ApplicationsService } from '../../services/applications.service';
import { PlansService } from '../../services/plans.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { AppPlanOption, Application, PlanAssignmentResult } from '../../models';
import { displayNameOrFallback } from '../../core/app-name.util';
import {
  accessLabel,
  accessTone,
  orgNeedsAttention,
  planActionLabel,
  planActionTone,
  planNeedsAttention,
  summarisePlans,
  syncLabel,
  syncTone
} from './assignment-result.util';

type Tab = 'assigned' | 'add';

/**
 * Put one application on many subscription plans at once, or take it off many at once. A plan is
 * what reaches organizations: every organization subscribed to it gets (or loses) the application,
 * and for a migration application its migration details are copied into (or removed from) their
 * schemas. A plan that already has the application is never offered again.
 */
@Component({
  selector: 'app-assign-plans',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalShellComponent, StatusPillComponent],
  templateUrl: './assign-plans.component.html',
  styleUrl: './assign-plans.component.scss'
})
export class AssignPlansComponent implements OnInit {
  @Input({ required: true }) app!: Application;
  /** Shown as e.g. "Step 3 of 3" when this is the last step of creating the application. */
  @Input() stepLabel: string | null = null;
  @Output() closed = new EventEmitter<void>();

  private applications = inject(ApplicationsService);
  private plansService = inject(PlansService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly planActionLabel = planActionLabel;
  readonly planActionTone = planActionTone;
  readonly accessLabel = accessLabel;
  readonly accessTone = accessTone;
  readonly syncLabel = syncLabel;
  readonly syncTone = syncTone;
  readonly orgNeedsAttention = orgNeedsAttention;
  readonly planNeedsAttention = planNeedsAttention;

  readonly tab = signal<Tab>('add');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly assigned = signal<AppPlanOption[]>([]);
  readonly available = signal<AppPlanOption[]>([]);
  readonly results = signal<PlanAssignmentResult[] | null>(null);
  readonly resultsTitle = signal('');
  readonly expandedResults = signal<ReadonlySet<string>>(new Set());

  readonly search = signal('');
  readonly toAdd = signal<ReadonlySet<string>>(new Set());
  readonly toRemove = signal<ReadonlySet<string>>(new Set());

  private matches(plan: AppPlanOption): boolean {
    const query = this.search().trim().toLowerCase();
    if (!query) return true;
    return (
      this.planLabel(plan).toLowerCase().includes(query) ||
      plan.planName.toLowerCase().includes(query) ||
      plan.organizations.some((org) => org.organizationName.toLowerCase().includes(query))
    );
  }

  readonly visibleAssigned = computed(() => this.assigned().filter((plan) => this.matches(plan)));
  readonly visibleAvailable = computed(() => this.available().filter((plan) => this.matches(plan)));
  /** Primary-application plans can't be removed here, so they're never part of a selection. */
  private readonly removable = computed(() => this.visibleAssigned().filter((plan) => !plan.primaryApplication));

  readonly allAvailableSelected = computed(() => {
    const shown = this.visibleAvailable();
    return shown.length > 0 && shown.every((plan) => this.toAdd().has(plan.planId));
  });
  readonly allRemovableSelected = computed(() => {
    const shown = this.removable();
    return shown.length > 0 && shown.every((plan) => this.toRemove().has(plan.planId));
  });

  /** Distinct organizations the pending selection would reach. */
  readonly addReach = computed(() => this.reach(this.available(), this.toAdd()));
  readonly removeReach = computed(() => this.reach(this.assigned(), this.toRemove()));

  get appLabel(): string {
    return displayNameOrFallback(this.app, this.app.appId);
  }

  async ngOnInit(): Promise<void> {
    await this.load();
    // Nothing on a plan yet means the only useful thing to do is add; otherwise start on what exists.
    this.tab.set(this.assigned().length ? 'assigned' : 'add');
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const plans = await this.applications.listPlanAssignments(this.app.appId);
      this.assigned.set(plans.assigned);
      this.available.set(plans.available);
    } catch (error: unknown) {
      this.toast.show(this.messageOf(error, "Couldn't load subscription plans"), 'critical');
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    if (!this.busy()) this.closed.emit();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.search.set('');
  }

  toggle(set: 'add' | 'remove', planId: string): void {
    const target = set === 'add' ? this.toAdd : this.toRemove;
    target.update((current) => {
      const next = new Set(current);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  toggleAll(set: 'add' | 'remove'): void {
    const shown = (set === 'add' ? this.visibleAvailable() : this.removable()).map((plan) => plan.planId);
    const allSelected = set === 'add' ? this.allAvailableSelected() : this.allRemovableSelected();
    const target = set === 'add' ? this.toAdd : this.toRemove;
    target.update((current) => {
      const next = new Set(current);
      shown.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async addSelected(): Promise<void> {
    const planIds = [...this.toAdd()];
    if (!planIds.length || this.busy()) return;
    this.busy.set(true);
    try {
      const results = await this.applications.assignToPlans(this.app.appId, planIds);
      await this.afterChange(results, 'Added to plans');
      this.toAdd.set(new Set());
      this.toast.show(summarisePlans(results, 'Added to'), results.some(planNeedsAttention) ? 'neutral' : 'success');
    } catch (error: unknown) {
      this.toast.show(this.messageOf(error, 'Could not add the application to the plans'), 'critical');
    } finally {
      this.busy.set(false);
    }
  }

  async removeSelected(): Promise<void> {
    const planIds = [...this.toRemove()];
    if (!planIds.length || this.busy()) return;
    const plans = planIds.length;
    const orgs = this.removeReach();
    const decision = await this.confirm.open({
      title: `Remove ${this.appLabel} from ${plans} plan${plans === 1 ? '' : 's'}?`,
      message:
        `${orgs} subscribed organization${orgs === 1 ? '' : 's'} will no longer have it on ` +
        (plans === 1 ? 'that plan' : 'those plans') +
        (this.app.migrationApplication
          ? ", and its migration details are removed from each organization's schema unless another of their plans still includes it."
          : '.') +
        ' Existing roles and users are not changed.',
      confirmLabel: 'Remove from plans',
      danger: true
    });
    if (!decision.confirmed) return;

    this.busy.set(true);
    try {
      const results = await this.applications.removeFromPlans(this.app.appId, planIds);
      await this.afterChange(results, 'Removed from plans');
      this.toRemove.set(new Set());
      this.toast.show(summarisePlans(results, 'Removed from'), results.some(planNeedsAttention) ? 'neutral' : 'success');
    } catch (error: unknown) {
      this.toast.show(this.messageOf(error, 'Could not remove the application from the plans'), 'critical');
    } finally {
      this.busy.set(false);
    }
  }

  async resync(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const results = await this.applications.syncPlanSubscribers(this.app.appId);
      this.showResults(results, 'Sync results');
      this.toast.show(summarisePlans(results, 'Synced'), results.some(planNeedsAttention) ? 'neutral' : 'success');
    } catch (error: unknown) {
      this.toast.show(this.messageOf(error, 'Could not sync migration details'), 'critical');
    } finally {
      this.busy.set(false);
    }
  }

  private async afterChange(results: PlanAssignmentResult[], title: string): Promise<void> {
    this.showResults(results, title);
    this.search.set('');
    await this.load();
    // The Plans screen caches plan contents; this changed them.
    void this.plansService.refresh().catch(() => undefined);
  }

  private showResults(results: PlanAssignmentResult[], title: string): void {
    this.resultsTitle.set(title);
    // Problems first: they are what someone needs to act on. Those start expanded.
    const sorted = [...results].sort((a, b) => Number(planNeedsAttention(b)) - Number(planNeedsAttention(a)));
    this.results.set(sorted);
    this.expandedResults.set(new Set(sorted.filter(planNeedsAttention).map((r) => r.planId)));
  }

  toggleResult(planId: string): void {
    this.expandedResults.update((current) => {
      const next = new Set(current);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  dismissResults(): void {
    this.results.set(null);
  }

  planLabel(plan: AppPlanOption): string {
    return plan.displayName?.trim() || plan.planName;
  }

  limitLabel(value: number | null): string {
    return value === null || value < 0 ? 'Unlimited' : value.toLocaleString();
  }

  orgPreview(plan: AppPlanOption): string {
    const names = plan.organizations.map((org) => org.organizationName);
    if (!names.length) return 'No active subscribers';
    const shown = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${shown} +${names.length - 3} more` : shown;
  }

  trackByPlan = (_: number, item: { planId: string }) => item.planId;
  trackByOrg = (_: number, item: { orgId: string }) => item.orgId;

  private reach(plans: AppPlanOption[], selected: ReadonlySet<string>): number {
    return new Set(plans.filter((plan) => selected.has(plan.planId)).flatMap((plan) => plan.organizations.map((org) => org.orgId))).size;
  }

  private messageOf(error: unknown, fallback: string): string {
    const http = error as { status?: number; error?: { message?: string } };
    if (http?.status === 0) return 'Could not reach the server. Check your connection and try again.';
    return http?.error?.message || fallback;
  }
}

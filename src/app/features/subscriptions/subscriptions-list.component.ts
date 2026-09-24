import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { CountdownComponent } from '../../core/ui/countdown.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { TreeBranchComponent } from '../../core/ui/tree-branch.component';
import { OrganizationsService } from '../../services/organizations.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { PlansService } from '../../services/plans.service';
import { AuditService } from '../../services/audit.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { SubscriptionLifecycleService } from '../../services/subscription-lifecycle.service';
import { daysUntil, formatDate, formatDateTime, formatLimit, sortableDays, subscriptionStatusTone } from '../../core/status.util';
import { OrgSubscribedPlan, PlanStatus } from '../../models';

export interface OrgSubscriptionGroup {
  orgId: string;
  orgName: string;
  subscriptions: OrgSubscribedPlan[];
  soonestDays: number;
}

@Component({
  selector: 'app-subscriptions-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusPillComponent, CountdownComponent, EmptyStateComponent, TreeBranchComponent],
  templateUrl: './subscriptions-list.component.html',
  styleUrl: './subscriptions-list.component.scss'
})
export class SubscriptionsListComponent {
  organizations = inject(OrganizationsService);
  subscriptions = inject(SubscriptionsService);
  plans = inject(PlansService);
  audit = inject(AuditService);
  auth = inject(AuthService);
  private confirm = inject(ConfirmService);
  private lifecycle = inject(SubscriptionLifecycleService);
  private toast = inject(ToastService);

  // Extend/shorten/suspend/reactivate/cancel all mutate a real billing date or shut off a
  // customer's access outright — "Change plan" is the one lifecycle action that maps onto closing
  // or upgrading a deal, so it's the only one SALES gets here too.
  isSuperAdmin = computed(() => this.auth.role() === 'SUPER_ADMIN');

  showBack = false;
  backUrl: string | null = null;

  private route = inject(ActivatedRoute);

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('from') === 'overview') {
      this.showBack = true;
      this.backUrl = null;
    }
  }

  readonly expandedOrgs = signal<ReadonlySet<string>>(new Set<string>());

  readonly allCollapsed = computed(() => {
    const groups = this.orgGroups();
    const expanded = this.expandedOrgs();
    return groups.length > 0 && groups.every((group) => !expanded.has(group.orgId));
  });

  trackByOrgId = (_index: number, group: OrgSubscriptionGroup): string => group.orgId;

  trackBySubscriptionId = (_index: number, subscription: OrgSubscribedPlan): string => subscription.subscriptionId;

  isAzureManaged(subscription: OrgSubscribedPlan): boolean {
    return subscription.azureMarketplaceManaged === true;
  }

  isOrgCollapsed(group: OrgSubscriptionGroup): boolean {
    return !this.expandedOrgs().has(group.orgId);
  }

  toggleOrg(orgId: string): void {
    this.expandedOrgs.update((current) => {
      const next = new Set(current);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  expandAllOrgs(): void {
    this.expandedOrgs.set(new Set(this.orgGroups().map((group) => group.orgId)));
  }

  collapseAllOrgs(): void {
    this.expandedOrgs.set(new Set<string>());
  }

  tone = subscriptionStatusTone;
  formatDate = formatDate;
  formatDateTime = formatDateTime;
  formatLimit = formatLimit;

  statusFilter: PlanStatus | '' = '';
  expiringInDays: number | null = null;
  expandedId = signal<string | null>(null);

  changePlanTarget = signal<OrgSubscribedPlan | null>(null);
  changePlanNewId = '';

  // Plain method, not computed(): statusFilter/expiringInDays are ngModel-bound
  // plain fields, so a computed() would never re-run when only they change.
  rows(): OrgSubscribedPlan[] {
    return this.subscriptions
      .list()()
      .filter((s) => (!this.statusFilter || s.planStatus === this.statusFilter))
      .filter((s) => {
        if (this.expiringInDays === null) return true;
        const d = daysUntil(s.planEndDate);
        return d !== null && d >= 0 && d <= this.expiringInDays!;
      })
      .sort((a, b) => sortableDays(a.planEndDate) - sortableDays(b.planEndDate));
  }

  // An organization can hold several subscriptions at once (a renewal booked alongside the running
  // term, a second accelerator sold separately). Listed flat, the same organization repeated down
  // the page read as several unrelated customers, and nothing said which subscriptions belonged
  // together. Grouping makes the organization the unit of the page and the subscription the detail.
  orgGroups(): OrgSubscriptionGroup[] {
    const byOrg = new Map<string, OrgSubscribedPlan[]>();
    for (const subscription of this.rows()) {
      const bucket = byOrg.get(subscription.orgId);
      if (bucket) {
        bucket.push(subscription);
      } else {
        byOrg.set(subscription.orgId, [subscription]);
      }
    }

    return [...byOrg.entries()]
      .map(([orgId, subscriptions]) => ({
        orgId,
        orgName: this.orgName(orgId),
        subscriptions,
        // The group sorts by its most urgent subscription, so an organization with anything
        // expiring soon stays at the top of the page the way the flat list did.
        soonestDays: Math.min(...subscriptions.map((s) => sortableDays(s.planEndDate)))
      }))
      .sort((a, b) => a.soonestDays - b.soonestDays || a.orgName.localeCompare(b.orgName));
  }

  // "2 active, 1 expired" - reading the group header alone should tell you the org's standing.
  statusSummary(group: OrgSubscriptionGroup): string {
    const counts = new Map<PlanStatus, number>();
    for (const subscription of group.subscriptions) {
      counts.set(subscription.planStatus, (counts.get(subscription.planStatus) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([status, count]) => `${count} ${status.toLowerCase()}`)
      .join(', ');
  }

  orgName(orgId: string): string {
    return this.organizations.byId(orgId)?.organizationName ?? orgId;
  }

  planName(planId: string): string {
    return this.plans.displayNameForPlanId(planId);
  }

  defaultPlans() {
    return this.plans.list()().filter((p) => p.planType === 'DEFAULT');
  }

  customPlans() {
    return this.plans.list()().filter((p) => p.planType === 'CUSTOM' && p.planState !== 'ARCHIVED');
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  history(sub: OrgSubscribedPlan) {
    const orgName = this.orgName(sub.orgId);
    return this.audit
      .recentActivity()()
      .filter((e) => e.targetLabel.includes(orgName) || e.targetLabel.includes(sub.subscriptionId));
  }

  // Extending must land strictly after the current expiry — the day after today's end date is the
  // earliest valid choice, otherwise "extend" could silently shorten it instead. There's no upper
  // bound; a super admin can push it out as far as they need.
  async extend(sub: OrgSubscribedPlan): Promise<void> {
    await this.lifecycle.extend(sub);
  }

  async shorten(sub: OrgSubscribedPlan): Promise<void> {
    await this.lifecycle.shorten(sub);
  }

  openChangePlan(sub: OrgSubscribedPlan): void {
    this.changePlanTarget.set(sub);
    this.changePlanNewId = '';
  }

  closeChangePlan(): void {
    this.changePlanTarget.set(null);
  }

  async confirmChangePlan(): Promise<void> {
    const sub = this.changePlanTarget();
    if (!sub || !this.changePlanNewId) return;
    const currentPlan = this.plans.byId(sub.planId);
    const newPlan = this.plans.byId(this.changePlanNewId);
    const result = await this.confirm.open({
      title: 'Confirm plan change',
      message: `${this.orgName(sub.orgId)} — usage counters reset to zero once this change is applied.`,
      diffLines: [
        { label: 'Plan', from: currentPlan?.planName ?? '', to: newPlan?.planName ?? '' },
        { label: 'Applications enabled', from: String(currentPlan?.apps.filter((a) => a.accessStatus === 'ENABLED').length ?? 0), to: String(newPlan?.apps.filter((a) => a.accessStatus === 'ENABLED').length ?? 0) },
        { label: 'Billing mode', from: currentPlan?.billingMode ?? '', to: newPlan?.billingMode ?? '' }
      ],
      reasonRequired: true,
      confirmLabel: 'Apply plan change'
    });
    if (!result.confirmed) return;
    // call backend to apply the change — find orgId from the selected subscription
    await this.subscriptions.changePlanDirectly(sub.orgId, sub.subscriptionId, this.changePlanNewId, 'NOW', result.reason ?? '');
    this.toast.show(`Plan changed to ${newPlan?.planName}`, 'success');
    this.closeChangePlan();
  }

  async suspend(sub: OrgSubscribedPlan): Promise<void> {
    await this.lifecycle.suspend(sub);
  }

  async deactivate(sub: OrgSubscribedPlan): Promise<void> {
    await this.lifecycle.deactivate(sub);
  }

  async reactivate(sub: OrgSubscribedPlan): Promise<void> {
    await this.lifecycle.reactivate(sub);
  }

  async cancel(sub: OrgSubscribedPlan): Promise<void> {
    await this.lifecycle.cancel(sub);
  }
}

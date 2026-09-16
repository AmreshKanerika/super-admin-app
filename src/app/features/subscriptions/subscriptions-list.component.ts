import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { CountdownComponent } from '../../core/ui/countdown.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { OrganizationsService } from '../../services/organizations.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { PlansService } from '../../services/plans.service';
import { AuditService } from '../../services/audit.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { daysUntil, formatDate, formatDateTime, formatLimit, subscriptionStatusTone } from '../../core/status.util';
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
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusPillComponent, CountdownComponent, EmptyStateComponent],
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
        return d >= 0 && d <= this.expiringInDays!;
      })
      .sort((a, b) => daysUntil(a.planEndDate) - daysUntil(b.planEndDate));
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
        soonestDays: Math.min(...subscriptions.map((s) => daysUntil(s.planEndDate)))
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
    return this.plans.byId(planId)?.planName ?? planId;
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
    const currentEnd = new Date(sub.planEndDate);
    const proposed = new Date(currentEnd);
    proposed.setDate(proposed.getDate() + 90);

    const minDate = new Date(currentEnd);
    minDate.setDate(minDate.getDate() + 1);

    await this.confirm.open({
      title: 'Extend subscription',
      message: `${this.orgName(sub.orgId)} — current end date is ${formatDate(sub.planEndDate)}. Choose a new, later end date.`,
      reasonRequired: true,
      confirmLabel: 'Apply change',
      extraInput: {
        type: 'date',
        label: 'New plan end date',
        value: proposed.toISOString().slice(0, 10),
        min: minDate.toISOString().slice(0, 10)
      },
      onConfirm: async (reason: string, extra?: any) => {
        const iso = new Date(extra + 'T00:00:00.000Z').toISOString();
        await this.subscriptions.extend(sub.subscriptionId, iso, reason ?? '');
      }
    });
    this.toast.show('Subscription extended', 'success');
  }

  // Shortening must land strictly before the current expiry (otherwise it isn't shortening
  // anything) and no earlier than today or the plan's own start date, whichever is later — you
  // can't retroactively shorten a subscription into a date that's already in the past relative to
  // when it started, or before "now".
  async shorten(sub: OrgSubscribedPlan): Promise<void> {
    const currentEnd = new Date(sub.planEndDate);
    const proposed = new Date(currentEnd);
    proposed.setDate(proposed.getDate() - 30);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(sub.planStartDate);
    const minDate = start > today ? start : today;
    const maxDate = new Date(currentEnd);
    maxDate.setDate(maxDate.getDate() - 1);

    if (minDate >= maxDate) {
      this.toast.show('This subscription cannot be shortened any further', 'critical');
      return;
    }
    if (proposed < minDate) proposed.setTime(minDate.getTime());

    await this.confirm.open({
      title: 'Shorten subscription',
      message: `${this.orgName(sub.orgId)} — current end date is ${formatDate(sub.planEndDate)}. Choose a new, earlier end date.`,
      reasonRequired: true,
      danger: true,
      confirmLabel: 'Apply change',
      extraInput: {
        type: 'date',
        label: 'New plan end date',
        value: proposed.toISOString().slice(0, 10),
        min: minDate.toISOString().slice(0, 10),
        max: maxDate.toISOString().slice(0, 10)
      },
      onConfirm: async (reason: string, extra?: any) => {
        const iso = new Date(extra + 'T00:00:00.000Z').toISOString();
        await this.subscriptions.extend(sub.subscriptionId, iso, reason ?? '');
      }
    });
    this.toast.show('Subscription shortened', 'success');
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
    const result = await this.confirm.open({
      title: 'Suspend subscription',
      message: `${this.orgName(sub.orgId)} loses access to every application immediately.`,
      danger: true,
      reasonRequired: true,
      confirmLabel: 'Suspend access'
    });
    if (!result.confirmed) return;
    await this.subscriptions.setStatus(sub.subscriptionId, 'SUSPENDED', result.reason);
    this.toast.show('Subscription suspended', 'critical');
  }

  async reactivate(sub: OrgSubscribedPlan): Promise<void> {
    const result = await this.confirm.open({
      title: 'Reactivate subscription',
      message: `Access is restored immediately for ${this.orgName(sub.orgId)}.`,
      reasonRequired: true,
      confirmLabel: 'Reactivate'
    });
    if (!result.confirmed) return;
    await this.subscriptions.setStatus(sub.subscriptionId, 'ACTIVE', result.reason);
    this.toast.show('Subscription reactivated', 'success');
  }

  async cancel(sub: OrgSubscribedPlan): Promise<void> {
    const result = await this.confirm.open({
      title: 'Cancel subscription',
      message: `This ends ${this.orgName(sub.orgId)}'s subscription. It will not renew and access ends at the current expiry date.`,
      danger: true,
      requireTypedText: this.orgName(sub.orgId),
      confirmLabel: 'Cancel subscription'
    });
    if (!result.confirmed) return;
    await this.subscriptions.setStatus(sub.subscriptionId, 'CANCELLED', result.reason);
    this.toast.show('Subscription cancelled', 'critical');
  }
}

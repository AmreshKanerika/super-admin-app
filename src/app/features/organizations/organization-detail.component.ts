import { OrgUsersRolesComponent } from './org-access/org-users-roles.component';
import { ProcessingInsightsComponent } from './processing-insights/processing-insights.component';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { CountdownComponent } from '../../core/ui/countdown.component';
import { LimitsPanelComponent } from '../limits/limits-panel.component';
import { UsageLimitsComponent } from './usage-limits.component';
import { OrganizationsService } from '../../services/organizations.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { PlansService } from '../../services/plans.service';
import { NotificationsService } from '../../services/notifications.service';
import { AuditService } from '../../services/audit.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { formatDate, formatDateTime, subscriptionStatusTone } from '../../core/status.util';
import { OrgSubscribedPlan, OrganizationDomain, PlanChangeEffective, PlanUsageSummary } from '../../models';
import { OrganizationOnboardingService } from '../../services/organization-onboarding.service';
import { SubscriptionLifecycleService } from '../../services/subscription-lifecycle.service';

type Tab = 'overview' | 'subscriptions' | 'usage' | 'limits' | 'users' | 'processing' | 'notifications' | 'activity';

@Component({
  selector: 'app-organization-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    StatusPillComponent,
    CountdownComponent,
    LimitsPanelComponent,
    UsageLimitsComponent,
    OrgUsersRolesComponent,
    ProcessingInsightsComponent
  ],
  templateUrl: './organization-detail.component.html',
  styleUrl: './organization-detail.component.scss'
})
export class OrganizationDetailComponent {
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  auth = inject(AuthService);
  organizations = inject(OrganizationsService);
  subscriptions = inject(SubscriptionsService);
  plans = inject(PlansService);
  notifications = inject(NotificationsService);
  audit = inject(AuditService);
  private onboarding = inject(OrganizationOnboardingService);

  readonly domain = signal<OrganizationDomain | null>(null);
  readonly domainBusy = signal(false);
  readonly domainError = signal('');
  readonly passwordRevealed = signal(false);
  readonly credentialsAcknowledged = signal(false);
  readonly moreMenuOpen = signal(false);

  readonly domainUrl = computed(() => {
    const domain = this.domain();
    // domainName is stored as a full https URL (older rows may be a bare host) - never double the scheme
    return domain ? `https://${domain.domainName.replace(/^https?:\/\//, '')}` : '';
  });

  readonly domainHeadline = computed(() => {
    const domain = this.domain();
    if (!domain) {
      return '';
    }
    if (domain.domainStatus === 'ACTIVE') {
      return 'This organization is reachable at its URL and its administrators can sign in.';
    }
    if (domain.domainStatus === 'RELEASED') {
      return 'The reservation lapsed and the address was returned to the pool. Assign a new URL before activating.';
    }
    if (domain.daysUntilExpiry === null) {
      return 'Reserved but not live yet. Activate it to create the DNS record and the sign-in realm.';
    }
    const days = domain.daysUntilExpiry;
    return `Reserved but not live yet — the address is released in ${days} day${days === 1 ? '' : 's'} unless it is activated.`;
  });

  readonly maskedPassword = computed(() => {
    const password = this.domain()?.temporaryPassword;
    return password ? '•'.repeat(password.length) : '';
  });

  provisioningFacts = computed(() => {
    const domain = this.domain();
    const org = this.org();
    if (!domain || !org) {
      return [] as { label: string; value: string; state: 'done' | 'pending' | 'failed'; note?: string }[];
    }
    const live = domain.domainStatus === 'ACTIVE';
    const facts: { label: string; value: string; state: 'done' | 'pending' | 'failed'; note?: string }[] = [
      {
        label: 'DNS record',
        value: live ? (domain.dnsRecordCreated ? 'Created by FLIP' : 'Adopted from DevOps') : 'Created on activation',
        state: live ? 'done' : 'pending'
      },
      {
        label: 'Sign-in realm',
        value: live ? org.keycloakRealmName : 'Created on activation',
        state: live ? 'done' : 'pending'
      },
      { label: 'Data schema', value: org.schemaName, state: 'done' }
    ];

    if (domain.diAppRequested) {
      facts.push({
        label: 'Data integration app',
        value:
          domain.diAppStatus === 'PROVISIONED'
            ? 'Provisioned'
            : domain.diAppStatus === 'FAILED'
              ? 'Provisioning failed'
              : 'Provisioned on activation',
        state: domain.diAppStatus === 'PROVISIONED' ? 'done' : domain.diAppStatus === 'FAILED' ? 'failed' : 'pending',
        note: domain.diAppStatus === 'FAILED' ? domain.diAppMessage ?? undefined : undefined
      });
    }

    return facts;
  });

  toggleMoreMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.moreMenuOpen.update((open) => !open);
  }

  @HostListener('document:click')
  closeMoreMenu(): void {
    this.moreMenuOpen.set(false);
  }

  async copyToClipboard(value: string | null | undefined, label: string): Promise<void> {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      this.toast.show(`${label} copied`, 'success');
    } catch {
      this.toast.show(`Could not copy the ${label.toLowerCase()}`, 'critical');
    }
  }

  private async loadDomain(): Promise<void> {
    const organizationId = this.route.snapshot.paramMap.get('id');
    if (!organizationId) {
      return;
    }
    try {
      this.domain.set(await this.onboarding.getDomain(organizationId));
    } catch (error) {
      console.error('Failed to load the organization domain', error);
    }
  }

  dnsAlreadyProvisioned = false;

  async activateDomain(): Promise<void> {
    const organizationId = this.domain()?.organizationId;
    if (!organizationId) {
      return;
    }
    const result = await this.confirm.open({
      title: 'Activate domain',
      message: this.dnsAlreadyProvisioned
        ? `This adopts the existing DNS record for ${this.domain()!.domainName}, then creates the sign-in realm and data integration app.`
        : `This creates the DNS record for ${this.domain()!.domainName}, the sign-in realm and the data integration app, and brings the URL online.`,
      confirmLabel: 'Activate domain'
    });
    if (!result.confirmed) {
      return;
    }
    this.domainBusy.set(true);
    this.domainError.set('');
    try {
      this.passwordRevealed.set(false);
      this.credentialsAcknowledged.set(false);
      this.domain.set(await this.onboarding.activateDomain(organizationId, this.dnsAlreadyProvisioned));
      this.toast.show('Domain activated', 'success');
    } catch (error) {
      this.domainError.set((error as Error).message);
      this.toast.show('Could not activate the domain', 'critical');
    } finally {
      this.domainBusy.set(false);
    }
  }

  readonly diAppBusy = signal(false);

  async provisionDiApp(alreadyProvisioned: boolean): Promise<void> {
    const organizationId = this.domain()?.organizationId;
    if (!organizationId) {
      return;
    }
    const result = await this.confirm.open({
      title: alreadyProvisioned ? 'Mark the data integration app as ready' : 'Retry provisioning',
      message: alreadyProvisioned
        ? 'Use this when the app was deployed outside this console. Nothing is created — the console just stops reporting it as missing.'
        : 'This asks the provisioning service to set the data integration app up again.',
      confirmLabel: alreadyProvisioned ? 'Mark as ready' : 'Retry'
    });
    if (!result.confirmed) {
      return;
    }
    this.diAppBusy.set(true);
    this.domainError.set('');
    try {
      this.domain.set(await this.onboarding.provisionDiApp(organizationId, alreadyProvisioned));
      this.toast.show(alreadyProvisioned ? 'Data integration app linked' : 'Data integration app provisioned', 'success');
    } catch (error) {
      this.domainError.set((error as Error).message);
      this.toast.show('Could not update the data integration app', 'critical');
    } finally {
      this.diAppBusy.set(false);
    }
  }

  async deactivateDomain(): Promise<void> {
    const organizationId = this.domain()?.organizationId;
    if (!organizationId) {
      return;
    }
    const result = await this.confirm.open({
      title: 'Deactivate domain',
      message: `This removes the DNS record for ${this.domain()!.domainName}. The organization stops being reachable at that URL until it is activated again.`,
      danger: true,
      reasonRequired: true,
      confirmLabel: 'Deactivate domain'
    });
    if (!result.confirmed) {
      return;
    }
    this.domainBusy.set(true);
    this.domainError.set('');
    try {
      this.domain.set(await this.onboarding.deactivateDomain(organizationId));
      this.toast.show('Domain deactivated', 'success');
    } catch (error) {
      this.domainError.set((error as Error).message);
      this.toast.show('Could not deactivate the domain', 'critical');
    } finally {
      this.domainBusy.set(false);
    }
  }

  showBack = false;
  backUrl: string | null = null;

  private static readonly TABS: Tab[] = ['overview', 'subscriptions', 'usage', 'limits', 'users', 'processing', 'notifications', 'activity'];

  isSuperAdmin = computed(() => this.auth.role() === 'SUPER_ADMIN');
  // Assigning an additional plan is shared with SALES; see AuthService.canAssignPlan.
  canAssignPlan = computed(() => this.auth.canAssignPlan());

  constructor() {
    this.loadDomain();
    const q = this.route.snapshot.queryParamMap;
    this.showBack = true;
    // Arrived via a drill-down (e.g. a dashboard tile): prefer history so Back walks all the way
    // back through dashboard → organizations → detail. Otherwise (direct link, refresh, or the
    // normal organizations list) fall back to the organizations list, which is always correct.
    this.backUrl = q.get('from') === 'overview' ? null : '/organizations';

    // Deep-link support (e.g. "View users" / "View subscription" from the offboarding pre-check).
    // Checked against the role-filtered tab list, not the static one — a SALES deep link into
    // ?tab=limits must land on Overview instead of silently rendering a tab its own tab bar hides.
    const tab = q.get('tab') as Tab | null;
    if (tab && OrganizationDetailComponent.TABS.includes(tab) && this.tabs().some((t) => t.key === tab)) {
      this.activeTab.set(tab);
    }
  }

  tone = subscriptionStatusTone;
  formatDate = formatDate;
  formatDateTime = formatDateTime;

  orgId = this.route.snapshot.paramMap.get('id') ?? '';
  activeTab = signal<Tab>('overview');

  org = computed(() => this.organizations.byId(this.orgId));
  activeSub = computed(() => this.subscriptions.activeByOrg(this.orgId));
  allSubs = computed(() => this.subscriptions.byOrg(this.orgId));

  isAzureManaged = computed(() => this.org()?.azureMarketplaceManaged === true
    || this.allSubs().some((sub) => sub.azureMarketplaceManaged === true));

  readonly lifecycle = inject(SubscriptionLifecycleService);

  trackBySubscriptionId = (_index: number, subscription: OrgSubscribedPlan): string => subscription.subscriptionId;

  planName(planId?: string): string {
    if (!planId) return '—';
    return this.plans.displayNameForPlanId(planId);
  }

  activity = computed(() => {
    const org = this.org();
    if (!org) return [];
    // Matched on targetId, not on the label. Most org-scoped actions (limit overrides, usage
    // resets, every subscription action) logged a UUID rather than the organization's name, so a
    // name substring match silently hid all of them from this tab. The label match is kept as a
    // fallback for entries written before targetId was populated.
    return this.audit
      .recentActivity()()
      .filter((e) => (e.targetId ? e.targetId === org.orgId : e.targetLabel.includes(org.organizationName)));
  });

  notificationLog = computed(() => this.notifications.logByOrg(this.orgId));

  // Apps & limits is raw per-app numeric design-time/runtime limits — meaningful to whoever
  // configures a plan, not to whoever's tracking a customer relationship. Filtered here (the actual
  // content gate), not just left out of some separate nav list, so a stale deep link can't reach it.
  private static readonly ALL_TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'subscriptions', label: 'Subscriptions' },
    // Usage answers "can this customer still work, and on what" — the question asked before
    // granting a reset — so unlike Apps & limits (which configures limits) it is not super-admin
    // only. The reset controls inside it still are.
    { key: 'usage', label: 'Usage & resets' },
    { key: 'limits', label: 'Apps & limits' },
    { key: 'users', label: 'Users & roles' },
    // Read-only file-processing numbers from the organization's own schema; open to Sales as well.
    { key: 'processing', label: 'Processing insights' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'activity', label: 'Activity' }
  ];

  tabs = computed(() => OrganizationDetailComponent.ALL_TABS.filter((t) => t.key !== 'limits' || this.isSuperAdmin()));

  async extendSubscription(): Promise<void> {
    const sub = this.activeSub();
    if (!sub) return;
    // open-ended subscription (no end date): extend from today
    const currentEnd = sub.planEndDate ? new Date(sub.planEndDate) : new Date();
    const proposed = new Date(currentEnd);
    proposed.setDate(proposed.getDate() + 90);
    const result = await this.confirm.open({
      title: 'Extend subscription',
      message: 'This pushes the subscription end date out and cancels any pending expiry reminders for the old date.',
      diffLines: [{ label: 'Plan end date', from: formatDate(sub.planEndDate), to: formatDate(proposed.toISOString()) }],
      reasonRequired: true,
      confirmLabel: 'Extend by 90 days'
    });
    if (!result.confirmed) return;
    this.subscriptions.extend(sub.subscriptionId, proposed.toISOString(), result.reason ?? '');
    this.toast.show('Subscription extended by 90 days', 'success');
  }

  async suspend(): Promise<void> {
    const sub = this.activeSub();
    if (!sub) return;
    const result = await this.confirm.open({
      title: 'Suspend subscription',
      message: 'The organization loses access to every application immediately. Use this for billing or compliance holds.',
      danger: true,
      reasonRequired: true,
      confirmLabel: 'Suspend access'
    });
    if (!result.confirmed) return;
    await this.subscriptions.setStatus(sub.subscriptionId, 'SUSPENDED', result.reason);
    this.toast.show('Subscription suspended', 'critical');
  }

  async reactivate(): Promise<void> {
    const sub = this.activeSub();
    if (!sub) return;
    const result = await this.confirm.open({
      title: 'Reactivate subscription',
      message: 'Access to every previously enabled application is restored immediately.',
      reasonRequired: true,
      confirmLabel: 'Reactivate'
    });
    if (!result.confirmed) return;
    await this.subscriptions.setStatus(sub.subscriptionId, 'ACTIVE', result.reason);
    this.toast.show('Subscription reactivated', 'success');
  }

  async sendReminderNow(): Promise<void> {
    const org = this.org();
    const sub = this.activeSub();
    if (!org || !sub) return;
    if (!sub.planEndDate) {
      this.toast.show('This subscription has no end date, so there is nothing to remind about', 'critical');
      return;
    }
    const days = Math.max(0, Math.round((+new Date(sub.planEndDate) - Date.now()) / 86_400_000));
    try {
      await this.notifications.sendReminder(org.orgId, sub.subscriptionId, org.adminEmail, 7, `Your FLIP subscription expires in ${days} days`);
      this.toast.show(`Reminder sent to ${org.adminEmail}`, 'success');
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to send reminder'), 'critical');
    }
  }

  // --- Change plan (direct, super-admin authority — the only path; there is no separate review
  // step since a super admin approving their own request was never a real separation of duties) ---

  changePlanOpen = signal(false);
  changePlanNewPlanId = '';
  changePlanEffective: PlanChangeEffective = 'NOW';
  changePlanNote = '';
  changePlanUsage = signal<PlanUsageSummary | null>(null);
  changePlanUsageLoading = signal(false);
  changePlanSubmitting = signal(false);

  otherPlans = computed(() => {
    const sub = this.activeSub();
    return this.plans.list()().filter((p) => p.planState !== 'ARCHIVED' && p.planId !== sub?.planId);
  });

  async openChangePlan(): Promise<void> {
    const sub = this.activeSub();
    if (!sub) return;
    this.changePlanNewPlanId = '';
    this.changePlanEffective = 'NOW';
    this.changePlanNote = '';
    this.changePlanUsage.set(null);
    this.changePlanOpen.set(true);

    this.changePlanUsageLoading.set(true);
    try {
      this.changePlanUsage.set(await this.subscriptions.getUsageSummary(this.orgId, sub.subscriptionId));
    } catch (err) {
      console.error('Failed to load usage summary', err);
    } finally {
      this.changePlanUsageLoading.set(false);
    }
  }

  closeChangePlan(): void {
    this.changePlanOpen.set(false);
  }

  async submitChangePlan(): Promise<void> {
    const sub = this.activeSub();
    if (!sub || !this.changePlanNewPlanId) return;

    this.changePlanSubmitting.set(true);
    try {
      await this.subscriptions.changePlanDirectly(this.orgId, sub.subscriptionId, this.changePlanNewPlanId, this.changePlanEffective, this.changePlanNote);
      this.toast.show(
        this.changePlanEffective === 'NOW' ? 'Plan changed and applied immediately' : "Plan change scheduled for the current plan's end date",
        'success'
      );
      this.changePlanOpen.set(false);
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to change plan'), 'critical');
    } finally {
      this.changePlanSubmitting.set(false);
    }
  }

  // --- Edit organization (name + tier only — domain/realm/schema stay immutable) ---

  editOpen = signal(false);
  editName = '';
  editIsPaidOrg = true;
  editSubmitting = signal(false);

  openEdit(): void {
    const org = this.org();
    if (!org) return;
    this.editName = org.organizationName;
    this.editIsPaidOrg = org.isPaidOrg;
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  async submitEdit(): Promise<void> {
    if (!this.editName.trim()) return;
    this.editSubmitting.set(true);
    try {
      await this.organizations.update(this.orgId, this.editName.trim(), this.editIsPaidOrg);
      this.toast.show('Organization updated', 'success');
      this.editOpen.set(false);
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to update organization'), 'critical');
    } finally {
      this.editSubmitting.set(false);
    }
  }

  private errorMessage(err: unknown, fallback: string): string {
    const message = (err as { error?: { message?: string } })?.error?.message;
    return message || fallback;
  }
}

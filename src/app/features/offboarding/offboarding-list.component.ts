import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { daysUntil, formatDate, subscriptionStatusTone } from '../../core/status.util';
import { OrganizationsService } from '../../services/organizations.service';
import { OffboardingService } from '../../services/offboarding.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { OrgAccessService } from '../../services/org-access.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { PlansService } from '../../services/plans.service';
import { OffboardingPreCheck, OrgUser, Organization } from '../../models';

@Component({
  selector: 'app-offboarding-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent, StatusPillComponent],
  templateUrl: './offboarding-list.component.html',
  styleUrl: './offboarding-list.component.scss'
})
export class OffboardingListComponent implements OnInit {
  organizations = inject(OrganizationsService);
  offboarding = inject(OffboardingService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private route = inject(ActivatedRoute);
  private orgAccess = inject(OrgAccessService);
  private subscriptions = inject(SubscriptionsService);
  private plans = inject(PlansService);

  showBack = false;
  backUrl: string | null = null;

  formatDate = formatDate;

  search = signal('');
  statusFilter = signal<StatusFilter>('ALL');

  // Split once so both the counts and the filtered list read from the same partition.
  private matchingSearch = computed(() => {
    const term = this.search().trim().toLowerCase();
    const list = this.organizations.list()();
    if (!term) return list;
    return list.filter(
      // domainName is null for orgs without a URL; calling toLowerCase() on it threw and broke search
      (o) => (o.organizationName ?? '').toLowerCase().includes(term) || (o.domainName ?? '').toLowerCase().includes(term)
    );
  });

  // "Onboarded" filter: newest first by default, or an order / recent window (newest first).
  readonly onboardedOptions: { value: OnboardedView; label: string }[] = [
    { value: 'latest', label: 'Latest first' },
    { value: 'earliest', label: 'Earliest first' },
    { value: 'last7', label: 'Last 7 days' },
    { value: 'last30', label: 'Last 30 days' },
    { value: 'last90', label: 'Last 90 days' }
  ];
  onboardedView = signal<OnboardedView>('latest');

  private matchingSearchAndDate = computed(() => {
    const view = this.onboardedView();
    const windowDays = WINDOW_DAYS[view];
    const cutoff = windowDays ? Date.now() - windowDays * 86_400_000 : null;
    const list = cutoff === null
      ? this.matchingSearch()
      : this.matchingSearch().filter((o) => createdTime(o) >= cutoff);
    const direction = view === 'earliest' ? 1 : -1;
    return [...list].sort((a, b) =>
      (createdTime(a) - createdTime(b)) * direction || a.organizationName.localeCompare(b.organizationName));
  });

  counts = computed(() => {
    const list = this.matchingSearchAndDate();
    const expired = list.filter((o) => o.isDecommissioned).length;
    const longExpired = list.filter((o) => this.isLongExpired(o)).length;
    return { all: list.length, active: list.length - expired, expired, longExpired };
  });

  filtered = computed(() => {
    const list = this.matchingSearchAndDate();
    const filter = this.statusFilter();
    if (filter === 'ACTIVE') return list.filter((o) => !o.isDecommissioned);
    if (filter === 'EXPIRED') return list.filter((o) => o.isDecommissioned);
    if (filter === 'LONG_EXPIRED') return list.filter((o) => this.isLongExpired(o));
    return list;
  });

  total = computed(() => this.organizations.list()().length);

  filtersActive = computed(() => !!this.search().trim() || this.onboardedView() !== 'latest' || this.statusFilter() !== 'ALL');

  readonly longExpiredDays = LONG_EXPIRED_DAYS;

  // Summary tiles double as the status filter; clicking the active tile again clears it.
  setFilter(filter: StatusFilter): void {
    this.statusFilter.set(this.statusFilter() === filter ? 'ALL' : filter);
  }

  clearFilters(): void {
    this.search.set('');
    this.onboardedView.set('latest');
    this.statusFilter.set('ALL');
  }

  // Days since access was blocked; null when the expiry date is unknown.
  daysExpired(org: Organization): number | null {
    const days = daysUntil(org.pendingDeletionAt);
    return days === null ? null : Math.max(0, -days);
  }

  expiredAgo(org: Organization): string {
    const days = this.daysExpired(org);
    if (days === null) return '';
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 60) return `${days} days ago`;
    const months = Math.round(days / 30);
    return months < 24 ? `${months} months ago` : `${Math.round(days / 365)} years ago`;
  }

  private isLongExpired(org: Organization): boolean {
    return org.isDecommissioned && (this.daysExpired(org) ?? 0) >= LONG_EXPIRED_DAYS;
  }

  // Per-row lock so a slow reactivate can't be fired twice.
  busyOrgId = signal<string | null>(null);

  targetOrgId = signal<string | null>(null);
  preCheck = signal<OffboardingPreCheck | null>(null);
  precheckLoading = signal(false);
  reason = '';
  confirmText = '';
  submitting = signal(false);

  /** "View" opens these lists inside the dialog instead of a new tab. */
  readonly detailOpen = signal<'users' | 'subs' | null>(null);
  readonly orgUsers = signal<OrgUser[] | null>(null);
  readonly usersLoading = signal(false);
  readonly usersError = signal(false);
  readonly subTone = subscriptionStatusTone;

  /** Live subscriptions first, then the rest, newest end date first. */
  readonly targetSubscriptions = computed(() => {
    const id = this.targetOrgId();
    if (!id) return [];
    const live = (status: string) => ['ACTIVE', 'UPCOMING', 'SUSPENDED'].includes(status) ? 0 : 1;
    return [...this.subscriptions.byOrg(id)].sort((a, b) =>
      live(a.planStatus) - live(b.planStatus) || (b.planEndDate ?? '').localeCompare(a.planEndDate ?? ''));
  });

  async toggleDetail(kind: 'users' | 'subs'): Promise<void> {
    if (this.detailOpen() === kind) {
      this.detailOpen.set(null);
      return;
    }
    this.detailOpen.set(kind);
    const id = this.targetOrgId();
    // Users are fetched once per dialog, the first time the list is opened.
    if (kind === 'users' && id && this.orgUsers() === null && !this.usersLoading()) {
      this.usersLoading.set(true);
      this.usersError.set(false);
      try {
        const response = await this.orgAccess.listUsers(id);
        if (this.targetOrgId() === id) this.orgUsers.set(response.users ?? []);
      } catch {
        this.usersError.set(true);
      } finally {
        this.usersLoading.set(false);
      }
    }
  }

  retryUsers(): void {
    this.orgUsers.set(null);
    this.detailOpen.set(null);
    this.toggleDetail('users');
  }

  planName(planId: string): string {
    return this.plans.displayNameForPlanId(planId) || planId;
  }

  userName(user: OrgUser): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
  }

  statusLabel(status: string): string {
    return status ? status.charAt(0) + status.slice(1).toLowerCase() : '';
  }

  ngOnInit(): void {
    const orgId = this.route.snapshot.queryParamMap.get('orgId');
    if (orgId) this.startOffboard(orgId);

    const from = this.route.snapshot.queryParamMap.get('from');
    if (from === 'overview') {
      this.showBack = true;
      this.backUrl = null;
    }
  }

  async startOffboard(orgId: string): Promise<void> {
    this.targetOrgId.set(orgId);
    this.resetDetails();
    this.reason = '';
    this.confirmText = '';
    this.precheckLoading.set(true);
    try {
      this.preCheck.set(await this.offboarding.preCheck(orgId));
    } catch (err) {
      this.toast.show('Could not load pre-check data — check your connection and try again.', 'critical');
      this.closeModal();
    } finally {
      this.precheckLoading.set(false);
    }
  }

  closeModal(): void {
    // Closing mid-request would hide the outcome; the toast still arrives, but keep the dialog until then.
    if (this.submitting()) return;
    this.targetOrgId.set(null);
    this.preCheck.set(null);
    this.resetDetails();
  }

  private resetDetails(): void {
    this.detailOpen.set(null);
    this.orgUsers.set(null);
    this.usersError.set(false);
  }

  targetOrgName(): string {
    const id = this.targetOrgId();
    return id ? this.organizations.byId(id)?.organizationName ?? '' : '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.targetOrgId()) this.closeModal();
  }

  // The name must be known: opened via ?orgId= before the org list loads, it is '' and an empty
  // confirm box would otherwise "match" it.
  canExecute(): boolean {
    const name = this.targetOrgName();
    return !!name && this.confirmText === name && !!this.reason.trim() && !this.precheckLoading();
  }

  async execute(): Promise<void> {
    const orgId = this.targetOrgId();
    if (!orgId || !this.canExecute()) return;
    this.submitting.set(true);
    try {
      await this.offboarding.expire(orgId, this.reason);
      this.toast.show('Organization expired — access is blocked, no data was deleted', 'success');
      this.closeModal();
    } catch (err: unknown) {
      this.toast.show(this.errorMessage(err, 'Failed to expire organization'), 'critical');
    } finally {
      this.submitting.set(false);
    }
  }

  async reactivate(orgId: string): Promise<void> {
    if (this.busyOrgId()) return;
    const orgName = this.organizations.byId(orgId)?.organizationName ?? orgId;
    // Reactivating restores sign-in for every user at once, so it gets a (non-destructive) confirm.
    // onConfirm keeps the dialog open with its spinner and shows any API error inside it.
    this.busyOrgId.set(orgId);
    try {
      const result = await this.confirm.open({
        title: `Reactivate ${orgName}?`,
        message: 'Users of this organization will be able to sign in again. Nothing was deleted while it was expired, so their data is exactly as they left it.',
        confirmLabel: 'Reactivate',
        onConfirm: async () => {
          await this.offboarding.reactivate(orgId);
        }
      });
      if (result.confirmed) this.toast.show('Organization reactivated', 'success');
    } finally {
      this.busyOrgId.set(null);
    }
  }

  async purgeNow(orgId: string): Promise<void> {
    const orgName = this.organizations.byId(orgId)?.organizationName ?? orgId;
    // This is a slow, real backend operation (hard-delete + archive + Keycloak realm + DNS
    // teardown) — onConfirm keeps the dialog open with a "Working…" spinner until it actually
    // finishes, instead of the dialog closing the instant the button is clicked and leaving several
    // silent seconds before a toast eventually appears.
    const result = await this.confirm.open({
      title: `Permanently delete ${orgName}?`,
      message: 'This immediately archives and permanently deletes every record for this organization — its data, database, login system, and web address. This cannot be undone. Expiring the organization (the default "Offboard" action) does not do this — use it instead unless you specifically need to destroy the data.',
      danger: true,
      requireTypedText: orgName,
      confirmLabel: 'Permanently delete',
      onConfirm: async () => {
        await this.offboarding.purgeNow(orgId, 'Purged via "Purge now" action');
      }
    });
    if (!result.confirmed) return;
    this.toast.show('Organization archived and permanently deleted', 'success');
  }

  private errorMessage(err: unknown, fallback: string): string {
    const httpError = err as { error?: { message?: string }; message?: string };
    return httpError?.error?.message || httpError?.message || fallback;
  }
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'EXPIRED' | 'LONG_EXPIRED';
// Expired this long and still not reactivated: likely candidates for permanent deletion.
const LONG_EXPIRED_DAYS = 90;

type OnboardedView = 'latest' | 'earliest' | 'last7' | 'last30' | 'last90';
const WINDOW_DAYS: Partial<Record<OnboardedView, number>> = { last7: 7, last30: 30, last90: 90 };

// organizations1.created_date; rows without a parsable date sort as oldest.
function createdTime(org: { createdDate: string }): number {
  return Date.parse(org.createdDate) || 0;
}

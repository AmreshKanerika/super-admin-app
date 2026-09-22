import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { CountdownComponent } from '../../core/ui/countdown.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { ViewToggleComponent } from '../../core/ui/view-toggle.component';
import { ScrollSentinelComponent } from '../../core/ui/scroll-sentinel.component';
import { ViewModeService, ViewMode } from '../../core/view-mode.service';
import { OverviewService, OrgOverviewRow } from '../../services/overview.service';
import { PlansService } from '../../services/plans.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { subscriptionStatusTone, formatDate } from '../../core/status.util';
import { PlanStatus } from '../../models';

type SortKey = 'name' | 'expiry';

@Component({
  selector: 'app-organizations-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusPillComponent, CountdownComponent, EmptyStateComponent, ViewToggleComponent, ScrollSentinelComponent],
  templateUrl: './organizations-list.component.html',
  styleUrl: './organizations-list.component.scss'
})
export class OrganizationsListComponent {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  overview = inject(OverviewService);

  isSuperAdmin = computed(() => this.auth.role() === 'SUPER_ADMIN');

  // Defaults to the list: this screen is most often opened to scan for one organization or to
  // work an attention queue, and a table compares rows far better than a grid does.
  private viewModes = inject(ViewModeService);
  readonly view = this.viewModes.mode('organizations', 'list');

  setView(mode: ViewMode): void {
    this.viewModes.set('organizations', mode);
  }
  plans = inject(PlansService);

  tone = subscriptionStatusTone;
  formatDate = formatDate;

  search = '';
  planStatus: PlanStatus | '' = '';
  planId = '';
  expiringInDays: number | null = null;
  paidOnly: boolean | null = null;
  hasSubscription: boolean | null = null;
  createdWithinDays: number | null = null;
  needsActivation = false;
  needsAttention = false;

  sortKey = signal<SortKey>('expiry');
  sortAsc = signal(true);
  private static readonly ROWS_PER_SCROLL_STEP = 25;

  visibleLimit = OrganizationsListComponent.ROWS_PER_SCROLL_STEP;
  private lastFilterSignature = '';

  statusOptions: PlanStatus[] = ['ACTIVE', 'INACTIVE', 'EXPIRED', 'SUSPENDED', 'UNSUBSCRIBED', 'UPCOMING', 'CANCELLED'];

  showBack = false;
  backUrl: string | null = null;

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    this.planStatus = (q.get('planStatus') as PlanStatus) ?? '';
    this.expiringInDays = q.get('expiringInDays') ? Number(q.get('expiringInDays')) : null;
    this.planId = q.get('planId') ?? '';
    this.paidOnly = q.get('isPaidOrg') === 'true' ? true : null;
    this.hasSubscription = q.get('hasSubscription') === 'false' ? false : null;
    this.createdWithinDays = q.get('createdWithinDays') ? Number(q.get('createdWithinDays')) : null;
    this.needsActivation = q.get('needsActivation') === 'true';
    this.needsAttention = q.get('needsAttention') === 'true';

    const from = q.get('from');
    if (from === 'overview') {
      // Show back arrow and use browser history so back navigates along the same forward path
      this.showBack = true;
      this.backUrl = null; // prefer location.back() over fixed URL for a natural flow
    }
  }

  // Plain methods, not computed(): several inputs here (search, planStatus, planId,
  // expiringInDays, paidOnly) are ngModel-bound plain fields, not signals, so a
  // computed() would never see them change and would go stale. Angular's default
  // change detection re-evaluates template method calls every cycle, which keeps
  // this correct at the data volumes this app deals with.
  filtered(): OrgOverviewRow[] {
    const rows = this.overview.filter(this.overview.rows(), {
      search: this.search,
      planStatus: this.planStatus || undefined,
      planId: this.planId || undefined,
      expiringInDays: this.expiringInDays ?? undefined,
      isPaidOrg: this.paidOnly,
      hasSubscription: this.hasSubscription,
      createdWithinDays: this.createdWithinDays ?? undefined,
      needsActivation: this.needsActivation,
      needsAttention: this.needsAttention
    });
    const scoped = this.needsActivation
      ? rows.filter((row) => row.org.domainStatus && row.org.domainStatus !== 'ACTIVE')
      : rows;
    const sorted = [...scoped].sort((a, b) => {
      if (this.needsAttention && this.sortKey() === 'expiry') {
        const priority = this.overview.attentionReasons(a)[0].priority - this.overview.attentionReasons(b)[0].priority;
        if (priority) return priority;
      }
      let cmp = 0;
      if (this.sortKey() === 'name') cmp = a.org.organizationName.localeCompare(b.org.organizationName);
      else cmp = (a.daysToExpiry ?? 999999) - (b.daysToExpiry ?? 999999);
      return this.sortAsc() ? cmp : -cmp;
    });
    return sorted;
  }

  visibleRows(): OrgOverviewRow[] {
    const rows = this.filtered();
    const signature = this.currentFilterSignature();
    if (signature !== this.lastFilterSignature) {
      this.lastFilterSignature = signature;
      this.visibleLimit = OrganizationsListComponent.ROWS_PER_SCROLL_STEP;
    }
    return rows.slice(0, this.visibleLimit);
  }

  hasMoreRowsBelow(): boolean {
    return this.filtered().length > this.visibleLimit;
  }

  showNextRows(): void {
    this.visibleLimit += OrganizationsListComponent.ROWS_PER_SCROLL_STEP;
  }

  private currentFilterSignature(): string {
    return [
      this.search,
      this.planStatus,
      this.planId,
      this.expiringInDays,
      this.paidOnly,
      this.hasSubscription,
      this.createdWithinDays,
      this.needsActivation,
      this.needsAttention,
      this.sortKey(),
      this.sortAsc()
    ].join('|');
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortAsc.set(!this.sortAsc());
    else {
      this.sortKey.set(key);
      this.sortAsc.set(true);
    }
  }

  onFilterChange(): void {
    this.visibleLimit = OrganizationsListComponent.ROWS_PER_SCROLL_STEP;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        planStatus: this.planStatus || null,
        planId: this.planId || null,
        expiringInDays: this.expiringInDays ?? null,
        isPaidOrg: this.paidOnly === true ? 'true' : null,
        hasSubscription: this.hasSubscription === false ? 'false' : null,
        createdWithinDays: this.createdWithinDays ?? null,
        needsActivation: this.needsActivation ? 'true' : null,
        needsAttention: this.needsAttention ? 'true' : null
      },
      queryParamsHandling: 'merge'
    });
  }

  clearFilter(field: 'planStatus' | 'planId' | 'expiringInDays' | 'paidOnly' | 'hasSubscription' | 'createdWithinDays' | 'needsActivation' | 'needsAttention'): void {
    if (field === 'paidOnly' || field === 'hasSubscription' || field === 'createdWithinDays') this[field] = null;
    else if (field === 'needsActivation') this.needsActivation = false;
    else if (field === 'needsAttention') this.needsAttention = false;
    else (this[field] as any) = field === 'expiringInDays' ? null : '';
    this.onFilterChange();
  }

  hasAnyFilter(): boolean {
    return !!(
      this.search.trim() ||
      this.planStatus ||
      this.planId ||
      this.expiringInDays ||
      this.paidOnly !== null ||
      this.hasSubscription !== null ||
      this.createdWithinDays ||
      this.needsActivation ||
      this.needsAttention
    );
  }

  resetFilters(): void {
    this.search = '';
    this.planStatus = '';
    this.planId = '';
    this.expiringInDays = null;
    this.paidOnly = null;
    this.hasSubscription = null;
    this.createdWithinDays = null;
    this.needsActivation = false;
    this.needsAttention = false;
    this.onFilterChange();
  }

  planName(planId?: string): string {
    if (!planId) return '—';
    return this.plans.displayNameForPlanId(planId);
  }

  exportCsv(): void {
    const rows = this.filtered();
    const header = ['Organization', 'Domain', 'Plan', 'Status', 'Start date', 'Expiry date'];
    const lines = rows.map((r) =>
      [
        r.org.organizationName,
        r.org.domainName,
        this.planName(r.subscription?.planId),
        r.subscription?.planStatus ?? '',
        r.subscription ? formatDate(r.subscription.planStartDate) : '',
        r.subscription ? formatDate(r.subscription.planEndDate) : ''
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'organizations.csv';
    a.click();
    URL.revokeObjectURL(url);
    this.toast.show(`Exported ${rows.length} organizations to CSV`, 'success');
  }

  pendingActivationCount(): number {
    return this.overview.rows().filter((row) => row.org.domainStatus && row.org.domainStatus !== 'ACTIVE').length;
  }

  domainChipTitle(org: { domainStatus: string | null; domainDaysUntilExpiry: number | null }): string {
    if (org.domainStatus === 'RELEASED') {
      return 'The reservation lapsed and the prefix was released — assign a new URL to bring this organization online.';
    }
    if (org.domainDaysUntilExpiry === null) {
      return 'The URL is reserved but no DNS record exists yet. Activate it from the organization page.';
    }
    return `The URL is reserved but no DNS record exists yet. Released in ${org.domainDaysUntilExpiry} day${
      org.domainDaysUntilExpiry === 1 ? '' : 's'
    } if it is not activated.`;
  }

  rowKey(_index: number, row: OrgOverviewRow): string {
    return row.org.orgId;
  }
}

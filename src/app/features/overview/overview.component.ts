import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { OverviewService, OrgOverviewRow } from '../../services/overview.service';
import { PlansService } from '../../services/plans.service';
import {
  AnalyticsService,
  BILLING_LABEL,
  BillingKey,
  CHANNEL_COLOR,
  CHANNEL_LABEL,
  CrossDim,
  DateBasis,
  KpiDefinition,
  RangePreset,
  STATUS_LABEL,
  StatusKey,
  billingKeyOf,
  channelKeyOf,
  statusKeyOf
} from '../../services/analytics.service';
import { ChartCardComponent } from '../../core/charts/chart-card.component';
import { DonutChartComponent } from '../../core/charts/donut-chart.component';
import { LineChartComponent } from '../../core/charts/line-chart.component';
import { HbarChartComponent } from '../../core/charts/hbar-chart.component';
import { MeterComponent } from '../../core/charts/meter.component';
import { ScrollSentinelComponent } from '../../core/ui/scroll-sentinel.component';
import { CountdownComponent } from '../../core/ui/countdown.component';
import {
  BarDatum,
  ChartSeries,
  DonutSlice,
  SEMANTIC,
  STATUS_COLOR,
  TREND_COLOR,
  TableRow,
  VIZ_SLOT,
  percent
} from '../../core/charts/chart.types';
import { formatDate } from '../../core/status.util';

type SortKey = 'name' | 'end' | 'status';

interface PresetOption {
  key: RangePreset;
  label: string;
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [
    ScrollSentinelComponent,
    CommonModule,
    FormsModule,
    RouterLink,
    ChartCardComponent,
    DonutChartComponent,
    LineChartComponent,
    HbarChartComponent,

    MeterComponent,
    CountdownComponent
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss'
})
export class OverviewComponent {
  auth = inject(AuthService);
  overview = inject(OverviewService);
  plans = inject(PlansService);
  a = inject(AnalyticsService);

  formatDate = formatDate;
  statusLabel = STATUS_LABEL;
  billingLabel = BILLING_LABEL;

  isSuperAdmin = computed(() => this.auth.role() === 'SUPER_ADMIN');

  greetingName(): string {
    const name = this.auth.currentUser()?.name;
    return name ? name.split(' ')[0] : 'there';
  }

  // --- slicer --------------------------------------------------------------

  readonly presets: PresetOption[] = [
    { key: '6M', label: 'Last 6 months' },
    { key: 'ALL', label: 'All time' },
    { key: '7D', label: 'Last 7 days' },
    { key: '30D', label: 'Last 30 days' },
    { key: '90D', label: 'Last 90 days' },
    { key: 'MTD', label: 'Month to date' },
    { key: 'QTD', label: 'Quarter to date' },
    { key: 'YTD', label: 'Year to date' },
    { key: 'CUSTOM', label: 'Custom…' }
  ];

  readonly basisOptions: { key: DateBasis; label: string }[] = [
    { key: 'ONBOARDED', label: 'Onboarding date' },
    { key: 'SUB_START', label: 'Subscription start' },
    { key: 'SUB_END', label: 'Subscription end' }
  ];

  setPreset(preset: RangePreset): void {
    this.a.setPreset(preset);
    this.trendPage.set(0);
    if (preset === 'CUSTOM' && !this.a.customFrom() && !this.a.customTo()) {
      // Seed the custom range with the last 30 days so the two pickers open on
      // something sensible instead of an empty pair that filters nothing.
      const now = new Date();
      const from = new Date(now.getTime() - 29 * 86_400_000);
      this.a.customFrom.set(toLocalInput(from));
      this.a.customTo.set(toLocalInput(now));
    }
  }

  onCustomChange(): void {
    this.a.preset.set('CUSTOM');
    this.a.clearDim('period');
  }

  /** The one-line answer to "what am I looking at?" */
  readonly scopeSentence = computed(() => {
    const total = this.a.totalOrganizations();
    const grand = this.a.grandTotal();
    if (!this.a.hasAnyFilter()) return `All ${grand} organizations on the platform.`;
    const bits: string[] = [];
    if (this.a.hasWindow()) bits.push(`${this.a.windowLabel().toLowerCase()} by ${this.a.basisLabel()}`);
    const chips = this.a.activeChips().length;
    if (chips) bits.push(`${chips} ${chips === 1 ? 'filter' : 'filters'}`);
    return `${total} of ${grand} organizations · ${bits.join(' · ')}`;
  });

  // --- KPI row -------------------------------------------------------------

  metricLabel(k: KpiDefinition): string {
    return ({ total: 'Total organizations', paid: 'Paid organizations', trial: 'Trial organizations', subscribed: 'Active subscriptions', nearExpiry: 'Renewing in 30 days', expired: 'Expired', unsubscribed: 'Unsubscribed', reactivated: 'Reactivated', ssoEnabled: 'SSO enabled', lapsed: 'Lapsed' } as Record<string, string>)[k.key] ?? k.label;
  }

  deltaOf(k: KpiDefinition): number | null {
    return k.previous === null ? null : k.value - k.previous;
  }

  kpiActive(k: KpiDefinition): boolean {
    return k.filter ? this.a.isSelected(k.filter.dim, k.filter.value) : false;
  }

  @ViewChild('organizationDialog') organizationDialog!: ElementRef<HTMLDialogElement>;
  readonly selectedMetric = signal<KpiDefinition | null>(null);
  readonly organizationSearch = signal('');
  // Row 1: who the customers are. Row 2: subscription health, in the order sales acts on it.
  readonly primaryKpis = computed(() => ['total', 'paid', 'trial', 'ssoEnabled', 'subscribed', 'nearExpiry', 'lapsed', 'reactivated'].map(key => this.a.kpis().find(k => k.key === key)!));
  readonly metricRows = computed(() => {
    const metric = this.selectedMetric();
    if (!metric) return this.a.rows();
    return this.a.organizationsForKpi(metric.key);
  });

  onKpiClick(k: KpiDefinition): void {
    this.selectedMetric.set(k);
    this.organizationSearch.set('');
    this.resetVisibleRows();
    this.organizationDialog.nativeElement.showModal();
  }

  closeOrganizations(): void {
    this.organizationDialog.nativeElement.close();
    this.selectedMetric.set(null);
    this.organizationSearch.set('');
  }



  // --- visuals -------------------------------------------------------------

  readonly statusSlices = computed<DonutSlice[]>(() => this.a.statusMix());
  readonly statusSelected = computed(() => this.a.selection().status);
  readonly statusTable = computed<TableRow[]>(() => {
    const mix = this.a.statusMix();
    const total = mix.reduce((sum, s) => sum + s.value, 0);
    return mix.map((s) => ({ label: s.label, values: [s.value, percent(s.value, total)], color: s.color }));
  });

  readonly planSlices = computed<DonutSlice[]>(() => this.a.planMix());
  readonly planSelected = computed(() => this.a.selection().plan);
  readonly planTable = computed<TableRow[]>(() => {
    const mix = this.a.planMix();
    const total = mix.reduce((sum, s) => sum + s.value, 0);
    return mix.map((s) => ({ label: s.label, values: [s.value, percent(s.value, total)], color: s.color }));
  });

  readonly trendPage = signal(0);
  readonly auditReady = computed(() => !this.a.eventsLoading() && !this.a.eventsFailed());
  readonly trendWindow = computed(() => {
    const total = this.a.lifecycleTrend().buckets.length;
    const page = Math.min(this.trendPage(), Math.max(0, Math.ceil(total / 12) - 1));
    const end = total - page * 12;
    return { start: Math.max(0, end - 12), end, page, total };
  });
  readonly trendWindowLabel = computed(() => {
    const buckets = this.a.lifecycleTrend().buckets;
    const { start, end } = this.trendWindow();
    return end ? `${buckets[start].label} – ${buckets[end - 1].label}` : 'No periods';
  });
  readonly trendCategories = computed(() => {
    const { start, end } = this.trendWindow();
    return this.a.lifecycleTrend().buckets.slice(start, end).map((b) => b.label);
  });
  readonly trendKeys = computed(() => {
    const { start, end } = this.trendWindow();
    return this.a.lifecycleTrend().buckets.slice(start, end).map((b) => b.key);
  });
  olderPeriods(): void { this.trendPage.update((page) => page + 1); }
  newerPeriods(): void { this.trendPage.update((page) => Math.max(0, page - 1)); }
  readonly trendSeries = computed<ChartSeries[]>(() => {
    const t = this.a.lifecycleTrend();
    const { start, end } = this.trendWindow();
    return [
      { key: 'onboarded', label: 'New organizations', color: TREND_COLOR.NEW, values: t.onboarded.slice(start, end) },
      { key: 'churned', label: 'Ended plans', color: TREND_COLOR.CHURNED, values: t.churned.slice(start, end) },
      ...(this.auditReady() ? [{ key: 'reactivated', label: 'Reactivated', color: TREND_COLOR.REACTIVATED, values: t.reactivated.slice(start, end) }] : [])
    ];
  });
  readonly trendTable = computed<TableRow[]>(() => {
    const t = this.a.lifecycleTrend();
    return t.buckets.map((b, i) => ({
      label: b.label,
      values: [t.onboarded[i], t.churned[i], this.auditReady() ? t.reactivated[i] : 'Unavailable', this.auditReady() ? t.onboarded[i] + t.reactivated[i] - t.churned[i] : 'Unavailable']
    }));
  });

  readonly runwayItems = computed<BarDatum[]>(() => this.a.expiryRunway());
  readonly runwaySelected = computed(() => this.a.selection().expiry);
  readonly runwayTotal = computed(() => this.runwayItems().reduce((sum, i) => sum + i.value, 0));
  readonly runwayTable = computed<TableRow[]>(() =>
    this.runwayItems().map((i) => ({ label: i.label, values: [i.value, percent(i.value, this.runwayTotal())], color: i.color }))
  );

  // --- acquisition channel (Azure Marketplace vs direct onboarding) ---

  readonly channelSelected = computed(() => this.a.selection().channel);
  /** Per channel: size, share, and how much of it is live and paying — what sales reads first. */
  readonly channelFacts = computed(() => {
    const rows = this.a.rowsIgnoringChannel();
    const total = rows.length;
    return this.a.channelMix().map((c) => {
      const inChannel = rows.filter((r) => channelKeyOf(r) === c.key);
      return {
        ...c,
        icon: c.key === 'MARKETPLACE' ? 'ti-brand-azure' : 'ti-building-store',
        share: percent(c.value, total),
        active: inChannel.filter((r) => statusKeyOf(r) === 'ACTIVE').length,
        paid: inChannel.filter((r) => r.org.isPaidOrg).length
      };
    });
  });
  readonly channelBarLabel = computed(() => this.channelFacts().map((c) => `${c.label} ${c.share}`).join(', '));
  readonly channelTable = computed<TableRow[]>(() => {
    const mix = this.a.channelMix();
    const total = mix.reduce((sum, s) => sum + s.value, 0);
    return mix.map((s) => ({ label: s.label, values: [s.value, percent(s.value, total)], color: s.color }));
  });
  readonly semantic = SEMANTIC;
  readonly slot = VIZ_SLOT;

  readonly salesFocus = signal('salesRenewals');
  readonly salesQueues = computed(() => [
    { key: 'salesRenewals', label: 'Renewals', icon: 'ti-calendar-due', hint: 'Active plans ending within 30 days', action: 'Discuss renewal', rows: this.a.organizationsForKpi('nearExpiry') },
    { key: 'salesTrials', label: 'Trial follow-up', icon: 'ti-flask', hint: 'Active trial accounts to qualify for a paid plan', action: 'Review trial & qualify', rows: this.a.organizationsForKpi('salesTrials') },
    { key: 'salesWinback', label: 'Win-back', icon: 'ti-user-heart', hint: 'Expired, cancelled or unsubscribed accounts', action: 'Discuss reactivation', rows: this.a.organizationsForKpi('salesWinback') }
  ]);
  readonly currentQueue = computed(() => this.salesQueues().find(q => q.key === this.salesFocus())!);
  readonly attentionPreview = computed(() => [...this.currentQueue().rows]
    .sort((a, b) => this.salesFocus() === 'salesWinback'
      ? (b.daysToExpiry ?? -999999) - (a.daysToExpiry ?? -999999)
      : (a.daysToExpiry ?? 999999) - (b.daysToExpiry ?? 999999)).slice(0, 5));
  readonly paidShare = computed(() => {
    const data = this.a.conversion();
    return data.total ? Math.round(data.paid / data.total * 100) : 0;
  });

  openSalesQueue(): void {
    const queue = this.currentQueue();
    this.onKpiClick({ key: queue.key, label: queue.label, icon: queue.icon,
      hint: queue.hint, value: queue.rows.length, previous: null, trend: [],
      color: '#7c46a3', upIsGood: true, filter: null });
  }

  metricContext(k: KpiDefinition): string {
    if (k.context) return k.context;
    if (k.key === 'total') return this.a.windowLabel();
    if (k.key === 'reactivated') return 'By reactivation date';
    const total = this.a.totalOrganizations();
    return total ? Math.round(k.value / total * 100) + '% of filtered organizations' : 'No matching organizations';
  }

  auditUnavailable(k: KpiDefinition): boolean {
    return k.key === 'reactivated' && (this.a.eventsLoading() || this.a.eventsFailed());
  }

  priority(row: OrgOverviewRow): number {
    return this.overview.attentionReasons(row)[0]?.priority ?? 5;
  }

  issueLabel(row: OrgOverviewRow): string {
    const reasons = this.overview.attentionReasons(row);
    const label = reasons[0]?.label ?? '';
    return reasons.length > 1 ? `${label} +${reasons.length - 1}` : label;
  }

  planName(planId?: string): string {
    if (!planId) return '—';
    return this.plans.displayNameForPlanId(planId);
  }

  statusOf(row: OrgOverviewRow): StatusKey {
    return statusKeyOf(row);
  }

  statusColor(row: OrgOverviewRow): string {
    return STATUS_COLOR[statusKeyOf(row)];
  }

  billingOf(row: OrgOverviewRow): BillingKey {
    return billingKeyOf(row);
  }

  // --- the table -----------------------------------------------------------

  readonly sortKey = signal<SortKey>('end');
  readonly sortAsc = signal(true);
  private static readonly ROWS_PER_SCROLL_STEP = 25;

  readonly visibleRowCount = signal(OverviewComponent.ROWS_PER_SCROLL_STEP);

  readonly sortedRows = computed(() => {
    const query = this.organizationSearch().trim().toLowerCase();
    const rows = this.metricRows().filter(row => !query ||
      row.org.organizationName.toLowerCase().includes(query) ||
      (row.org.domainName ?? '').toLowerCase().includes(query));
    const key = this.sortKey();
    const dir = this.sortAsc() ? 1 : -1;
    rows.sort((x, y) => {
      if (key === 'name') return x.org.organizationName.localeCompare(y.org.organizationName) * dir;
      if (key === 'status') return statusKeyOf(x).localeCompare(statusKeyOf(y)) * dir;
      return ((x.daysToExpiry ?? 999999) - (y.daysToExpiry ?? 999999)) * dir;
    });
    return rows;
  });

  readonly visibleRows = computed(() => this.sortedRows().slice(0, this.visibleRowCount()));

  readonly hasMoreRowsBelow = computed(() => this.sortedRows().length > this.visibleRowCount());

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortAsc.set(!this.sortAsc());
    else {
      this.sortKey.set(key);
      this.sortAsc.set(true);
    }
    this.resetVisibleRows();
  }

  resetVisibleRows(): void {
    this.visibleRowCount.set(OverviewComponent.ROWS_PER_SCROLL_STEP);
  }

  showNextRows(): void {
    this.visibleRowCount.update((count) => count + OverviewComponent.ROWS_PER_SCROLL_STEP);
  }

  /** Exports the slice on screen, not the whole table — what you see is what you get. */
  exportCsv(): void {
    const header = ['Organization', 'Domain', 'Plan', 'Status', 'Billing', 'Subscription start', 'Subscription end', 'Days to expiry', 'Onboarded'];
    const lines = this.sortedRows().map((r) => [
      r.org.organizationName,
      r.org.domainName,
      this.planName(r.subscription?.planId),
      STATUS_LABEL[statusKeyOf(r)],
      r.org.isPaidOrg ? 'Paid' : 'Trial',
      r.subscription?.planStartDate ? formatDate(r.subscription.planStartDate) : '',
      r.subscription?.planEndDate ? formatDate(r.subscription.planEndDate) : '',
      r.daysToExpiry === null ? '' : String(r.daysToExpiry),
      formatDate(r.org.createdDate)
    ]);
    const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flip-organizations-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // --- cross-filter plumbing ----------------------------------------------

  toggle(dim: CrossDim, value: string): void {
    this.a.toggle(dim, value);
  }

  removeChip(chip: { dim: CrossDim; value: string }): void {
    this.a.toggle(chip.dim, chip.value);
  }
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

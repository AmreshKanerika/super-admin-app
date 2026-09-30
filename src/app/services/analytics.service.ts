import { Injectable, computed, inject, signal } from '@angular/core';
import { OrgOverviewRow, OverviewService } from './overview.service';
import { PlansService } from './plans.service';
import { OrganizationsService } from './organizations.service';
import { SubscriptionsService } from './subscriptions.service';
import { AuditService } from './audit.service';
import { OrgSubscribedPlan } from '../models';
import { daysUntil } from '../core/status.util';
import { BILLING_COLOR, EXPIRY_RAMP, STATUS_COLOR, VIZ_SLOT } from '../core/charts/chart.types';

// ---------------------------------------------------------------------------
// The dashboard's analytical model.
//
// Two layers of filtering, which is what makes the page behave like a BI tool
// rather than a set of unrelated widgets:
//
//   1. A **date slicer** — one window, chosen once, applied to every visual.
//      Which date it tests is the reader's choice (`DateBasis`), because "the
//      last 30 days" means something different for onboarding than it does for
//      renewals. With no window, everything on the page is all-time totals.
//   2. Cross-filters apply to every KPI, chart and drill-down. The plan
//      grouping alone ignores its own dimension to keep Other membership stable.
// ---------------------------------------------------------------------------

export type RangePreset = 'ALL' | '7D' | '30D' | '90D' | '6M' | 'MTD' | 'QTD' | 'YTD' | 'CUSTOM';

/** Which date the window is tested against. */
export type DateBasis = 'ONBOARDED' | 'SUB_START' | 'SUB_END';

export type StatusKey = 'ACTIVE' | 'UPCOMING' | 'SUSPENDED' | 'EXPIRED' | 'UNSUBSCRIBED' | 'NONE';
export type BillingKey = 'PAID' | 'TRIAL';
export type ExpiryKey = '0_7' | '8_15' | '16_30' | '31_60' | '60_PLUS';
export type CrossDim = 'status' | 'billing' | 'plan' | 'expiry' | 'period';

export type Granularity = 'day' | 'week' | 'month' | 'quarter';

export interface Bucket {
  key: string;
  label: string;
  start: number;
  end: number;
}

export interface KpiDefinition {
  key: string;
  label: string;
  icon: string;
  color: string;
  value: number;
  previous: number | null;
  trend: number[];
  upIsGood: boolean;
  hint: string;
  /** The cross-filter this tile applies, if any. */
  filter: { dim: CrossDim; value: string } | null;
}

const DAY = 86_400_000;

export const STATUS_LABEL: Record<StatusKey, string> = {
  ACTIVE: 'Subscribed',
  UPCOMING: 'Upcoming',
  SUSPENDED: 'Suspended',
  EXPIRED: 'Expired',
  UNSUBSCRIBED: 'Unsubscribed',
  NONE: 'No active plan'
};

/** Ring order. Changing it invalidates the validated adjacent-pair palette. */
export const STATUS_ORDER: StatusKey[] = ['ACTIVE', 'UPCOMING', 'SUSPENDED', 'EXPIRED', 'UNSUBSCRIBED', 'NONE'];

export const EXPIRY_LABEL: Record<ExpiryKey, string> = {
  '0_7': 'Within 7 days',
  '8_15': '8 – 15 days',
  '16_30': '16 – 30 days',
  '31_60': '31 – 60 days',
  '60_PLUS': 'Over 60 days'
};

export const EXPIRY_ORDER: ExpiryKey[] = ['0_7', '8_15', '16_30', '31_60', '60_PLUS'];

export const BILLING_LABEL: Record<BillingKey, string> = { PAID: 'Paid plan', TRIAL: 'Trial plan' };

const EMPTY_SELECTION: Record<CrossDim, string[]> = { status: [], billing: [], plan: [], expiry: [], period: [] };

/**
 * Six buckets, not seven statuses. CANCELLED and UNSUBSCRIBED are the same
 * event to a reader ("they left"), and INACTIVE and "no subscription row at
 * all" are both "nothing is running" — splitting either pair would push the
 * ring past the six segments a part-to-whole chart can carry.
 */
export function statusKeyOf(row: OrgOverviewRow): StatusKey {
  const status = row.subscription?.planStatus;
  if (!status) return 'NONE';
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'UPCOMING':
      return 'UPCOMING';
    case 'SUSPENDED':
      return 'SUSPENDED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'UNSUBSCRIBED':
    case 'CANCELLED':
      return 'UNSUBSCRIBED';
    default:
      return 'NONE';
  }
}

export function billingKeyOf(row: OrgOverviewRow): BillingKey {
  return row.org.isPaidOrg ? 'PAID' : 'TRIAL';
}

/** Only a live subscription has a runway; everything else has already landed. */
export function expiryKeyOf(row: OrgOverviewRow): ExpiryKey | null {
  if (row.subscription?.planStatus !== 'ACTIVE') return null;
  const days = row.daysToExpiry;
  if (days === null || days < 0) return null;
  if (days <= 7) return '0_7';
  if (days <= 15) return '8_15';
  if (days <= 30) return '16_30';
  if (days <= 60) return '31_60';
  return '60_PLUS';
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** `datetime-local` strings are wall-clock with no zone — parse them as local. */
function parseLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value.length === 16 ? `${value}:00` : value);
  return Number.isFinite(ms) ? ms : null;
}

function pickGranularity(spanMs: number): Granularity {
  const days = spanMs / DAY;
  if (days <= 45) return 'day';
  if (days <= 210) return 'week';
  if (days <= 1100) return 'month';
  return 'quarter';
}

function bucketsBetween(fromMs: number, toMs: number, granularity: Granularity): Bucket[] {
  const buckets: Bucket[] = [];
  const cursor = new Date(fromMs);
  const guard = 400;

  if (granularity === 'day') cursor.setHours(0, 0, 0, 0);
  if (granularity === 'week') {
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); // ISO weeks start Monday
  }
  if (granularity === 'month') {
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(1);
  }
  if (granularity === 'quarter') {
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(1);
    cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3);
  }

  while (cursor.getTime() <= toMs && buckets.length < guard) {
    const start = new Date(cursor);
    const next = new Date(cursor);
    if (granularity === 'day') next.setDate(next.getDate() + 1);
    else if (granularity === 'week') next.setDate(next.getDate() + 7);
    else if (granularity === 'month') next.setMonth(next.getMonth() + 1);
    else next.setMonth(next.getMonth() + 3);

    buckets.push({
      key: `${granularity}-${start.getTime()}`,
      label: labelFor(start, granularity),
      start: start.getTime(),
      end: next.getTime() - 1
    });
    cursor.setTime(next.getTime());
  }
  return buckets;
}

function labelFor(date: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    case 'week':
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    case 'quarter':
      return `Q${Math.floor(date.getMonth() / 3) + 1} '${String(date.getFullYear()).slice(2)}`;
  }
}

interface LifecycleEvent {
  type: 'REACTIVATED';
  at: number;
  orgId: string | null;
}

const EVENT_BY_ACTION: Record<string, LifecycleEvent['type']> = {
  SUBSCRIPTION_REACTIVATED: 'REACTIVATED',
  ORG_REACTIVATED: 'REACTIVATED'
};

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private overview = inject(OverviewService);
  private organizations = inject(OrganizationsService);
  private subscriptions = inject(SubscriptionsService);
  private plans = inject(PlansService);
  private audit = inject(AuditService);

  /** One representative subscription per organization for current-state charts.
   * The catalog API may include historical rows in unspecified order. */
  private readonly sourceRows = computed<OrgOverviewRow[]>(() => {
    const plans = new Map(this.plans.list()().map((plan) => [plan.planId, plan]));
    const subscriptions = new Map<string, OrgSubscribedPlan>();
    for (const sub of this.subscriptions.list()()) {
      const current = subscriptions.get(sub.orgId);
      const priority = (s: OrgSubscribedPlan) => s.planStatus === 'ACTIVE' ? 1 : 0;
      const date = (s: OrgSubscribedPlan) => Date.parse(s.planStartDate) || 0;
      if (!current || priority(sub) > priority(current) ||
          (priority(sub) === priority(current) && date(sub) > date(current))) {
        subscriptions.set(sub.orgId, sub);
      }
    }
    const allByOrg = new Map<string, OrgSubscribedPlan[]>();
    for (const sub of this.subscriptions.list()()) {
      allByOrg.set(sub.orgId, [...(allByOrg.get(sub.orgId) ?? []), sub]);
    }
    return this.organizations.list()().map((org) => {
      const subscription = subscriptions.get(org.orgId);
      return {
        org,
        subscriptions: allByOrg.get(org.orgId) ?? [],
        subscription,
        plan: subscription ? plans.get(subscription.planId) : undefined,
        daysToExpiry: subscription ? daysUntil(subscription.planEndDate) : null
      };
    });
  });

  // --- slicer state --------------------------------------------------------

  readonly preset = signal<RangePreset>('6M');
  readonly customFrom = signal<string>('');
  readonly customTo = signal<string>('');
  readonly basis = signal<DateBasis>('ONBOARDED');
  readonly selection = signal<Record<CrossDim, string[]>>({ ...EMPTY_SELECTION });

  /**
   * Reactivations are not a state an organization is in — they are something
   * that happened to it, so the only record is the audit log. Loaded once and
   * sliced client-side, which keeps the date slicer instant.
   */
  private readonly events = signal<LifecycleEvent[]>([]);
  readonly eventsLoading = signal(true);
  readonly eventsFailed = signal(false);

  constructor() {
    void this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    this.eventsLoading.set(true);
    this.eventsFailed.set(false);
    const collected: LifecycleEvent[] = [];
    try {
      const size = 200;
      // The audit endpoint is paginated. Fetch every matching page so older
      // reactivations do not silently disappear from all-time trends.
      for (let page = 0; ; page++) {
        const result = await this.audit.search({ search: 'REACTIVATED', result: 'SUCCESS', page, size });
        for (const entry of result.items) {
          const type = EVENT_BY_ACTION[entry.action];
          const at = parse(entry.createdDate);
          if (!type || at === null || entry.result !== 'SUCCESS') continue;
          collected.push({ type, at, orgId: entry.targetId ?? null });
        }
        if (page + 1 >= Math.max(1, result.totalPages)) break;
      }
      this.events.set(collected);
    } catch (err) {
      console.error('Failed to load lifecycle events for the dashboard', err);
      this.eventsFailed.set(true);
    } finally {
      this.eventsLoading.set(false);
    }
  }

  // --- the window ----------------------------------------------------------

  /** null on either end means "unbounded" — the all-time view. */
  readonly window = computed<{ from: number | null; to: number | null }>(() => {
    const now = Date.now();
    switch (this.preset()) {
      case 'ALL':
        return { from: null, to: null };
      case '7D':
        return { from: startOfDay(now - 6 * DAY), to: now };
      case '30D':
        return { from: startOfDay(now - 29 * DAY), to: now };
      case '90D':
        return { from: startOfDay(now - 89 * DAY), to: now };
      case '6M': {
        const d = new Date(now);
        return { from: new Date(d.getFullYear(), d.getMonth() - 5, 1).getTime(), to: now };
      }
      case 'MTD': {
        const d = new Date(now);
        return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: now };
      }
      case 'QTD': {
        const d = new Date(now);
        return { from: new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime(), to: now };
      }
      case 'YTD': {
        const d = new Date(now);
        return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: now };
      }
      case 'CUSTOM': {
        const from = parseLocalInput(this.customFrom());
        const to = parseLocalInput(this.customTo());
        // A half-open custom range is legitimate: "everything since March" and
        // "everything up to the migration" are both real questions.
        return { from, to };
      }
    }
  });

  readonly hasWindow = computed(() => {
    const w = this.window();
    return w.from !== null || w.to !== null;
  });

  /** The equal-length window immediately before this one, for the deltas. */
  readonly previousWindow = computed<{ from: number | null; to: number | null } | null>(() => {
    const { from, to } = this.window();
    if (from === null || to === null) return null;
    const span = to - from;
    if (span <= 0) return null;
    return { from: from - span - 1, to: from - 1 };
  });

  readonly windowLabel = computed(() => {
    const preset = this.preset();
    const labels: Record<RangePreset, string> = {
      ALL: 'All time',
      '7D': 'Last 7 days',
      '30D': 'Last 30 days',
      '90D': 'Last 90 days',
      '6M': 'Last 6 months',
      MTD: 'Month to date',
      QTD: 'Quarter to date',
      YTD: 'Year to date',
      CUSTOM: 'Custom range'
    };
    return labels[preset];
  });

  readonly basisLabel = computed(() => {
    const labels: Record<DateBasis, string> = {
      ONBOARDED: 'onboarding date',
      SUB_START: 'subscription start',
      SUB_END: 'subscription end'
    };
    return labels[this.basis()];
  });

  readonly deltaLabel = computed(() => (this.previousWindow() ? `vs previous ${this.spanLabel()}` : ''));

  private spanLabel(): string {
    const { from, to } = this.window();
    if (from === null || to === null) return 'period';
    const days = Math.max(1, Math.round((to - from) / DAY));
    return days === 1 ? 'day' : `${days} days`;
  }

  // --- the rows ------------------------------------------------------------

  private dateOf(row: OrgOverviewRow): number | null {
    switch (this.basis()) {
      case 'ONBOARDED':
        return parse(row.org.createdDate);
      case 'SUB_START':
        return parse(row.subscription?.planStartDate);
      case 'SUB_END':
        return parse(row.subscription?.planEndDate);
    }
  }

  private inWindow(row: OrgOverviewRow, w: { from: number | null; to: number | null }): boolean {
    if (w.from === null && w.to === null) return true;
    const at = this.dateOf(row);
    // With a window set on a date the row does not have (an organization with
    // no subscription, filtered by subscription start), the row is genuinely
    // outside the window rather than "unknown, so keep it".
    if (at === null) return false;
    if (w.from !== null && at < w.from) return false;
    if (w.to !== null && at > w.to) return false;
    return true;
  }

  private matchesCross(row: OrgOverviewRow, exclude?: CrossDim): boolean {
    const sel = this.selection();
    if (exclude !== 'status' && sel.status.length && !sel.status.includes(statusKeyOf(row))) return false;
    if (exclude !== 'billing' && sel.billing.length && !sel.billing.includes(billingKeyOf(row))) return false;
    if (exclude !== 'plan' && sel.plan.length) {
      const planId = row.subscription?.planId ?? '__none__';
      const topPlanIds = this.topPlanIds();
      const inOther = sel.plan.includes('__other__') && planId !== '__none__' && !topPlanIds.has(planId);
      if (!sel.plan.includes(planId) && !inOther) return false;
    }
    if (exclude !== 'expiry' && sel.expiry.length) {
      const key = expiryKeyOf(row);
      if (!key || !sel.expiry.includes(key)) return false;
    }
    if (exclude !== 'period' && sel.period.length) {
      const at = this.dateOf(row);
      const buckets = this.buckets();
      const hit = buckets.some((b) => sel.period.includes(b.key) && at !== null && at >= b.start && at <= b.end);
      if (!hit) return false;
    }
    return true;
  }

  /** Every row the current slice selects. `exclude` drops one dimension so a
   *  visual can keep showing its own categories in full. */
  rowsFor(exclude?: CrossDim, windowOverride?: { from: number | null; to: number | null }): OrgOverviewRow[] {
    const w = windowOverride ?? this.window();
    return this.sourceRows().filter((row) => this.inWindow(row, w) && this.matchesCross(row, exclude));
  }

  private readonly topPlanIds = computed(() => {
    const counts = new Map<string, number>();
    for (const row of this.rowsFor('plan')) {
      const id = row.subscription?.planId;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return new Set([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([id]) => id));
  });

  readonly rows = computed(() => this.rowsFor());
  readonly rowsIgnoringStatus = computed(() => this.rowsFor('status'));
  readonly rowsIgnoringBilling = computed(() => this.rowsFor('billing'));
  readonly rowsIgnoringPlan = computed(() => this.rowsFor('plan'));
  readonly rowsIgnoringExpiry = computed(() => this.rowsFor('expiry'));

  /** Cross-filtered but window-free — the base for anything plotted over time. */
  readonly rowsAllTime = computed(() => this.rowsFor('period', { from: null, to: null }));

  private readonly previousRows = computed(() => {
    const prev = this.previousWindow();
    return prev && !this.selection().period.length ? this.rowsFor(undefined, prev) : null;
  });

  readonly totalOrganizations = computed(() => this.rows().length);
  readonly grandTotal = computed(() => this.sourceRows().length);

  // --- time buckets --------------------------------------------------------

  readonly buckets = computed<Bucket[]>(() => {
    const rows = this.sourceRows();
    const w = this.window();
    const now = Date.now();
    const dates = rows.map((r) => parse(r.org.createdDate)).filter((d): d is number => d !== null);
    const earliest = dates.length ? Math.min(...dates) : now - 180 * DAY;
    const from = w.from ?? earliest;
    const to = w.to ?? now;
    if (to <= from) return [];
    return bucketsBetween(from, to, this.preset() === '6M' ? 'month' : pickGranularity(to - from));
  });

  readonly granularityLabel = computed(() => {
    const n = this.buckets().length;
    if (!n) return '';
    const span = this.buckets()[0];
    const days = (span.end - span.start) / DAY;
    if (days < 1.5) return 'by day';
    if (days < 8) return 'by week';
    if (days < 40) return 'by month';
    return 'by quarter';
  });

  private countInBuckets(dates: (number | null)[]): number[] {
    const buckets = this.buckets();
    const counts = new Array(buckets.length).fill(0);
    for (const at of dates) {
      if (at === null) continue;
      const window = this.window();
      if ((window.from !== null && at < window.from) || (window.to !== null && at > window.to)) continue;
      for (let i = 0; i < buckets.length; i++) {
        if (this.selection().period.length && !this.selection().period.includes(buckets[i].key)) continue;
        if (at >= buckets[i].start && at <= buckets[i].end) {
          counts[i]++;
          break;
        }
      }
    }
    return counts;
  }

  // --- lifecycle events, sliced -------------------------------------------

  private eventsIn(type: LifecycleEvent['type'], w: { from: number | null; to: number | null }, respectPeriod = true): LifecycleEvent[] {
    const allowed = new Set(this.rowsFor(undefined, w).map((r) => r.org.orgId));
    const selectedPeriods = respectPeriod ? this.selection().period : [];
    const buckets = selectedPeriods.length ? this.buckets() : [];
    return this.events().filter((e) => {
      if (e.type !== type) return false;
      if (w.from !== null && e.at < w.from) return false;
      if (w.to !== null && e.at > w.to) return false;
      if (selectedPeriods.length && !buckets.some((b) => selectedPeriods.includes(b.key) && e.at >= b.start && e.at <= b.end)) return false;
      // Events must belong to an organization in the same filtered cohort.
      return e.orgId !== null && allowed.has(e.orgId);
    });
  }

  /** Organizations reactivated, not reactivation events — one org that bounced
   *  twice is still one organization. */
  private distinctOrgs(events: LifecycleEvent[]): number {
    const ids = new Set<string>();
    let anonymous = 0;
    for (const e of events) {
      if (e.orgId) ids.add(e.orgId);
      else anonymous++;
    }
    return ids.size + anonymous;
  }

  readonly reactivated = computed(() => this.distinctOrgs(this.eventsIn('REACTIVATED', this.window())));

  // --- KPIs ----------------------------------------------------------------

  private countBy(rows: OrgOverviewRow[], predicate: (r: OrgOverviewRow) => boolean): number {
    return rows.filter(predicate).length;
  }

  /** Match the count shown on a dashboard card without changing chart filters. */
  organizationsForKpi(key: string): OrgOverviewRow[] {
    if (key === 'total') return this.rows();
    if (key === 'reactivated') {
      const ids = new Set(this.eventsIn('REACTIVATED', this.window()).map(event => event.orgId));
      return this.rows().filter(row => ids.has(row.org.orgId));
    }
    return this.rows().filter(row => {
      switch (key) {
        case 'subscribed': return statusKeyOf(row) === 'ACTIVE';
        case 'salesRenewals':
        case 'nearExpiry': return row.subscription?.planStatus === 'ACTIVE' &&
          row.daysToExpiry !== null && row.daysToExpiry >= 0 && row.daysToExpiry <= 30;
        case 'expired': return statusKeyOf(row) === 'EXPIRED';
        case 'unsubscribed': return statusKeyOf(row) === 'UNSUBSCRIBED';
        case 'salesTrials': return !row.org.isPaidOrg && statusKeyOf(row) === 'ACTIVE';
        case 'salesWinback': return ['EXPIRED', 'UNSUBSCRIBED'].includes(statusKeyOf(row));
        case 'paid': return !!row.org.isPaidOrg;
        case 'trial': return !row.org.isPaidOrg;
        default: return false;
      }
    });
  }

  readonly kpis = computed<KpiDefinition[]>(() => {
    const rows = this.rows();
    const prev = this.previousRows();
    const allTime = this.rowsAllTime();
    const deltaFor = (fn: (r: OrgOverviewRow) => boolean) => (prev ? this.countBy(prev, fn) : null);

    const isSubscribed = (r: OrgOverviewRow) => statusKeyOf(r) === 'ACTIVE';
    const isExpired = (r: OrgOverviewRow) => statusKeyOf(r) === 'EXPIRED';
    const isUnsub = (r: OrgOverviewRow) => statusKeyOf(r) === 'UNSUBSCRIBED';
    const isNear = (r: OrgOverviewRow) =>
      r.subscription?.planStatus === 'ACTIVE' && r.daysToExpiry !== null && r.daysToExpiry >= 0 && r.daysToExpiry <= 30;
    const isPaid = (r: OrgOverviewRow) => r.org.isPaidOrg;
    const isTrial = (r: OrgOverviewRow) => !r.org.isPaidOrg;

    const prevWindow = this.previousWindow();

    return [
      {
        key: 'total',
        label: 'Total organizations',
        icon: 'ti-building',
        color: VIZ_SLOT.violet,
        value: rows.length,
        previous: null,
        trend: this.countInBuckets(rows.map((r) => parse(r.org.createdDate))),
        upIsGood: true,
        hint: 'Organizations in the selected filters',
        filter: null
      },
      {
        key: 'subscribed',
        label: 'Active plans',
        icon: 'ti-circle-check',
        color: STATUS_COLOR['ACTIVE'],
        value: this.countBy(rows, isSubscribed),
        previous: deltaFor(isSubscribed),
        trend: this.countInBuckets(allTime.filter(isSubscribed).map((r) => parse(r.subscription?.planStartDate))),
        upIsGood: true,
        hint: 'Organizations with an active plan',
        filter: { dim: 'status', value: 'ACTIVE' }
      },
      {
        key: 'nearExpiry',
        label: 'Near expiry',
        icon: 'ti-calendar-due',
        color: EXPIRY_RAMP[1],
        value: this.countBy(rows, isNear),
        previous: deltaFor(isNear),
        trend: this.forwardExpiryTrend(),
        upIsGood: false,
        hint: 'Active, ending within 30 days',
        filter: null
      },
      {
        key: 'expired',
        label: 'Expired',
        icon: 'ti-clock-exclamation',
        color: STATUS_COLOR['EXPIRED'],
        value: this.countBy(rows, isExpired),
        previous: deltaFor(isExpired),
        trend: this.countInBuckets(allTime.filter(isExpired).map((r) => parse(r.subscription?.planEndDate))),
        upIsGood: false,
        hint: 'Subscription ended',
        filter: { dim: 'status', value: 'EXPIRED' }
      },
      {
        key: 'unsubscribed',
        label: 'Unsubscribed',
        icon: 'ti-user-minus',
        color: STATUS_COLOR['UNSUBSCRIBED'],
        value: this.countBy(rows, isUnsub),
        previous: deltaFor(isUnsub),
        trend: this.countInBuckets(allTime.filter(isUnsub).map((r) => parse(r.subscription?.planEndDate))),
        upIsGood: false,
        hint: 'Unsubscribed or cancelled',
        filter: { dim: 'status', value: 'UNSUBSCRIBED' }
      },
      {
        key: 'reactivated',
        label: 'Reactivated',
        icon: 'ti-refresh',
        color: VIZ_SLOT.aqua,
        value: this.reactivated(),
        previous: prevWindow && !this.selection().period.length ? this.distinctOrgs(this.eventsIn('REACTIVATED', prevWindow)) : null,
        trend: this.countInBuckets(this.eventsIn('REACTIVATED', this.window()).map((e) => e.at)),
        upIsGood: true,
        hint: this.eventsFailed() ? 'Audit log unavailable' : 'Won back from suspended or expired',
        filter: null
      },
      {
        key: 'paid',
        label: 'Paid plan',
        icon: 'ti-credit-card',
        color: BILLING_COLOR['PAID'],
        value: this.countBy(rows, isPaid),
        previous: deltaFor(isPaid),
        trend: this.countInBuckets(allTime.filter(isPaid).map((r) => parse(r.org.createdDate))),
        upIsGood: true,
        hint: 'Billable organizations',
        filter: { dim: 'billing', value: 'PAID' }
      },
      {
        key: 'trial',
        label: 'Trial plan',
        icon: 'ti-flask',
        color: BILLING_COLOR['TRIAL'],
        value: this.countBy(rows, isTrial),
        previous: deltaFor(isTrial),
        trend: this.countInBuckets(allTime.filter(isTrial).map((r) => parse(r.org.createdDate))),
        upIsGood: true,
        hint: 'Not yet converted to paid',
        filter: { dim: 'billing', value: 'TRIAL' }
      }
    ];
  });

  /**
   * The near-expiry tile looks forward, not back: eight weeks of renewals still
   * to come. A backward sparkline under a forward-looking number would be
   * telling a different story from the figure it sits beside.
   */
  private forwardExpiryTrend(): number[] {
    const rows = this.rowsAllTime().filter((r) => r.subscription?.planStatus === 'ACTIVE');
    const weeks = new Array(8).fill(0);
    const today = startOfDay(Date.now());
    for (const row of rows) {
      const end = parse(row.subscription?.planEndDate);
      if (end === null) continue;
      const weekIndex = Math.floor((startOfDay(end) - today) / (7 * DAY));
      if (weekIndex >= 0 && weekIndex < weeks.length) weeks[weekIndex]++;
    }
    return weeks;
  }

  // --- visuals -------------------------------------------------------------

  readonly statusMix = computed(() => {
    const rows = this.rows();
    return STATUS_ORDER.map((key) => ({
      key,
      label: STATUS_LABEL[key],
      value: rows.filter((r) => statusKeyOf(r) === key).length,
      color: STATUS_COLOR[key]
    }));
  });

  readonly billingMix = computed(() => {
    const rows = this.rows();
    return (['PAID', 'TRIAL'] as BillingKey[]).map((key) => ({
      key,
      label: BILLING_LABEL[key],
      value: rows.filter((r) => billingKeyOf(r) === key).length,
      color: BILLING_COLOR[key]
    }));
  });

  /**
   * Top five plans plus "Other". A ring past six segments stops being readable,
   * and a generated seventh hue would be indistinguishable from an existing one
   * under colour-vision deficiency — so the tail folds instead.
   */
  readonly planMix = computed(() => {
    const rows = this.rows();
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const row of rows) {
      const planId = row.subscription?.planId;
      if (!planId) {
        unassigned++;
        continue;
      }
      counts.set(planId, (counts.get(planId) ?? 0) + 1);
    }
    const slots: string[] = [VIZ_SLOT.blue, VIZ_SLOT.orange, VIZ_SLOT.aqua, VIZ_SLOT.yellow, VIZ_SLOT.magenta];
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const head = sorted.filter(([id]) => this.topPlanIds().has(id)).map(([planId, value], i) => ({
      key: planId,
      label: this.plans.byId(planId)?.planName ?? planId,
      value,
      color: slots[i]
    }));
    const others = sorted.filter(([id]) => !this.topPlanIds().has(id));
    const tail = others.reduce((sum, [, v]) => sum + v, 0);
    const out = [...head];
    if (tail > 0) out.push({ key: '__other__', label: `Other (${others.length} plans)`, value: tail, color: VIZ_SLOT.violet });
    if (unassigned > 0) out.push({ key: '__none__', label: 'No plan assigned', value: unassigned, color: STATUS_COLOR['NONE'] });
    return out;
  });

  readonly expiryRunway = computed(() => {
    const rows = this.rows();
    return EXPIRY_ORDER.map((key, i) => ({
      key,
      label: EXPIRY_LABEL[key],
      value: rows.filter((r) => expiryKeyOf(r) === key).length,
      color: EXPIRY_RAMP[i]
    }));
  });

  readonly pastDue = computed(
    () => this.rows().filter((r) => r.subscription?.planStatus === 'ACTIVE' && r.daysToExpiry !== null && r.daysToExpiry < 0).length
  );

  /** New / churned / reactivated over the window, on one axis. */
  readonly lifecycleTrend = computed(() => {
    const rows = this.rows();
    const isChurn = (r: OrgOverviewRow) => {
      const k = statusKeyOf(r);
      return k === 'EXPIRED' || k === 'UNSUBSCRIBED';
    };
    return {
      buckets: this.buckets(),
      onboarded: this.countInBuckets(rows.map((r) => parse(r.org.createdDate))),
      churned: this.countInBuckets(rows.filter(isChurn).map((r) => parse(r.subscription?.planEndDate))),
      reactivated: this.countInBuckets(this.eventsIn('REACTIVATED', { from: null, to: null }, false).map((e) => e.at))
    };
  });

  /** Gained vs lost per period — the same series as the trend, read as polarity. */
  readonly netMovement = computed(() => {
    const trend = this.lifecycleTrend();
    return {
      buckets: trend.buckets,
      gained: trend.buckets.map((_, i) => trend.onboarded[i] + trend.reactivated[i]),
      lost: trend.churned
    };
  });

  readonly conversion = computed(() => {
    const rows = this.rows();
    const paid = rows.filter((r) => r.org.isPaidOrg).length;
    return { paid, total: rows.length };
  });

  readonly renewalHealth = computed(() => {
    const rows = this.rows();
    const withPlan = rows.filter((r) => r.subscription).length;
    const healthy = rows.filter((r) => {
      if (r.subscription?.planStatus !== 'ACTIVE') return false;
      return r.daysToExpiry === null || r.daysToExpiry > 30;
    }).length;
    return { healthy, withPlan };
  });

  readonly attentionRows = computed(() =>
    this.rows()
      .filter((row) => this.overview.attentionReasons(row).length > 0)
      .sort(
        (a, b) =>
          this.overview.attentionReasons(a)[0].priority - this.overview.attentionReasons(b)[0].priority ||
          (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999)
      )
  );

  // --- cross-filter plumbing ----------------------------------------------

  toggle(dim: CrossDim, value: string): void {
    this.selection.update((sel) => {
      const current = sel[dim];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...sel, [dim]: next };
    });
  }

  isSelected(dim: CrossDim, value: string): boolean {
    return this.selection()[dim].includes(value);
  }

  clearDim(dim: CrossDim): void {
    this.selection.update((sel) => ({ ...sel, [dim]: [] }));
  }

  clearCrossFilters(): void {
    this.selection.set({ ...EMPTY_SELECTION });
  }

  clearAll(): void {
    this.preset.set('6M');
    this.customFrom.set('');
    this.customTo.set('');
    this.basis.set('ONBOARDED');
    this.clearCrossFilters();
  }

  setPreset(preset: RangePreset): void {
    this.preset.set(preset);
    // Period chips are labelled against the old buckets; they are meaningless
    // once the window changes underneath them.
    this.clearDim('period');
  }

  readonly activeChips = computed(() => {
    const sel = this.selection();
    const chips: { dim: CrossDim; value: string; label: string }[] = [];
    for (const value of sel.status) chips.push({ dim: 'status', value, label: `Status: ${STATUS_LABEL[value as StatusKey] ?? value}` });
    for (const value of sel.billing) chips.push({ dim: 'billing', value, label: BILLING_LABEL[value as BillingKey] ?? value });
    for (const value of sel.plan) {
      const label = value === '__none__' ? 'No plan assigned' : value === '__other__' ? 'Other plans' : this.plans.byId(value)?.planName ?? value;
      chips.push({ dim: 'plan', value, label: `Plan: ${label}` });
    }
    for (const value of sel.expiry) chips.push({ dim: 'expiry', value, label: `Expiry: ${EXPIRY_LABEL[value as ExpiryKey] ?? value}` });
    for (const value of sel.period) {
      const bucket = this.buckets().find((b) => b.key === value);
      chips.push({ dim: 'period', value, label: `Period: ${bucket?.label ?? value}` });
    }
    return chips;
  });

  readonly hasAnyFilter = computed(() => this.hasWindow() || this.activeChips().length > 0);
}

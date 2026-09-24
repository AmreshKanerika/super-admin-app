import { Injectable, computed, inject } from '@angular/core';
import { Organization, OrgSubscribedPlan, PlanStatus, SubscriptionPlan } from '../models';
import { OrganizationsService } from './organizations.service';
import { SubscriptionsService } from './subscriptions.service';
import { PlansService } from './plans.service';
import { daysUntil, sortableDays } from '../core/status.util';
import { attentionReasons } from '../core/attention.util';

export interface OrgOverviewRow {
  org: Organization;
  /** Every subscription the organization holds - filters match on any of them. */
  subscriptions: OrgSubscribedPlan[];
  /** The one shown in the row and used for the expiry column/sort (see primarySubscription). */
  subscription?: OrgSubscribedPlan;
  plan?: SubscriptionPlan;
  daysToExpiry: number | null;
}

export interface OrgOverviewFilters {
  search?: string;
  planStatus?: PlanStatus | '';
  planId?: string;
  expiringInDays?: number;
  isPaidOrg?: boolean | null;
  hasSubscription?: boolean | null;
  createdWithinDays?: number;
  needsActivation?: boolean;
  needsAttention?: boolean;
}

const STATUS_RANK: Record<string, number> = { ACTIVE: 0, UPCOMING: 1, SUSPENDED: 2, EXPIRED: 3 };

/**
 * The subscription an org row displays and sorts by expiry on. Previously it was simply the first
 * one the API returned, which for multi-subscription orgs was arbitrary. Now: an ACTIVE one first
 * (the soonest-expiring, open-ended ones last), otherwise UPCOMING, SUSPENDED, EXPIRED, anything
 * else - the most recently started within the same status.
 */
export function primarySubscription(subscriptions: OrgSubscribedPlan[]): OrgSubscribedPlan | undefined {
  return [...subscriptions].sort((a, b) => {
    const rank = (STATUS_RANK[a.planStatus] ?? 9) - (STATUS_RANK[b.planStatus] ?? 9);
    if (rank) return rank;
    if (a.planStatus === 'ACTIVE') {
      const expiry = sortableDays(a.planEndDate) - sortableDays(b.planEndDate);
      if (expiry) return expiry;
    }
    return (Date.parse(b.planStartDate) || 0) - (Date.parse(a.planStartDate) || 0);
  })[0];
}

@Injectable({ providedIn: 'root' })
export class OverviewService {
  attentionReasons = attentionReasons;
  private organizations = inject(OrganizationsService);
  private subscriptions = inject(SubscriptionsService);
  private plans = inject(PlansService);

  rows = computed<OrgOverviewRow[]>(() => {
    const byOrg = new Map<string, OrgSubscribedPlan[]>();
    for (const sub of this.subscriptions.list()()) {
      const bucket = byOrg.get(sub.orgId);
      if (bucket) bucket.push(sub);
      else byOrg.set(sub.orgId, [sub]);
    }
    const plans = this.plans.list()();
    return this.organizations.list()().map((org) => {
      const subscriptions = byOrg.get(org.orgId) ?? [];
      const subscription = primarySubscription(subscriptions);
      const plan = subscription ? plans.find((p) => p.planId === subscription.planId) : undefined;
      const daysToExpiry = subscription ? daysUntil(subscription.planEndDate) : null;
      return { org, subscriptions, subscription, plan, daysToExpiry };
    });
  });

  metrics = computed(() => {
    const rows = this.rows();
    const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return {
      total: rows.length,
      active: rows.filter((r) => r.subscription?.planStatus === 'ACTIVE').length,
      expiringIn30: rows.filter((r) => r.subscription?.planStatus === 'ACTIVE' && r.daysToExpiry !== null && r.daysToExpiry >= 0 && r.daysToExpiry <= 30).length,
      expired: rows.filter((r) => r.subscription?.planStatus === 'EXPIRED').length,
      suspended: rows.filter((r) => r.subscription?.planStatus === 'SUSPENDED').length,
      paid: rows.filter((r) => r.org.isPaidOrg).length,
      newIn30: rows.filter((r) => {
        const created = Date.parse(r.org.createdDate);
        return Number.isFinite(created) && created >= recentCutoff && created <= Date.now();
      }).length,
      withoutSubscription: rows.filter((r) => !r.subscription).length,
      needsActivation: rows.filter((r) => r.org.domainStatus === 'INACTIVE' || r.org.domainStatus === 'RELEASED').length
    };
  });

  attentionRows = computed(() => this.rows()
    .filter((row) => attentionReasons(row).length > 0)
    .sort((a, b) => attentionReasons(a)[0].priority - attentionReasons(b)[0].priority || (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999)));

  filter(rows: OrgOverviewRow[], filters: OrgOverviewFilters): OrgOverviewRow[] {
    return rows.filter((r) => {
      if (filters.needsAttention && attentionReasons(r).length === 0) return false;
      if (filters.search) {
        const q = filters.search.trim().toLowerCase();
        // domainName is null for orgs without a URL - toLowerCase() on it threw and broke the whole list
        const name = (r.org.organizationName ?? '').toLowerCase();
        const domain = (r.org.domainName ?? '').toLowerCase();
        if (q && !name.includes(q) && !domain.includes(q)) return false;
      }
      // An org can hold several subscriptions: match if ANY of them fits, not only the displayed one.
      if (filters.planStatus && !r.subscriptions.some((s) => s.planStatus === filters.planStatus)) return false;
      if (filters.planId && !r.subscriptions.some((s) => s.planId === filters.planId)) return false;
      if (filters.isPaidOrg !== undefined && filters.isPaidOrg !== null && r.org.isPaidOrg !== filters.isPaidOrg) return false;
      if (filters.hasSubscription !== undefined && filters.hasSubscription !== null && (r.subscriptions.length > 0) !== filters.hasSubscription) return false;
      if (filters.needsActivation && (r.org.domainStatus === null || r.org.domainStatus === 'ACTIVE')) return false;
      if (filters.createdWithinDays !== undefined) {
        const created = Date.parse(r.org.createdDate);
        if (!Number.isFinite(created) || created < Date.now() - filters.createdWithinDays * 24 * 60 * 60 * 1000 || created > Date.now()) return false;
      }
      if (filters.expiringInDays !== undefined && filters.expiringInDays !== null) {
        const window = filters.expiringInDays;
        const expiresInWindow = r.subscriptions.some((s) => {
          const days = daysUntil(s.planEndDate);
          return days !== null && days >= 0 && days <= window;
        });
        if (!expiresInWindow) return false;
      }
      return true;
    });
  }

  byOrgId(orgId: string): OrgOverviewRow | undefined {
    return this.rows().find((r) => r.org.orgId === orgId);
  }
}

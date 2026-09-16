import { Injectable, computed, inject } from '@angular/core';
import { Organization, OrgSubscribedPlan, PlanStatus, SubscriptionPlan } from '../models';
import { OrganizationsService } from './organizations.service';
import { SubscriptionsService } from './subscriptions.service';
import { PlansService } from './plans.service';
import { daysUntil } from '../core/status.util';
import { attentionReasons } from '../core/attention.util';

export interface OrgOverviewRow {
  org: Organization;
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

@Injectable({ providedIn: 'root' })
export class OverviewService {
  attentionReasons = attentionReasons;
  private organizations = inject(OrganizationsService);
  private subscriptions = inject(SubscriptionsService);
  private plans = inject(PlansService);

  rows = computed<OrgOverviewRow[]>(() => {
    const subs = this.subscriptions.list()();
    const plans = this.plans.list()();
    return this.organizations.list()().map((org) => {
      const subscription = subs.find((s) => s.orgId === org.orgId);
      const plan = subscription ? plans.find((p) => p.planId === subscription.planId) : undefined;
      const daysToExpiry = subscription ? daysUntil(subscription.planEndDate) : null;
      return { org, subscription, plan, daysToExpiry };
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
        const q = filters.search.toLowerCase();
        if (!r.org.organizationName.toLowerCase().includes(q) && !r.org.domainName.toLowerCase().includes(q)) return false;
      }
      if (filters.planStatus && r.subscription?.planStatus !== filters.planStatus) return false;
      if (filters.planId && r.subscription?.planId !== filters.planId) return false;
      if (filters.isPaidOrg !== undefined && filters.isPaidOrg !== null && r.org.isPaidOrg !== filters.isPaidOrg) return false;
      if (filters.hasSubscription !== undefined && filters.hasSubscription !== null && Boolean(r.subscription) !== filters.hasSubscription) return false;
      if (filters.needsActivation && (r.org.domainStatus === null || r.org.domainStatus === 'ACTIVE')) return false;
      if (filters.createdWithinDays !== undefined) {
        const created = Date.parse(r.org.createdDate);
        if (!Number.isFinite(created) || created < Date.now() - filters.createdWithinDays * 24 * 60 * 60 * 1000 || created > Date.now()) return false;
      }
      if (filters.expiringInDays !== undefined && filters.expiringInDays !== null) {
        if (r.daysToExpiry === null || r.daysToExpiry < 0 || r.daysToExpiry > filters.expiringInDays) return false;
      }
      return true;
    });
  }

  byOrgId(orgId: string): OrgOverviewRow | undefined {
    return this.rows().find((r) => r.org.orgId === orgId);
  }
}

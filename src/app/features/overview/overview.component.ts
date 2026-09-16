import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { OverviewService } from '../../services/overview.service';
import { PlansService } from '../../services/plans.service';
import { CountdownComponent } from '../../core/ui/countdown.component';
import { OrgOverviewRow } from '../../services/overview.service';

interface ShortcutTile {
  label: string;
  description: string;
  icon: string;
  path: string;
  technicalOnly?: boolean;
}

interface DashboardKpi {
  label: string;
  value: number;
  detail: string;
  icon: string;
  queryParams: Record<string, string>;
  alert?: boolean;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function last6MonthKeys(): { label: string; key: string }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { label: d.toLocaleDateString('en-US', { month: 'short' }), key: `${d.getFullYear()}-${d.getMonth()}` };
  });
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, CountdownComponent],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss'
})
export class OverviewComponent {
  auth = inject(AuthService);
  overview = inject(OverviewService);
  plans = inject(PlansService);

  isSuperAdmin = computed(() => this.auth.role() === 'SUPER_ADMIN');

  greetingName(): string {
    const name = this.auth.currentUser()?.name;
    return name ? name.split(' ')[0] : 'there';
  }

  footprintKpis = computed<DashboardKpi[]>(() => {
    const m = this.overview.metrics();
    const kpis: DashboardKpi[] = [
      { label: 'Organizations', value: m.total, detail: 'Onboarded to the platform', icon: 'ti-building-community', queryParams: {} },
      { label: 'Active subscriptions', value: m.active, detail: `${m.total ? Math.round(m.active / m.total * 100) : 0}% of organizations`, icon: 'ti-circle-check', queryParams: { planStatus: 'ACTIVE' } },
      { label: 'Paid organizations', value: m.paid, detail: `${m.total - m.paid} on trial`, icon: 'ti-credit-card', queryParams: { isPaidOrg: 'true' } },
      { label: 'New in 30 days', value: m.newIn30, detail: 'Recently onboarded', icon: 'ti-rocket', queryParams: { createdWithinDays: '30' } }
    ];
    return kpis;
  });

  attentionKpis = computed<DashboardKpi[]>(() => {
    const m = this.overview.metrics();
    const kpis: DashboardKpi[] = [
      { label: 'Renewals due', value: m.expiringIn30, detail: 'Within 30 days', icon: 'ti-calendar-due', queryParams: { planStatus: 'ACTIVE', expiringInDays: '30' }, alert: true },
      { label: 'Expired', value: m.expired, detail: 'Subscription ended', icon: 'ti-clock-exclamation', queryParams: { planStatus: 'EXPIRED' }, alert: true },
      { label: 'Suspended', value: m.suspended, detail: 'Access paused', icon: 'ti-player-pause', queryParams: { planStatus: 'SUSPENDED' }, alert: true },
      { label: 'No subscription', value: m.withoutSubscription, detail: 'Plan not assigned', icon: 'ti-link-off', queryParams: { hasSubscription: 'false' }, alert: true },
      { label: 'URL activation', value: m.needsActivation, detail: 'Not yet active', icon: 'ti-world-off', queryParams: { needsActivation: 'true' }, alert: true }
    ];
    return kpis;
  });

  drilldownParams(kpi: DashboardKpi): Record<string, string> {
    return { ...kpi.queryParams, from: 'overview' };
  }

  attentionRows = computed(() => this.overview.attentionRows().slice(0, 6));
  organizationsRequiringAction = computed(() => this.overview.attentionRows().length);

  priority(row: OrgOverviewRow): number {
    return this.overview.attentionReasons(row)[0]?.priority ?? 5;
  }

  issueLabel(row: OrgOverviewRow): string {
    const reasons = this.overview.attentionReasons(row);
    const label = reasons[0]?.label ?? '';
    return reasons.length > 1 ? `${label} +${reasons.length - 1}` : label;
  }
  monthly = computed(() => {
    const buckets = last6MonthKeys();
    const months = buckets.map((b) => ({ label: b.label, onboarded: 0, expiring: 0 }));
    const keys = buckets.map((b) => b.key);
    for (const row of this.overview.rows()) {
      const idx = keys.indexOf(monthKey(row.org.createdDate));
      if (idx > -1) months[idx].onboarded++;
      if (row.subscription?.planStatus === 'ACTIVE') {
        const eidx = keys.indexOf(monthKey(row.subscription.planEndDate));
        if (eidx > -1) months[eidx].expiring++;
      }
    }
    const max = Math.max(1, ...months.map((m) => Math.max(m.onboarded, m.expiring)));
    return { months, max };
  });

  planName(planId?: string): string {
    if (!planId) return '—';
    return this.plans.byId(planId)?.planName ?? planId;
  }

  planAdoption = computed(() => {
    const counts = new Map<string, number>();
    for (const row of this.overview.rows()) {
      if (!row.subscription) continue;
      counts.set(row.subscription.planId, (counts.get(row.subscription.planId) ?? 0) + 1);
    }
    const entries = [...counts.entries()]
      .map(([planId, count]) => ({ planId, name: this.planName(planId), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const max = Math.max(1, ...entries.map((e) => e.count));
    return { entries, max };
  });

  private allShortcuts: ShortcutTile[] = [
    { label: 'Organizations', description: 'View every tenant, its plan and subscription status', icon: 'ti-building', path: '/organizations' },
    { label: 'Manage plans', description: 'Review default plans or build a custom one', icon: 'ti-clipboard-list', path: '/plans', technicalOnly: true },
    { label: 'Subscriptions', description: 'Extend, suspend or reactivate a tenant’s subscription', icon: 'ti-credit-card', path: '/subscriptions' },
    { label: 'Audit log', description: 'See every platform action across every organization', icon: 'ti-history', path: '/audit-log', technicalOnly: true }
  ];

  shortcuts = computed(() => (this.isSuperAdmin() ? this.allShortcuts : this.allShortcuts.filter((s) => !s.technicalOnly)));
}

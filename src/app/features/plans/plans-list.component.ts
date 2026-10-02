import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { ViewToggleComponent } from '../../core/ui/view-toggle.component';
import { ViewModeService, ViewMode } from '../../core/view-mode.service';
import { ApplicationsService } from '../../services/applications.service';
import { PlansService } from '../../services/plans.service';
import { OverviewService } from '../../services/overview.service';
import { planStateTone } from '../../core/status.util';
import { PlanDisplayNamePipe } from '../../core/plan-name.pipe';
import { planDisplayNameOrFallback } from '../../core/plan-name.util';
import { SubscriptionPlan } from '../../models';

interface PlanListRow {
  plan: SubscriptionPlan;
  initial: string;
}

@Component({
  selector: 'app-plans-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusPillComponent, EmptyStateComponent, ViewToggleComponent, PlanDisplayNamePipe],
  templateUrl: './plans-list.component.html',
  styleUrl: './plans-list.component.scss'
})
export class PlansListComponent {
  plans = inject(PlansService);
  applications = inject(ApplicationsService);
  private overview = inject(OverviewService);

  tone = planStateTone;
  readonly search = signal('');
  readonly typeFilter = signal('');
  readonly billingFilter = signal<'' | 'PREPAID' | 'METERED'>('');
  readonly stateFilter = signal<'' | 'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('');
  /** In use = at least one organization subscribed to it. */
  readonly usageFilter = signal<'all' | 'inUse' | 'unused'>('all');
  readonly sort = signal<'name' | 'orgs' | 'apps'>('name');

  /** Built from the plans themselves: the catalogue carries more types than Default and Custom (Paid, Trial…). */
  readonly typeOptions = computed(() => {
    const types = [...new Set(this.plans.list()().map((p) => p.planType as string))].sort((a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b));
    return [{ value: '', label: 'All' }, ...types.map((t) => ({ value: t, label: titleCase(t) }))];
  });

  // Defaults to cards: a plan is browsed and compared on what it contains, which a card shows
  // and a row of cells does not. The list is there for scanning a long catalogue.
  private viewModes = inject(ViewModeService);
  readonly view = this.viewModes.mode('plans', 'cards');

  setView(mode: ViewMode): void {
    this.viewModes.set('plans', mode);
  }

  showBack = false;
  backUrl: string | null = null;

  constructor() {
    const q = new URLSearchParams(window.location.search);
    if (q.get('from') === 'overview') {
      this.showBack = true;
      this.backUrl = null; // use history
    }
  }

  /** Organizations per plan, counted once instead of scanning every organization for every card. */
  private readonly orgCountByPlan = computed(() => {
    const counts = new Map<string, number>();
    for (const row of this.overview.rows()) {
      const planId = row.subscription?.planId;
      if (planId) counts.set(planId, (counts.get(planId) ?? 0) + 1);
    }
    return counts;
  });

  readonly summary = computed(() => {
    const all = this.plans.list()();
    const inUse = all.filter((p) => this.orgsInUse(p.planId) > 0).length;
    return {
      total: all.length,
      prepaid: all.filter((p) => p.billingMode === 'PREPAID').length,
      metered: all.filter((p) => p.billingMode === 'METERED').length,
      inUse,
      unused: all.length - inUse
    };
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    const billing = this.billingFilter();
    const state = this.stateFilter();
    const usage = this.usageFilter();
    const rows = this.plans
      .list()()
      .filter((p) => !q || p.planName.toLowerCase().includes(q) || planDisplayNameOrFallback(p).toLowerCase().includes(q)
        || (p.description ?? '').toLowerCase().includes(q))
      .filter((p) => !type || p.planType === type)
      .filter((p) => !billing || p.billingMode === billing)
      .filter((p) => !state || p.planState === state)
      .filter((p) => usage === 'all' || (usage === 'inUse') === (this.orgsInUse(p.planId) > 0));
    const byName = (a: SubscriptionPlan, b: SubscriptionPlan) => planDisplayNameOrFallback(a).localeCompare(planDisplayNameOrFallback(b));
    switch (this.sort()) {
      case 'orgs': return [...rows].sort((a, b) => this.orgsInUse(b.planId) - this.orgsInUse(a.planId) || byName(a, b));
      case 'apps': return [...rows].sort((a, b) => this.appCount(b.planId) - this.appCount(a.planId) || byName(a, b));
      default: return [...rows].sort(byName);
    }
  });

  readonly hasFilters = computed(() => !!(this.search().trim() || this.typeFilter() || this.billingFilter() || this.stateFilter() || this.usageFilter() !== 'all'));

  clearFilters(): void {
    this.search.set('');
    this.typeFilter.set('');
    this.billingFilter.set('');
    this.stateFilter.set('');
    this.usageFilter.set('all');
  }

  /** Summary tiles double as one-click filters; clicking the active one clears it. */
  showBilling(billing: 'PREPAID' | 'METERED'): void {
    this.usageFilter.set('all');
    this.billingFilter.set(this.billingFilter() === billing ? '' : billing);
  }

  showUsage(usage: 'inUse' | 'unused'): void {
    this.billingFilter.set('');
    this.usageFilter.set(this.usageFilter() === usage ? 'all' : usage);
  }

  typeLabel = titleCase;

  /** One colour per plan type, shared by the card accent, avatar and badge in both views. */
  typeTone(type: string): string {
    return TYPE_TONE[type] ?? '#5b6b86';
  }

  billingLabel(mode: string): string {
    return mode === 'METERED' ? 'Metered' : mode === 'PREPAID' ? 'Prepaid' : titleCase(mode);
  }

  initialOf(plan: SubscriptionPlan): string {
    return (planDisplayNameOrFallback(plan) || '?').trim().charAt(0).toUpperCase();
  }

  appCount(planId: string): number {
    return this.plans.byId(planId)?.apps.filter((a) => a.accessStatus === 'ENABLED').length ?? 0;
  }

  orgsInUse(planId: string): number {
    return this.orgCountByPlan().get(planId) ?? 0;
  }

  primaryAppName(appId: string | null): string {
    if (!appId) return 'No primary app';
    return this.applications.displayNameForAppId(appId);
  }

  readonly listRows = computed<PlanListRow[]>(() =>
    this.filtered().map((plan) => ({ plan, initial: this.initialOf(plan) }))
  );

  trackByPlanId = (_index: number, row: PlanListRow): string => row.plan.planId;
}

const TYPE_TONE: Record<string, string> = {
  DEFAULT: '#6a3fb1',
  CUSTOM: '#c2417f',
  PAID: '#2a78d6',
  TRIAL: '#d9682b'
};

/** Defaults first, then paid, trial and custom; anything new after them. */
function typeRank(type: string): number {
  const order = ['DEFAULT', 'PAID', 'TRIAL', 'CUSTOM'];
  const i = order.indexOf(type);
  return i === -1 ? order.length : i;
}

function titleCase(value: string): string {
  return value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : '';
}

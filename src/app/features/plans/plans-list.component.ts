import { Component, inject } from '@angular/core';
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

const FAMILY_COLOUR_COUNT = 6;

interface PlanListRow {
  plan: SubscriptionPlan;
  familyColourIndex: number;
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
  search = '';
  typeFilter = '';

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

  // Plain method, not computed(): search/typeFilter are ngModel-bound plain fields.
  filtered() {
    const q = this.search.trim().toLowerCase();
    return this.plans
      .list()()
      .filter((p) => (!q || p.planName.toLowerCase().includes(q) || planDisplayNameOrFallback(p).toLowerCase().includes(q)) && (!this.typeFilter || p.planType === this.typeFilter));
  }

  appCount(planId: string): number {
    return this.plans.byId(planId)?.apps.filter((a) => a.accessStatus === 'ENABLED').length ?? 0;
  }

  orgsInUse(planId: string): number {
    return this.overview.rows().filter((r) => r.subscription?.planId === planId).length;
  }

  primaryAppName(appId: string | null): string {
    if (!appId) return 'No primary app';
    return this.applications.displayNameForAppId(appId);
  }

  listRows(): PlanListRow[] {
    const colourIndexByPrimaryApp = new Map<string, number>();
    return this.filtered().map((plan) => {
      const groupKey = plan.primaryAppId ?? '';
      if (!colourIndexByPrimaryApp.has(groupKey)) {
        colourIndexByPrimaryApp.set(groupKey, colourIndexByPrimaryApp.size % FAMILY_COLOUR_COUNT);
      }
      return {
        plan,
        familyColourIndex: colourIndexByPrimaryApp.get(groupKey) ?? 0,
        initial: (planDisplayNameOrFallback(plan) || '?').trim().charAt(0).toUpperCase()
      };
    });
  }

  trackByPlanId = (_index: number, row: PlanListRow): string => row.plan.planId;
}

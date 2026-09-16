import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { ApplicationsService } from '../../services/applications.service';
import { PlansService } from '../../services/plans.service';
import { OverviewService } from '../../services/overview.service';
import { planStateTone } from '../../core/status.util';
import { formatAppName } from '../../core/app-name.util';

@Component({
  selector: 'app-plans-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusPillComponent],
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
      .filter((p) => (!q || p.planName.toLowerCase().includes(q)) && (!this.typeFilter || p.planType === this.typeFilter));
  }

  appCount(planId: string): number {
    return this.plans.byId(planId)?.apps.filter((a) => a.accessStatus === 'ENABLED').length ?? 0;
  }

  orgsInUse(planId: string): number {
    return this.overview.rows().filter((r) => r.subscription?.planId === planId).length;
  }

  primaryAppName(appId: string | null): string {
    if (!appId) return 'No primary app';
    return formatAppName(this.applications.byId(appId)?.appName ?? appId);
  }
}

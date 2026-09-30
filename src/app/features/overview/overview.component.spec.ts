import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OverviewComponent } from './overview.component';
import { AuthService } from '../../core/auth/auth.service';
import { OrganizationsService } from '../../services/organizations.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { PlansService } from '../../services/plans.service';
import { AuditService } from '../../services/audit.service';
import { Organization, OrgSubscribedPlan } from '../../models';

describe('Overview dashboard', () => {
  let fixture: ComponentFixture<OverviewComponent>;
  let component: OverviewComponent;
  const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

  beforeEach(async () => {
    const organizations = signal([
      { orgId: 'alpha', organizationName: 'Alpha', domainName: 'alpha.example', isPaidOrg: true, createdDate: date(-90) },
      { orgId: 'beta', organizationName: 'Beta', domainName: 'beta.example', isPaidOrg: false, createdDate: date(-50) },
      { orgId: 'gamma', organizationName: 'Gamma', domainName: 'gamma.example', isPaidOrg: true, createdDate: date(-40) }
    ] as Organization[]);
    const subscriptions = signal([
      { orgId: 'alpha', planId: 'plan', planStatus: 'ACTIVE', planStartDate: date(-60), planEndDate: date(7) },
      { orgId: 'beta', planId: 'plan', planStatus: 'ACTIVE', planStartDate: date(-40), planEndDate: date(50) },
      { orgId: 'gamma', planId: 'plan', planStatus: 'EXPIRED', planStartDate: date(-30), planEndDate: date(-2) }
    ] as OrgSubscribedPlan[]);
    const plan = { planId: 'plan', planName: 'Business' };
    await TestBed.configureTestingModule({
      imports: [OverviewComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { role: () => 'SUPER_ADMIN', currentUser: () => null } },
        { provide: OrganizationsService, useValue: { list: () => organizations } },
        { provide: SubscriptionsService, useValue: { list: () => subscriptions } },
        { provide: PlansService, useValue: { list: () => signal([plan]), byId: () => plan, displayNameForPlanId: () => 'Business' } },
        { provide: AuditService, useValue: { search: async () => ({ items: [{ action: 'ORG_REACTIVATED', targetId: 'alpha', result: 'SUCCESS', createdDate: date(-1) }, { action: 'ORG_REACTIVATED', targetId: 'alpha', result: 'SUCCESS', createdDate: date(-2) }], totalPages: 1 }) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    if (fixture.nativeElement.querySelector('dialog')?.open) component.closeOrganizations();
  });

  it('renders one heading, one filter bar and eight cards without the old grid', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelectorAll('[aria-label="Dashboard filters"]').length).toBe(1);
    expect(el.querySelectorAll('.kpi-grid').length).toBe(1);
    expect(el.querySelectorAll('.metric-card').length).toBe(8);
    expect(el.querySelector('app-stat-tile')).toBeNull();
    expect(el.querySelector<HTMLDialogElement>('dialog')!.open).toBeFalse();
  });

  it('opens the exact organizations behind every primary card without changing filters', () => {
    for (const metric of component.primaryKpis()) {
      (fixture.nativeElement.querySelector('[data-metric="' + metric.key + '"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('dialog').open).toBeTrue();
      expect(component.metricRows().length).toBe(metric.value);
      expect(component.a.preset()).toBe('6M');
      expect(component.a.activeChips().length).toBe(0);
      component.closeOrganizations();
      fixture.detectChanges();
    }
  });

  it('searches the selected metric and clears search when closing', () => {
    component.onKpiClick(component.primaryKpis().find(k => k.key === 'subscribed')!);
    component.organizationSearch.set('BETA.EXAMPLE');
    expect(component.sortedRows().map(r => r.org.orgId)).toEqual(['beta']);
    component.organizationSearch.set('not present');
    expect(component.sortedRows().length).toBe(0);
    component.closeOrganizations();
    expect(component.organizationSearch()).toBe('');
    expect(component.selectedMetric()).toBeNull();
  });

  it('applies chart filters to the total card too', () => {
    component.a.toggle('billing', 'TRIAL');
    const cards = component.primaryKpis();
    component.onKpiClick(cards.find(k => k.key === 'subscribed')!);
    expect(component.metricRows().map(r => r.org.orgId)).toEqual(['beta']);
    component.closeOrganizations();
    component.onKpiClick(cards.find(k => k.key === 'total')!);
    expect(component.metricRows().map(r => r.org.orgId)).toEqual(['beta']);
  });
  it('groups sales follow-ups by renewal, active trial and win-back', () => {
    const queues = component.salesQueues();
    expect(queues.find(q => q.key === 'salesRenewals')!.rows.map(r => r.org.orgId)).toEqual(['alpha']);
    expect(queues.find(q => q.key === 'salesTrials')!.rows.map(r => r.org.orgId)).toEqual(['beta']);
    expect(queues.find(q => q.key === 'salesWinback')!.rows.map(r => r.org.orgId)).toEqual(['gamma']);
    component.salesFocus.set('salesWinback');
    component.openSalesQueue();
    expect(component.metricRows().map(r => r.org.orgId)).toEqual(['gamma']);
  });

  it('deduplicates reactivations and respects the same date cohort as other charts', () => {
    let metric = component.primaryKpis().find(k => k.key === 'reactivated')!;
    expect(metric.value).toBe(1);
    component.onKpiClick(metric);
    expect(component.metricRows().map(r => r.org.orgId)).toEqual(['alpha']);
    component.closeOrganizations();
    component.setPreset('7D');
    metric = component.primaryKpis().find(k => k.key === 'reactivated')!;
    expect(metric.value).toBe(0);
  });

  it('does not present unavailable audit data as a zero', () => {
    component.a.eventsFailed.set(true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('[data-metric="reactivated"]') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
    expect(button.textContent).toContain('Audit data unavailable');
    expect(button.textContent).toContain('—');
  });

  it('defaults and resets to exactly six calendar-month buckets', () => {
    expect(component.a.preset()).toBe('6M');
    expect(component.a.buckets().length).toBe(6);
    const now = new Date();
    expect(component.a.window().from).toBe(new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime());
    component.setPreset('ALL');
    component.a.toggle('billing', 'TRIAL');
    component.a.clearAll();
    expect(component.a.preset()).toBe('6M');
    expect(component.a.activeChips().length).toBe(0);
  });

  it('applies a billing selection to every composition, trend, KPI and sales queue', () => {
    component.a.toggle('billing', 'TRIAL');
    const sum = (items: { value: number }[]) => items.reduce((n, i) => n + i.value, 0);
    expect(component.a.totalOrganizations()).toBe(1);
    expect(sum(component.a.statusMix())).toBe(1);
    expect(sum(component.a.billingMix())).toBe(1);
    expect(sum(component.a.planMix())).toBe(1);
    expect(sum(component.a.expiryRunway())).toBe(1);
    expect(component.a.conversion()).toEqual({ paid: 0, total: 1 });
    expect(component.a.lifecycleTrend().onboarded.reduce((a,b) => a+b, 0)).toBe(1);
    expect(component.a.netMovement().gained.reduce((a,b) => a+b, 0)).toBe(1);
    expect(component.salesQueues().find(q => q.key === 'salesTrials')!.rows.length).toBe(1);
  });

  it('clips every chart to an exact custom range and updates when date basis changes', () => {
    component.a.customFrom.set(date(-60));
    component.a.customTo.set(date(-45));
    component.setPreset('CUSTOM');
    expect(component.a.rows().map(r => r.org.orgId)).toEqual(['beta']);
    for (const items of [component.a.statusMix(), component.a.billingMix(), component.a.planMix(), component.a.expiryRunway()]) {
      expect(items.reduce((sum, item) => sum + item.value, 0)).toBe(1);
    }
    expect(component.a.lifecycleTrend().onboarded.reduce((a,b) => a+b, 0)).toBe(1);
    expect(component.a.kpis().find(k => k.key === 'total')!.value).toBe(1);
    component.a.basis.set('SUB_END');
    expect(component.a.rows().length).toBe(0);
    expect(component.a.lifecycleTrend().onboarded.reduce((a,b) => a+b, 0)).toBe(0);
    expect(component.a.planMix().length).toBe(0);
  });

  it('filters the originating status chart as well as other charts', () => {
    component.a.toggle('status', 'EXPIRED');
    expect(component.a.statusMix().filter(s => s.value > 0).map(s => s.key)).toEqual(['EXPIRED']);
    expect(component.a.kpis().find(k => k.key === 'total')!.value).toBe(1);
    expect(component.a.billingMix().find(s => s.key === 'PAID')!.value).toBe(1);
    expect(component.a.expiryRunway().every(s => s.value === 0)).toBeTrue();
  });

  it('keeps Other plan membership stable when its own chart filters the dashboard', () => {
    const organizations = TestBed.inject(OrganizationsService).list();
    const subscriptions = TestBed.inject(SubscriptionsService).list();
    organizations.update(rows => [...rows, ...Array.from({ length: 6 }, (_, i) => ({
      orgId: 'extra-' + i, organizationName: 'Extra ' + i, domainName: 'extra.example',
      isPaidOrg: true, createdDate: date(-10)
    } as Organization))]);
    subscriptions.update(rows => [...rows, ...Array.from({ length: 6 }, (_, i) => ({
      orgId: 'extra-' + i, planId: 'extra-plan-' + i, planStatus: 'ACTIVE',
      planStartDate: date(-10), planEndDate: date(20)
    } as OrgSubscribedPlan))]);
    const otherCount = component.a.planMix().find(p => p.key === '__other__')!.value;
    expect(otherCount).toBe(2);
    component.a.toggle('plan', '__other__');
    expect(component.a.rows().length).toBe(otherCount);
    expect(component.a.planMix().map(p => p.key)).toEqual(['__other__']);
    expect(component.a.planMix()[0].value).toBe(otherCount);
  });

  it('applies selected chart periods to both trend series and composition charts', () => {
    const target = Date.parse(date(-50));
    const bucket = component.a.buckets().find(b => target >= b.start && target <= b.end)!;
    component.a.toggle('period', bucket.key);
    const trend = component.a.lifecycleTrend();
    expect(trend.onboarded.reduce((a,b) => a+b, 0)).toBe(component.a.rows().length);
    expect(trend.onboarded.every((value, i) => trend.buckets[i].key === bucket.key || value === 0)).toBeTrue();
    expect(component.a.billingMix().reduce((sum,item) => sum + item.value, 0)).toBe(component.a.rows().length);
  });

  it('does not present missing audit events as zero in lifecycle charts and tables', () => {
    component.a.eventsLoading.set(false);
    component.a.eventsFailed.set(true);
    expect(component.lifecycleSummary().reactivated).toBeNull();
    expect(component.lifecycleSummary().difference).toBeNull();
    expect(component.trendSeries().some(s => s.key === 'reactivated')).toBeFalse();
    expect(component.trendTable().every(r => r.values[2] === 'Unavailable')).toBeTrue();
    expect(component.netTable().every(r => r.values[2] === 'Unavailable')).toBeTrue();
    expect(component.netSeries()[0].label).toBe('New organizations only');
    component.a.eventsFailed.set(false);
    expect(component.lifecycleSummary().reactivated).not.toBeNull();
    expect(component.trendSeries().some(s => s.key === 'reactivated')).toBeTrue();
  });
});

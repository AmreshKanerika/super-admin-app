import { signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrganizationsListComponent } from './organizations-list.component';
import { OverviewService, OrgOverviewRow } from '../../services/overview.service';
import { AuthService } from '../../core/auth/auth.service';
import { PlansService } from '../../services/plans.service';
import { ToastService } from '../../core/toast.service';
import { ViewModeService } from '../../core/view-mode.service';

describe('Organization directory', () => {
  let component: OrganizationsListComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<OrganizationsListComponent>>;
  let filter: jasmine.Spy;
  beforeEach(() => {
    const rows = signal([
      { org: { orgId: 'offboarded', organizationName: 'Offboarded', domainName: '', domainStatus: 'INACTIVE', createdDate: '2026-01-01', isDecommissioned: true }, subscriptions: [], daysToExpiry: null },
      { org: { orgId: 'old', organizationName: 'Older', domainName: 'old.example', domainStatus: 'INACTIVE', createdDate: '2025-01-01' }, subscriptions: [], daysToExpiry: null },
      { org: { orgId: 'new', organizationName: 'Newest', domainName: 'https://new.example', domainStatus: 'ACTIVE', createdDate: '2026-09-01' }, subscriptions: [
        { planId: 'p1', planStatus: 'ACTIVE', planStartDate: '2026-01-01' },
        { planId: 'p2', planStatus: 'UPCOMING', planStartDate: '2026-10-01' }
      ], daysToExpiry: null }
    ] as unknown as OrgOverviewRow[]);
    filter = jasmine.createSpy('filter').and.callFake((items: OrgOverviewRow[], f: { search: string }) => items.filter(r => r.org.organizationName.toLowerCase().includes(f.search.toLowerCase())));
    TestBed.configureTestingModule({ imports: [OrganizationsListComponent], providers: [provideRouter([]),
      { provide: OverviewService, useValue: { rows, filter, metrics: () => ({ total: 2 }), attentionReasons: () => [] } },
      { provide: AuthService, useValue: { role: () => 'SUPER_ADMIN' } },
      { provide: PlansService, useValue: { list: () => signal([]), displayNameForPlanId: (id: string) => id } },
      { provide: ToastService, useValue: { show: () => {} } },
      { provide: ViewModeService, useValue: { mode: () => signal('list'), set: () => {} } }
    ] });
    fixture = TestBed.createComponent(OrganizationsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('orders newest first and only links live domains', () => {
    expect(component.filtered().some(row => row.org.orgId === 'offboarded')).toBeFalse();
    expect(component.filtered().map(r => r.org.orgId)).toEqual(['new', 'old']);
    expect(component.domainUrl(component.filtered()[0])).toBe('https://new.example/');
    expect(component.domainUrl(component.filtered()[1])).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.live-domain').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.plan-tree a').length).toBe(0);
    const toggle = fixture.nativeElement.querySelector('.plan-disclosure') as HTMLButtonElement;
    toggle.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelectorAll('.plan-tree a').length).toBe(2);
    toggle.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.plan-tree a').length).toBe(0);
    expect(component.subscriptionsByOrg().get('new')![0].planId).toBe('p2');
  });
  it('reuses cached filtering across repeated rendering and debounces search', fakeAsync(() => {
    filter.calls.reset();
    for (let i = 0; i < 100; i++) { component.filtered(); component.visibleRows(); component.hasMoreRowsBelow(); }
    expect(filter).not.toHaveBeenCalled();
    component.onSearchChange('Older');
    tick(179);
    expect(component.filtered().length).toBe(2);
    tick(1);
    expect(component.filtered().map(r => r.org.orgId)).toEqual(['old']);
    expect(filter).toHaveBeenCalledTimes(1);
    component.resetFilters();
    expect(component.filtered().length).toBe(2);
  }));
  it('invalidates the cached result for filter changes', () => {
    filter.calls.reset();
    component.planId = 'p1';
    component.onFilterChange();
    component.filtered();
    expect(filter).toHaveBeenCalledTimes(1);
    expect(filter.calls.mostRecent().args[1].planId).toBe('p1');
  });
});

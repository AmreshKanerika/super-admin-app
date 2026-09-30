import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LimitsPanelComponent } from './limits-panel.component';
import { ApplicationsService } from '../../services/applications.service';
import { AppUsageService } from '../../services/app-usage.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';

describe('Organization application catalog', () => {
  it('shows new apps as Hidden, retains assigned access, and routes unassigned activation to provisioning', async () => {
    const apps = signal([{ appId: 'existing', appName: 'EXISTING', displayName: 'Existing', parentAppId: null }, { appId: 'new', appName: 'NEW', displayName: 'New application', parentAppId: null }]);
    const update = jasmine.createSpy('update').and.resolveTo();
    TestBed.configureTestingModule({ imports: [LimitsPanelComponent], providers: [provideRouter([]),
      { provide: ApplicationsService, useValue: { list: () => apps } },
      { provide: AppUsageService, useValue: { refreshForOrg: async () => {}, byOrg: () => [{ appId: 'existing', accessStatus: 'ENABLED', designTimeLimit: 10, runtimeLimit: 20 }], update } },
      { provide: SubscriptionsService, useValue: { byOrg: () => [{ planStatus: 'ACTIVE' }] } },
      { provide: ConfirmService, useValue: { open: async () => ({ confirmed: true, reason: 'Test' }) } },
      { provide: ToastService, useValue: { show: () => {} } }
    ] });
    const fixture = TestBed.createComponent(LimitsPanelComponent);
    fixture.componentRef.setInput('orgId', 'org');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.summary()).toEqual({ total: 2, enabled: 1, hidden: 1, disabled: 0 });
    const newApp = component.rows().find(row => row.item.appId === 'new')!;
    component.setAccess(newApp, 'ENABLED');
    expect(component.dirtyCount()).toBe(0);
    const link = fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('href')).toContain('/organizations/org/subscriptions/new?applicationId=new');
    const assigned = component.rows().find(row => row.item.appId === 'existing')!;
    component.setAccess(assigned, 'HIDDEN');
    await component.saveChanges();
    expect(update).toHaveBeenCalledWith('org', 'existing', { designTimeLimit: 10, runtimeLimit: 20, accessStatus: 'HIDDEN' }, 'Test');
    apps.update(list => [...list, { appId: 'later', appName: 'LATER', displayName: 'Added later', parentAppId: null }]);
    expect(component.rows().find(row => row.item.appId === 'later')!.state.accessStatus).toBe('HIDDEN');
  });
});

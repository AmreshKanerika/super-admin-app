import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UsageLimitsComponent } from './usage-limits.component';
import { AppUsageService } from '../../services/app-usage.service';
import { ApplicationsService } from '../../services/applications.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { OrgUsageSnapshot } from '../../models';

describe('UsageLimitsComponent plan selection and resets', () => {
  let fixture: ComponentFixture<UsageLimitsComponent>;
  let component: UsageLimitsComponent;
  let usage: jasmine.SpyObj<AppUsageService>;
  let confirm: jasmine.SpyObj<ConfirmService>;
  const app = (appId: string, designTimeLimit: number | null, runtimeLimit: number | null) => ({
    appId, appName: appId, accessStatus: 'ENABLED' as const,
    designTimeLimit, designTimeUsed: 0, designTimeRemaining: designTimeLimit,
    runtimeLimit, runtimeUsed: 0, runtimeRemaining: runtimeLimit
  });
  const snapshot: OrgUsageSnapshot = { orgId: 'organization', plans: [
    { planId: 'plan-a', planName: 'Plan A', limit: 500, used: 0, remaining: 500,
      apps: [app('Design app', 10, -1), app('Runtime app', -1, 20), app('Unlimited app', -1, -1), app('Unconfigured app', null, null)] },
    { planId: 'plan-b', planName: 'Plan B', limit: 100, used: 0, remaining: 100,
      apps: [app('Design app', 30, 40)] }
  ] };

  beforeEach(async () => {
    usage = jasmine.createSpyObj<AppUsageService>('AppUsageService', ['usageSnapshotFor', 'refreshUsageSnapshot', 'resetOrganizationUsage']);
    usage.usageSnapshotFor.and.returnValue(snapshot);
    usage.refreshUsageSnapshot.and.resolveTo();
    usage.resetOrganizationUsage.and.resolveTo({
      orgId: 'organization', scope: 'BOTH', rowsReset: 2, designTimeRowsReset: 1, runtimeRowsReset: 1,
      plans: [], message: 'Selected finite usage counters reset successfully.'
    });
    confirm = jasmine.createSpyObj<ConfirmService>('ConfirmService', ['open']);
    confirm.open.and.resolveTo({ confirmed: true, reason: 'Approved reset' });
    await TestBed.configureTestingModule({
      imports: [UsageLimitsComponent],
      providers: [
        { provide: AppUsageService, useValue: usage },
        { provide: ApplicationsService, useValue: { byId: () => null } },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: { show: jasmine.createSpy() } },
        { provide: AuthService, useValue: { role: () => 'SUPER_ADMIN' } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(UsageLimitsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('orgId', 'organization');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function choosePlan(id = 'plan-a'): void {
    component.selectPlan(id);
    fixture.detectChanges();
  }

  it('shows plans before showing only the chosen plan applications', () => {
    expect(fixture.nativeElement.querySelectorAll('.plan-card').length).toBe(2);
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    choosePlan();
    expect(component.rows().length).toBe(4);
    choosePlan('plan-b');
    expect(component.rows().length).toBe(1);
    expect(component.rows()[0].designTime.limit).toBe(30);
  });

  it('enables reset for a selected finite counter even with zero usage', () => {
    choosePlan();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('input[aria-label="Select Design app"]');
    checkbox.click();
    fixture.detectChanges();
    expect(component.canReset()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.reset-button').disabled).toBeFalse();
  });

  it('makes unlimited and unconfigured rows read-only with explanatory hints', () => {
    choosePlan();
    for (const name of ['Unlimited app', 'Unconfigured app']) {
      const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('input[aria-label="Select ' + name + '"]');
      expect(checkbox.disabled).toBeTrue();
      expect(checkbox.parentElement?.getAttribute('data-tooltip')).toBeTruthy();
    }
    const unlimited = component.rows().find((row) => row.appId === 'Unlimited app')!;
    component.toggleApp(unlimited);
    expect(component.targetedRows().length).toBe(0);
    expect(component.rowHint(unlimited)).toContain('there is no usage cap');
  });

  it('selects all eligible apps in the chosen plan and deselects all without a reset target', async () => {
    choosePlan();
    component.query.set('Design');
    component.selectAll();
    expect(component.targetedRows().length).toBe(2);
    expect(component.allSelected()).toBeTrue();
    expect(component.targetedRows().every((row) => row.planId === 'plan-a')).toBeTrue();
    component.clearSelection();
    expect(component.canReset()).toBeFalse();
    await component.resetUsage();
    expect(usage.resetOrganizationUsage).not.toHaveBeenCalled();
  });

  it('prunes selection on scope changes and clears selection on plan changes', () => {
    choosePlan();
    component.selectAll();
    component.changeScope('RUNTIME');
    expect(component.targetedRows().map((row) => row.appId)).toEqual(['Runtime app']);
    choosePlan('plan-b');
    expect(component.targetedRows().length).toBe(0);
    expect(component.canReset()).toBeFalse();
  });

  it('confirms and submits only selected plan apps with finite counters', async () => {
    choosePlan();
    component.selectAll();
    await component.resetUsage();
    const request = confirm.open.calls.mostRecent().args[0];
    expect(request.diffLines?.length).toBe(2);
    expect(request.diffLines?.every((line) => line.from.includes('Used 0'))).toBeTrue();
    expect(usage.resetOrganizationUsage).toHaveBeenCalledWith('organization', 'Approved reset', 'BOTH', [
      { planId: 'plan-a', appId: 'Design app' }, { planId: 'plan-a', appId: 'Runtime app' }
    ]);
    expect(component.targetedRows().length).toBe(0);
  });
});


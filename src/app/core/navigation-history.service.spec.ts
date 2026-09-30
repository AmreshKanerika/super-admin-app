import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { NavigationHistoryService } from './navigation-history.service';
describe('Page back navigation', () => {
  let service: NavigationHistoryService;
  let navigate: jasmine.Spy;
  beforeEach(() => {
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { events: new Subject(), navigateByUrl: navigate } }] });
    service = TestBed.inject(NavigationHistoryService);
  });
  it('returns to the actual origin including filters rather than a hardcoded parent', () => {
    service.record('/organizations?planId=a');
    service.record('/organizations?planId=b');
    service.record('/plans/b');
    service.back('/plans');
    expect(navigate).toHaveBeenCalledWith('/organizations?planId=b', { replaceUrl: true });
  });
  it('preserves repeated visits and avoids bouncing after page back', () => {
    service.record('/overview'); service.record('/organizations'); service.record('/plans/a'); service.record('/organizations');
    service.back(null);
    expect(navigate).toHaveBeenCalledWith('/plans/a', { replaceUrl: true });
    service.record('/plans/a'); service.back(null);
    expect(navigate).toHaveBeenCalledWith('/organizations', { replaceUrl: true });
  });
  it('uses a local fallback for direct entry and clears history at login', () => {
    service.record('/overview'); service.record('/login'); service.record('/plans/a');
    service.back('/plans');
    expect(navigate).toHaveBeenCalledWith('/plans', { replaceUrl: true });
  });
});

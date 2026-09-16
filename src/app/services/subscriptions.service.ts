import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { OrgSubscribedPlan, PlanChangeEffective, PlanStatus, PlanUsageSummary } from '../models';
import { AuditService } from './audit.service';
import { AppUsageService } from './app-usage.service';
import { ToastService } from '../core/toast.service';
import { API_BASE_URL } from '../core/api-config';

let nextId = 1;

@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private audit = inject(AuditService);
  private appUsage = inject(AppUsageService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private readonly subs = signal<OrgSubscribedPlan[]>([]);

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const subs = await firstValueFrom(this.http.get<OrgSubscribedPlan[]>(`${API_BASE_URL}/platform/subscriptions`));
      this.subs.set(subs);
    } catch (err) {
      console.error('Failed to load subscriptions', err);
      this.toast.show("Couldn't load subscriptions — check your connection and refresh.", 'critical');
    }
  }

  list() {
    return this.subs;
  }

  byId(id: string): OrgSubscribedPlan | undefined {
    return this.subs().find((s) => s.subscriptionId === id);
  }

  byOrg(orgId: string): OrgSubscribedPlan[] {
    return this.subs().filter((s) => s.orgId === orgId);
  }

  // The org's current subscription, regardless of status — ACTIVE, SUSPENDED,
  // EXPIRED, or CANCELLED. Each organization has exactly one subscription in this
  // model, so this is just "the" subscription, not literally the active-status one.
  // (Named activeByOrg for historical reasons; filtering by ACTIVE here caused
  // suspended orgs to lose their action buttons entirely once suspended.)
  activeByOrg(orgId: string): OrgSubscribedPlan | undefined {
    return this.subs().find((s) => s.orgId === orgId);
  }

  create(sub: OrgSubscribedPlan): void {
    this.subs.update((list) => [sub, ...list]);
  }

  async extend(id: string, newEndDateIso: string, reason: string): Promise<void> {
    const sub = this.byId(id);
    if (!sub) throw new Error('Subscription not found');
    // optimistic local update
    const prev = { ...sub };
    this.subs.update((list) => list.map((s) => (s.subscriptionId === id ? { ...s, planEndDate: newEndDateIso } : s)));
    try {
      const payload = { planEndDate: newEndDateIso, reason, requestedBy: 'super-admin-console' };
      const updated = await firstValueFrom(this.http.post<any>(`${API_BASE_URL}/platform/organizations/${sub.orgId}/subscriptions/${id}/update`, payload));
      // align local store with server authoritative dto
      this.subs.update((list) => list.map((s) => (s.subscriptionId === id ? { ...s, planEndDate: updated.planEndDate, planStartDate: updated.planStartDate, planStatus: updated.planStatus } : s)));
      this.audit.log('SUBSCRIPTION_EXTENDED', 'Subscription', `Extended — ${reason}`, 'SUCCESS', sub.orgId);
    } catch (err: unknown) {
      // rollback
      this.subs.update((list) => list.map((s) => (s.subscriptionId === id ? prev : s)));
      console.error('Failed to extend subscription', err);
      const httpError = err as { error?: { message?: string }; message?: string };
      this.toast.show(httpError?.error?.message || httpError?.message || 'Failed to extend subscription', 'critical');
      throw err;
    }
  }

  changePlan(id: string, newPlanId: string, reason: string): void {
    // legacy local-only helper. Prefer changePlanDirectly(orgId, subscriptionId, ...)
    const sub = this.byId(id);
    if (!sub) return;
    this.subs.update((list) => list.map((s) => (s.subscriptionId === id ? { ...s, planId: newPlanId } : s)));
    this.appUsage.resetForOrg(sub.orgId, newPlanId);
    this.audit.log('SUBSCRIPTION_PLAN_CHANGED', 'Subscription', `Plan changed — ${reason}`, 'SUCCESS', sub?.orgId);
  }

  async setStatus(id: string, status: PlanStatus, reason?: string): Promise<void> {
    const sub = this.byId(id);
    if (!sub) throw new Error('Subscription not found');
    const prev = { ...sub };
    // optimistic
    this.subs.update((list) => list.map((s) => (s.subscriptionId === id ? { ...s, planStatus: status, statusReason: reason } : s)));
    try {
      const payload = { status, reason, requestedBy: 'super-admin-console' };
      const updated = await firstValueFrom(this.http.post<any>(`${API_BASE_URL}/platform/organizations/${sub.orgId}/subscriptions/${id}/update`, payload));
      this.subs.update((list) => list.map((s) => (s.subscriptionId === id ? { ...s, planStatus: updated.planStatus, statusReason: updated.statusReason } : s)));
      const actionMap: Record<string, string> = {
        SUSPENDED: 'SUBSCRIPTION_SUSPENDED',
        ACTIVE: 'SUBSCRIPTION_REACTIVATED',
        CANCELLED: 'SUBSCRIPTION_CANCELLED'
      };
      this.audit.log(actionMap[status] ?? 'SUBSCRIPTION_STATUS_CHANGED', 'Subscription', `${status}${reason ? ' — ' + reason : ''}`, 'SUCCESS', sub?.orgId);
    } catch (err: unknown) {
      // rollback
      this.subs.update((list) => list.map((s) => (s.subscriptionId === id ? prev : s)));
      console.error('Failed to update subscription status', err);
      const httpError = err as { error?: { message?: string }; message?: string };
      this.toast.show(httpError?.error?.message || httpError?.message || 'Failed to update status', 'critical');
      throw err;
    }
  }

  nextSubscriptionId(): string {
    return `sub-${nextId++}`;
  }

  async getUsageSummary(orgId: string, subscriptionId: string): Promise<PlanUsageSummary> {
    return firstValueFrom(
      this.http.get<PlanUsageSummary>(`${API_BASE_URL}/platform/organizations/${orgId}/subscriptions/${subscriptionId}/usage-summary`)
    );
  }

  async assignPlan(orgId: string, planId: string, planStartDate?: string, planEndDate?: string): Promise<OrgSubscribedPlan> {
    const sub = await firstValueFrom(
      this.http.post<OrgSubscribedPlan>(`${API_BASE_URL}/platform/organizations/${orgId}/subscriptions`, {
        planId,
        planStartDate,
        planEndDate
      })
    );
    this.subs.update((list) => [sub, ...list]);
    this.audit.log('SUBSCRIPTION_ASSIGNED', 'Subscription', `Subscription assigned`, 'SUCCESS', orgId);
    return sub;
  }

  async changePlanDirectly(
    orgId: string,
    subscriptionId: string,
    newPlanId: string,
    effective: PlanChangeEffective,
    reviewNote: string,
    newPlanEndDate?: string
  ): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/platform/organizations/${orgId}/subscriptions/${subscriptionId}/change-plan`, {
        newPlanId,
        effective,
        newPlanEndDate,
        reviewNote,
        requestedBy: 'super-admin-console'
      })
    );
    if (effective === 'NOW') {
      this.subs.update((list) =>
        list.map((s) => (s.subscriptionId === subscriptionId ? { ...s, planId: newPlanId, planStatus: 'ACTIVE' } : s))
      );
      this.appUsage.resetForOrg(orgId, newPlanId);
    }
    this.audit.log('SUBSCRIPTION_PLAN_CHANGED', 'Subscription', `Plan changed — ${reviewNote} (${effective})`, 'SUCCESS', orgId);
  }
}

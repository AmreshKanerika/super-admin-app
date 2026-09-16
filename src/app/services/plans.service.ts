import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppLimitConfig, BillingMode, SubscriptionPlan } from '../models';
import { AuditService } from './audit.service';
import { ToastService } from '../core/toast.service';
import { API_BASE_URL } from '../core/api-config';

export interface PlanDraft {
  planName: string;
  description: string;
  billingMode: BillingMode;
  primaryAppId: string;
  apps: AppLimitConfig[];
}

interface PlanCreateOptions {
  auditAction?: string;
  auditLabel?: string;
  successMessage?: (plan: SubscriptionPlan) => string;
  failureMessage?: string;
}

@Injectable({ providedIn: 'root' })
export class PlansService {
  private audit = inject(AuditService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private readonly plans = signal<SubscriptionPlan[]>([]);

  constructor() {
    // fire-and-forget initial load
    this.refresh().catch((err) => console.error('Initial plans load failed', err));
  }

  /**
   * Refresh plans from server and return a promise that resolves when done.
   */
  refresh(): Promise<SubscriptionPlan[]> {
    return firstValueFrom(this.http.get<SubscriptionPlan[]>(`${API_BASE_URL}/platform/plans`))
      .then((plans) => {
        this.plans.set(plans);
        return plans;
      })
      .catch((err) => {
        console.error('Failed to load plans', err);
        this.toast.show("Couldn't load plans — check your connection and refresh.", 'critical');
        throw err;
      });
  }

  list() {
    return this.plans;
  }

  byId(planId: string): SubscriptionPlan | undefined {
    return this.plans().find((p) => p.planId === planId);
  }

  defaults(): SubscriptionPlan[] {
    return this.plans().filter((p) => p.planType === 'DEFAULT' && p.planState === 'ACTIVE');
  }

  nameAvailable(name: string, excludePlanId?: string): boolean {
    const norm = name.trim().toLowerCase();
    return !this.plans().some((p) => p.planId !== excludePlanId && p.planName.trim().toLowerCase() === norm);
  }

  async create(draft: PlanDraft, options?: PlanCreateOptions): Promise<SubscriptionPlan> {
    // create a lightweight temporary plan so UI updates instantly
    const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const tempPlan: SubscriptionPlan = {
      planId: tempId,
      planName: draft.planName,
      description: draft['description'] ?? '',
      planType: 'CUSTOM',
      planState: 'DRAFT',
      billingMode: draft.billingMode,
      primaryAppId: draft.primaryAppId || null,
      apps: draft.apps ?? [],
      createdDate: new Date().toISOString(),
      assignedOrgCount: 0,
      isSystemDefault: false
    } as unknown as SubscriptionPlan;

    // insert immediately
    this.plans.update((list) => [tempPlan, ...list]);

    try {
      const plan = await firstValueFrom(
        this.http.post<SubscriptionPlan>(`${API_BASE_URL}/platform/plans`, {
          planName: draft.planName,
          billingMode: draft.billingMode,
          primaryAppId: draft.primaryAppId || null,
          apps: draft.apps
        })
      );

      // replace temp with server-provided plan — this response is already authoritative, so
      // there's no need for a follow-up refresh() (that was doubling every save's latency and,
      // if it ever failed, rolling back a save that had actually already succeeded).
      this.plans.update((list) => list.map((p) => (p.planId === tempId ? plan : p)));
      this.audit.log(options?.auditAction ?? 'PLAN_CREATED', 'Plan', options?.auditLabel ?? plan.planName);
      this.toast.show(options?.successMessage?.(plan) ?? `Plan '${plan.planName}' created`, 'success');
      return plan;
    } catch (err: any) {
      // rollback temp
      this.plans.update((list) => list.filter((p) => p.planId !== tempId));
      console.error('Failed to create plan', err);
      this.toast.show(err?.error?.message || err?.message || options?.failureMessage || 'Failed to create plan', 'critical');
      throw err;
    }
  }

  async update(planId: string, patch: Partial<Pick<SubscriptionPlan, 'planName' | 'description' | 'billingMode' | 'primaryAppId' | 'apps'>>): Promise<void> {
    const existing = this.byId(planId);
    if (!existing) {
      throw new Error('Plan not found');
    }
    const merged = { ...existing, ...patch } as SubscriptionPlan;

    // snapshot for rollback
    const prev = { ...existing, apps: existing.apps?.map((a) => ({ ...a })) } as SubscriptionPlan;

    // apply optimistic update
    this.plans.update((list) => list.map((p) => (p.planId === planId ? merged : p)));

    try {
      const updated = await firstValueFrom(
        this.http.put<SubscriptionPlan>(`${API_BASE_URL}/platform/plans/${planId}`, {
          planName: merged.planName,
          billingMode: merged.billingMode,
          primaryAppId: merged.primaryAppId || null,
          apps: merged.apps
        })
      );
      // replace with authoritative server copy — no follow-up refresh() needed, see create() above.
      this.plans.update((list) => list.map((p) => (p.planId === planId ? updated : p)));
      this.audit.log('PLAN_UPDATED', 'Plan', updated.planName);
      this.toast.show(`Plan '${updated.planName}' updated`, 'success');
    } catch (err: any) {
      // rollback
      this.plans.update((list) => list.map((p) => (p.planId === planId ? prev : p)));
      console.error('Failed to update plan', err);
      this.toast.show(err?.error?.message || err?.message || 'Failed to update plan', 'critical');
      throw err;
    }
  }

  async remove(planId: string): Promise<void> {
    const plan = this.byId(planId);
    if (!plan) {
      throw new Error('Plan not found');
    }

    // snapshot full list for rollback
    const prevList = this.plans();

    // optimistic remove
    this.plans.update((list) => list.filter((p) => p.planId !== planId));

    try {
      await firstValueFrom(this.http.delete<void>(`${API_BASE_URL}/platform/plans/${planId}`));
      this.audit.log('PLAN_DELETED', 'Plan', plan?.planName ?? planId);
      this.toast.show(`Plan '${plan.planName}' deleted`, 'success');
    } catch (err: any) {
      // rollback
      this.plans.set(prevList);
      console.error('Failed to remove plan', err);
      this.toast.show(err?.error?.message || err?.message || 'Failed to delete plan', 'critical');
      throw err;
    }
  }

  // A clone used to be fabricated here with a client-side `plan-custom-N` id and pushed straight
  // into the signal, so the copy only ever existed in this browser tab - the server had never heard
  // of it. Every subsequent action on that plan then failed, and failed opaquely: DELETE
  // /platform/plans/plan-custom-1 cannot even bind to the endpoint's `@PathVariable UUID planId`,
  // so Spring rejected it before the controller ran and the user saw a bare "An unexpected error
  // occurred". Going through create() means a clone is a real, persisted plan like any other.
  async clone(planId: string): Promise<SubscriptionPlan | undefined> {
    const source = this.byId(planId);
    if (!source) return undefined;

    const planName = this.availableCopyName(source.planName);
    return this.create(
      {
        planName,
        description: source.description ?? '',
        billingMode: source.billingMode,
        primaryAppId: source.primaryAppId ?? '',
        apps: source.apps.map((a) => ({ ...a }))
      },
      {
        auditAction: 'PLAN_CLONED',
        auditLabel: `${source.planName} → ${planName}`,
        successMessage: (plan) => `Cloned as '${plan.planName}'`,
        failureMessage: 'Failed to clone plan'
      }
    );
  }

  // Plan names are unique server-side (existsByPlanName -> 409), so a second clone of the same plan
  // cannot also be "<name> (copy)". Numbering the copies keeps cloning repeatable instead of
  // failing on the second attempt.
  private availableCopyName(sourceName: string): string {
    const base = `${sourceName} (copy)`;
    if (this.nameAvailable(base)) {
      return base;
    }
    for (let n = 2; n < 500; n++) {
      const candidate = `${sourceName} (copy ${n})`;
      if (this.nameAvailable(candidate)) {
        return candidate;
      }
    }
    return `${sourceName} (copy ${Date.now()})`;
  }

  setState(planId: string, state: SubscriptionPlan['planState']): void {
    const plan = this.byId(planId);
    this.plans.update((list) => list.map((p) => (p.planId === planId ? { ...p, planState: state } : p)));
    this.audit.log(state === 'ARCHIVED' ? 'PLAN_ARCHIVED' : 'PLAN_ACTIVATED', 'Plan', plan?.planName ?? planId);
  }
}

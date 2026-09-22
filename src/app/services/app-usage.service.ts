import { Injectable, inject, signal } from '@angular/core';
import { AccessStatus, AppUsage, OrgPlanUsage, OrgUsageSnapshot, ResetOrgUsageResult, UsageResetScope, UsageResetTarget } from '../models';
import { AuditService } from './audit.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../core/api-config';
import { AuthService } from '../core/auth/auth.service';
import { PlansService } from './plans.service';

interface PlanUsageResponse {
  orgId: string;
  planName?: string;
  orgPlanLimit?: number;
  orgUsedLimit?: number;
  orgRemainingLimit?: number;
  appsInfo?: {
    appId: string;
    parentAppId?: string;
    appName?: string;
    accessStatus?: 'ENABLED' | 'DISABLED' | 'HIDDEN';
    appPlanLimit?: number;
    appUsedLimit?: number;
    appRemainingLimit?: number;
  }[];
  appRunUsageLimitInfo?: {
    appId: string;
    appName?: string;
    appRuntimeLimit?: number;
    appRuntimeUsed?: number;
    appRuntimeRemaining?: number;
  }[];
}

interface AdminAppLimitUpdateResponse {
  orgId: string;
  appId: string;
  accessStatus: AccessStatus;
  designTimeLimit: number;
  designTimeUsed: number;
  runtimeLimit: number;
  runtimeUsed: number;
}

@Injectable({ providedIn: 'root' })
export class AppUsageService {
  private audit = inject(AuditService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private plans = inject(PlansService);

  private readonly usage = signal<AppUsage[]>([]);

  // The organization-level allowance, kept separately from the per-app rows because it is a
  // different thing: one pooled counter for the whole subscription, and the one a usage reset
  // clears. The per-app rows are what an admin overrides; this is what a customer consumes.
  private readonly orgUsage = signal<Record<string, OrgPlanUsage>>({});
  private readonly snapshots = signal<Record<string, OrgUsageSnapshot>>({});

  usageSnapshotFor(orgId: string): OrgUsageSnapshot | null {
    return this.snapshots()[orgId] ?? null;
  }

  async refreshUsageSnapshot(orgId: string): Promise<void> {
    const userId = this.auth.getUserId();
    if (!userId) throw new Error('Not authenticated');
    const url = `${API_BASE_URL}/plan/admin/usage?orgId=${encodeURIComponent(orgId)}&userId=${encodeURIComponent(userId)}`;
    const snapshot = await firstValueFrom(this.http.get<OrgUsageSnapshot>(url));
    this.snapshots.update((current) => ({ ...current, [orgId]: snapshot }));
  }

  list() {
    return this.usage;
  }

  /** null until refreshForOrg has run for this organization. */
  orgUsageFor(orgId: string): OrgPlanUsage | null {
    return this.orgUsage()[orgId] ?? null;
  }

  byOrg(orgId: string): AppUsage[] {
    return this.usage().filter((u) => u.orgId === orgId);
  }

  // Fetch real usage for a single organization and merge into the in-memory store. Uses the
  // super-admin-specific endpoint: the end-user-facing /plan/getPlanLimit filters apps down to
  // "apps this calling user has scope for", and a platform super admin is never a member of the
  // org being viewed — that endpoint would (and did) always come back empty for this console.
  async refreshForOrg(orgId: string): Promise<void> {
    const userId = this.auth.getUserId();
    if (!userId) return; // not authenticated yet
    try {
      const url = `${API_BASE_URL}/plan/admin/getPlanLimit?orgId=${encodeURIComponent(orgId)}&userId=${encodeURIComponent(userId)}`;
      const resp = (await firstValueFrom(this.http.get<PlanUsageResponse>(url))) as PlanUsageResponse;

      const runtimeInfo = new Map<string, NonNullable<PlanUsageResponse['appRunUsageLimitInfo']>[0]>();
      (resp.appRunUsageLimitInfo ?? []).forEach((r) => runtimeInfo.set(r.appId, r));

      const rows: AppUsage[] = (resp.appsInfo ?? []).map((a) => {
        const r = runtimeInfo.get(a.appId);
        return {
          orgId: resp.orgId,
          appId: a.appId,
          appName: a.appName ?? r?.appName ?? null,
          designTimeLimit: a.appPlanLimit ?? -1,
          designTimeUsed: a.appUsedLimit ?? 0,
          designTimeRemaining: a.appRemainingLimit ?? -1,
          runtimeLimit: r?.appRuntimeLimit ?? -1,
          runtimeUsed: r?.appRuntimeUsed ?? 0,
          runtimeRemaining: r?.appRuntimeRemaining ?? -1,
          accessStatus: (a.accessStatus as AccessStatus) ?? 'DISABLED'
        };
      });

      this.orgUsage.update((byOrg) => ({
        ...byOrg,
        [orgId]: {
          orgId: resp.orgId ?? orgId,
          planName: resp.planName ?? null,
          orgPlanLimit: resp.orgPlanLimit ?? 0,
          orgUsedLimit: resp.orgUsedLimit ?? 0,
          orgRemainingLimit: resp.orgRemainingLimit ?? 0
        }
      }));

      // Replace any existing rows for this org
      this.usage.update((list) => [...list.filter((u) => u.orgId !== orgId), ...rows]);
    } catch (err) {
      console.error('Failed to load app usage for org', orgId, err);
      throw err;
    }
  }

  // Persist a single app's design-time limit, runtime limit, and access status override for this
  // organization. Throws on failure — callers must not treat this as a fire-and-forget call.
  async update(orgId: string, appId: string, patch: Partial<Pick<AppUsage, 'designTimeLimit' | 'runtimeLimit' | 'accessStatus'>>, reason: string): Promise<void> {
    const userId = this.auth.getUserId();
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const current = this.usage().find((u) => u.orgId === orgId && u.appId === appId);
    const merged = { ...current, ...patch };

    const body = {
      orgId,
      appId,
      userId,
      designTimeLimit: merged.designTimeLimit,
      runtimeLimit: merged.runtimeLimit,
      accessStatus: merged.accessStatus
    };

    const resp = await firstValueFrom(
      this.http.post<AdminAppLimitUpdateResponse>(`${API_BASE_URL}/plan/admin/updatePlanLimit`, body)
    );

    const designTimeLimit = resp.designTimeLimit ?? merged.designTimeLimit ?? -1;
    const designTimeUsed = resp.designTimeUsed ?? merged.designTimeUsed ?? 0;
    const runtimeLimit = resp.runtimeLimit ?? merged.runtimeLimit ?? -1;
    const runtimeUsed = resp.runtimeUsed ?? merged.runtimeUsed ?? 0;

    const updated: AppUsage = {
      orgId: resp.orgId ?? orgId,
      appId: resp.appId ?? appId,
      appName: merged.appName ?? null,
      designTimeLimit,
      designTimeUsed,
      // The override response does not echo remaining, so it is derived here —
      // keeping the unlimited sentinel rather than computing -1 minus used.
      designTimeRemaining: designTimeLimit < 0 ? -1 : Math.max(0, designTimeLimit - designTimeUsed),
      runtimeLimit,
      runtimeUsed,
      runtimeRemaining: runtimeLimit < 0 ? -1 : Math.max(0, runtimeLimit - runtimeUsed),
      accessStatus: resp.accessStatus ?? merged.accessStatus ?? 'DISABLED'
    };
    this.usage.update((list) => list.map((u) => (u.orgId === orgId && u.appId === appId ? updated : u)));
    this.audit.log('LIMIT_OVERRIDE', 'Organization', reason, 'SUCCESS', orgId);
  }

  // Clears the organization's pooled consumption so a customer who ran out — most often on a
  // trial — can use their allowance again. The limit itself is untouched: this is "start the same
  // allowance over", never "grant more", which stays a deliberate plan or limit change.
  //
  // The caller re-reads whatever view it shows afterwards. This used to refresh the per-app store
  // here as well, which made one reset three round trips: the reset, this refresh, and the caller's
  // own snapshot read - and that snapshot endpoint re-runs the same sync again server side.
  async resetOrganizationUsage(
    orgId: string,
    reason: string,
    scope: UsageResetScope,
    targets: UsageResetTarget[]
  ): Promise<ResetOrgUsageResult> {
    if (!targets.length) throw new Error('Select at least one application to reset.');
    const userId = this.auth.getUserId();
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const result = await firstValueFrom(
      this.http.post<ResetOrgUsageResult>(`${API_BASE_URL}/plan/admin/resetUsage`, { orgId, userId, reason, scope, targets })
    );

    this.audit.log('USAGE_RESET', 'Organization', reason, 'SUCCESS', orgId);
    return result;
  }

  resetForOrg(orgId: string, planId: string): void {
    // keep local behaviour — reset from the plan's app configs
    const plan = this.plans.byId(planId);
    const enabledAppIds = new Set(plan?.apps.filter((a) => a.accessStatus === 'ENABLED').map((a) => a.appId) ?? []);
    this.usage.update((list) =>
      list.map((u) =>
        u.orgId === orgId
          ? {
              ...u,
              designTimeUsed: 0,
              designTimeRemaining: u.designTimeLimit < 0 ? -1 : u.designTimeLimit,
              runtimeUsed: 0,
              runtimeRemaining: u.runtimeLimit < 0 ? -1 : u.runtimeLimit,
              accessStatus: (enabledAppIds.has(u.appId) ? 'ENABLED' : 'DISABLED') as AccessStatus
            }
          : u
      )
    );
    this.audit.log('USAGE_RESET', 'Organization', 'Usage counters reset', 'SUCCESS', orgId);
  }
}

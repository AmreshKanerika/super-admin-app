import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AppPlanAssignments,
  Application,
  ApplicationScopeRow,
  MigrationTypeConfig,
  MigrationTypeSaveResponse,
  PlanAssignmentResult,
  Scope
} from '../models';
import { ToastService } from '../core/toast.service';
import { AuditService } from './audit.service';
import { AuthService } from '../core/auth/auth.service';
import { API_BASE_URL } from '../core/api-config';
import { displayNameOrFallback } from '../core/app-name.util';

/** Result of the live name check in the migration details form. */
export interface MigrationNameCheck {
  available: boolean;
  existingId: number | null;
  existingName: string | null;
  existingAppId: string | null;
  existingAppLabel: string | null;
}

export interface ApplicationDraft {
  /** Only read on create — the machine key is fixed for the life of the application. */
  appName: string;
  displayName: string;
  parentAppId: string | null;
  scopes: Scope[];
}

@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private audit = inject(AuditService);
  private auth = inject(AuthService);

  private readonly apps = signal<Application[]>([]);
  readonly loading = signal(false);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const apps = await firstValueFrom(this.http.get<Application[]>(`${API_BASE_URL}/platform/applications`));
      this.apps.set(apps ?? []);
    } catch (err) {
      console.error('Failed to load applications', err);
      this.toast.show("Couldn't load the application catalog — check your connection and refresh.", 'critical');
    } finally {
      this.loading.set(false);
    }
  }

  list() {
    return this.apps;
  }

  roots(): Application[] {
    return this.apps().filter((a) => a.parentAppId === null);
  }

  childrenOf(appId: string): Application[] {
    return this.apps().filter((a) => a.parentAppId === appId);
  }

  byId(appId: string): Application | undefined {
    return this.apps().find((a) => a.appId === appId);
  }

  descendantsInclusive(appId: string): string[] {
    const children = this.childrenOf(appId).map((c) => c.appId);
    return [appId, ...children];
  }

  displayNameForAppId(appId: string | null | undefined): string {
    if (!appId) return '';
    return displayNameOrFallback(this.byId(appId), appId);
  }

  // Walks the full catalog tree to whatever depth it actually goes — a plan's applications aren't
  // just root + one level of children (e.g. Migration has its own children like "SSAS to Fabric"),
  // and anywhere that only checked roots()/childrenOf(root) one level deep silently dropped every
  // app past the second level.
  flattenedTree(): { app: Application; depth: number }[] {
    const result: { app: Application; depth: number }[] = [];
    const visit = (app: Application, depth: number) => {
      result.push({ app, depth });
      for (const child of this.childrenOf(app.appId)) visit(child, depth + 1);
    };
    for (const root of this.roots()) visit(root, 0);
    return result;
  }

  // --- writes --------------------------------------------------------------
  //
  // Each of these refreshes the whole catalog rather than patching the local signal.
  // The server normalises what it is sent (upper-casing the machine key, collapsing
  // whitespace in the label, sorting scopes), so a locally-patched row would differ
  // from the stored one in ways nobody would think to look for.

  async create(draft: ApplicationDraft): Promise<Application> {
    const created = await firstValueFrom(
      this.http.post<Application>(`${API_BASE_URL}/platform/applications`, { ...draft, userId: this.auth.getUserId() })
    );
    await this.refresh();
    this.audit.log('APPLICATION_CREATED', 'Application', displayNameOrFallback(created, created.appId), 'SUCCESS', created.appId);
    return created;
  }

  async update(appId: string, draft: Omit<ApplicationDraft, 'appName'>): Promise<Application> {
    const updated = await firstValueFrom(
      this.http.put<Application>(`${API_BASE_URL}/platform/applications/${appId}`, {
        ...draft,
        userId: this.auth.getUserId()
      })
    );
    await this.refresh();
    this.audit.log('APPLICATION_UPDATED', 'Application', displayNameOrFallback(updated, appId), 'SUCCESS', appId);
    return updated;
  }

  async remove(appId: string): Promise<void> {
    const label = this.displayNameForAppId(appId);
    await firstValueFrom(this.http.delete(`${API_BASE_URL}/platform/applications/${appId}`));
    await this.refresh();
    this.audit.log('APPLICATION_DELETED', 'Application', label, 'SUCCESS', appId);
  }

  async listScopes(appId: string): Promise<ApplicationScopeRow[]> {
    return firstValueFrom(this.http.get<ApplicationScopeRow[]>(`${API_BASE_URL}/platform/applications/${appId}/scopes`));
  }

  async addScope(appId: string, scopeName: Scope): Promise<void> {
    const params = new URLSearchParams({ scopeName });
    const userId = this.auth.getUserId();
    if (userId) params.set('userId', userId);
    await firstValueFrom(this.http.post(`${API_BASE_URL}/platform/applications/${appId}/scopes?${params.toString()}`, {}));
    await this.refresh();
  }

  async removeScope(appId: string, appScopeId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${API_BASE_URL}/platform/applications/${appId}/scopes/${appScopeId}`));
    await this.refresh();
  }

  // --- plan assignment ------------------------------------------------------
  //
  // An application reaches organizations through the plans that include it. Each call answers per
  // plan (and per subscribed organization), because a batch can partly succeed.

  async listPlanAssignments(appId: string): Promise<AppPlanAssignments> {
    return firstValueFrom(this.http.get<AppPlanAssignments>(`${API_BASE_URL}/platform/applications/${appId}/plans`));
  }

  async assignToPlans(appId: string, planIds: string[]): Promise<PlanAssignmentResult[]> {
    const results = await firstValueFrom(
      this.http.post<PlanAssignmentResult[]>(`${API_BASE_URL}/platform/applications/${appId}/plans`, {
        planIds,
        userId: this.auth.getUserId()
      })
    );
    await this.refresh();
    this.audit.log('APPLICATION_ADDED_TO_PLANS', 'Application', this.displayNameForAppId(appId), 'SUCCESS', appId);
    return results;
  }

  async removeFromPlans(appId: string, planIds: string[]): Promise<PlanAssignmentResult[]> {
    const results = await firstValueFrom(
      this.http.post<PlanAssignmentResult[]>(`${API_BASE_URL}/platform/applications/${appId}/plans/remove`, {
        planIds,
        userId: this.auth.getUserId()
      })
    );
    await this.refresh();
    this.audit.log('APPLICATION_REMOVED_FROM_PLANS', 'Application', this.displayNameForAppId(appId), 'SUCCESS', appId);
    return results;
  }

  async syncPlanSubscribers(appId: string): Promise<PlanAssignmentResult[]> {
    return firstValueFrom(this.http.post<PlanAssignmentResult[]>(`${API_BASE_URL}/platform/applications/${appId}/plans/sync`, {}));
  }

  // --- migration details ----------------------------------------------------

  /** Null when this migration application has no details saved yet. */
  async getMigrationType(appId: string): Promise<MigrationTypeConfig | null> {
    try {
      // 204 (no details yet) arrives as a null body.
      return (await firstValueFrom(this.http.get<MigrationTypeConfig | null>(`${API_BASE_URL}/platform/applications/${appId}/migration-type`))) ?? null;
    } catch (error: unknown) {
      if ((error as { status?: number })?.status === 404) return null;
      throw error;
    }
  }

  /** Whether another application's master migration type already uses this name. */
  checkMigrationName(appId: string, name: string): Promise<MigrationNameCheck> {
    return firstValueFrom(
      this.http.get<MigrationNameCheck>(`${API_BASE_URL}/platform/applications/${appId}/migration-type/name-check`, { params: { name } })
    );
  }

  async saveMigrationType(appId: string, config: MigrationTypeConfig): Promise<MigrationTypeSaveResponse> {
    const response = await firstValueFrom(
      this.http.put<MigrationTypeSaveResponse>(`${API_BASE_URL}/platform/applications/${appId}/migration-type`, {
        ...config,
        userId: this.auth.getUserId()
      })
    );
    await this.refresh();
    this.audit.log('MIGRATION_TYPE_SAVED', 'Application', this.displayNameForAppId(appId), 'SUCCESS', appId);
    return response;
  }
}

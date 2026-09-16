import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuditLogEntry, AuditLogPage } from '../models';
import { AuthService } from '../core/auth/auth.service';
import { API_BASE_URL } from '../core/api-config';

export interface AuditLogSearchParams {
  search?: string;
  result?: 'SUCCESS' | 'FAILURE';
  fromEpochMs?: number;
  toEpochMs?: number;
  page?: number;
  size?: number;
}

// How many of the most recent entries the org-detail "Activity" tab and the per-subscription
// history panel keep in memory. Those two views only ever need a recent window for one org — not
// the full unbounded table — so they share one small cache instead of each hitting the API
// separately. The dedicated Audit log page (AuditLogComponent) never uses this: it always queries
// the real paginated endpoint directly, over the full table.
const RECENT_ACTIVITY_WINDOW = 200;

@Injectable({ providedIn: 'root' })
export class AuditService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private readonly recent = signal<AuditLogEntry[]>([]);

  constructor() {
    this.refreshRecent();
  }

  // Backing signal for the org-detail Activity tab and subscription history panel — both read this
  // and filter client-side by target label, the same shape those views used before this was wired
  // to a real API.
  recentActivity() {
    return this.recent;
  }

  // Fire-and-forget from the caller's perspective (existing call sites don't await this), but the
  // write itself is a real, persisted API call — not a local in-memory push. A failure here must
  // never surface as a failure of the action that triggered it (the underlying change already
  // succeeded against the real backend by the time this is called), so errors are swallowed after
  // logging.
  log(action: string, targetType: string, targetLabel: string, result: 'SUCCESS' | 'FAILURE' = 'SUCCESS', targetId?: string): void {
    const user = this.auth.currentUser();
    const body = {
      actorUserId: this.auth.getUserId(),
      actorEmail: user?.email || 'unknown@kanerika.com',
      actorName: user?.name,
      action,
      targetType,
      targetId,
      targetLabel,
      result
    };
    firstValueFrom(this.http.post(`${API_BASE_URL}/platform/audit-log`, body))
      .then(() => this.refreshRecent())
      .catch((err) => {
        console.error('Failed to record audit log entry', action, targetType, err);
      });
  }

  private async refreshRecent(): Promise<void> {
    try {
      const page = await this.search({ size: RECENT_ACTIVITY_WINDOW });
      this.recent.set(page.items);
    } catch (err) {
      console.error('Failed to load recent audit activity', err);
    }
  }

  async search(params: AuditLogSearchParams): Promise<AuditLogPage> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.result) query.set('result', params.result);
    if (params.fromEpochMs != null) query.set('fromEpochMs', String(params.fromEpochMs));
    if (params.toEpochMs != null) query.set('toEpochMs', String(params.toEpochMs));
    query.set('page', String(params.page ?? 0));
    query.set('size', String(params.size ?? 25));

    return firstValueFrom(this.http.get<AuditLogPage>(`${API_BASE_URL}/platform/audit-log?${query.toString()}`));
  }

  exportUrl(params: Omit<AuditLogSearchParams, 'page' | 'size'>): string {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.result) query.set('result', params.result);
    if (params.fromEpochMs != null) query.set('fromEpochMs', String(params.fromEpochMs));
    if (params.toEpochMs != null) query.set('toEpochMs', String(params.toEpochMs));
    return `${API_BASE_URL}/platform/audit-log/export?${query.toString()}`;
  }
}

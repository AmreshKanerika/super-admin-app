import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { OffboardingPreCheck, OrganizationArchiveSummary } from '../models';
import { OrganizationsService } from './organizations.service';
import { SubscriptionsService } from './subscriptions.service';
import { AuditService } from './audit.service';
import { AuthService } from '../core/auth/auth.service';
import { API_BASE_URL } from '../core/api-config';

@Injectable({ providedIn: 'root' })
export class OffboardingService {
  private http = inject(HttpClient);
  private organizations = inject(OrganizationsService);
  private subscriptions = inject(SubscriptionsService);
  private audit = inject(AuditService);
  private auth = inject(AuthService);

  async preCheck(orgId: string): Promise<OffboardingPreCheck> {
    return firstValueFrom(this.http.get<OffboardingPreCheck>(`${API_BASE_URL}/platform/organizations/${orgId}/offboarding/precheck`));
  }

  // Immediately expires the org's active subscription(s) and marks it decommissioned — no data is
  // deleted. Fully reversible via reactivate().
  async expire(orgId: string, reason: string): Promise<void> {
    const org = this.organizations.byId(orgId);
    const requestedBy = this.auth.getUserId();
    if (!requestedBy) throw new Error('Your session has expired — sign in again before offboarding an organization.');

    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/platform/organizations/${orgId}/offboarding/expire`, { reason, requestedBy })
    );
    this.audit.log('ORG_EXPIRED', 'Organization', `${org?.organizationName ?? orgId} — ${reason}`, 'SUCCESS', orgId);
    await Promise.all([this.organizations.refresh(), this.subscriptions.refresh()]);
  }

  async reactivate(orgId: string): Promise<void> {
    const org = this.organizations.byId(orgId);
    await firstValueFrom(this.http.post(`${API_BASE_URL}/platform/organizations/${orgId}/offboarding/reactivate`, {}));
    this.audit.log('ORG_REACTIVATED', 'Organization', org?.organizationName ?? orgId, 'SUCCESS', orgId);
    await Promise.all([this.organizations.refresh(), this.subscriptions.refresh()]);
  }

  // Explicit, separate, still-destructive action — hard-deletes every record for the organization.
  // Never triggered automatically; only reachable from its own confirm dialog.
  async purgeNow(orgId: string, reason?: string): Promise<void> {
    const org = this.organizations.byId(orgId);
    const requestedBy = this.auth.getUserId();
    if (!requestedBy) throw new Error('Your session has expired — sign in again before purging an organization.');

    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/platform/organizations/${orgId}/offboarding/purge-now`, { reason, requestedBy })
    );
    this.audit.log('ORG_PURGED', 'Organization', org?.organizationName ?? orgId, 'SUCCESS', orgId);
    await Promise.all([this.organizations.refresh(), this.subscriptions.refresh()]);
  }

  async listArchived(): Promise<OrganizationArchiveSummary[]> {
    return firstValueFrom(this.http.get<OrganizationArchiveSummary[]>(`${API_BASE_URL}/platform/organizations/archive`));
  }
}

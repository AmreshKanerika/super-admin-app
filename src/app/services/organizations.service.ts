import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Organization } from '../models';
import { AuditService } from './audit.service';
import { ToastService } from '../core/toast.service';
import { API_BASE_URL } from '../core/api-config';

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  private audit = inject(AuditService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private readonly orgs = signal<Organization[]>([]);

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const orgs = await firstValueFrom(this.http.get<Organization[]>(`${API_BASE_URL}/platform/organizations`));
      this.orgs.set(orgs);
    } catch (err) {
      console.error('Failed to load organizations', err);
      this.toast.show("Couldn't load organizations — check your connection and refresh.", 'critical');
    }
  }

  list() {
    return this.orgs;
  }

  byId(orgId: string): Organization | undefined {
    return this.orgs().find((o) => o.orgId === orgId);
  }

  nameExists(name: string): boolean {
    return this.orgs().some((o) => o.organizationName.trim().toLowerCase() === name.trim().toLowerCase());
  }

  domainPrefixAvailable(prefix: string): boolean {
    const norm = prefix.trim().toLowerCase();
    return !this.orgs().some((o) => o.domainPrefix === norm);
  }

  async update(orgId: string, organizationName: string, isPaidOrg: boolean): Promise<void> {
    const updated = await firstValueFrom(
      this.http.put<Organization>(`${API_BASE_URL}/platform/organizations/${orgId}`, { organizationName, isPaidOrg })
    );
    this.orgs.update((list) => list.map((o) => (o.orgId === orgId ? updated : o)));
    this.audit.log('ORG_UPDATED', 'Organization', updated.organizationName, 'SUCCESS', orgId);
  }
}

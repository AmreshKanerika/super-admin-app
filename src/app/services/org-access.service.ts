import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../core/api-config';
import { AuditService } from './audit.service';
import {
  CreateOrgUserResult,
  OrgRole,
  OrgRoleAppOption,
  OrgRoleUpsert,
  OrgUser,
  OrgUsersResponse
} from '../models';

export interface CreateOrgUserRequest {
  username: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
  sendCredentialsEmail: boolean;
}

/**
 * An organization's users and roles, managed from the console. The backend runs these through the
 * same role/grant services the product's own admin screens use, with the super admin standing in
 * as the organization's admin.
 */
@Injectable({ providedIn: 'root' })
export class OrgAccessService {
  private http = inject(HttpClient);
  private audit = inject(AuditService);

  private base(orgId: string): string {
    return `${API_BASE_URL}/platform/organizations/${orgId}`;
  }

  listUsers(orgId: string): Promise<OrgUsersResponse> {
    return firstValueFrom(this.http.get<OrgUsersResponse>(`${this.base(orgId)}/users`));
  }

  async createUser(orgId: string, orgLabel: string, request: CreateOrgUserRequest): Promise<CreateOrgUserResult> {
    const result = await firstValueFrom(this.http.post<CreateOrgUserResult>(`${this.base(orgId)}/users`, request));
    this.audit.log('ORG_USER_ADDED', 'Organization', `${request.username} → ${orgLabel}`, 'SUCCESS', orgId);
    return result;
  }

  async updateUser(
    orgId: string,
    orgLabel: string,
    user: OrgUser,
    changes: { firstName: string; lastName: string; roleIds: string[] }
  ): Promise<OrgUser> {
    const updated = await firstValueFrom(this.http.put<OrgUser>(`${this.base(orgId)}/users/${user.userId}`, changes));
    this.audit.log('ORG_USER_UPDATED', 'Organization', `${user.username} in ${orgLabel}`, 'SUCCESS', orgId);
    return updated;
  }

  async setUserRoles(orgId: string, orgLabel: string, user: OrgUser, roleIds: string[]): Promise<OrgUser> {
    const updated = await firstValueFrom(this.http.put<OrgUser>(`${this.base(orgId)}/users/${user.userId}/roles`, { roleIds }));
    this.audit.log('ORG_USER_ROLES_CHANGED', 'Organization', `${user.username} in ${orgLabel}`, 'SUCCESS', orgId);
    return updated;
  }

  async removeUser(orgId: string, orgLabel: string, user: OrgUser): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base(orgId)}/users/${user.userId}`));
    this.audit.log('ORG_USER_REMOVED', 'Organization', `${user.username} from ${orgLabel}`, 'SUCCESS', orgId);
  }

  sendCredentials(orgId: string, userId: string, temporaryPassword: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base(orgId)}/users/${userId}/send-credentials`, { temporaryPassword }));
  }

  async cancelInvite(orgId: string, orgLabel: string, inviteId: number, username: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base(orgId)}/invites/${inviteId}`));
    this.audit.log('ORG_INVITE_CANCELLED', 'Organization', `${username} in ${orgLabel}`, 'SUCCESS', orgId);
  }

  async listRoles(orgId: string): Promise<OrgRole[]> {
    const response = await firstValueFrom(this.http.get<{ roles: OrgRole[] }>(`${this.base(orgId)}/roles`));
    return response?.roles ?? [];
  }

  async listRoleApps(orgId: string): Promise<OrgRoleAppOption[]> {
    const response = await firstValueFrom(this.http.get<{ apps: OrgRoleAppOption[] }>(`${this.base(orgId)}/role-apps`));
    return response?.apps ?? [];
  }

  async createRole(orgId: string, orgLabel: string, role: OrgRoleUpsert): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base(orgId)}/roles`, role));
    this.audit.log('ORG_ROLE_CREATED', 'Organization', `${role.roleName} in ${orgLabel}`, 'SUCCESS', orgId);
  }

  async updateRole(orgId: string, orgLabel: string, roleId: string, role: OrgRoleUpsert): Promise<void> {
    await firstValueFrom(this.http.put(`${this.base(orgId)}/roles/${roleId}`, role));
    this.audit.log('ORG_ROLE_UPDATED', 'Organization', `${role.roleName} in ${orgLabel}`, 'SUCCESS', orgId);
  }

  async deleteRole(orgId: string, orgLabel: string, role: OrgRole): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base(orgId)}/roles/${role.roleId}`));
    this.audit.log('ORG_ROLE_DELETED', 'Organization', `${role.roleName} in ${orgLabel}`, 'SUCCESS', orgId);
  }
}

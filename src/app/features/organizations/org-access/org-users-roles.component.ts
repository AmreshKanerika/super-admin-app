import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalShellComponent } from '../../../core/ui/modal-shell.component';
import { StatusPillComponent } from '../../../core/ui/status-pill.component';
import { OrgAccessService } from '../../../services/org-access.service';
import { ApplicationsService } from '../../../services/applications.service';
import { PlansService } from '../../../services/plans.service';
import { ToastService } from '../../../core/toast.service';
import { ConfirmService } from '../../../core/confirm.service';
import { Tone } from '../../../core/status.util';
import { CreateOrgUserResult, OrgPendingInvite, OrgRole, OrgUser, OrgUserRoleRef } from '../../../models';
import { OrgRoleEditorComponent, messageOf } from './org-role-editor.component';

type View = 'users' | 'roles';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * An organization's users and roles (new SaaS model): users hold subscription roles - Admin /
 * Developer from onboarding, or custom roles - and each role carries app scopes.
 *
 * Super admins: add, edit (name + roles) and remove users; create, edit and delete custom roles.
 * Admin and Developer can be assigned but not changed. The org's original Admin (first Admin, at
 * onboarding) can't be removed or lose Admin. Sales see everything read-only.
 */
@Component({
  selector: 'app-org-users-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalShellComponent, StatusPillComponent, OrgRoleEditorComponent],
  templateUrl: './org-users-roles.component.html',
  styleUrls: ['./org-users-roles.component.scss', './org-user-dialogs.scss']
})
export class OrgUsersRolesComponent implements OnInit {
  @Input({ required: true }) orgId!: string;
  @Input({ required: true }) orgLabel!: string;
  @Input() canManage = false;

  private access = inject(OrgAccessService);
  private applications = inject(ApplicationsService);
  private plans = inject(PlansService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly view = signal<View>('users');
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly users = signal<OrgUser[]>([]);
  readonly invites = signal<OrgPendingInvite[]>([]);
  readonly roles = signal<OrgRole[]>([]);
  readonly search = signal('');
  readonly busy = signal(false);

  // Add user
  readonly addOpen = signal(false);
  readonly newEmail = signal('');
  readonly newFirst = signal('');
  readonly newLast = signal('');
  readonly newRoles = signal<ReadonlySet<string>>(new Set());
  readonly newSendEmail = signal(true);
  /** Validation messages appear only once someone has tried to submit. */
  readonly addTried = signal(false);
  readonly editTried = signal(false);
  readonly created = signal<CreateOrgUserResult | null>(null);

  // Edit user
  readonly editingUser = signal<OrgUser | null>(null);
  readonly editFirst = signal('');
  readonly editLast = signal('');
  readonly editRoles = signal<ReadonlySet<string>>(new Set());
  /** Set once a role is (un)ticked, so "keep at least one role" shows as soon as it applies. */
  readonly editRolesTouched = signal(false);

  /** Role names being added / removed by the pending edit, for the changes strip. */
  readonly roleChanges = computed(() => {
    const user = this.editingUser();
    if (!user) return { added: [] as string[], removed: [] as string[] };
    const before = new Set(user.roles.map((r) => r.roleId));
    const after = this.editRoles();
    const byId = new Map(this.roles().map((r) => [r.roleId, r]));
    const label = (id: string) => {
      const role = byId.get(id) ?? user.roles.find((r) => r.roleId === id);
      return role ? this.roleLabel(role) : id;
    };
    return {
      added: [...after].filter((id) => !before.has(id)).map(label),
      removed: [...before].filter((id) => !after.has(id)).map(label)
    };
  });

  // Role editor
  readonly roleEditorOpen = signal(false);
  readonly editingRole = signal<OrgRole | null>(null);
  /** Which user form opened the role editor, so the new role can be selected there once saved. */
  readonly roleEditorFor = signal<'new' | 'edit' | null>(null);

  readonly visibleUsers = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.users().filter(
      (u) =>
        !query ||
        u.username.toLowerCase().includes(query) ||
        this.fullName(u).toLowerCase().includes(query) ||
        u.roles.some((r) => r.roleName.toLowerCase().includes(query))
    );
  });

  readonly visibleRoles = computed(() => {
    const query = this.search().trim().toLowerCase();
    return [...this.roles()]
      .sort((a, b) => typeRank(a.roleType) - typeRank(b.roleType) || a.roleName.localeCompare(b.roleName))
      .filter((r) => !query || r.roleName.toLowerCase().includes(query) || (r.roleDescription ?? '').toLowerCase().includes(query));
  });

  /** Roles for the pickers, defaults first. */
  readonly pickableRoles = computed(() =>
    [...this.roles()].sort((a, b) => typeRank(a.roleType) - typeRank(b.roleType) || a.roleName.localeCompare(b.roleName))
  );

  readonly holders = computed(() => {
    const counts = new Map<string, number>();
    for (const user of this.users()) for (const role of user.roles) counts.set(role.roleId, (counts.get(role.roleId) ?? 0) + 1);
    return counts;
  });

  readonly adminRoleIds = computed(() => new Set(this.roles().filter((r) => r.roleType === 'ADMIN').map((r) => r.roleId)));
  readonly takenRoleNames = computed(() => this.roles().map((r) => r.roleName));

  readonly newUserValid = computed(
    () => EMAIL_PATTERN.test(this.newEmail().trim()) && !!this.newFirst().trim() && !!this.newLast().trim() && this.newRoles().size > 0
  );

  readonly editValid = computed(() => !!this.editFirst().trim() && !!this.editLast().trim() && this.editRoles().size > 0);

  readonly editChanged = computed(() => {
    const user = this.editingUser();
    if (!user) return false;
    const current = new Set(user.roles.map((r) => r.roleId));
    const next = this.editRoles();
    const rolesChanged = current.size !== next.size || [...next].some((id) => !current.has(id));
    return rolesChanged || this.editFirst().trim() !== (user.firstName ?? '') || this.editLast().trim() !== (user.lastName ?? '');
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [users, roles] = await Promise.all([this.access.listUsers(this.orgId), this.access.listRoles(this.orgId)]);
      this.users.set(users.users ?? []);
      this.invites.set(users.pendingInvites ?? []);
      this.roles.set(roles);
    } catch (error: unknown) {
      this.loadError.set(messageOf(error, "Couldn't load this organization's users and roles."));
    } finally {
      this.loading.set(false);
    }
  }

  setView(view: View): void {
    this.view.set(view);
    this.search.set('');
  }

  // --- users ---------------------------------------------------------------

  openAdd(): void {
    this.newEmail.set('');
    this.newFirst.set('');
    this.newLast.set('');
    this.newSendEmail.set(true);
    this.addTried.set(false);
    // Developer is the everyday default; an Admin grant should be a deliberate choice.
    const developer = this.roles().find((r) => r.roleType === 'DEVELOPER');
    this.newRoles.set(new Set(developer ? [developer.roleId] : []));
    this.addOpen.set(true);
  }

  closeAdd(): void {
    // Escape reaches every open dialog; while the role editor is on top it only closes that one.
    if (this.roleEditorOpen()) return;
    if (!this.busy()) this.addOpen.set(false);
  }

  toggleRole(set: 'new' | 'edit', role: OrgRole): void {
    if (set === 'edit' && this.isLockedForEdit(role)) return;
    if (set === 'edit') this.editRolesTouched.set(true);
    const target = set === 'new' ? this.newRoles : this.editRoles;
    target.update((current) => {
      const next = new Set(current);
      if (next.has(role.roleId)) next.delete(role.roleId);
      else next.add(role.roleId);
      return next;
    });
  }

  /** The original admin's Admin role can't be unticked. */
  isLockedForEdit(role: OrgRole): boolean {
    return !!this.editingUser()?.primaryAdmin && role.roleType === 'ADMIN';
  }

  async addUser(): Promise<void> {
    if (!this.newUserValid() || this.busy()) return;
    this.busy.set(true);
    try {
      const result = await this.access.createUser(this.orgId, this.orgLabel, {
        username: this.newEmail().trim(),
        firstName: this.newFirst().trim(),
        lastName: this.newLast().trim(),
        roleIds: [...this.newRoles()],
        sendCredentialsEmail: this.newSendEmail()
      });
      this.addOpen.set(false);
      await this.load();
      if (result.temporaryPassword) this.created.set(result);
      else this.toast.show(result.message || `${result.user.username} added`, 'success');
      if (result.emailError) this.toast.show(result.emailError, 'critical');
    } catch (error: unknown) {
      this.toast.show(messageOf(error, 'Could not add the user'), 'critical');
    } finally {
      this.busy.set(false);
    }
  }

  async copyCredentials(): Promise<void> {
    const c = this.created();
    if (!c?.temporaryPassword) return;
    const lines = [
      `Organization: ${this.orgLabel}`,
      ...(c.signInUrl ? [`Sign in at: ${c.signInUrl}`] : []),
      `Username: ${c.user.username}`,
      `Temporary password: ${c.temporaryPassword}`,
      '',
      'You will be asked to choose your own password the first time you sign in.'
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      this.toast.show('Credentials copied to clipboard', 'success');
    } catch {
      this.toast.show('Could not copy — select and copy manually', 'critical');
    }
  }

  async emailCredentials(): Promise<void> {
    const c = this.created();
    if (!c?.temporaryPassword || this.busy()) return;
    this.busy.set(true);
    try {
      await this.access.sendCredentials(this.orgId, c.user.userId, c.temporaryPassword);
      this.created.set({ ...c, emailSent: true, emailError: null });
      this.toast.show(`Sign-in details emailed to ${c.user.username}`, 'success');
    } catch (error: unknown) {
      this.toast.show(messageOf(error, 'Could not send the email'), 'critical');
    } finally {
      this.busy.set(false);
    }
  }

  closeCreated(): void {
    this.created.set(null);
  }

  openEdit(user: OrgUser): void {
    this.editFirst.set(user.firstName ?? '');
    this.editLast.set(user.lastName ?? '');
    this.editRoles.set(new Set(user.roles.map((r) => r.roleId)));
    this.editTried.set(false);
    this.editRolesTouched.set(false);
    this.editingUser.set(user);
  }

  closeEdit(): void {
    if (this.roleEditorOpen()) return;
    if (!this.busy()) this.editingUser.set(null);
  }

  async saveEdit(): Promise<void> {
    const user = this.editingUser();
    if (!user || !this.editValid() || !this.editChanged() || this.busy()) return;
    this.busy.set(true);
    try {
      await this.access.updateUser(this.orgId, this.orgLabel, user, {
        firstName: this.editFirst().trim(),
        lastName: this.editLast().trim(),
        roleIds: [...this.editRoles()]
      });
      this.editingUser.set(null);
      await this.load();
      this.toast.show(`${user.username} updated`, 'success');
    } catch (error: unknown) {
      this.toast.show(messageOf(error, 'Could not update the user'), 'critical');
    } finally {
      this.busy.set(false);
    }
  }

  removeLockReason(user: OrgUser): string | null {
    return user.primaryAdmin ? "The organization's original Admin (created at onboarding) can't be removed." : null;
  }

  async removeUser(user: OrgUser): Promise<void> {
    if (this.removeLockReason(user)) return;
    const decision = await this.confirm.open({
      title: `Remove ${this.fullName(user) || user.username} from ${this.orgLabel}?`,
      message: user.homeOrganization
        ? 'Their roles in this organization are removed and their login for it is deleted. If they belong to other organizations, their account moves to one of those; otherwise it is deleted.'
        : 'Their roles and membership in this organization are removed. Their access to their other organizations is kept.',
      confirmLabel: 'Remove user',
      danger: true
    });
    if (!decision.confirmed) return;
    this.busy.set(true);
    try {
      await this.access.removeUser(this.orgId, this.orgLabel, user);
      await this.load();
      this.toast.show(`${user.username} removed from ${this.orgLabel}`, 'success');
    } catch (error: unknown) {
      this.toast.show(messageOf(error, 'Could not remove the user'), 'critical');
    } finally {
      this.busy.set(false);
    }
  }

  async cancelInvite(invite: OrgPendingInvite): Promise<void> {
    const decision = await this.confirm.open({
      title: `Cancel the invitation for ${invite.username}?`,
      message: 'The invitation link stops working and its reserved seat is released.',
      confirmLabel: 'Cancel invitation',
      danger: true
    });
    if (!decision.confirmed) return;
    try {
      await this.access.cancelInvite(this.orgId, this.orgLabel, invite.inviteId, invite.username);
      await this.load();
      this.toast.show(`Invitation for ${invite.username} cancelled`, 'success');
    } catch (error: unknown) {
      this.toast.show(messageOf(error, 'Could not cancel the invitation'), 'critical');
    }
  }

  // --- roles ---------------------------------------------------------------

  openRoleEditor(role: OrgRole | null): void {
    this.editingRole.set(role);
    this.roleEditorOpen.set(true);
  }

  /** "Create a new role" inside the Add / Edit user form: the form stays open underneath. */
  createRoleFrom(mode: 'new' | 'edit'): void {
    this.roleEditorFor.set(mode);
    this.openRoleEditor(null);
  }

  closeRoleEditor(): void {
    this.roleEditorOpen.set(false);
    this.roleEditorFor.set(null);
  }

  async onRoleSaved(roleName?: string): Promise<void> {
    const openedFrom = this.roleEditorFor();
    this.closeRoleEditor();
    await this.load();
    if (!openedFrom || !roleName) return;
    const key = roleName.trim().toLowerCase();
    const created = this.roles().find((r) => r.roleType === 'CUSTOM' && r.roleName.trim().toLowerCase() === key);
    if (!created) return;
    const target = openedFrom === 'new' ? this.newRoles : this.editRoles;
    target.set(new Set([...target(), created.roleId]));
    if (openedFrom === 'edit') this.editRolesTouched.set(true);
  }

  async deleteRole(role: OrgRole): Promise<void> {
    const holders = this.holders().get(role.roleId) ?? 0;
    const decision = await this.confirm.open({
      title: `Delete the role '${role.roleName}'?`,
      message: holders
        ? `${holders} user${holders === 1 ? '' : 's'} hold${holders === 1 ? 's' : ''} this role and will lose its permissions. Users are not removed from the organization.`
        : 'No user holds this role.',
      confirmLabel: 'Delete role',
      danger: true,
      requireTypedText: holders ? role.roleName : undefined
    });
    if (!decision.confirmed) return;
    try {
      await this.access.deleteRole(this.orgId, this.orgLabel, role);
      await this.load();
      this.toast.show(`Role '${role.roleName}' deleted`, 'success');
    } catch (error: unknown) {
      this.toast.show(messageOf(error, 'Could not delete the role'), 'critical');
    }
  }

  // --- display helpers -----------------------------------------------------

  emailValid(value: string): boolean {
    return EMAIL_PATTERN.test(value.trim());
  }

  fullName(user: OrgUser): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }

  initials(user: OrgUser): string {
    const name = this.fullName(user) || user.username;
    return name
      .split(/[\s.@_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  roleTone(role: OrgUserRoleRef | OrgRole): Tone {
    return role.roleType === 'ADMIN' ? 'accent' : role.roleType === 'DEVELOPER' ? 'neutral' : 'success';
  }

  isDefault(role: OrgRole | OrgUserRoleRef): boolean {
    return role.roleType === 'ADMIN' || role.roleType === 'DEVELOPER';
  }

  roleLabel(role: OrgRole | OrgUserRoleRef): string {
    // Default roles are stored upper-case (ADMIN); show them the way people say them.
    if (role.roleType === 'ADMIN') return 'Admin';
    if (role.roleType === 'DEVELOPER') return 'Developer';
    return role.roleName;
  }

  /**
   * Admin and Developer exist once per subscription, so an organization on several plans has
   * several of each. The plan name is what tells them apart; custom roles have none.
   */
  rolePlan(role: OrgRole | OrgUserRoleRef): string | null {
    if (!this.isDefault(role)) return null;
    const full = 'planId' in role ? role : this.roles().find((r) => r.roleId === role.roleId);
    return full?.planId ? this.plans.displayNameForPlanId(full.planId) : null;
  }

  /** Role label with its plan when the organization has more than one role of that name. */
  rolePillLabel(role: OrgRole | OrgUserRoleRef): string {
    const label = this.roleLabel(role);
    const plan = this.rolePlan(role);
    const sameName = this.roles().filter((r) => this.roleLabel(r) === label).length;
    return plan && sameName > 1 ? `${label} · ${plan}` : label;
  }

  roleDescription(role: OrgRole): string {
    if (role.roleDescription) return role.roleDescription;
    if (role.roleType === 'ADMIN') return "Full access to the organization's apps, and manages its users and roles.";
    if (role.roleType === 'DEVELOPER') return "Works in the organization's apps.";
    return this.appSummary(role);
  }

  createdRoleNames(result: CreateOrgUserResult): string {
    return result.user.roles.map((r) => this.roleLabel(r)).join(', ') || '—';
  }

  appNames(role: OrgRole): string[] {
    return (role.apps ?? []).map((a) => this.applications.displayNameForAppId(a.appId) || a.appName);
  }

  appSummary(role: OrgRole): string {
    const names = this.appNames(role);
    if (!names.length) return 'No apps';
    const shown = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${shown} +${names.length - 3} more` : shown;
  }

  appCount(role: OrgRole): number {
    return (role.apps ?? []).length;
  }

  scopeCount(role: OrgRole): number {
    return (role.apps ?? []).reduce((n, a) => n + (a.scopes?.length ?? 0), 0);
  }

  formatDate(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }

  trackByUser = (_: number, u: OrgUser) => u.userId;
  trackByRole = (_: number, r: OrgRole) => r.roleId;
  trackByInvite = (_: number, i: OrgPendingInvite) => i.inviteId;
}

function typeRank(type: string | null): number {
  return type === 'ADMIN' ? 0 : type === 'DEVELOPER' ? 1 : 2;
}

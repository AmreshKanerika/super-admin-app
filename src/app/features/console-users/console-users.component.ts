import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { ModalShellComponent } from '../../core/ui/modal-shell.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { ConsoleUsersService } from '../../services/console-users.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { ConsoleUser, ConsoleUserRole } from '../../models';
import { HttpErrorResponse } from '@angular/common/http';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RoleFilter = 'ALL' | ConsoleUserRole;

// One place for the human wording of each role, so badges, tooltips and the role picker agree.
const ROLE_INFO: Record<ConsoleUserRole, { label: string; icon: string; summary: string }> = {
  SUPER_ADMIN: {
    label: 'Super admin',
    icon: 'ti-shield-lock',
    summary: 'Full technical access, including plans, limits and provisioning.'
  },
  SALES: {
    label: 'Sales',
    icon: 'ti-briefcase',
    summary: 'Organizations, subscriptions, notifications and Customer Insights.'
  }
};

// Both backend error shapes (the controller's Message and GlobalExceptionHandler's ErrorResponse)
// carry a `message`; status 0 means the request never reached the server at all.
function errorMessage(err: unknown, fallback: string): string {
  const http = err as HttpErrorResponse;
  if (http?.status === 0) return 'Could not reach the server. Check your connection and try again.';
  return http?.error?.message || fallback;
}

@Component({
  selector: 'app-console-users',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusPillComponent, ModalShellComponent, EmptyStateComponent],
  templateUrl: './console-users.component.html',
  styleUrl: './console-users.component.scss'
})
export class ConsoleUsersComponent implements OnDestroy {
  users = inject(ConsoleUsersService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  readonly roles = ROLE_INFO;
  readonly roleChoices: ConsoleUserRole[] = ['SALES', 'SUPER_ADMIN'];
  readonly roleOptions: { value: RoleFilter; label: string }[] = [
    { value: 'ALL', label: 'All roles' },
    { value: 'SUPER_ADMIN', label: 'Super admin' },
    { value: 'SALES', label: 'Sales' }
  ];

  list = this.users.list();
  sorted = computed(() => [...this.list()].sort((a, b) => a.email.localeCompare(b.email)));

  // --- filters ------------------------------------------------------------

  search = signal('');
  roleFilter = signal<RoleFilter>('ALL');
  pendingOnly = signal(false);

  counts = computed(() => {
    const all = this.list();
    return {
      total: all.length,
      superAdmins: all.filter(u => u.role === 'SUPER_ADMIN').length,
      sales: all.filter(u => u.role === 'SALES').length,
      pending: all.filter(u => !u.keycloakSubjectId).length
    };
  });

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const pending = this.pendingOnly();
    return this.sorted().filter(u =>
      (role === 'ALL' || u.role === role)
      && (!pending || !u.keycloakSubjectId)
      && (!q || u.email.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q)));
  });

  hasFilters = computed(() => !!this.search().trim() || this.roleFilter() !== 'ALL' || this.pendingOnly());

  // Tiles toggle: clicking the active one again clears it.
  toggleRole(role: ConsoleUserRole): void {
    this.roleFilter.set(this.roleFilter() === role ? 'ALL' : role);
  }

  togglePending(): void {
    this.pendingOnly.set(!this.pendingOnly());
  }

  clearFilters(): void {
    this.search.set('');
    this.roleFilter.set('ALL');
    this.pendingOnly.set(false);
  }

  // --- row helpers --------------------------------------------------------

  private myEmail = computed(() => (this.auth.currentUser()?.email || '').toLowerCase());

  isMe(user: ConsoleUser): boolean {
    return !!this.myEmail() && user.email.toLowerCase() === this.myEmail();
  }

  initials(user: ConsoleUser): string {
    const parts = (user.displayName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length) return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    return (user.email[0] || '?').toUpperCase();
  }

  // --- edit / remove ------------------------------------------------------

  addOpen = signal(false);
  submitting = signal(false);
  email = '';
  firstName = '';
  lastName = '';
  role: ConsoleUserRole = 'SALES';
  editing = signal<ConsoleUser | null>(null);
  removing = signal<ConsoleUser | null>(null);
  editEmail = '';
  editName = '';

  openEdit(user: ConsoleUser): void {
    if (user.role !== 'SALES') return;
    this.editEmail = user.email;
    this.editName = user.displayName || '';
    this.editing.set(user);
  }

  closeEdit(): void {
    if (!this.submitting()) this.editing.set(null);
  }

  editEmailValid(): boolean {
    return EMAIL_PATTERN.test(this.editEmail.trim());
  }

  editChanged(): boolean {
    const user = this.editing();
    if (!user) return false;
    return this.editEmail.trim().toLowerCase() !== user.email.toLowerCase()
      || this.editName.trim() !== (user.displayName || '');
  }

  canSaveEdit(): boolean {
    return !this.submitting() && !!this.editName.trim() && this.editEmailValid() && this.editChanged();
  }

  async saveEdit(): Promise<void> {
    const user = this.editing();
    if (!user || !this.canSaveEdit()) return;
    this.submitting.set(true);
    try {
      await this.users.update(user.id, { email: this.editEmail.trim(), displayName: this.editName.trim() });
      this.editing.set(null);
      this.toast.show('Sales user updated', 'success');
    } catch (err: unknown) {
      this.toast.show(errorMessage(err, 'Could not update user'), 'critical');
    } finally { this.submitting.set(false); }
  }

  openRemove(user: ConsoleUser): void {
    if (user.role === 'SALES') this.removing.set(user);
  }

  closeRemove(): void {
    if (!this.submitting()) this.removing.set(null);
  }

  async removeUser(): Promise<void> {
    const user = this.removing();
    if (!user || user.role !== 'SALES' || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.users.remove(user.id);
      this.removing.set(null);
      this.toast.show(`Console access removed for ${user.email}`, 'success');
    } catch (err: unknown) {
      if ((err as HttpErrorResponse)?.status === 404) {
        // Already gone (removed in another tab) — resync rather than leave a ghost row behind.
        this.removing.set(null);
        await this.users.refresh();
      }
      this.toast.show(errorMessage(err, 'Could not remove user'), 'critical');
    } finally { this.submitting.set(false); }
  }

  // --- add ----------------------------------------------------------------

  // Set right after a successful create() that minted a brand-new login — shown once, exactly like
  // the onboarding wizard's one-time credential reveal, then discarded.
  created = signal<ConsoleUser | null>(null);

  // Errors stay quiet until a field is touched or submit is tried, so the dialog doesn't open in red.
  addAttempted = false;

  openAdd(): void {
    this.email = '';
    this.firstName = '';
    this.lastName = '';
    this.role = 'SALES';
    this.addAttempted = false;
    this.addOpen.set(true);
  }

  closeAdd(): void {
    if (!this.submitting()) this.addOpen.set(false);
  }

  addEmailValid(): boolean {
    return /.+@.+\..+/.test(this.email.trim());
  }

  canSubmit(): boolean {
    return this.addEmailValid() && !!this.firstName.trim() && !!this.lastName.trim();
  }

  async submit(): Promise<void> {
    this.addAttempted = true;
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const created = await this.users.create({
        email: this.email.trim(),
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        role: this.role
      });
      this.addOpen.set(false);
      if (created.temporaryPassword) {
        this.created.set(created);
      } else {
        this.toast.show(`${created.email} already had a login — granted ${this.roleLabel(this.role)} access`, 'success');
      }
    } catch (err: unknown) {
      this.toast.show(errorMessage(err, 'Failed to add console user'), 'critical');
    } finally {
      this.submitting.set(false);
    }
  }

  roleLabel(role: ConsoleUserRole): string {
    return role === 'SUPER_ADMIN' ? 'super admin' : 'sales';
  }

  // --- one-time credential reveal -----------------------------------------

  // Which copy button last succeeded, for a brief "Copied" state on that button.
  copied = signal<'password' | 'all' | null>(null);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  closeCreated(): void {
    this.created.set(null);
    this.copied.set(null);
  }

  private markCopied(which: 'password' | 'all'): void {
    this.copied.set(which);
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.copied.set(null), 2000);
  }

  async copyPassword(): Promise<void> {
    const password = this.created()?.temporaryPassword;
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      this.markCopied('password');
      this.toast.show('Temporary password copied', 'success');
    } catch {
      this.toast.show('Could not copy — select and copy manually', 'critical');
    }
  }

  async copyCredentials(): Promise<void> {
    const c = this.created();
    if (!c) return;
    const text = `Console: FLIP Platform Console\nEmail: ${c.email}\nTemporary password: ${c.temporaryPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      this.markCopied('all');
      this.toast.show('Credentials copied to clipboard', 'success');
    } catch {
      this.toast.show('Could not copy — select and copy manually', 'critical');
    }
  }

  ngOnDestroy(): void {
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
  }
}

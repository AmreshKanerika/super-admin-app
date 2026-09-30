import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { ModalShellComponent } from '../../core/ui/modal-shell.component';
import { ConsoleUsersService } from '../../services/console-users.service';
import { ToastService } from '../../core/toast.service';
import { ConsoleUser, ConsoleUserRole } from '../../models';
import { Tone } from '../../core/status.util';
import { HttpErrorResponse } from '@angular/common/http';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusPillComponent, ModalShellComponent],
  templateUrl: './console-users.component.html',
  styleUrl: './console-users.component.scss'
})
export class ConsoleUsersComponent {
  users = inject(ConsoleUsersService);
  private toast = inject(ToastService);

  list = this.users.list();
  sorted = computed(() => [...this.list()].sort((a, b) => a.email.localeCompare(b.email)));

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

  // Set right after a successful create() that minted a brand-new login — shown once, exactly like
  // the onboarding wizard's one-time credential reveal, then discarded.
  created = signal<ConsoleUser | null>(null);

  roleTone(role: ConsoleUserRole): Tone {
    return role === 'SUPER_ADMIN' ? 'accent' : 'neutral';
  }

  openAdd(): void {
    this.email = '';
    this.firstName = '';
    this.lastName = '';
    this.role = 'SALES';
    this.addOpen.set(true);
  }

  closeAdd(): void {
    this.addOpen.set(false);
  }

  canSubmit(): boolean {
    return /.+@.+\..+/.test(this.email.trim()) && !!this.firstName.trim() && !!this.lastName.trim();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
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

  closeCreated(): void {
    this.created.set(null);
  }

  async copyCredentials(): Promise<void> {
    const c = this.created();
    if (!c) return;
    const text = `Console: FLIP Platform Console\nEmail: ${c.email}\nTemporary password: ${c.temporaryPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show('Credentials copied to clipboard', 'success');
    } catch {
      this.toast.show('Could not copy — select and copy manually', 'critical');
    }
  }
}

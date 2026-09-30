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

  async saveEdit(): Promise<void> {
    const user = this.editing();
    if (!user || this.submitting() || !this.editName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.editEmail.trim())) return;
    this.submitting.set(true);
    try {
      await this.users.update(user.id, { email: this.editEmail.trim(), displayName: this.editName.trim() });
      this.editing.set(null);
      this.toast.show('Sales user updated', 'success');
    } catch (err: unknown) {
      this.toast.show((err as { error?: { message?: string } })?.error?.message || 'Could not update user', 'critical');
    } finally { this.submitting.set(false); }
  }

  async removeUser(): Promise<void> {
    const user = this.removing();
    if (!user || user.role !== 'SALES' || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.users.remove(user.id);
      this.removing.set(null);
      this.toast.show('Console access removed', 'success');
    } catch (err: unknown) {
      this.toast.show((err as { error?: { message?: string } })?.error?.message || 'Could not remove user', 'critical');
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
      const message = (err as { error?: { message?: string } })?.error?.message;
      this.toast.show(message || 'Failed to add console user', 'critical');
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

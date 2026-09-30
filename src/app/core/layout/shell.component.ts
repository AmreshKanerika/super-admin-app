import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastHostComponent } from '../ui/toast-host.component';
import { ConfirmHostComponent } from '../ui/confirm-host.component';
import { AuthService } from '../auth/auth.service';
import { ENV_NAME } from '../api-config';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  technicalOnly?: boolean;
  section?: string;
}

const COLLAPSE_KEY = 'sa-sidebar-collapsed';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink, RouterLinkActive, RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  auth = inject(AuthService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Shown beside the product name everywhere except production. */
  readonly envName = ENV_NAME;
  roleLabel = computed(() => this.auth.role() === 'SUPER_ADMIN' ? 'Super Admin' : this.auth.role() === 'SALES' ? 'Sales' : 'Console user');

  // technicalOnly items are hidden from the SALES role entirely — the routes behind them are also
  // guarded server-side-of-the-router (roleGuard in app.routes.ts), so hiding the link here is about
  // not showing a destination that isn't a fit for that role, not the actual access boundary.
  private allNavItems: NavItem[] = [
    { label: 'Overview', path: '/overview', icon: 'ti-layout-dashboard', section: 'Workspace' },
    { label: 'Organizations', path: '/organizations', icon: 'ti-building' },
    { label: 'Applications', path: '/applications', icon: 'ti-apps', technicalOnly: true },
    { label: 'Subscription Plans', path: '/plans', icon: 'ti-clipboard-list', technicalOnly: true },
    { label: 'Notifications', path: '/notifications', icon: 'ti-bell', section: 'Operations' },
    { label: 'Offboarding', path: '/offboarding', icon: 'ti-door-exit', technicalOnly: true },
    { label: 'Audit log', path: '/audit-log', icon: 'ti-history', technicalOnly: true },
    { label: 'Console users', path: '/console-users', icon: 'ti-users-group', technicalOnly: true },
    { label: 'Help', path: '/help', icon: 'ti-help-circle', section: 'Support' }
  ];

  navItems = computed(() => (this.auth.role() === 'SUPER_ADMIN' ? this.allNavItems : this.allNavItems.filter((item) => !item.technicalOnly)));

  collapsed = signal(this.resolveInitialCollapsed());
  profileOpen = signal(false);

  // On first visit (no stored preference yet) default to collapsed on narrow viewports, where the
  // sidebar becomes an off-canvas overlay — showing it open by default would cover the whole screen.
  private resolveInitialCollapsed(): boolean {
    if (window.innerWidth <= 640) return true;
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored !== null) return stored === '1';
    return window.innerWidth < 640;
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    if (next) this.profileOpen.set(false);
  }

  toggleProfile(): void {
    this.profileOpen.set(!this.profileOpen());
  }

  // The profile menu closes on any click outside it (including the page behind it) and on Escape.
  @HostListener('document:click', ['$event'])
  closeProfileOnOutsideClick(event: MouseEvent): void {
    if (!this.profileOpen()) return;
    const target = event.target as Node | null;
    const block = this.host.nativeElement.querySelector('.profile-block');
    if (target && block?.contains(target)) return;
    this.profileOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closeProfileOnEscape(): void {
    this.profileOpen.set(false);
  }

  closeOnMobileNav(): void {
    if (window.innerWidth <= 640 && !this.collapsed()) {
      this.collapsed.set(true);
      localStorage.setItem(COLLAPSE_KEY, '1');
    }
  }

  private wasMobile = window.innerWidth <= 640;
  @HostListener('window:resize')
  onResize(): void {
    const mobile = window.innerWidth <= 640;
    if (mobile && !this.wasMobile) { this.collapsed.set(true); this.profileOpen.set(false); }
    this.wasMobile = mobile;
  }

  async signOut(): Promise<void> {
    // AuthService.logout() clears the session and redirects to /login itself, so this covers
    // both an explicit sign-out click and an automatic 24h-timeout / refresh-failure logout.
    await this.auth.logout();
  }
}

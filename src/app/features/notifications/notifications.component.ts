import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { CountdownComponent } from '../../core/ui/countdown.component';
import { ToggleSwitchComponent } from '../../core/ui/toggle-switch.component';
import { OrganizationsService } from '../../services/organizations.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { NotificationsService } from '../../services/notifications.service';
import { ToastService } from '../../core/toast.service';
import { daysUntil, formatDateTime } from '../../core/status.util';
import { NotificationOffset } from '../../models';

type Tab = 'expiring' | 'history' | 'settings';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusPillComponent, CountdownComponent, ToggleSwitchComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
  organizations = inject(OrganizationsService);
  subscriptions = inject(SubscriptionsService);
  notifications = inject(NotificationsService);
  private toast = inject(ToastService);

  showBack = false;
  backUrl: string | null = null;

  private route = inject(ActivatedRoute);

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('from') === 'overview') {
      this.showBack = true;
      this.backUrl = null;
    }

    // Settings load asynchronously from the backend now (previously a synchronous mock), so seeding
    // ccText once at field-initializer time could run before the real value ever arrives. This
    // re-seeds it whenever the settings signal updates, but only until the admin actually starts
    // editing the field — otherwise a background refresh could stomp on an in-progress edit.
    effect(() => {
      const recipients = this.notifications.settings()().ccRecipients;
      if (!this.ccTextTouched) {
        this.ccText = recipients.join(', ');
      }
    });
  }

  formatDateTime = formatDateTime;
  activeTab = signal<Tab>('expiring');
  selected = signal<Set<string>>(new Set());

  ccText = '';
  ccTextTouched = false;
  offsetChoices: NotificationOffset[] = [30, 15, 7, 1, 0];

  // Shared by the Settings offset chips and the History table's own offset column, so a reminder's
  // timing always reads the same plain-English way wherever it's shown.
  offsetLabel(offset: number): string {
    if (offset === 0) return 'On expiry';
    return offset === 1 ? '1 day before' : `${offset} days before`;
  }

  expiring = computed(() =>
    this.subscriptions
      .list()()
      .filter((s) => s.planStatus === 'ACTIVE')
      .map((s) => ({ sub: s, days: daysUntil(s.planEndDate) }))
      .filter((r) => r.days <= 30)
      .sort((a, b) => a.days - b.days)
  );

  orgName(orgId: string): string {
    return this.organizations.byId(orgId)?.organizationName ?? orgId;
  }

  adminEmail(orgId: string): string {
    return this.organizations.byId(orgId)?.adminEmail ?? '';
  }

  toggleSelect(subscriptionId: string): void {
    const s = new Set(this.selected());
    if (s.has(subscriptionId)) s.delete(subscriptionId);
    else s.add(subscriptionId);
    this.selected.set(s);
  }

  allSelected(): boolean {
    return this.expiring().length > 0 && this.expiring().every((r) => this.selected().has(r.sub.subscriptionId));
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selected.set(new Set());
    } else {
      this.selected.set(new Set(this.expiring().map((r) => r.sub.subscriptionId)));
    }
  }

  async sendToSelected(): Promise<void> {
    const chosen = this.expiring().filter((r) => this.selected().has(r.sub.subscriptionId));
    const results = await Promise.allSettled(
      chosen.map((r) => {
        const offset = ([30, 15, 7, 1, 0] as NotificationOffset[]).find((o) => o >= r.days) ?? 0;
        const subject = r.days <= 0 ? 'Your FLIP subscription has expired' : `Your FLIP subscription expires in ${r.days} days`;
        return this.notifications.sendReminder(r.sub.orgId, r.sub.subscriptionId, this.adminEmail(r.sub.orgId), offset, subject);
      })
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - sent;
    if (failed === 0) {
      this.toast.show(`Sent ${sent} reminder${sent === 1 ? '' : 's'}`, 'success');
    } else if (sent === 0) {
      this.toast.show(`Failed to send ${failed} reminder${failed === 1 ? '' : 's'}`, 'critical');
    } else {
      this.toast.show(`Sent ${sent}, failed ${failed}`, 'critical');
    }
    this.selected.set(new Set());
  }

  async resend(logId: string): Promise<void> {
    try {
      await this.notifications.resend(logId);
      this.toast.show('Reminder resent', 'success');
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to resend reminder'), 'critical');
    }
  }

  async toggleOffset(offset: NotificationOffset): Promise<void> {
    const current = this.notifications.settings()().offsets;
    const next = current.includes(offset) ? current.filter((o) => o !== offset) : [...current, offset].sort((a, b) => b - a);
    try {
      await this.notifications.updateSettings({ offsets: next });
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to update reminder offsets'), 'critical');
    }
  }

  hasOffset(offset: NotificationOffset): boolean {
    return this.notifications.settings()().offsets.includes(offset);
  }

  async toggleEnabled(): Promise<void> {
    try {
      await this.notifications.updateSettings({ enabled: !this.notifications.settings()().enabled });
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to update automatic reminders'), 'critical');
    }
  }

  async saveCc(): Promise<void> {
    const list = this.ccText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await this.notifications.updateSettings({ ccRecipients: list });
      this.toast.show('Notification settings saved', 'success');
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to save notification settings'), 'critical');
    }
  }

  private errorMessage(err: unknown, fallback: string): string {
    const httpError = err as { error?: { message?: string }; message?: string };
    return httpError?.error?.message || httpError?.message || fallback;
  }
}

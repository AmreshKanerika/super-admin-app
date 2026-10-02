import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { CountdownComponent } from '../../core/ui/countdown.component';
import { ToggleSwitchComponent } from '../../core/ui/toggle-switch.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { OrganizationsService } from '../../services/organizations.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import { NotificationsService } from '../../services/notifications.service';
import { ToastService } from '../../core/toast.service';
import { daysUntil, formatDate, formatDateTime, Tone } from '../../core/status.util';
import { NotificationLogEntry, NotificationOffset } from '../../models';

type Tab = 'expiring' | 'history' | 'settings';
type ExpiryWindow = 'all' | 'overdue' | 'week' | 'month';
type ExpirySort = 'soonest' | 'name';
type LogStatus = NotificationLogEntry['status'];
type HistorySort = 'newest' | 'oldest';

const STATUS_LABEL: Record<LogStatus, string> = { SENT: 'Sent', FAILED: 'Failed', QUEUED: 'Queued' };
const STATUS_TONE: Record<LogStatus, Tone> = { SENT: 'success', FAILED: 'critical', QUEUED: 'accent' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusPillComponent, CountdownComponent, ToggleSwitchComponent, EmptyStateComponent],
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
  formatDate = formatDate;
  activeTab = signal<Tab>('expiring');
  selected = signal<Set<string>>(new Set());
  sending = signal(false);
  resending = signal<Set<string>>(new Set());

  // Expiring-soon filters
  expSearch = signal('');
  expWindow = signal<ExpiryWindow>('all');
  expSort = signal<ExpirySort>('soonest');
  readonly windowOptions: { value: ExpiryWindow; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'overdue', label: 'Past end date' },
    { value: 'week', label: 'Within 7 days' },
    { value: 'month', label: '8–30 days' }
  ];

  // History filters
  histSearch = signal('');
  histStatus = signal<LogStatus | 'all'>('all');
  histOffset = signal<NotificationOffset | 'all'>('all');
  histSort = signal<HistorySort>('newest');
  readonly statusOptions: { value: LogStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'SENT', label: 'Sent' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'QUEUED', label: 'Queued' }
  ];

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
      // open-ended subscriptions (no end date) never expire
      .filter((r): r is { sub: typeof r.sub; days: number } => r.days !== null && r.days <= 30)
      .sort((a, b) => a.days - b.days)
  );

  // Counts for the summary tiles and tab badges.
  stats = computed(() => {
    const exp = this.expiring();
    const log = this.notifications.log()();
    return {
      expiring: exp.length,
      overdue: exp.filter((r) => r.days < 0).length,
      week: exp.filter((r) => r.days >= 0 && r.days <= 7).length,
      sent: log.filter((n) => n.status === 'SENT').length,
      failed: log.filter((n) => n.status === 'FAILED').length,
      total: log.length
    };
  });

  // Most recent reminder per subscription, so admins can see who was already nudged before sending again.
  lastReminder = computed(() => {
    const map = new Map<string, NotificationLogEntry>();
    for (const n of this.notifications.log()()) {
      const prev = map.get(n.subscriptionId);
      if (!prev || n.sentDate > prev.sentDate) map.set(n.subscriptionId, n);
    }
    return map;
  });

  visibleExpiring = computed(() => {
    const q = this.expSearch().trim().toLowerCase();
    const win = this.expWindow();
    const rows = this.expiring().filter((r) => {
      if (win === 'overdue' && r.days >= 0) return false;
      if (win === 'week' && (r.days < 0 || r.days > 7)) return false;
      if (win === 'month' && r.days <= 7) return false;
      if (!q) return true;
      return this.orgName(r.sub.orgId).toLowerCase().includes(q) || this.adminEmail(r.sub.orgId).toLowerCase().includes(q);
    });
    if (this.expSort() === 'name') rows.sort((a, b) => this.orgName(a.sub.orgId).localeCompare(this.orgName(b.sub.orgId)));
    return rows;
  });

  // Only rows the admin can actually see get a reminder — a filter must never hide who is being emailed.
  selectedVisible = computed(() => this.visibleExpiring().filter((r) => this.selected().has(r.sub.subscriptionId)));
  hiddenSelectedCount = computed(() => {
    const visible = new Set(this.visibleExpiring().map((r) => r.sub.subscriptionId));
    return this.expiring().filter((r) => this.selected().has(r.sub.subscriptionId) && !visible.has(r.sub.subscriptionId)).length;
  });

  expFiltered = computed(() => !!this.expSearch().trim() || this.expWindow() !== 'all');

  visibleLog = computed(() => {
    const q = this.histSearch().trim().toLowerCase();
    const status = this.histStatus();
    const offset = this.histOffset();
    const rows = this.notifications
      .log()()
      .filter((n) => {
        if (status !== 'all' && n.status !== status) return false;
        if (offset !== 'all' && n.offsetDays !== offset) return false;
        if (!q) return true;
        return (
          this.orgName(n.orgId).toLowerCase().includes(q) ||
          (n.recipient ?? '').toLowerCase().includes(q) ||
          (n.subject ?? '').toLowerCase().includes(q)
        );
      });
    const dir = this.histSort() === 'newest' ? -1 : 1;
    return rows.sort((a, b) => (a.sentDate < b.sentDate ? -dir : a.sentDate > b.sentDate ? dir : 0));
  });

  histFiltered = computed(() => !!this.histSearch().trim() || this.histStatus() !== 'all' || this.histOffset() !== 'all');

  statusLabel(status: LogStatus): string {
    return STATUS_LABEL[status] ?? status;
  }

  statusTone(status: LogStatus): Tone {
    return STATUS_TONE[status] ?? 'neutral';
  }

  activeOffsetsLabel(): string {
    const offsets = this.notifications.settings()().offsets;
    return offsets.length ? offsets.map((o) => this.offsetLabel(o).toLowerCase()).join(', ') : 'no timing chosen';
  }

  // Tiles jump to the tab they describe and apply their filter; clicking an active tile clears it.
  showExpiring(win: ExpiryWindow): void {
    const isOn = this.activeTab() === 'expiring' && this.expWindow() === win;
    this.activeTab.set('expiring');
    this.expWindow.set(isOn ? 'all' : win);
  }

  showHistory(status: LogStatus | 'all'): void {
    const isOn = this.activeTab() === 'history' && this.histStatus() === status;
    this.activeTab.set('history');
    this.histStatus.set(isOn ? 'all' : status);
  }

  clearExpFilters(): void {
    this.expSearch.set('');
    this.expWindow.set('all');
  }

  clearHistFilters(): void {
    this.histSearch.set('');
    this.histStatus.set('all');
    this.histOffset.set('all');
  }

  onHistOffset(value: string): void {
    this.histOffset.set(value === 'all' ? 'all' : (Number(value) as NotificationOffset));
  }

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

  // "Select all" works on the rows currently shown, so it agrees with what the filters display.
  allSelected(): boolean {
    const rows = this.visibleExpiring();
    return rows.length > 0 && rows.every((r) => this.selected().has(r.sub.subscriptionId));
  }

  someSelected(): boolean {
    return this.selectedVisible().length > 0 && !this.allSelected();
  }

  toggleSelectAll(): void {
    const s = new Set(this.selected());
    const ids = this.visibleExpiring().map((r) => r.sub.subscriptionId);
    if (this.allSelected()) ids.forEach((id) => s.delete(id));
    else ids.forEach((id) => s.add(id));
    this.selected.set(s);
  }

  async sendToSelected(): Promise<void> {
    const chosen = this.selectedVisible();
    if (!chosen.length || this.sending()) return;
    this.sending.set(true);
    const results = await Promise.allSettled(
      chosen.map((r) => {
        // The nearest reminder timing at or after the days left (5 days left -> "7 days before").
        // Searched ascending: the old descending search matched 30 for every row.
        const offset = ([0, 1, 7, 15, 30] as NotificationOffset[]).find((o) => o >= r.days) ?? 30;
        const subject =
          r.days < 0
            ? 'Your FLIP subscription has expired'
            : r.days === 0
              ? 'Your FLIP subscription expires today'
              : `Your FLIP subscription expires in ${r.days} day${r.days === 1 ? '' : 's'}`;
        return this.notifications.sendReminder(r.sub.orgId, r.sub.subscriptionId, this.adminEmail(r.sub.orgId), offset, subject);
      })
    );
    this.sending.set(false);

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
    if (this.resending().has(logId)) return;
    this.resending.update((s) => new Set(s).add(logId));
    try {
      await this.notifications.resend(logId);
      this.toast.show('Reminder resent', 'success');
    } catch (err) {
      this.toast.show(this.errorMessage(err, 'Failed to resend reminder'), 'critical');
    } finally {
      this.resending.update((s) => {
        const next = new Set(s);
        next.delete(logId);
        return next;
      });
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

  // Addresses in the "Also notify" box that don't look like an email — flagged, not blocked.
  ccInvalid(): string[] {
    return this.parseCc().filter((e) => !EMAIL_RE.test(e));
  }

  ccDirty(): boolean {
    return this.parseCc().join(',') !== this.notifications.settings()().ccRecipients.join(',');
  }

  private parseCc(): string[] {
    return this.ccText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async saveCc(): Promise<void> {
    const list = this.parseCc();
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

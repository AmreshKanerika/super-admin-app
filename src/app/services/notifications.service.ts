import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NotificationLogEntry, NotificationOffset, NotificationSettings } from '../models';
import { AuditService } from './audit.service';
import { AuthService } from '../core/auth/auth.service';
import { ToastService } from '../core/toast.service';
import { API_BASE_URL } from '../core/api-config';

const FALLBACK_SETTINGS: NotificationSettings = {
  offsets: [30, 7, 1],
  ccRecipients: [],
  enabled: true
};

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private audit = inject(AuditService);
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private readonly settingsSignal = signal<NotificationSettings>(FALLBACK_SETTINGS);
  private readonly logSignal = signal<NotificationLogEntry[]>([]);

  constructor() {
    this.http.get<NotificationLogEntry[]>(`${API_BASE_URL}/platform/notifications`).subscribe({
      next: (log) => this.logSignal.set(log),
      error: (err) => {
        console.error('Failed to load notification log', err);
        this.toast.show("Couldn't load the notification log — check your connection and refresh.", 'critical');
      }
    });

    this.http.get<NotificationSettings>(`${API_BASE_URL}/platform/notifications/settings`).subscribe({
      next: (settings) => this.settingsSignal.set(settings),
      error: (err) => {
        console.error('Failed to load notification settings', err);
        this.toast.show("Couldn't load notification settings — check your connection and refresh.", 'critical');
      }
    });
  }

  settings() {
    return this.settingsSignal;
  }

  async updateSettings(patch: Partial<NotificationSettings>): Promise<void> {
    const updated = await firstValueFrom(
      this.http.put<NotificationSettings>(`${API_BASE_URL}/platform/notifications/settings`, {
        ...patch,
        modifiedBy: this.auth.getUserId()
      })
    );
    this.settingsSignal.set(updated);
    this.audit.log('NOTIFICATION_SETTINGS_UPDATED', 'PlatformSetting', 'Reminder offsets/recipients');
  }

  log() {
    return this.logSignal;
  }

  logByOrg(orgId: string): NotificationLogEntry[] {
    return this.logSignal().filter((n) => n.orgId === orgId);
  }

  async sendReminder(orgId: string, subscriptionId: string, recipient: string, offsetDays: NotificationOffset, subject: string): Promise<void> {
    const entry = await firstValueFrom(
      this.http.post<NotificationLogEntry>(`${API_BASE_URL}/platform/notifications/org/${orgId}/send-reminder`, {
        subscriptionId,
        offsetDays,
        subject
      })
    );
    this.logSignal.update((list) => [entry, ...list]);
    this.audit.log('REMINDER_SENT', 'Notification', `${entry.recipient} — ${subject}`);
  }

  async resend(logId: string): Promise<void> {
    const entry = await firstValueFrom(this.http.post<NotificationLogEntry>(`${API_BASE_URL}/platform/notifications/${logId}/resend`, {}));
    this.logSignal.update((list) => list.map((n) => (n.id === logId ? entry : n)));
    this.audit.log('REMINDER_RESENT', 'Notification', entry.recipient ?? logId);
  }
}

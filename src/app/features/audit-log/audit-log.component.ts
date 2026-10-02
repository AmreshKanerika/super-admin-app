import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ActivatedRoute } from '@angular/router';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { ScrollSentinelComponent } from '../../core/ui/scroll-sentinel.component';
import { AuditService } from '../../services/audit.service';
import { AuditLogEntry } from '../../models';
import { formatDateTime } from '../../core/status.util';

type ResultFilter = '' | 'SUCCESS' | 'FAILURE';
type CategoryKey = 'org' | 'people' | 'apps' | 'plans' | 'notify' | 'usage' | 'other';

interface Category {
  key: CategoryKey;
  label: string;
  icon: string;
}

// Action codes stay internal; users see these names. Unknown codes fall back to title case.
const ACTION_LABELS: Record<string, string> = {
  APPLICATION_ADDED_TO_PLANS: 'Application added to plans',
  APPLICATION_CREATED: 'Application created',
  APPLICATION_DELETED: 'Application deleted',
  APPLICATION_REMOVED_FROM_PLANS: 'Application removed from plans',
  APPLICATION_UPDATED: 'Application updated',
  LIMIT_OVERRIDE: 'Usage limit overridden',
  MIGRATION_TYPE_SAVED: 'Migration type saved',
  NOTIFICATION_SETTINGS_UPDATED: 'Notification settings updated',
  ORG_EXPIRED: 'Organization expired',
  ORG_INVITE_CANCELLED: 'Invitation cancelled',
  ORG_PURGED: 'Organization purged',
  ORG_REACTIVATED: 'Organization reactivated',
  ORG_ROLE_CREATED: 'Role created',
  ORG_ROLE_DELETED: 'Role deleted',
  ORG_ROLE_UPDATED: 'Role updated',
  ORG_UPDATED: 'Organization updated',
  ORG_USER_ADDED: 'Organization user added',
  ORG_USER_REMOVED: 'Organization user removed',
  ORG_USER_ROLES_CHANGED: 'User roles changed',
  ORG_USER_UPDATED: 'Organization user updated',
  PLAN_DELETED: 'Plan deleted',
  PLAN_UPDATED: 'Plan updated',
  REMINDER_RESENT: 'Reminder resent',
  REMINDER_SENT: 'Reminder sent',
  SUBSCRIPTION_ASSIGNED: 'Subscription assigned',
  SUBSCRIPTION_EXTENDED: 'Subscription extended',
  SUBSCRIPTION_PLAN_CHANGED: 'Subscription plan changed',
  USAGE_RESET: 'Usage reset'
};

const CATEGORIES: Category[] = [
  { key: 'org', label: 'Organizations', icon: 'ti-building' },
  { key: 'people', label: 'Users & roles', icon: 'ti-users' },
  { key: 'apps', label: 'Applications', icon: 'ti-apps' },
  { key: 'plans', label: 'Plans & subscriptions', icon: 'ti-receipt' },
  { key: 'notify', label: 'Notifications', icon: 'ti-bell' },
  { key: 'usage', label: 'Usage & limits', icon: 'ti-gauge' },
  { key: 'other', label: 'Other', icon: 'ti-activity' }
];

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

function titleCase(code: string): string {
  const words = code.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

function categoryOf(action: string): CategoryKey {
  if (/^ORG_(USER|ROLE|INVITE)/.test(action)) return 'people';
  if (action.startsWith('ORG_')) return 'org';
  if (action.startsWith('APPLICATION_') || action.startsWith('MIGRATION_')) return 'apps';
  if (action.startsWith('PLAN_') || action.startsWith('SUBSCRIPTION_')) return 'plans';
  if (action.startsWith('REMINDER_') || action.startsWith('NOTIFICATION_')) return 'notify';
  if (action.startsWith('USAGE_') || action.startsWith('LIMIT_')) return 'usage';
  return 'other';
}

function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface AuditRow {
  entry: AuditLogEntry;
  action: string;
  category: Category;
  targetType: string;
  actor: string;
  initial: string;
  failed: boolean;
  relative: string;
  exact: string;
}

export interface AuditDay {
  key: string;
  label: string;
  rows: AuditRow[];
}

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusPillComponent, EmptyStateComponent, ScrollSentinelComponent],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss'
})
export class AuditLogComponent implements OnInit {
  private audit = inject(AuditService);
  private route = inject(ActivatedRoute);

  readonly categories = CATEGORIES;
  readonly resultOptions: { value: ResultFilter; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'SUCCESS', label: 'Succeeded' },
    { value: 'FAILURE', label: 'Failed' }
  ];

  search = '';
  resultFilter: ResultFilter = '';
  fromDate = '';
  toDate = '';

  // Category isn't a server-side filter, so it narrows the pages already loaded; the scroll
  // sentinel keeps fetching while it stays visible, so sparse matches still fill in.
  category = signal<CategoryKey | ''>('');

  private nextPageToLoad = signal(0);
  private readonly pageSize = 20;

  items = signal<AuditLogEntry[]>([]);
  totalElements = signal(0);
  totalPages = signal(1);
  loading = signal(false);
  error = signal('');

  // Summary tiles: unfiltered counts, fetched once with size=1 queries.
  todayCount = signal<number | null>(null);
  failureCount = signal<number | null>(null);
  allCount = signal<number | null>(null);

  // Ticks every minute so "5 min ago" stays truthful without recomputing on every CD pass.
  private now = signal(Date.now());

  showBack = false;
  backUrl: string | null = null;

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly rows = computed<AuditRow[]>(() => {
    const now = this.now();
    const cat = this.category();
    const out: AuditRow[] = [];
    for (const entry of this.items()) {
      const key = categoryOf(entry.action);
      if (cat && key !== cat) continue;
      const date = new Date(entry.createdDate);
      const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const actor = entry.actorName || entry.actorEmail || 'Unknown';
      out.push({
        entry,
        action: this.actionLabel(entry.action),
        category: CATEGORY_BY_KEY.get(key)!,
        targetType: titleCase(entry.targetType || ''),
        actor,
        initial: actor.charAt(0).toUpperCase(),
        failed: entry.result === 'FAILURE',
        relative: this.relativeTime(date, now, time),
        exact: formatDateTime(entry.createdDate)
      });
    }
    return out;
  });

  readonly days = computed<AuditDay[]>(() => {
    const today = new Date(this.now());
    const todayKey = localIsoDate(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = localIsoDate(yesterday);

    const groups: AuditDay[] = [];
    for (const row of this.rows()) {
      const d = new Date(row.entry.createdDate);
      const key = localIsoDate(d);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        const full = d.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric'
        });
        const label = key === todayKey ? `Today · ${full}` : key === yesterdayKey ? `Yesterday · ${full}` : full;
        group = { key, label, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    }
    return groups;
  });

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('from') === 'overview') {
      this.showBack = true;
      this.backUrl = null;
    }
    const tick = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    });
  }

  ngOnInit(): void {
    this.load();
    void this.loadSummary();
  }

  get hasFilters(): boolean {
    return !!(this.search.trim() || this.resultFilter || this.fromDate || this.toDate || this.category());
  }

  get todayIso(): string {
    return localIsoDate(new Date(this.now()));
  }

  get todayOn(): boolean {
    return this.fromDate === this.todayIso && this.toDate === this.todayIso;
  }

  onSearchChange(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.reloadFromFirstPage();
    }, 350);
  }

  onFilterChange(): void {
    this.reloadFromFirstPage();
  }

  setResult(value: ResultFilter): void {
    if (this.resultFilter === value) return;
    this.resultFilter = value;
    this.onFilterChange();
  }

  toggleFailuresTile(): void {
    this.setResult(this.resultFilter === 'FAILURE' ? '' : 'FAILURE');
  }

  toggleTodayTile(): void {
    if (this.todayOn) {
      this.fromDate = '';
      this.toDate = '';
    } else {
      this.fromDate = this.todayIso;
      this.toDate = this.todayIso;
    }
    this.onFilterChange();
  }

  filterByActor(row: AuditRow): void {
    this.search = row.entry.actorEmail || row.entry.actorName || '';
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.onFilterChange();
  }

  clearFilters(): void {
    this.search = '';
    this.resultFilter = '';
    this.fromDate = '';
    this.toDate = '';
    this.category.set('');
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.onFilterChange();
  }

  reloadFromFirstPage(): void {
    this.nextPageToLoad.set(0);
    this.items.set([]);
    void this.load();
  }

  hasMoreEntriesBelow(): boolean {
    return !this.loading() && this.nextPageToLoad() < this.totalPages();
  }

  loadNextPage(): void {
    if (this.loading() || !this.hasMoreEntriesBelow()) return;
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const requestedPage = this.nextPageToLoad();
    try {
      const result = await this.audit.search({
        ...this.serverFilters(),
        page: requestedPage,
        size: this.pageSize
      });
      this.items.update((loaded) => (requestedPage === 0 ? result.items : [...loaded, ...result.items]));
      this.totalElements.set(result.totalElements);
      this.totalPages.set(Math.max(1, result.totalPages));
      this.nextPageToLoad.set(requestedPage + 1);
    } catch (err) {
      console.error('Failed to load audit log', err);
      this.error.set("Couldn't load the audit log — check your connection and try again.");
    } finally {
      this.loading.set(false);
    }
  }

  retry(): void {
    void this.load();
  }

  private async loadSummary(): Promise<void> {
    const start = new Date(this.todayIso + 'T00:00:00').getTime();
    const end = new Date(this.todayIso + 'T23:59:59').getTime();
    const count = (p: Parameters<AuditService['search']>[0]) =>
      this.audit.search({ ...p, page: 0, size: 1 }).then((r) => r.totalElements, () => null);
    const [all, today, failures] = await Promise.all([
      count({}),
      count({ fromEpochMs: start, toEpochMs: end }),
      count({ result: 'FAILURE' })
    ]);
    this.allCount.set(all);
    this.todayCount.set(today);
    this.failureCount.set(failures);
  }

  private serverFilters() {
    return {
      search: this.search.trim() || undefined,
      result: this.resultFilter || undefined,
      fromEpochMs: this.fromDate ? new Date(this.fromDate + 'T00:00:00').getTime() : undefined,
      toEpochMs: this.toDate ? new Date(this.toDate + 'T23:59:59').getTime() : undefined
    };
  }

  exportCsv(): void {
    const url = this.audit.exportUrl(this.serverFilters());
    window.open(url, '_blank');
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? titleCase(action);
  }

  // Within a day, relative time reads best; older rows sit under a dated day header, so the clock
  // time is the useful part.
  private relativeTime(date: Date, now: number, time: string): string {
    const sec = Math.round((now - date.getTime()) / 1000);
    if (sec < 45) return 'Just now';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    return time;
  }

  trackRow = (_: number, row: AuditRow) => row.entry.id;
  trackDay = (_: number, day: AuditDay) => day.key;
}

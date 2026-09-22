import { Component, OnInit, inject, signal } from '@angular/core';
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

  formatDateTime = formatDateTime;

  search = '';
  resultFilter: ResultFilter = '';
  fromDate = '';
  toDate = '';

  private nextPageToLoad = signal(0);
  private readonly pageSize = 20;

  items = signal<AuditLogEntry[]>([]);
  totalElements = signal(0);
  totalPages = signal(1);
  loading = signal(false);
  error = signal('');

  showBack = false;
  backUrl: string | null = null;

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('from') === 'overview') {
      this.showBack = true;
      this.backUrl = null;
    }
  }

  ngOnInit(): void {
    this.load();
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
        search: this.search.trim() || undefined,
        result: this.resultFilter || undefined,
        fromEpochMs: this.fromDate ? new Date(this.fromDate + 'T00:00:00').getTime() : undefined,
        toEpochMs: this.toDate ? new Date(this.toDate + 'T23:59:59').getTime() : undefined,
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

  exportCsv(): void {
    const url = this.audit.exportUrl({
      search: this.search.trim() || undefined,
      result: this.resultFilter || undefined,
      fromEpochMs: this.fromDate ? new Date(this.fromDate + 'T00:00:00').getTime() : undefined,
      toEpochMs: this.toDate ? new Date(this.toDate + 'T23:59:59').getTime() : undefined
    });
    window.open(url, '_blank');
  }

  actionLabel(action: string): string {
    return action.replace(/_/g, ' ');
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ActivatedRoute } from '@angular/router';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { AuditService } from '../../services/audit.service';
import { AuditLogEntry } from '../../models';
import { formatDateTime } from '../../core/status.util';

type ResultFilter = '' | 'SUCCESS' | 'FAILURE';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusPillComponent, EmptyStateComponent],
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

  page = signal(0);
  pageSize = 20;

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
      this.page.set(0);
      this.load();
    }, 350);
  }

  onFilterChange(): void {
    this.page.set(0);
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.audit.search({
        search: this.search.trim() || undefined,
        result: this.resultFilter || undefined,
        fromEpochMs: this.fromDate ? new Date(this.fromDate + 'T00:00:00').getTime() : undefined,
        toEpochMs: this.toDate ? new Date(this.toDate + 'T23:59:59').getTime() : undefined,
        page: this.page(),
        size: this.pageSize
      });
      this.items.set(result.items);
      this.totalElements.set(result.totalElements);
      this.totalPages.set(Math.max(1, result.totalPages));
    } catch (err) {
      console.error('Failed to load audit log', err);
      this.error.set("Couldn't load the audit log — check your connection and try again.");
    } finally {
      this.loading.set(false);
    }
  }

  nextPage(): void {
    if (this.page() + 1 >= this.totalPages()) return;
    this.page.set(this.page() + 1);
    this.load();
  }

  previousPage(): void {
    if (this.page() <= 0) return;
    this.page.set(this.page() - 1);
    this.load();
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

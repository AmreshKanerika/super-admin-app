import { Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProcessingInsightsService } from '../../../services/processing-insights.service';
import { ProcessingInsights } from '../../../models';

type Period = 'latest' | 'this-month' | 'last-month' | 'last-3' | 'this-year' | 'month' | 'custom';

interface PeriodOption {
  key: Period;
  label: string;
}

/**
 * The organization's file-processing numbers: files processed per source type (PDF, XLSX, XLS, CSV,
 * ZIP), PDF pages and manual reviews for a month range. Opens on the latest month with activity.
 */
@Component({
  selector: 'app-processing-insights',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  templateUrl: './processing-insights.component.html',
  styleUrl: './processing-insights.component.scss'
})
export class ProcessingInsightsComponent implements OnChanges {
  @Input({ required: true }) orgId!: string;
  @Input() orgLabel = 'this organization';

  private service = inject(ProcessingInsightsService);

  readonly periods: PeriodOption[] = [
    { key: 'latest', label: 'Latest month' },
    { key: 'this-month', label: 'This month' },
    { key: 'last-month', label: 'Last month' },
    { key: 'last-3', label: 'Last 3 months' },
    { key: 'this-year', label: 'This year' },
    { key: 'custom', label: 'Custom range…' }
  ];

  /** Icon and plain-language label for each shown source file type. */
  readonly typeMeta: Partial<Record<string, { icon: string; label: string }>> = {
    PDF: { icon: 'ti-file-type-pdf', label: 'PDF files' },
    XLSX: { icon: 'ti-file-spreadsheet', label: 'Excel workbooks' },
    XLS: { icon: 'ti-file-spreadsheet', label: 'Excel 97–2003 workbooks' },
    CSV: { icon: 'ti-file-type-csv', label: 'CSV files' },
    ZIP: { icon: 'ti-file-zip', label: 'Files from ZIP uploads' }
  };

  period = signal<Period>('latest');
  /** The one Period dropdown's value: a preset key, 'custom', or 'm:yyyy-MM' for a month with activity. */
  selection = signal<string>('latest');
  customFrom = signal('');
  customTo = signal('');
  loading = signal(false);
  error = signal('');
  data = signal<ProcessingInsights | null>(null);

  latestLabel = computed(() => {
    const latest = this.data()?.availableMonths?.[0];
    return latest ? `Latest month · ${monthLabel(latest)}` : 'Latest month';
  });

  rangeLabel = computed(() => {
    const d = this.data();
    if (!d) return '';
    return d.from === d.to ? monthLabel(d.from) : `${monthLabel(d.from)} – ${monthLabel(d.to)}`;
  });

  ngOnChanges(): void {
    if (this.orgId) void this.load();
  }

  /** Handles the Period dropdown. */
  onSelect(value: string): void {
    this.selection.set(value);
    if (value.startsWith('m:')) {
      const month = value.slice(2);
      this.period.set('month');
      this.customFrom.set(month);
      this.customTo.set(month);
      void this.load();
      return;
    }
    this.choose(value as Period);
  }

  choose(period: Period): void {
    this.period.set(period);
    if (period === 'custom') {
      const d = this.data();
      if (!this.customFrom()) this.customFrom.set(d?.from ?? currentMonth());
      if (!this.customTo()) this.customTo.set(d?.to ?? currentMonth());
      return;
    }
    void this.load();
  }

  applyCustom(): void {
    if (!this.customFrom() || !this.customTo()) {
      this.error.set('Choose both a start month and an end month.');
      return;
    }
    if (this.customTo() < this.customFrom()) {
      this.error.set('The end month must not be before the start month.');
      return;
    }
    void this.load();
  }

  pickMonth(month: string): void {
    this.onSelect('m:' + month);
  }

  async load(): Promise<void> {
    const [from, to] = this.monthsFor(this.period());
    this.loading.set(true);
    this.error.set('');
    try {
      this.data.set(await this.service.get(this.orgId, from, to));
    } catch (err) {
      const e = err as { error?: { message?: string }; message?: string };
      this.error.set(e?.error?.message || e?.message || 'Could not load processing data.');
    } finally {
      this.loading.set(false);
    }
  }

  monthLabel = monthLabel;

  private monthsFor(period: Period): [string | undefined, string | undefined] {
    const now = new Date();
    switch (period) {
      case 'this-month':
        return [currentMonth(), currentMonth()];
      case 'last-month': {
        const m = shiftMonth(now, -1);
        return [m, m];
      }
      case 'last-3':
        return [shiftMonth(now, -2), currentMonth()];
      case 'this-year':
        return [`${now.getFullYear()}-01`, currentMonth()];
      case 'month':
      case 'custom':
        return [this.customFrom() || undefined, this.customTo() || undefined];
      default:
        return [undefined, undefined];
    }
  }
}

function currentMonth(): string {
  return shiftMonth(new Date(), 0);
}

function shiftMonth(date: Date, delta: number): string {
  const d = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

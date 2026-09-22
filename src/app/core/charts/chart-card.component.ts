import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableRow } from './chart.types';

/**
 * The frame every visual sits in: title, subtitle, an actions slot, the plot
 * itself and a footnote.
 *
 * Two things here are requirements rather than decoration:
 *  - **Table view.** Every chart carries a table-view twin so no value is
 *    reachable only by hovering, and so the light hues in the palette (which
 *    sit under 3:1 against the card) always have a text fallback.
 *  - **Dimmed refresh.** While data reloads the previous render is held at
 *    reduced opacity instead of collapsing to a skeleton — no layout jump.
 */
@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="ccard" [class.dimmed]="loading" [style.--card-accent]="accent">
      <header class="cc-head">
        <div class="cc-title">
          <h3>{{ title }}</h3>
          <p *ngIf="subtitle">{{ subtitle }}</p>
        </div>
        <div class="cc-actions">
          <ng-content select="[cardActions]"></ng-content>
          <button
            *ngIf="tableRows?.length"
            type="button"
            class="cc-toggle"
            [class.on]="showTable()"
            (click)="showTable.set(!showTable())"
            [attr.aria-pressed]="showTable()"
            [attr.aria-label]="showTable() ? 'Show chart' : 'Show values as a table'"
            [title]="showTable() ? 'Show chart' : 'Show values as a table'"
          >
            <i class="ti" [class.ti-chart-donut-3]="showTable()" [class.ti-table]="!showTable()" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div class="cc-body" *ngIf="!isEmpty; else emptyTpl">
        <div class="cc-plot" [hidden]="showTable()"><ng-content></ng-content></div>

        <div class="cc-table" *ngIf="showTable()">
          <table class="dtable">
            <thead>
              <tr>
                <th *ngFor="let h of tableHeaders; let i = index" [class.num]="i > 0">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of tableRows">
                <td>
                  <span class="swatch" *ngIf="r.color" [style.background]="r.color" aria-hidden="true"></span>{{ r.label }}
                </td>
                <td *ngFor="let v of r.values" class="num mono">{{ v }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <ng-template #emptyTpl>
        <div class="cc-empty">
          <i class="ti ti-chart-bar-off" aria-hidden="true"></i>
          <strong>{{ emptyTitle }}</strong>
          <span>{{ emptyMessage }}</span>
        </div>
      </ng-template>

      <p class="cc-foot" *ngIf="footnote && !isEmpty">{{ footnote }}</p>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        height: 100%;
      }
      .ccard {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 22px 24px 20px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 8px 28px rgba(40, 20, 60, 0.05);
        overflow: hidden;
        transition: opacity 0.18s ease;
      }
      .ccard::before {
        position: absolute;
        inset: 0 0 auto;
        height: 3px;
        background: var(--card-accent, var(--accent));
        content: '';
      }
      .ccard.dimmed {
        opacity: 0.55;
      }
      .cc-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .cc-title h3 {
        margin: 0;
        font: 700 16px/1.25 var(--k-font-display);
        letter-spacing: -0.015em;
        color: var(--ink);
      }
      .cc-title p {
        margin: 4px 0 0;
        color: var(--ink-soft);
        font-size: 12.5px;
        line-height: 1.45;
        max-width: 54ch;
      }
      .cc-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
      }
      .cc-toggle {
        display: grid;
        place-items: center;
        width: 27px;
        height: 27px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #fff;
        color: var(--ink-faint);
        font-size: 15px;
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }
      .cc-toggle:hover {
        background: var(--paper-sunken);
        color: var(--ink-soft);
      }
      .cc-toggle.on {
        border-color: var(--accent);
        background: var(--accent-soft);
        color: var(--accent-ink);
      }
      .cc-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .cc-plot {
        min-width: 0;
      }
      .cc-table {
        margin-top: 12px;
        max-height: 320px;
        overflow: auto;
      }
      .cc-table table.dtable {
        min-width: 0;
      }
      .cc-table th,
      .cc-table td {
        padding: 7px 10px;
        font-size: 12px;
      }
      .cc-table th.num,
      .cc-table td.num {
        text-align: right;
      }
      .cc-table td:first-child {
        min-width: 0;
        color: var(--ink);
      }
      .swatch {
        display: inline-block;
        width: 9px;
        height: 9px;
        margin-right: 8px;
        border-radius: 2px;
        vertical-align: baseline;
      }
      .cc-empty {
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 170px;
        padding: 18px;
        color: var(--ink-faint);
        text-align: center;
        font-size: 11.5px;
      }
      .cc-empty i {
        color: var(--line-strong);
        font-size: 26px;
      }
      .cc-empty strong {
        color: var(--ink-soft);
        font-size: 13px;
      }
      .cc-foot {
        margin: 12px 0 0;
        padding-top: 10px;
        border-top: 1px solid var(--line);
        color: var(--ink-soft);
        font-size: 12px;
        line-height: 1.5;
      }
      @media (max-width: 520px) {
        .ccard { padding: 20px 16px 16px; }
        .cc-title h3 { font-size: 15px; }
      }
    `
  ]
})
export class ChartCardComponent {
  @Input() title = '';
  @Input() accent = '';
  @Input() subtitle = '';
  @Input() footnote = '';
  @Input() loading = false;
  @Input() emptyTitle = 'Nothing in this slice';
  @Input() emptyMessage = 'Widen the date range or clear a filter.';

  /** The table-view twin. Omit only for a plot that carries no values (a meter). */
  @Input() tableRows: TableRow[] | null = null;
  @Input() tableHeaders: string[] = ['Category', 'Organizations'];

  private readonly emptyFlag = signal(false);
  @Input() set empty(value: boolean) {
    this.emptyFlag.set(value);
    if (value) this.showTable.set(false);
  }
  get isEmpty(): boolean {
    return this.emptyFlag();
  }

  readonly showTable = signal(false);

  readonly hasTable = computed(() => (this.tableRows?.length ?? 0) > 0);
}

import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BarDatum } from './chart.types';

/**
 * Horizontal bars — the right form when the categories have long names or when
 * the reader is comparing close magnitudes (a ring cannot do either).
 *
 * Built from HTML rather than SVG on purpose: the category labels are real text
 * that wraps, truncates and is selectable, and each row is a real button, so
 * the hit target is the whole row rather than the painted bar.
 */
@Component({
  selector: 'app-hbar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ul class="hb">
      <li *ngFor="let r of rows(); trackBy: trackKey">
        <button
          type="button"
          [class.dimmed]="r.dimmed"
          [class.selected]="r.active"
          [attr.aria-pressed]="r.active"
          [attr.aria-label]="r.label + ': ' + r.value + '. ' + (clickable() ? 'Filter by this.' : '')"
          [disabled]="!clickable()"
          (click)="barToggle.emit(r.key)"
        >
          <span class="lb">
            <span class="dot" [style.background]="r.color" aria-hidden="true"></span>
            <span class="txt">{{ r.label }}</span>
          </span>
          <span class="track">
            <span class="bar" [style.width.%]="r.pct" [style.background]="r.color"></span>
          </span>
          <span class="vl mono">{{ r.value }}</span>
          <span class="nt" *ngIf="r.note">{{ r.note }}</span>
        </button>
      </li>
    </ul>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .hb {
        list-style: none;
        margin: 14px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .hb button {
        display: grid;
        grid-template-columns: minmax(84px, 132px) minmax(0, 1fr) 40px;
        align-items: center;
        gap: 4px 12px;
        width: 100%;
        padding: 7px 8px;
        border: none;
        border-radius: 7px;
        background: none;
        color: var(--ink-soft);
        font: inherit;
        font-size: 11.5px;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.12s ease, opacity 0.14s ease;
      }
      .hb button[disabled] {
        cursor: default;
      }
      .hb button:not([disabled]):hover {
        background: var(--paper-sunken);
      }
      .hb button.dimmed {
        opacity: 0.38;
      }
      .hb button.selected {
        background: var(--accent-soft);
      }
      .lb {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .dot {
        width: 9px;
        height: 9px;
        flex: none;
        border-radius: 3px;
      }
      .txt {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hb button.selected .txt {
        color: var(--accent-ink);
        font-weight: 600;
      }
      .track {
        position: relative;
        height: 12px;
        border-radius: 3px;
        background: var(--paper-sunken);
        overflow: hidden;
      }
      /* Square where it meets the baseline, rounded at the data end only. */
      .bar {
        display: block;
        height: 100%;
        min-width: 2px;
        border-radius: 0 4px 4px 0;
        transition: width 0.3s ease;
      }
      .vl {
        color: var(--ink);
        font-weight: 700;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .nt {
        grid-column: 2 / -1;
        color: var(--ink-faint);
        font-size: 10px;
      }
      @media (max-width: 520px) {
        .hb button {
          grid-template-columns: minmax(0, 1fr) 40px;
        }
        .track {
          grid-column: 1 / -1;
        }
      }
    `
  ]
})
export class HbarChartComponent {
  readonly items = input<BarDatum[]>([]);
  readonly selected = input<string[]>([]);
  readonly clickable = input<boolean>(true);
  /** Scale bars against the largest bar (default) or against the running total. */
  readonly scaleTo = input<'max' | 'total'>('max');

  readonly barToggle = output<string>();

  readonly rows = computed(() => {
    const items = this.items();
    const sel = this.selected();
    const denominator =
      this.scaleTo() === 'total'
        ? items.reduce((sum, i) => sum + i.value, 0)
        : Math.max(...items.map((i) => i.value), 0);
    return items.map((i) => ({
      ...i,
      pct: denominator > 0 ? (i.value / denominator) * 100 : 0,
      dimmed: sel.length > 0 && !sel.includes(i.key),
      active: sel.includes(i.key)
    }));
  });

  trackKey(_: number, r: BarDatum): string {
    return r.key;
  }
}

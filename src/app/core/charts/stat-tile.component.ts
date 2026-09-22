import { Component, Input, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SparklineComponent } from './sparkline.component';

/**
 * A single headline number. The right form for one value — a one-bar bar chart
 * is not.
 *
 * Contract: label · value · delta (signed, against a named period) · trend.
 * The delta's colour is direction × whether up is good for *this* metric, so a
 * rise in expiries reads red while a rise in reactivations reads green. It is
 * always paired with an arrow and the period name, never colour alone.
 *
 * A tile is also a filter: pressing it cross-filters every other visual.
 */
@Component({
  selector: 'app-stat-tile',
  standalone: true,
  imports: [CommonModule, SparklineComponent],
  template: `
    <button
      type="button"
      class="tile"
      [style.--tile-accent]="color()"
      [style.--tile-soft]="softColor()"
      [class.selected]="active()"
      [class.plain]="!filterable()"
      [class.compact]="compact()"
      [disabled]="!filterable()"
      [attr.aria-pressed]="filterable() ? active() : null"
      [attr.aria-label]="aria()"
      (click)="tileToggle.emit()"
    >
      <span class="top">
        <span class="lb">{{ label }}</span>
        <span class="ic" *ngIf="!compact()" [style.background]="softColor()" [style.color]="color()"><i class="ti" [class]="icon" aria-hidden="true"></i></span>
      </span>

      <span class="value-row">
        <span class="val">{{ display() }}</span>
        <span class="ic" *ngIf="compact()" [style.background]="softColor()" [style.color]="color()"><i class="ti" [class]="icon" aria-hidden="true"></i></span>
      </span>

      <span class="delta" [class]="deltaTone()" *ngIf="delta() !== null; else hintTpl">
        <i class="ti" [class.ti-trending-up]="delta()! > 0" [class.ti-trending-down]="delta()! < 0" [class.ti-minus]="delta() === 0" aria-hidden="true"></i>
        <span>{{ deltaText() }}</span>
        <small>{{ deltaLabel }}</small>
      </span>
      <ng-template #hintTpl>
        <span class="delta neutral"><small>{{ hint }}</small></span>
      </ng-template>

      <span class="spark" *ngIf="trend().length > 1">
        <app-sparkline [values]="trend()" [color]="color()"></app-sparkline>
      </span>

      <span class="mark" *ngIf="active()" aria-hidden="true"><i class="ti ti-filter-filled"></i></span>
    </button>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .tile {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 190px;
        padding: 21px 23px 19px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: linear-gradient(145deg, var(--tile-soft) -75%, #fff 66%);
        color: var(--ink);
        font: inherit;
        text-align: left;
        cursor: pointer;
        overflow: hidden;
        box-shadow: 0 8px 24px rgba(40, 20, 60, 0.055);
        transition: border-color 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
      }
      .tile::before {
        position: absolute;
        inset: 0 auto auto 0;
        width: 4px;
        height: 100%;
        background: var(--tile-accent);
        content: '';
      }
      .tile.plain {
        cursor: default;
      }
      .tile:not(.plain):hover {
        transform: translateY(-2px);
        border-color: var(--line-strong);
        box-shadow: 0 10px 22px rgba(43, 20, 66, 0.09);
      }
      .tile.selected {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px var(--accent) inset, 0 8px 18px rgba(124, 70, 163, 0.14);
      }
      .tile:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .lb {
        color: var(--ink-soft);
        font-size: 13px;
        font-weight: 700;
        line-height: 1.35;
      }
      .ic {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 10px;
        font-size: 20px;
      }
      /* Proportional figures: tabular digits make a large standalone number
         look loose. The tabular variant belongs in the table view. */
      .val {
        margin: 18px 0 0;
        font: 700 40px/1 var(--k-font-display);
        letter-spacing: -0.035em;
        color: var(--ink);
      }
      .value-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; }
      .delta {
        display: flex;
        align-items: baseline;
        gap: 5px;
        margin-top: 9px;
        font-size: 11px;
        font-weight: 700;
      }
      .delta i {
        font-size: 13px;
        transform: translateY(2px);
      }
      .delta small {
        color: var(--ink-faint);
        font-size: 10px;
        font-weight: 400;
      }
      .delta.good {
        color: #0a7d0a;
      }
      .delta.bad {
        color: #c03a3a;
      }
      .delta.neutral {
        color: var(--ink-faint);
      }
      .spark {
        display: block;
        margin-top: auto;
        padding-top: 18px;
      }
      .mark {
        position: absolute;
        top: 9px;
        right: 9px;
        display: none;
        color: var(--accent);
        font-size: 12px;
      }
      .tile.selected .ic {
        display: none;
      }
      .tile.selected .mark {
        display: block;
      }
      .tile.compact { min-height: 154px; padding: 15px 14px 12px; }
      .tile.compact .lb { font-size: 11px; white-space: nowrap; }
      .tile.compact .ic { width: 32px; height: 32px; font-size: 17px; }
      .tile.compact .value-row .ic { margin-top: 13px; }
      .tile.compact .val { margin-top: 13px; font-size: 32px; }
      .tile.compact .delta { margin-top: 7px; font-size: 10px; }
      .tile.compact .delta small { font-size: 9px; }
      .tile.compact .spark { padding-top: 9px; }
    `
  ]
})
export class StatTileComponent {
  readonly value = input<number>(0);
  readonly compact = input<boolean>(false);
  readonly delta = input<number | null>(null);
  readonly trend = input<number[]>([]);
  readonly color = input<string>('#7c46a3');
  readonly active = input<boolean>(false);
  readonly filterable = input<boolean>(true);
  /** true when a rise is good news for this metric (signups), false for churn. */
  readonly upIsGood = input<boolean>(true);

  @Input() label = '';
  @Input() icon = 'ti-chart-bar';
  /** Names the comparison period, e.g. "vs previous 30 days". */
  @Input() deltaLabel = '';
  /** Shown in the delta's place when there is no comparison window. */
  @Input() hint = '';

  readonly tileToggle = output<void>();

  readonly display = computed(() => this.value().toLocaleString('en-US'));

  readonly softColor = computed(() => `${this.color()}1f`);

  readonly deltaTone = computed(() => {
    const d = this.delta();
    if (d === null || d === 0) return 'neutral';
    return d > 0 === this.upIsGood() ? 'good' : 'bad';
  });

  readonly deltaText = computed(() => {
    const d = this.delta();
    if (d === null) return '';
    if (d === 0) return 'no change';
    return `${d > 0 ? '+' : ''}${d}`;
  });

  readonly aria = computed(() => {
    const parts = [`${this.label}: ${this.value()}`];
    const d = this.delta();
    if (d !== null) parts.push(`${d > 0 ? 'up' : d < 0 ? 'down' : 'unchanged'} ${Math.abs(d)} ${this.deltaLabel}`);
    if (this.filterable()) parts.push(this.active() ? 'Filter active. Press to clear.' : 'Press to filter the dashboard by this.');
    return parts.join('. ');
  });
}

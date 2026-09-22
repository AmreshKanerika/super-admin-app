import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartSeries, barPath, niceTicks } from './chart.types';

interface Mark {
  seriesIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  path: string;
  color: string;
}

interface Column {
  index: number;
  key: string;
  label: string;
  centre: number;
  hitX: number;
  hitW: number;
  marks: Mark[];
  selected: boolean;
  netLabel: string | null;
  netY: number;
}

/**
 * Columns over time.
 *
 * `diverging` plots series[0] up from the baseline and series[1] down — the job
 * is polarity (gained vs lost), so two poles and a neutral zero rule, not two
 * axes. `grouped` puts the series side by side in each slot.
 *
 * The hit target is the whole column slot, not the painted bar: a two-pixel
 * sliver for a month with one churn still has to be hoverable.
 */
@Component({
  selector: 'app-column-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cc">
      <ul class="legend">
        <li *ngFor="let s of series()">
          <span class="key" [style.background]="s.color" aria-hidden="true"></span>{{ s.label }}
        </li>
        <li *ngIf="mode() === 'diverging'" class="net-key"><span class="net-dot" aria-hidden="true"></span>Net change</li>
      </ul>

      <div class="plot-wrap">
        <svg [attr.viewBox]="'0 0 ' + vbWidth + ' ' + height()" role="img" [attr.aria-label]="ariaLabel()">
          <line
            *ngFor="let t of gridLines()"
            [attr.x1]="padL"
            [attr.x2]="vbWidth - padR"
            [attr.y1]="t.y"
            [attr.y2]="t.y"
            [attr.stroke]="t.zero ? '#d5dae2' : '#eceef2'"
            stroke-width="1"
          />
          <text *ngFor="let t of gridLines()" class="tick y-tick" [attr.x]="padL - 8" [attr.y]="t.y + 3.5">{{ t.label }}</text>

          <g *ngFor="let c of columns(); trackBy: trackCol" [class.dimmed]="anySelected() && !c.selected">
            <rect
              class="slot"
              [class.on]="c.selected"
              [attr.x]="c.hitX"
              [attr.y]="padT"
              [attr.width]="c.hitW"
              [attr.height]="plotH()"
              rx="5"
              tabindex="0"
              role="button"
              [attr.aria-pressed]="c.selected"
              [attr.aria-label]="columnAria(c)"
              (mouseenter)="hover.set(c.index)"
              (mouseleave)="hover.set(null)"
              (focus)="hover.set(c.index)"
              (blur)="hover.set(null)"
              (click)="bucketToggle.emit(c.key)"
              (keydown.enter)="bucketToggle.emit(c.key)"
              (keydown.space)="$event.preventDefault(); bucketToggle.emit(c.key)"
            />
            <path *ngFor="let m of c.marks" [attr.d]="m.path" [attr.fill]="m.color" pointer-events="none" />
            <text *ngIf="c.netLabel" class="net" [attr.x]="c.centre" [attr.y]="c.netY" pointer-events="none">{{ c.netLabel }}</text>
          </g>

          <text
            *ngFor="let c of columns()"
            class="tick"
            [class.hidden]="!showTickAt(c.index)"
            [attr.x]="c.centre"
            [attr.y]="height() - 8"
            text-anchor="middle"
          >
            {{ c.label }}
          </text>
        </svg>

        <div class="tip" *ngIf="hovered() as h" [style.left.%]="tipLeft()" [class.flip]="tipLeft() > 58">
          <p class="tip-head">{{ h.label }}</p>
          <p class="tip-row" *ngFor="let s of series(); let i = index">
            <span class="tip-key" [style.background]="s.color" aria-hidden="true"></span>
            <strong>{{ valueAt(s, h.index) }}</strong>
            <span>{{ s.label }}</span>
          </p>
          <p class="tip-net" *ngIf="mode() === 'diverging'">Net {{ h.netLabel ?? '0' }}</p>
          <p class="tip-foot">Click to filter on this period</p>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .cc {
        margin-top: 12px;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 18px;
        list-style: none;
        margin: 0 0 12px;
        padding: 0;
        color: var(--ink-soft);
        font-size: 12px;
      }
      .legend li {
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .key {
        width: 11px;
        height: 11px;
        border-radius: 3px;
      }
      .net-dot {
        width: 11px;
        height: 11px;
        border-radius: 3px;
        border: 1px dashed var(--line-strong);
      }
      .plot-wrap {
        position: relative;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
      }
      g.dimmed {
        opacity: 0.3;
      }
      .slot {
        fill: transparent;
        cursor: pointer;
        outline: none;
        transition: fill 0.12s ease;
      }
      .slot:hover {
        fill: rgba(42, 120, 214, 0.055);
      }
      .slot.on {
        fill: rgba(42, 120, 214, 0.1);
      }
      .slot:focus-visible {
        stroke: var(--accent);
        stroke-width: 2;
      }
      .tick {
        fill: #596477;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .y-tick {
        text-anchor: end;
      }
      .tick.hidden {
        display: none;
      }
      .net {
        fill: #4a5264;
        font-size: 10px;
        font-weight: 700;
        text-anchor: middle;
        font-variant-numeric: tabular-nums;
      }
      .tip {
        position: absolute;
        top: 2px;
        transform: translateX(10px);
        min-width: 126px;
        padding: 9px 11px;
        border: 1px solid var(--line);
        border-radius: 9px;
        background: #fff;
        box-shadow: 0 8px 22px rgba(24, 14, 40, 0.14);
        pointer-events: none;
        z-index: 3;
      }
      .tip.flip {
        transform: translateX(-100%) translateX(-10px);
      }
      .tip-head {
        margin: 0 0 6px;
        color: var(--ink-faint);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .tip-row {
        display: flex;
        align-items: baseline;
        gap: 7px;
        margin: 0;
        font-size: 11px;
        color: var(--ink-faint);
        line-height: 1.75;
      }
      .tip-key {
        width: 9px;
        height: 9px;
        border-radius: 2px;
        transform: translateY(-1px);
      }
      .tip-row strong {
        color: var(--ink);
        font-size: 12.5px;
        font-variant-numeric: tabular-nums;
      }
      .tip-net {
        margin: 5px 0 0;
        color: var(--ink-soft);
        font-size: 11px;
        font-weight: 700;
      }
      .tip-foot {
        margin: 7px 0 0;
        padding-top: 6px;
        border-top: 1px solid var(--line);
        color: var(--ink-faint);
        font-size: 9.5px;
      }
    `
  ]
})
export class ColumnChartComponent {
  readonly categories = input<string[]>([]);
  readonly categoryKeys = input<string[]>([]);
  readonly series = input<ChartSeries[]>([]);
  readonly selected = input<string[]>([]);
  readonly mode = input<'diverging' | 'grouped'>('diverging');
  readonly height = input<number>(240);

  readonly bucketToggle = output<string>();

  readonly vbWidth = 760;
  readonly padL = 38;
  readonly padR = 14;
  readonly padT = 16;
  readonly padB = 26;
  /** Keep grouped columns substantial while retaining a small gap between periods. */
  private readonly maxBar = 42;

  readonly hover = signal<number | null>(null);

  readonly plotH = computed(() => this.height() - this.padT - this.padB);
  private readonly plotW = computed(() => this.vbWidth - this.padL - this.padR);

  readonly anySelected = computed(() => this.selected().length > 0);

  private readonly scale = computed(() => {
    const s = this.series();
    const diverging = this.mode() === 'diverging';
    const up = Math.max(1, ...(diverging ? (s[0]?.values ?? [0]) : s.flatMap((series) => series.values)));
    const down = diverging ? Math.max(0, ...(s[1]?.values ?? [0])) : 0;
    const upTicks = niceTicks(up, diverging ? 2 : 4);
    const downTicks = down > 0 ? niceTicks(down, 2) : [0];
    const upMax = upTicks[upTicks.length - 1] || 1;
    const downMax = downTicks[downTicks.length - 1] || 0;
    const span = upMax + downMax || 1;
    const zeroY = this.padT + (upMax / span) * this.plotH();
    return { upMax, downMax, span, zeroY, upTicks, downTicks, diverging };
  });

  readonly gridLines = computed(() => {
    const { upTicks, downTicks, zeroY, downMax, span, diverging } = this.scale();
    const h = this.plotH();
    const lines = upTicks.map((t) => ({ y: zeroY - (t / span) * h, label: String(t), zero: t === 0 }));
    if (diverging && downMax > 0) {
      for (const t of downTicks) {
        if (t === 0) continue;
        lines.push({ y: zeroY + (t / span) * h, label: String(t), zero: false });
      }
    }
    return lines;
  });

  readonly columns = computed<Column[]>(() => {
    const cats = this.categories();
    const keys = this.categoryKeys();
    const series = this.series();
    const sel = this.selected();
    const { zeroY, span, diverging } = this.scale();
    const h = this.plotH();
    if (!cats.length) return [];

    const slot = this.plotW() / cats.length;
    const groupCount = diverging ? 1 : Math.max(1, series.length);
    const pairGap = 2;
    const barW = Math.min(this.maxBar, Math.max(3, (slot * 0.94 - pairGap * (groupCount - 1)) / groupCount));

    return cats.map((label, index) => {
      const x0 = this.padL + index * slot;
      const centre = x0 + slot / 2;
      const marks: Mark[] = [];

      if (diverging) {
        const upVal = series[0]?.values[index] ?? 0;
        const downVal = series[1]?.values[index] ?? 0;
        if (upVal > 0) {
          const barH = (upVal / span) * h;
          marks.push({
            seriesIndex: 0,
            x: centre - barW / 2,
            y: zeroY - barH,
            w: barW,
            h: barH,
            path: barPath(centre - barW / 2, zeroY - barH, barW, barH, 4, 'up'),
            color: series[0].color
          });
        }
        if (downVal > 0) {
          const barH = (downVal / span) * h;
          marks.push({
            seriesIndex: 1,
            x: centre - barW / 2,
            y: zeroY,
            w: barW,
            h: barH,
            path: barPath(centre - barW / 2, zeroY, barW, barH, 4, 'down'),
            color: series[1].color
          });
        }
      } else {
        const groupW = barW * series.length + pairGap * (series.length - 1);
        series.forEach((s, si) => {
          const value = s.values[index] ?? 0;
          if (value <= 0) return;
          const barH = (value / span) * h;
          const x = centre - groupW / 2 + si * (barW + pairGap);
          marks.push({
            seriesIndex: si,
            x,
            y: zeroY - barH,
            w: barW,
            h: barH,
            path: barPath(x, zeroY - barH, barW, barH, 4, 'up'),
            color: s.color
          });
        });
      }

      const net = diverging ? (series[0]?.values[index] ?? 0) - (series[1]?.values[index] ?? 0) : 0;
      return {
        index,
        key: keys[index] ?? label,
        label,
        centre,
        hitX: x0 + 1,
        hitW: Math.max(6, slot - 2),
        marks,
        selected: sel.includes(keys[index] ?? label),
        // Only the diverging view carries a net figure, and only where there is
        // movement — a "0" on every empty month is noise, not a label.
        netLabel: diverging && net !== 0 ? (net > 0 ? `+${net}` : String(net)) : null,
        netY: this.padT + 10
      };
    });
  });

  readonly hovered = computed(() => {
    const i = this.hover();
    if (i === null) return null;
    return this.columns()[i] ?? null;
  });

  readonly tipLeft = computed(() => {
    const c = this.hovered();
    return c ? (c.centre / this.vbWidth) * 100 : 0;
  });

  showTickAt(index: number): boolean {
    const n = this.categories().length;
    if (n <= 1) return true;
    const every = Math.ceil(n / 12);
    return index % every === 0 || index === n - 1;
  }

  columnAria(c: Column): string {
    const parts = this.series().map((s) => `${s.label} ${s.values[c.index] ?? 0}`);
    return `${c.label}: ${parts.join(', ')}. Filter on this period.`;
  }

  readonly ariaLabel = computed(() => {
    const cats = this.categories();
    if (!cats.length) return 'No data';
    return this.series()
      .map((s) => `${s.label}: ${cats.map((c, i) => `${c} ${s.values[i] ?? 0}`).join(', ')}`)
      .join('. ');
  });

  trackCol(_: number, c: Column): string {
    return c.key;
  }

  /** Indexing past the end is possible mid-update; the axis is not. */
  valueAt(series: ChartSeries, index: number): number {
    return series.values[index] ?? 0;
  }
}

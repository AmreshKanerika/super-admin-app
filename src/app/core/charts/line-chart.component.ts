import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartSeries, niceTicks } from './chart.types';

interface Pt {
  x: number;
  y: number;
}

interface DrawnSeries {
  key: string;
  label: string;
  color: string;
  line: string;
  area: string;
  points: Pt[];
}

/**
 * Trend over time, 1–4 series on **one** y-axis (a second scale would invent a
 * correlation that is not in the data — every series here counts organizations,
 * so one axis is also the honest one).
 *
 * Reading the values does not depend on landing the pointer on a 2px stroke: a
 * crosshair snaps to the nearest bucket and one tooltip reports every series at
 * that x. Arrow keys do the same thing from the keyboard.
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="lc">
      <ul class="legend" *ngIf="series().length > 1">
        <li *ngFor="let s of series()">
          <span class="key" [style.background]="s.color" aria-hidden="true"></span>{{ s.label }}
        </li>
      </ul>

      <div class="plot-wrap">
        <svg
          [attr.viewBox]="'0 0 ' + vbWidth + ' ' + vbHeight()"
          role="img"
          [attr.aria-label]="ariaLabel()"
          tabindex="0"
          (mousemove)="onMove($event)"
          (mouseleave)="hover.set(null)"
          (click)="emitToggle()"
          (keydown)="onKey($event)"
          (blur)="hover.set(null)"
        >
          <!-- y grid: solid hairlines, one step off the surface -->
          <g>
            <line
              *ngFor="let t of ticks()"
              [attr.x1]="padL"
              [attr.x2]="vbWidth - padR"
              [attr.y1]="yOf(t)"
              [attr.y2]="yOf(t)"
              stroke="#eceef2"
              stroke-width="1"
            />
            <text *ngFor="let t of ticks()" class="tick y-tick" [attr.x]="padL - 8" [attr.y]="yOf(t) + 3.5">{{ t }}</text>
          </g>

          <!-- selected buckets read as a soft band behind the marks -->
          <rect
            *ngFor="let b of selectedBands()"
            [attr.x]="b.x"
            [attr.y]="padT"
            [attr.width]="b.w"
            [attr.height]="plotH()"
            fill="#f2eaf8"
            rx="4"
          />

          <!-- crosshair first, so the marks sit on top of it -->
          <line
            *ngIf="hover() !== null"
            [attr.x1]="xOf(hover()!)"
            [attr.x2]="xOf(hover()!)"
            [attr.y1]="padT"
            [attr.y2]="padT + plotH()"
            stroke="#c4cad4"
            stroke-width="1"
          />

          <g *ngFor="let s of drawn(); let seriesIndex = index">
            <path *ngIf="seriesIndex === 0" [attr.d]="s.area" [attr.fill]="s.color" opacity="0.09" />
            <path [attr.d]="s.line" fill="none" [attr.stroke]="s.color" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
            <circle
              *ngFor="let point of s.points; let pointIndex = index"
              [attr.cx]="point.x"
              [attr.cy]="point.y"
              [attr.r]="hover() === pointIndex ? 4.5 : categories().length <= 18 ? 3 : 0"
              [attr.fill]="s.color"
              stroke="#ffffff"
              stroke-width="1.5"
            />
            <!-- Active marker remains visible when series overlap. -->
            <circle
              *ngIf="hover() !== null && s.points[hover()!]"
              [attr.cx]="s.points[hover()!].x"
              [attr.cy]="s.points[hover()!].y"
              r="4.5"
              [attr.fill]="s.color"
              stroke="#ffffff"
              stroke-width="2"
            />
          </g>

          <!-- x axis -->
          <line [attr.x1]="padL" [attr.x2]="vbWidth - padR" [attr.y1]="padT + plotH()" [attr.y2]="padT + plotH()" stroke="#d5dae2" stroke-width="1" />
          <text
            *ngFor="let c of categories(); let i = index"
            class="tick"
            [class.hidden]="!showTickAt(i)"
            [attr.x]="xOf(i)"
            [attr.y]="padT + plotH() + 16"
            text-anchor="middle"
          >
            {{ c }}
          </text>
        </svg>

        <div class="tip" *ngIf="hover() !== null" [style.left.%]="tipLeft()" [class.flip]="tipLeft() > 58">
          <p class="tip-head">{{ categories()[hover()!] }}</p>
          <p class="tip-row" *ngFor="let s of series()">
            <span class="tip-key" [style.background]="s.color" aria-hidden="true"></span>
            <strong>{{ valueAt(s, hover()!) }}</strong>
            <span>{{ s.label }}</span>
          </p>
          <p class="tip-foot" *ngIf="clickable()">Click to filter on this period</p>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .lc {
        margin-top: 10px;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 18px;
        list-style: none;
        margin: 0 0 6px;
        padding: 0;
        color: var(--ink-soft);
        font-size: 11px;
      }
      .legend li {
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .key {
        width: 14px;
        height: 3px;
        border-radius: 2px;
      }
      .plot-wrap {
        position: relative;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
        cursor: crosshair;
        outline: none;
      }
      svg:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
        border-radius: 6px;
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
      .tip {
        position: absolute;
        top: 4px;
        transform: translateX(10px);
        min-width: 128px;
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
        width: 11px;
        height: 3px;
        border-radius: 2px;
        transform: translateY(-3px);
      }
      .tip-row strong {
        color: var(--ink);
        font-size: 12.5px;
        font-variant-numeric: tabular-nums;
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
export class LineChartComponent {
  readonly categories = input<string[]>([]);
  readonly categoryKeys = input<string[]>([]);
  readonly series = input<ChartSeries[]>([]);
  readonly selected = input<string[]>([]);
  readonly clickable = input<boolean>(true);
  readonly height = input<number>(250);

  readonly bucketToggle = output<string>();

  readonly vbWidth = 760;
  readonly padL = 38;
  readonly padR = 18;
  readonly padT = 12;
  readonly padB = 26;

  readonly hover = signal<number | null>(null);

  readonly vbHeight = computed(() => this.height());
  readonly plotH = computed(() => this.vbHeight() - this.padT - this.padB);
  private readonly plotW = computed(() => this.vbWidth - this.padL - this.padR);

  readonly maxValue = computed(() => {
    const all = this.series().flatMap((s) => s.values);
    return Math.max(1, ...all);
  });

  readonly ticks = computed(() => niceTicks(this.maxValue(), 4));

  private readonly ceiling = computed(() => {
    const t = this.ticks();
    return Math.max(1, t[t.length - 1]);
  });

  yOf(value: number): number {
    return this.padT + this.plotH() - (value / this.ceiling()) * this.plotH();
  }

  xOf(index: number): number {
    const n = this.categories().length;
    if (n <= 1) return this.padL + this.plotW() / 2;
    return this.padL + (index / (n - 1)) * this.plotW();
  }

  readonly drawn = computed<DrawnSeries[]>(() => {
    const cats = this.categories();
    if (!cats.length) return [];
    const baseline = this.padT + this.plotH();

    const built = this.series().map((s) => {
      const points = cats.map((_, i) => ({ x: this.xOf(i), y: this.yOf(s.values[i] ?? 0) }));
      // Straight segments preserve the observed values without implying
      // intermediate peaks that were never measured.
      const line = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
      const area = points.length
        ? `${line} L ${points[points.length - 1].x.toFixed(2)} ${baseline} L ${points[0].x.toFixed(2)} ${baseline} Z`
        : '';
      return { key: s.key, label: s.label, color: s.color, line, area, points };
    });
    return built;
  });

  readonly selectedBands = computed(() => {
    const keys = this.categoryKeys();
    const sel = this.selected();
    if (!sel.length || !keys.length) return [];
    const n = keys.length;
    const halfStep = n > 1 ? this.plotW() / (n - 1) / 2 : this.plotW() / 2;
    return keys
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => sel.includes(k))
      .map(({ i }) => {
        const centre = this.xOf(i);
        const x = Math.max(this.padL, centre - halfStep);
        const right = Math.min(this.vbWidth - this.padR, centre + halfStep);
        return { x, w: Math.max(4, right - x) };
      });
  });

  /** Thin the x labels until they stop colliding rather than rotating them. */
  showTickAt(index: number): boolean {
    const n = this.categories().length;
    if (n <= 1) return true;
    const every = Math.ceil(n / 12);
    return index % every === 0 || index === n - 1;
  }

  readonly tipLeft = computed(() => {
    const i = this.hover();
    if (i === null) return 0;
    return (this.xOf(i) / this.vbWidth) * 100;
  });

  readonly ariaLabel = computed(() => {
    const cats = this.categories();
    if (!cats.length) return 'No data';
    return this.series()
      .map((s) => `${s.label}: ${cats.map((c, i) => `${c} ${s.values[i] ?? 0}`).join(', ')}`)
      .join('. ');
  });

  onMove(event: MouseEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const vbX = ((event.clientX - rect.left) / rect.width) * this.vbWidth;
    const n = this.categories().length;
    if (!n) return;
    if (n === 1) {
      this.hover.set(0);
      return;
    }
    const raw = ((vbX - this.padL) / this.plotW()) * (n - 1);
    this.hover.set(Math.max(0, Math.min(n - 1, Math.round(raw))));
  }

  onKey(event: KeyboardEvent): void {
    const n = this.categories().length;
    if (!n) return;
    const current = this.hover();
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = current === null ? (event.key === 'ArrowRight' ? 0 : n - 1) : current + (event.key === 'ArrowRight' ? 1 : -1);
      this.hover.set(Math.max(0, Math.min(n - 1, next)));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.emitToggle();
    } else if (event.key === 'Escape') {
      this.hover.set(null);
    }
  }

  /** Indexing past the end is possible mid-update; the axis is not. */
  valueAt(series: ChartSeries, index: number): number {
    return series.values[index] ?? 0;
  }

  emitToggle(): void {
    const i = this.hover();
    if (i === null || !this.clickable()) return;
    const key = this.categoryKeys()[i];
    if (key) this.bucketToggle.emit(key);
  }
}

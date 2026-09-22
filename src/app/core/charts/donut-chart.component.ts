import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DonutSlice, arcPath, percent } from './chart.types';

interface Segment extends DonutSlice {
  path: string;
  hoverPath: string;
  share: string;
  dimmed: boolean;
  active: boolean;
}

/**
 * Part-to-whole ring, ≤ 6 segments. Clicking a segment (or its legend row)
 * toggles that key as a cross-filter for the whole dashboard.
 *
 * The hover/focus readout lands in the ring's centre rather than a floating
 * tooltip: on a donut the centre is already the reader's focal point, it never
 * collides with the pointer, and it gives keyboard focus the identical readout
 * for free.
 */
@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="donut-wrap">
      <div class="ring">
        <svg [attr.viewBox]="'0 0 ' + box + ' ' + box" role="img" [attr.aria-label]="ariaLabel()">
          <g *ngFor="let s of segments(); trackBy: trackKey">
            <path
              class="seg"
              [class.dimmed]="s.dimmed"
              [class.selected]="s.active"
              [attr.d]="hovered() === s.key ? s.hoverPath : s.path"
              [attr.fill]="s.color"
              tabindex="0"
              role="button"
              [attr.aria-pressed]="s.active"
              [attr.aria-label]="s.label + ': ' + s.value + ' organizations, ' + s.share + '. Filter by this.'"
              (mouseenter)="hovered.set(s.key)"
              (mouseleave)="hovered.set(null)"
              (focus)="hovered.set(s.key)"
              (blur)="hovered.set(null)"
              (click)="sliceToggle.emit(s.key)"
              (keydown.enter)="sliceToggle.emit(s.key)"
              (keydown.space)="$event.preventDefault(); sliceToggle.emit(s.key)"
            >
              <title>{{ s.label }}: {{ s.value }} ({{ s.share }})</title>
            </path>
          </g>

          <text class="c-value" [attr.x]="box / 2" [attr.y]="box / 2 - 2">{{ centre().value }}</text>
          <text class="c-label" [attr.x]="box / 2" [attr.y]="box / 2 + 17">{{ centre().label }}</text>
          <text class="c-sub" *ngIf="centre().sub" [attr.x]="box / 2" [attr.y]="box / 2 + 33">{{ centre().sub }}</text>
        </svg>
      </div>

      <ul class="legend">
        <li *ngFor="let s of segments(); trackBy: trackKey">
          <button
            type="button"
            [class.dimmed]="s.dimmed"
            [class.selected]="s.active"
            [attr.aria-pressed]="s.active"
            (mouseenter)="hovered.set(s.key)"
            (mouseleave)="hovered.set(null)"
            (focus)="hovered.set(s.key)"
            (blur)="hovered.set(null)"
            (click)="sliceToggle.emit(s.key)"
          >
            <span class="sw" [style.background]="s.color" aria-hidden="true"></span>
            <span class="lb">{{ s.label }}</span>
            <span class="vl mono">{{ s.value }}</span>
            <span class="pc mono">{{ s.share }}</span>
          </button>
        </li>
      </ul>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .donut-wrap {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .ring {
        flex: 0 0 auto;
        width: 220px;
        max-width: 100%;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
      }
      .seg {
        cursor: pointer;
        transition: opacity 0.14s ease, d 0.14s ease;
        outline: none;
      }
      .seg.dimmed {
        opacity: 0.22;
      }
      .seg:focus-visible {
        stroke: #272b34;
        stroke-width: 2;
      }
      .c-value {
        text-anchor: middle;
        font: 700 29px/1 var(--k-font-display), sans-serif;
        fill: #272b34;
      }
      .c-label {
        text-anchor: middle;
        font-size: 10.5px;
        font-weight: 600;
        fill: #70798c;
      }
      .c-sub {
        text-anchor: middle;
        font-size: 9.5px;
        fill: #8b93a4;
      }

      .legend {
        flex: 1 1 190px;
        min-width: 175px;
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .legend button {
        display: grid;
        grid-template-columns: 10px minmax(0, 1fr) auto 38px;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 5px 7px;
        border: none;
        border-radius: 6px;
        background: none;
        color: var(--ink-soft);
        font: inherit;
        font-size: 11.5px;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.12s ease, opacity 0.14s ease;
      }
      .legend button:hover {
        background: var(--paper-sunken);
      }
      .legend button.dimmed {
        opacity: 0.42;
      }
      .legend button.selected {
        background: var(--accent-soft);
        color: var(--accent-ink);
        font-weight: 600;
      }
      .sw {
        width: 10px;
        height: 10px;
        border-radius: 3px;
      }
      .lb {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .vl {
        font-weight: 700;
        color: var(--ink);
        font-variant-numeric: tabular-nums;
      }
      .legend button.selected .vl {
        color: var(--accent-ink);
      }
      .pc {
        color: var(--ink-faint);
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
    `
  ]
})
export class DonutChartComponent {
  readonly slices = input<DonutSlice[]>([]);
  /** Keys currently selected as cross-filters. Empty means "nothing selected". */
  readonly selected = input<string[]>([]);
  readonly centreLabel = input<string>('Total');
  readonly centreSub = input<string>('');

  readonly sliceToggle = output<string>();

  readonly box = 210;
  private readonly radius = 96;
  private readonly thickness = 32;

  readonly hovered = signal<string | null>(null);

  readonly total = computed(() => this.slices().reduce((sum, s) => sum + s.value, 0));

  readonly segments = computed<Segment[]>(() => {
    const slices = this.slices().filter((s) => s.value > 0);
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    if (!total) return [];
    const sel = this.selected();
    // A 2px gap in the surface colour is what separates neighbouring segments —
    // never a stroke, which would add ink that is not data. At r=96 that is
    // ~1.2° of arc. With a single segment there is no neighbour, so no gap.
    const gap = slices.length > 1 ? (2 / this.radius) * (180 / Math.PI) : 0;
    const cx = this.box / 2;
    let cursor = 0;

    return slices.map((s) => {
      const sweep = (s.value / total) * 360;
      const start = cursor + gap / 2;
      const end = cursor + sweep - gap / 2;
      cursor += sweep;
      const drawEnd = Math.max(start + 0.4, end);
      return {
        ...s,
        path: arcPath(cx, cx, this.radius, this.thickness, start, drawEnd),
        // The hovered segment grows outward by 4px — a visible response to the
        // pointer that does not move the ring's inner edge or the centre text.
        hoverPath: arcPath(cx, cx, this.radius + 4, this.thickness + 4, start, drawEnd),
        share: percent(s.value, total),
        dimmed: sel.length > 0 && !sel.includes(s.key),
        active: sel.includes(s.key)
      };
    });
  });

  readonly centre = computed(() => {
    const key = this.hovered();
    const seg = key ? this.segments().find((s) => s.key === key) : undefined;
    if (seg) {
      return { value: String(seg.value), label: seg.label, sub: seg.share };
    }
    return { value: String(this.total()), label: this.centreLabel(), sub: this.centreSub() };
  });

  readonly ariaLabel = computed(() => {
    const parts = this.segments().map((s) => `${s.label} ${s.value} (${s.share})`);
    return parts.length ? `${this.centreLabel()} ${this.total()}. ${parts.join(', ')}.` : 'No data';
  });

  trackKey(_: number, s: DonutSlice): string {
    return s.key;
  }
}

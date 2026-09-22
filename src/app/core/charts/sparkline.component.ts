import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { smoothPath } from './chart.types';

/**
 * The trend line on a stat tile. History in the de-emphasis grey with the
 * current period picked out in the tile's own colour — a sparkline is context
 * for the number beside it, not a chart competing with it, so it carries no
 * axis, no grid and no labels. The tile's value and delta are the readable
 * figures; this only shows the shape.
 */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path *ngIf="area()" [attr.d]="area()" [attr.fill]="color()" opacity="0.08" />
      <path [attr.d]="path()" fill="none" stroke="#c4cad4" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      <path *ngIf="tail()" [attr.d]="tail()" fill="none" [attr.stroke]="color()" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
      <circle *ngIf="last() as p" [attr.cx]="p.x" [attr.cy]="p.y" r="2.6" [attr.fill]="color()" stroke="#ffffff" stroke-width="1.4" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      svg {
        display: block;
        width: 100%;
        height: 38px;
        overflow: visible;
      }
    `
  ]
})
export class SparklineComponent {
  readonly values = input<number[]>([]);
  readonly color = input<string>('#7c46a3');

  readonly w = 120;
  readonly h = 30;

  private readonly points = computed(() => {
    const values = this.values();
    if (values.length < 2) return [];
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const top = 3;
    const usable = this.h - top * 2;
    return values.map((v, i) => ({
      x: (i / (values.length - 1)) * this.w,
      y: top + usable - ((v - min) / span) * usable
    }));
  });

  readonly path = computed(() => smoothPath(this.points()));

  /** The last segment carries the accent — "where it is now". */
  readonly tail = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return '';
    return smoothPath(pts.slice(-2));
  });

  readonly area = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return '';
    return `${this.path()} L ${pts[pts.length - 1].x.toFixed(2)} ${this.h} L ${pts[0].x.toFixed(2)} ${this.h} Z`;
  });

  readonly last = computed(() => {
    const pts = this.points();
    return pts.length ? pts[pts.length - 1] : null;
  });
}

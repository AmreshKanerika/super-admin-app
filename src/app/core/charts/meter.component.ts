import { Component, Input, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * A single ratio against a limit — the right form when the question is "how far
 * along is this?", and the reason there is no two-slice pie anywhere on this
 * dashboard.
 *
 * The unfilled track is a lighter step of the fill's own ramp rather than plain
 * grey, so the state reads across the whole bar instead of only the filled part.
 */
@Component({
  selector: 'app-meter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="meter">
      <div class="head">
        <span class="lb">{{ label }}</span>
        <strong class="vl">{{ display() }}</strong>
      </div>
      <div
        class="track"
        [style.background]="trackColor()"
        role="meter"
        [attr.aria-valuenow]="value()"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="max()"
        [attr.aria-label]="label + ': ' + display()"
      >
        <span class="fill" [style.width.%]="pct()" [style.background]="color()"></span>
      </div>
      <p class="cap" *ngIf="caption">{{ caption }}</p>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .meter + .meter {
        margin-top: 14px;
      }
      .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 7px;
      }
      .lb {
        color: var(--ink-soft);
        font-size: 11.5px;
        font-weight: 600;
      }
      .vl {
        font: 700 16px/1 var(--k-font-display);
        color: var(--ink);
      }
      .track {
        height: 10px;
        border-radius: 5px;
        overflow: hidden;
      }
      .fill {
        display: block;
        height: 100%;
        border-radius: 0 5px 5px 0;
        transition: width 0.35s ease;
      }
      .cap {
        margin: 7px 0 0;
        color: var(--ink-faint);
        font-size: 10.5px;
        line-height: 1.5;
      }
    `
  ]
})
export class MeterComponent {
  @Input() label = '';
  @Input() caption = '';
  /** 'percent' shows value/max as a share; 'count' shows "12 of 40". */
  @Input() format: 'percent' | 'count' = 'percent';

  readonly value = input<number>(0);
  readonly max = input<number>(100);
  readonly color = input<string>('#2a78d6');

  readonly pct = computed(() => {
    const max = this.max();
    if (max <= 0) return 0;
    return Math.max(0, Math.min(100, (this.value() / max) * 100));
  });

  /** A lighter step of the fill's own hue, not neutral grey. */
  readonly trackColor = computed(() => `${this.color()}1f`);

  readonly display = computed(() =>
    this.format === 'count' ? `${this.value()} of ${this.max()}` : `${Math.round(this.pct())}%`
  );
}

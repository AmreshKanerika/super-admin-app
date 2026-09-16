import { Component, Input, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

type Tone = 'success' | 'warning' | 'critical' | 'accent' | '';

@Component({
  selector: 'app-metric-tile',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a class="tile" [class]="appliedTone()" [routerLink]="link" [queryParams]="queryParams">
      <p class="tl">{{ label }}</p>
      <p class="tv mono">{{ value }}</p>
      <!-- Always rendered, even when empty: showing it on only one tile made that tile taller and
           pushed its number off the baseline the rest of the row shares. -->
      <p class="td">{{ delta || ' ' }}</p>
    </a>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .tile {
        display: flex;
        flex-direction: column;
        height: 100%;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 16px 18px;
        background: var(--paper-raised);
        text-decoration: none;
        color: inherit;
        transition: border-color 0.12s ease, box-shadow 0.12s ease;
      }
      .tile:hover {
        border-color: var(--line-strong);
        box-shadow: var(--shadow-sm);
        text-decoration: none;
      }
      .tl {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--ink-faint);
        margin: 0 0 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tv {
        font-size: 26px;
        font-weight: 700;
        color: var(--ink);
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .td {
        margin-top: 6px;
        font-size: 11px;
        line-height: 1.4;
        color: var(--ink-faint);
      }
      /* Tone is applied only where the number itself carries meaning — see appliedTone(). */
      .success .tv {
        color: var(--success);
      }
      .warning .tv {
        color: var(--warning);
      }
      .critical .tv {
        color: var(--critical);
      }
      .accent .tv {
        color: var(--accent-ink);
      }
    `
  ]
})
export class MetricTileComponent {
  @Input() label = '';
  @Input() delta = '';
  @Input() link: string | any[] = [];
  @Input() queryParams: Record<string, string> | null = null;

  private readonly currentValue = signal<string | number>('');
  private readonly currentTone = signal<Tone>('');

  @Input()
  set value(value: string | number) {
    this.currentValue.set(value);
  }

  get value(): string | number {
    return this.currentValue();
  }

  @Input()
  set tone(tone: Tone) {
    this.currentTone.set(tone);
  }

  get tone(): Tone {
    return this.currentTone();
  }

  // A zero count of things that need attention is good news, so colouring it amber or red cries
  // wolf. Warning and critical tones are dropped at zero; success and accent are identity colours
  // for the metric and always apply.
  readonly appliedTone = computed<Tone>(() => {
    const tone = this.currentTone();
    const isAlertTone = tone === 'warning' || tone === 'critical';
    return isAlertTone && Number(this.currentValue()) === 0 ? '' : tone;
  });
}

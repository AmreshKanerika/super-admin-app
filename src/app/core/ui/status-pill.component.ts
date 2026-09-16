import { Component, Input } from '@angular/core';
import { Tone } from '../status.util';

@Component({
  selector: 'app-status-pill',
  standalone: true,
  template: `<span class="pill" [class]="tone">{{ label }}</span>`,
  styles: [
    `
      .pill {
        display: inline-flex;
        align-items: center;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 20px;
        letter-spacing: 0.01em;
        line-height: 1.5;
      }
      .success {
        background: var(--success-soft);
        color: var(--success);
      }
      .warning {
        background: var(--warning-soft);
        color: var(--warning);
      }
      .critical {
        background: var(--critical-soft);
        color: var(--critical);
      }
      .accent {
        background: var(--accent-soft);
        color: var(--accent-ink);
      }
      .neutral {
        background: var(--paper-sunken);
        color: var(--ink-soft);
      }
    `
  ]
})
export class StatusPillComponent {
  @Input() label = '';
  @Input() tone: Tone = 'neutral';
}

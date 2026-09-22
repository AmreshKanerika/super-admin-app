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
        font-size: 11.5px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 20px;
        letter-spacing: 0.01em;
        line-height: 1.5;
      }
      .success {
        background: var(--success-soft);
        color: #176b4d;
      }
      .warning {
        background: var(--warning-soft);
        color: #825c0a;
      }
      .critical {
        background: var(--critical-soft);
        color: #a63340;
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

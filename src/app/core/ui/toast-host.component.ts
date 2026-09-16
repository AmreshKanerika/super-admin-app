import { Component, inject } from '@angular/core';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
    <div class="toast-stack" aria-live="polite" aria-relevant="additions">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="toast"
          [class]="t.tone"
          [attr.role]="t.tone === 'critical' ? 'alert' : 'status'"
          (mouseenter)="toast.pause(t.id)"
          (mouseleave)="toast.resume(t.id)"
          (focusin)="toast.pause(t.id)"
          (focusout)="toast.resume(t.id)">
          <span class="toast-icon" aria-hidden="true">
            <i
              class="ti"
              [class.ti-check]="t.tone === 'success'"
              [class.ti-alert-triangle]="t.tone === 'critical'"
              [class.ti-info-circle]="t.tone === 'neutral'"></i>
          </span>

          <div class="toast-body">
            <p class="toast-title">{{ title(t.tone) }}</p>
            <p class="toast-text">{{ t.message }}</p>
          </div>

          <button type="button" class="toast-close" (click)="toast.dismiss(t.id)" aria-label="Dismiss">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>

          <span class="toast-timer" [style.animation-duration.ms]="t.durationMs" aria-hidden="true"></span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* Top-right: where a console user's eye already is after clicking an action in the header
         strip, and the convention in the tools this sits alongside. The stack grows downward as
         toasts arrive, so a new one never shifts the one currently being read. */
      .toast-stack {
        position: fixed;
        top: 18px;
        right: 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 400;
        pointer-events: none;
        width: min(380px, calc(100vw - 32px));
      }

      .toast {
        position: relative;
        overflow: hidden;
        pointer-events: auto;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: flex-start;
        gap: 12px;
        padding: 13px 13px 14px 14px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: var(--paper-raised);
        color: var(--ink);
        box-shadow: 0 12px 32px rgba(35, 16, 54, 0.16), 0 2px 6px rgba(35, 16, 54, 0.06);
        animation: toast-in 0.26s cubic-bezier(0.21, 1, 0.3, 1);
      }

      .toast-icon {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        flex: none;
        border-radius: 9px;
        font-size: 17px;
      }

      .toast-body {
        min-width: 0;
        padding-top: 1px;
      }

      .toast-title {
        margin: 0;
        font-size: 12.5px;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1.3;
      }

      .toast-text {
        margin: 3px 0 0;
        font-size: 12.5px;
        line-height: 1.45;
        color: var(--ink-soft);
        overflow-wrap: anywhere;
      }

      .toast-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        flex: none;
        border: none;
        border-radius: 6px;
        background: none;
        color: var(--ink-faint);
        cursor: pointer;
        font-size: 14px;
      }

      .toast-close:hover {
        background: var(--paper-sunken);
        color: var(--ink);
      }

      /* Tone lives in the icon chip and the timer, not in a slab of colour behind the text —
         the message stays as readable as body copy. */
      .toast.success .toast-icon {
        background: var(--success-soft);
        color: #1f7a45;
      }
      .toast.critical .toast-icon {
        background: var(--critical-soft);
        color: var(--critical);
      }
      .toast.neutral .toast-icon {
        background: var(--accent-soft);
        color: var(--accent-ink);
      }

      .toast-timer {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 2px;
        width: 100%;
        transform-origin: left center;
        animation-name: toast-timer;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
      }

      .toast.success .toast-timer {
        background: var(--success);
      }
      .toast.critical .toast-timer {
        background: var(--critical);
      }
      .toast.neutral .toast-timer {
        background: var(--accent);
      }

      /* The bar must stop with the countdown it represents, or it would empty while the toast
         stays open under the pointer. */
      .toast:hover .toast-timer,
      .toast:focus-within .toast-timer {
        animation-play-state: paused;
      }

      /* Drops in from above rather than sliding up, matching where the stack now lives. */
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translate3d(0, -10px, 0) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      @keyframes toast-timer {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }

      @media (max-width: 560px) {
        .toast-stack {
          top: 12px;
          right: 12px;
          left: 12px;
          width: auto;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .toast {
          animation: none;
        }
        .toast-timer {
          display: none;
        }
      }
    `
  ]
})
export class ToastHostComponent {
  toast = inject(ToastService);

  title(tone: 'success' | 'critical' | 'neutral'): string {
    if (tone === 'success') return 'Done';
    if (tone === 'critical') return "That didn't work";
    return 'Heads up';
  }
}

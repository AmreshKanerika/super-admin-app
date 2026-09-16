import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../confirm.service';
import { ModalShellComponent } from './modal-shell.component';

@Component({
  selector: 'app-confirm-host',
  standalone: true,
  imports: [FormsModule, ModalShellComponent],
  template: `
    @if (confirm.active(); as req) {
      <app-modal-shell [title]="req.title" [width]="520" (close)="cancel()">
        @if (req.message) {
          <p class="msg">{{ req.message }}</p>
        }
        @if (req.diffLines?.length) {
          <div class="diff">
            @for (line of req.diffLines; track line.label) {
              <div class="diff-row">
                <span class="diff-label">{{ line.label }}</span>
                <span class="diff-from mono">{{ line.from }}</span>
                <span class="arrow">→</span>
                <span class="diff-to mono">{{ line.to }}</span>
              </div>
            }
          </div>
        }
        @if (req.reasonRequired) {
          <div class="field" style="margin-top:14px">
            <label>Reason</label>
            <textarea class="input" rows="3" [(ngModel)]="reason" placeholder="Why is this change being made?"></textarea>
          </div>
        }
        @if (req.extraInput) {
          <div class="field" style="margin-top:14px">
            <label>{{ req.extraInput.label || 'Value' }}</label>
            @if (req.extraInput.type === 'date') {
              <input type="date" class="input" [(ngModel)]="extraInputValue" [min]="req.extraInput.min" [max]="req.extraInput.max" />
            } @else if (req.extraInput.type === 'number') {
              <input type="number" class="input" [(ngModel)]="extraInputValue" [min]="req.extraInput.min" [max]="req.extraInput.max" />
            } @else {
              <input type="text" class="input" [(ngModel)]="extraInputValue" />
            }
          </div>
        }
        @if (req.requireTypedText) {
          <div class="field" style="margin-top:14px">
            <label>Type <span class="mono">{{ req.requireTypedText }}</span> to confirm</label>
            <input class="input mono" [(ngModel)]="typedText" [placeholder]="req.requireTypedText" [disabled]="busy()" />
          </div>
        }
        @if (error()) {
          <p class="confirm-error">{{ error() }}</p>
        }
        <div class="actions">
          <button type="button" class="btn ghost" [disabled]="busy()" (click)="cancel()">{{ req.cancelLabel || 'Cancel' }}</button>
          <button
            type="button"
            class="btn"
            [class.danger]="req.danger"
            [class.solid]="req.danger"
            [class.primary]="!req.danger"
            [disabled]="!canConfirm()"
            (click)="confirmIt()"
          >
            @if (busy()) {
              <i class="ti ti-loader-2 spin"></i>
            }
            {{ busy() ? 'Working…' : (req.confirmLabel || 'Confirm') }}
          </button>
        </div>
      </app-modal-shell>
    }
  `,
  styles: [
    `
      .msg {
        font-size: 13.5px;
        color: var(--ink-soft);
        line-height: 1.6;
      }
      .diff {
        margin-top: 14px;
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }
      .diff-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 10px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--line);
        font-size: 12.5px;
      }
      .diff-row:last-child {
        border-bottom: none;
      }
      .diff-label {
        flex: 1;
        min-width: 100px;
        color: var(--ink-soft);
      }
      @media (max-width: 420px) {
        .diff-label {
          flex: 1 1 100%;
        }
      }
      .diff-from {
        color: var(--ink-faint);
      }
      .arrow {
        color: var(--ink-faint);
      }
      .diff-to {
        color: var(--accent-ink);
        font-weight: 600;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 22px;
      }
      .confirm-error {
        margin: 14px 0 0;
        padding: 10px 14px;
        border-radius: var(--radius-sm);
        background: var(--critical-soft);
        color: var(--critical);
        font-size: 13px;
      }
      .spin {
        animation: confirm-host-spin 0.8s linear infinite;
      }
      @keyframes confirm-host-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `
  ]
})
export class ConfirmHostComponent {
  confirm = inject(ConfirmService);
  reason = '';
  typedText = '';
  busy = signal(false);
  error = signal('');
  // holds the extra input value when confirm dialog requests one (date string or number)
  extraInputValue: any = null;

  constructor() {
    // Seeds the field with the caller's suggested default (e.g. "current end date + 90 days") the
    // instant a new request opens — without this the input rendered empty even though the diff
    // preview above it showed a sensible target date, so Confirm stayed disabled until the admin
    // manually picked a date matching what the preview already implied.
    effect(() => {
      const req = this.confirm.active();
      if (req?.extraInput) {
        this.extraInputValue = req.extraInput.value ?? null;
      }
    });
  }

  canConfirm(): boolean {
    const req = this.confirm.active();
    if (!req) return false;
    if (this.busy()) return false;
    if (req.reasonRequired && this.reason.trim().length === 0) return false;
    if (req.requireTypedText && this.typedText !== req.requireTypedText) return false;
    if (req.extraInput && (this.extraInputValue === null || this.extraInputValue === undefined || String(this.extraInputValue).trim() === '')) return false;
    return true;
  }

  async confirmIt(): Promise<void> {
    const req = this.confirm.active();
    if (!req) return;

    if (!req.onConfirm) {
      this.confirm.resolve({ confirmed: true, reason: this.reason });
      this.reset();
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      await req.onConfirm(this.reason, this.extraInputValue);
      this.confirm.resolve({ confirmed: true, reason: this.reason });
      this.reset();
    } catch (err: unknown) {
      this.busy.set(false);
      const httpError = err as { error?: { message?: string }; message?: string };
      this.error.set(httpError?.error?.message || httpError?.message || 'Something went wrong — try again.');
    }
  }

  cancel(): void {
    if (this.busy()) return;
    this.confirm.resolve({ confirmed: false });
    this.reset();
  }

  private reset(): void {
    this.reason = '';
    this.typedText = '';
    this.extraInputValue = null;
    this.busy.set(false);
    this.error.set('');
  }
}

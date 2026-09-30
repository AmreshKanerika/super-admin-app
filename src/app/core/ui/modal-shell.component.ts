import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-modal-shell',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="backdrop" (click)="close.emit()">
      <div class="panel" role="dialog" aria-modal="true" [attr.aria-label]="heading" [style.maxWidth.px]="width" (click)="$event.stopPropagation()">
        <div class="head">
          <span class="head-icon" *ngIf="icon" aria-hidden="true"><i [class]="'ti ' + icon"></i></span>
          <div class="head-text">
            <h3>{{ heading }}</h3>
            <p class="subtitle" *ngIf="subtitle">{{ subtitle }}</p>
          </div>
          <button type="button" class="x" (click)="close.emit()" aria-label="Close" title="Close">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="body">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(19, 26, 31, 0.45);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 100;
        animation: fade-in 0.14s ease-out;
      }
      .panel {
        background: var(--paper-raised);
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.08);
        width: 100%;
        max-height: 88vh;
        max-height: 88dvh;
        /* Header stays put; only the body scrolls, so content never slides up behind or above it. */
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: rise-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .head {
        flex: none;
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 18px 22px;
        border-bottom: 1px solid var(--line);
        background: var(--paper-raised);
      }
      .head-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        flex-shrink: 0;
        border-radius: 11px;
        background: var(--accent);
        color: #fff;
        font-size: 19px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
      }
      .head-text {
        flex: 1;
        min-width: 0;
      }
      .head h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }
      .subtitle {
        margin: 2px 0 0;
        font-size: 12.5px;
        color: var(--ink-faint);
        overflow-wrap: anywhere;
      }
      .x {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        border: 1px solid var(--limit-design-line);
        border-radius: 50%;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 18px;
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
      }
      .x:hover {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }
      .x:active {
        transform: scale(0.94);
      }
      .x:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 22px;
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes rise-in {
        from { opacity: 0; transform: translateY(8px) scale(0.985); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .backdrop, .panel { animation: none; }
      }
      @media (max-width: 480px) {
        .backdrop { padding: 12px; }
        .head, .body { padding: 16px; }
        .head-icon { width: 34px; height: 34px; font-size: 17px; }
        .x { width: 44px; height: 44px; }
      }
    `
  ]
})
export class ModalShellComponent {
  @Input() heading = '';
  /** Optional second line under the heading. */
  @Input() subtitle = '';
  /** Optional Tabler icon class for a badge beside the heading, e.g. 'ti-user-plus'. */
  @Input() icon = '';
  @Input() width = 640;
  @Output() close = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.close.emit();
  }
}

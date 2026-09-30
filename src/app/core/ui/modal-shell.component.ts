import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-modal-shell',
  standalone: true,
  template: `
    <div class="backdrop" (click)="close.emit()">
      <div class="panel" [style.maxWidth.px]="width" (click)="$event.stopPropagation()">
        <div class="head">
          <h3>{{ heading }}</h3>
          <button type="button" class="x" (click)="close.emit()" aria-label="Close">✕</button>
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
        background: rgba(19, 26, 31, 0.42);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 100;
      }
      .panel {
        background: var(--paper-raised);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        width: 100%;
        max-height: 88vh;
        max-height: 88dvh;
        overflow-y: auto;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 22px;
        border-bottom: 1px solid var(--line);
        background: var(--paper-raised);
      }
      .head h3 {
        font-size: 16px;
      }
      .x {
        border: none;
        background: none;
        font-size: 14px;
        color: var(--ink-faint);
        cursor: pointer;
        padding: 4px;
        line-height: 1;
      }
      .x:hover {
        color: var(--ink);
      }
      .body {
        padding: 22px;
      }
      @media (max-width: 480px) {
        .backdrop { padding: 12px; }
        .head, .body { padding: 16px; }
        .x { min-width: 44px; min-height: 44px; }
      }
    `
  ]
})
export class ModalShellComponent {
  @Input() heading = '';
  @Input() width = 640;
  @Output() close = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.close.emit();
  }
}

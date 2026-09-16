import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-toggle-switch',
  standalone: true,
  template: `
    <button
      type="button"
      class="toggle"
      [class.on]="checked"
      [class.disabled]="disabled"
      [disabled]="disabled"
      role="switch"
      [attr.aria-checked]="checked"
      [attr.aria-label]="ariaLabel"
      (click)="flip()"
    >
      <span class="knob"></span>
    </button>
  `,
  styles: [
    `
      .toggle {
        width: 34px;
        height: 19px;
        border-radius: 20px;
        background: var(--line-strong);
        border: none;
        position: relative;
        cursor: pointer;
        padding: 0;
        flex: 0 0 auto;
        transition: background-color 0.12s ease;
      }
      .toggle.on {
        background: var(--accent);
      }
      .toggle.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        transition: left 0.12s ease;
      }
      .toggle.on .knob {
        left: 17px;
      }
    `
  ]
})
export class ToggleSwitchComponent {
  @Input() checked = false;
  @Input() disabled = false;
  @Input() ariaLabel = 'Toggle';
  @Output() checkedChange = new EventEmitter<boolean>();

  flip(): void {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.checkedChange.emit(this.checked);
  }
}

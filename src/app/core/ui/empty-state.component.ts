import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="empty">
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
      <div class="empty-action">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      .empty {
        text-align: center;
        padding: 56px 24px;
        border: 1px dashed var(--line-strong);
        border-radius: var(--radius);
        background: var(--paper-raised);
      }
      h3 {
        font-size: 15px;
        margin-bottom: 6px;
      }
      p {
        font-size: 13px;
        color: var(--ink-soft);
        max-width: 46ch;
        margin: 0 auto;
      }
      .empty-action {
        margin-top: 16px;
        display: flex;
        justify-content: center;
      }
    `
  ]
})
export class EmptyStateComponent {
  @Input() title = 'Nothing here yet';
  @Input() message = '';
}

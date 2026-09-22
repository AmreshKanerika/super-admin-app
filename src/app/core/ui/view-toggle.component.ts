import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewMode } from '../view-mode.service';

/**
 * Cards / list switch, shared by every browsing screen so the control sits in the same place and
 * behaves the same way on all of them.
 *
 * Icon-only by design — two labelled buttons would out-weigh the filters they sit beside — but
 * each carries a real accessible name and `aria-pressed`, so it is never icon-alone for anyone
 * reading it through assistive technology.
 */
@Component({
  selector: 'app-view-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="vt" role="group" [attr.aria-label]="label()">
      <button
        type="button"
        class="vt-btn"
        [class.on]="mode() === 'cards'"
        [attr.aria-pressed]="mode() === 'cards'"
        title="Card view"
        (click)="modeChange.emit('cards')"
      >
        <i class="ti ti-layout-grid" aria-hidden="true"></i>
        <span class="sr-only">Card view</span>
      </button>
      <button
        type="button"
        class="vt-btn"
        [class.on]="mode() === 'list'"
        [attr.aria-pressed]="mode() === 'list'"
        title="List view"
        (click)="modeChange.emit('list')"
      >
        <i class="ti ti-list" aria-hidden="true"></i>
        <span class="sr-only">List view</span>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
      .vt {
        display: inline-flex;
        gap: 2px;
        padding: 3px;
        border: 1px solid var(--line);
        border-radius: 9px;
        background: var(--paper-sunken);
      }
      .vt-btn {
        display: grid;
        place-items: center;
        width: 30px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--ink-faint);
        font-size: 16px;
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease;
      }
      .vt-btn:hover {
        color: var(--ink-soft);
      }
      /* The selected side is lifted onto the surface rather than merely tinted, so which
         view is active survives a glance at low contrast. */
      .vt-btn.on {
        background: var(--paper-raised);
        color: var(--accent-ink);
        box-shadow: 0 1px 3px rgba(40, 20, 60, 0.13);
      }
      .vt-btn:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    `
  ]
})
export class ViewToggleComponent {
  readonly mode = input<ViewMode>('list');
  readonly label = input<string>('View mode');
  readonly modeChange = output<ViewMode>();
}

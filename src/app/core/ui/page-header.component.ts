import { Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="ph">
      <button class="back-btn" *ngIf="showBack" (click)="goBack()" aria-label="Back" title="Back">
        <i class="ti ti-arrow-left" aria-hidden="true"></i>
      </button>
      <div class="ph-text">
        <p class="eyebrow" *ngIf="eyebrow">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <p class="sub" *ngIf="subtitle">{{ subtitle }}</p>
      </div>
      <div class="ph-actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .ph {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 24px;
        padding: 22px 24px 20px;
        border: none;
        border-radius: 17px;
        background: var(--ui-header-grad);
        color: #fff;
        box-shadow: 0 10px 24px rgba(66, 26, 99, 0.13);
        flex-wrap: wrap;
      }

      // A header can carry several action buttons (e.g. a plan's Assign/Edit/Clone/Delete/Archive
      // row) — on a narrow viewport those must drop to their own row instead of forcing the whole
      // page to scroll horizontally.
      .ph-actions {
        flex-wrap: wrap;
      }

      @media (max-width: 640px) {
        .ph-text {
          flex-basis: 100%;
        }
        .ph-actions {
          flex-basis: 100%;
          justify-content: flex-start;
        }
      }

      .back-btn {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.14);
        border-radius: var(--radius, 8px);
        border: 1px solid rgba(255, 255, 255, 0.34);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        color: #fff;
        transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      }
      .back-btn:hover { background: rgba(255, 255, 255, 0.26); border-color: rgba(255, 255, 255, 0.55); }
      .back-btn:active { background: rgba(255, 255, 255, 0.34); }
      .back-btn:focus-visible { outline: 2px solid #ffe0c9; outline-offset: 2px; }

      // Buttons projected into the band sit on violet, so the neutral variants need to invert.
      .ph-actions ::ng-deep .btn.ghost {
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.34);
        color: #fff;
      }
      .ph-actions ::ng-deep .btn.ghost:hover {
        background: rgba(255, 255, 255, 0.26);
      }
      .ph-actions ::ng-deep .btn.primary {
        background: #fff;
        border-color: #fff;
        color: #7937a8;
      }
      .ph-actions ::ng-deep .btn.primary:hover {
        background: #f6ecfb;
        border-color: #f6ecfb;
      }
      .ph-actions ::ng-deep .btn.danger {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 220, 220, 0.6);
        color: #ffe3e3;
      }
      .ph-actions ::ng-deep .btn.danger:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .ph-text {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .eyebrow {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        color: #f1dbff;
        margin: 0 0 6px 0;
        letter-spacing: 0.12em;
      }

      h1 {
        font-size: 22px;
        margin: 0;
        font-weight: 700;
        letter-spacing: -0.03em;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sub {
        font-size: 13px;
        color: #f0dcf4;
        margin-top: 6px;
        max-width: 62ch;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .ph-actions {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-shrink: 0;
      }

      @media (min-width: 1200px) {
        h1 { font-size: 28px; }
        .back-btn { width: 40px; height: 40px; font-size: 18px; }
      }
    `
  ]
})
export class PageHeaderComponent {
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() subtitle = '';
  @Input() showBack = false;
  @Input() backUrl: string | null = null;

  constructor(private location: Location, private router: Router) {}

  goBack(): void {
    if (this.backUrl) {
      this.router.navigateByUrl(this.backUrl);
    } else {
      this.location.back();
    }
  }
}

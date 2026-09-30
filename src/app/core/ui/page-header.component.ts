import { Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';
import { NavigationHistoryService } from '../navigation-history.service';


@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="ph colorful">
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
        border: 1px solid #e9e3ef;
        border-radius: 17px;
        background: linear-gradient(110deg, #f5f1fa, #fff 60%, #fbf5f8);
        color: var(--ink);
        box-shadow: 0 8px 24px rgba(40, 26, 65, 0.055);
        flex-wrap: wrap;
      }
      .ph.colorful {
        position: relative;
        overflow: hidden;
        gap: 28px;
        margin-bottom: 16px;
        padding: 30px 34px;
        border: 1px solid #80679a;
        border-radius: 20px;
        background: var(--ui-header-grad);
        color: #fff;
        box-shadow: 0 12px 28px rgba(66, 44, 104, 0.13);
      }
      .ph.colorful::after {
        content: '';
        position: absolute;
        right: -45px;
        bottom: -102px;
        width: 280px;
        height: 280px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 50%;
        box-shadow: 0 0 0 50px rgba(255, 255, 255, 0.035), 0 0 0 100px rgba(255, 255, 255, 0.025);
        pointer-events: none;
      }
      .ph.colorful > * { position: relative; z-index: 1; }
      .ph.colorful .eyebrow {
        margin: 0;
        color: #e2d2f6;
        font-size: 10px;
        letter-spacing: 0.14em;
      }
      .ph.colorful h1 {
        margin: 9px 0 6px;
        overflow: visible;
        text-overflow: clip;
        white-space: normal;
        overflow-wrap: anywhere;
        font: 700 clamp(26px, 2.6vw, 35px) / 1.12 var(--k-font-display);
        letter-spacing: -0.04em;
        color: #fff;
      }
      .ph.colorful .sub { margin: 0; font-size: 12.5px; line-height: 1.5; color: #f1e9f8; }
      .ph.colorful .back-btn { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.3); color: #fff; }
      .ph.colorful .back-btn:hover { background: rgba(255, 255, 255, 0.22); border-color: rgba(255, 255, 255, 0.55); }
      .ph.colorful .back-btn:focus-visible { outline-color: #fff; }
      .ph.colorful .ph-actions ::ng-deep .btn.ghost { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.35); color: #fff; }
      .ph.colorful .ph-actions ::ng-deep .btn.ghost:hover { background: rgba(255, 255, 255, 0.22); }
      .ph.colorful .ph-actions ::ng-deep .btn.primary { background: #fff; border-color: #fff; color: #674189; }
      .ph.colorful .ph-actions ::ng-deep .btn.primary:hover { background: #f3eaf8; border-color: #f3eaf8; }
      .ph.colorful .ph-actions ::ng-deep .btn.danger { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.4); color: #fff; }
      .ph.colorful .ph-actions ::ng-deep .btn.danger:hover { background: rgba(255, 255, 255, 0.22); }

      /* Allow action buttons to wrap on narrower screens. */
      .ph-actions {
        flex-wrap: wrap;
      }

      @media (max-width: 640px) {
        .ph.colorful { padding: 22px 18px; }
        .ph.colorful::after { right: -120px; opacity: 0.5; }
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
        background: #fff;
        border-radius: var(--radius, 8px);
        border: 1px solid var(--line-strong);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        color: var(--accent-ink);
        transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      }
      .back-btn:hover { background: var(--accent-soft); border-color: var(--accent); }
      .back-btn:active { background: var(--ui-violet-soft); }
      .back-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

      /* Keep projected actions legible on the light header. */
      .ph-actions ::ng-deep .btn.ghost {
        background: #fff;
        border-color: var(--line-strong);
        color: var(--ink);
      }
      .ph-actions ::ng-deep .btn.ghost:hover {
        background: var(--accent-soft);
      }
      .ph-actions ::ng-deep .btn.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }
      .ph-actions ::ng-deep .btn.primary:hover {
        background: var(--accent-hover);
        border-color: var(--accent-hover);
      }
      .ph-actions ::ng-deep .btn.danger {
        background: #fff;
        border-color: var(--critical);
        color: #a92f3c;
      }
      .ph-actions ::ng-deep .btn.danger:hover {
        background: var(--critical-soft);
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
        color: var(--accent-ink);
        margin: 0 0 6px 0;
        letter-spacing: 0.12em;
      }

      h1 {
        font-size: 22px;
        margin: 0;
        font-weight: 700;
        letter-spacing: -0.03em;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sub {
        font-size: 13px;
        color: var(--ink-soft);
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
        flex-wrap: wrap;
        max-width: 100%;
        gap: 10px;
        align-items: center;
        flex-shrink: 0;
      }

      @media (min-width: 1200px) {
        h1 { font-size: 28px; }
        .back-btn { width: 40px; height: 40px; font-size: 18px; }
      }
      @media (max-width: 640px) {
        .ph.colorful { padding: 20px 18px; gap: 16px; }
        .ph-actions { width: 100%; gap: 8px; }
        .ph-actions ::ng-deep .btn { white-space: normal; min-height: 44px; }
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

  constructor(private navigationHistory: NavigationHistoryService) {}

  goBack(): void {
    this.navigationHistory.back(this.backUrl);
  }
}

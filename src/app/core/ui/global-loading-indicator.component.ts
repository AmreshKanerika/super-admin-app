import { Component, effect, inject, signal } from '@angular/core';
import { LoadingService } from '../loading.service';

// The single "the app is talking to the server" indicator, driven by loadingInterceptor counting
// every HTTP request. A thin bar along the top rather than a full-screen blur, so one slow request
// never hides a page that has already rendered; a small pill joins it once a request is clearly slow.
@Component({
  selector: 'app-global-loading-indicator',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="gl-bar" role="progressbar" aria-label="Loading" aria-busy="true"><span></span></div>
    }
    @if (slow()) {
      <div class="gl-pill" role="status" aria-live="polite">
        <img src="assets/logos/flip-loader.svg" alt="" />
        <span>Loading…</span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .gl-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 300;
        height: 3px;
        overflow: hidden;
        background: rgba(106, 63, 177, 0.12);
        pointer-events: none;
      }
      .gl-bar span {
        position: absolute;
        inset: 0 auto 0 0;
        width: 40%;
        border-radius: 3px;
        background: linear-gradient(90deg, #6a3fb1, #c2417f);
        animation: gl-slide 1.1s ease-in-out infinite;
      }
      @keyframes gl-slide {
        from { transform: translateX(-100%); }
        to { transform: translateX(260%); }
      }
      .gl-pill {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 300;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 14px 7px 8px;
        border: 1px solid #e6e8f0;
        border-radius: 999px;
        background: #fff;
        color: #4b5468;
        font-size: 12.5px;
        font-weight: 600;
        box-shadow: 0 12px 30px rgba(42, 45, 86, 0.14);
        pointer-events: none;
      }
      .gl-pill img {
        display: block;
        width: 24px;
        height: 24px;
      }
      @media (prefers-reduced-motion: reduce) {
        .gl-bar span { animation: none; width: 100%; opacity: 0.6; }
      }
    `
  ]
})
export class GlobalLoadingIndicatorComponent {
  loading = inject(LoadingService);

  /** Shown after a short delay, so quick requests don't flash the bar. */
  readonly visible = signal(false);
  /** A request still running after a second gets the pill too. */
  readonly slow = signal(false);

  private showTimer?: ReturnType<typeof setTimeout>;
  private slowTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const busy = this.loading.isLoading();
      clearTimeout(this.showTimer);
      clearTimeout(this.slowTimer);
      if (busy) {
        this.showTimer = setTimeout(() => this.visible.set(true), 150);
        this.slowTimer = setTimeout(() => this.slow.set(true), 1000);
      } else {
        this.visible.set(false);
        this.slow.set(false);
      }
    }, { allowSignalWrites: true });
  }
}

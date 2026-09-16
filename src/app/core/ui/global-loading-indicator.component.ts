import { Component, inject } from '@angular/core';
import { LoadingService } from '../loading.service';

// The single "the app is talking to the server" indicator, driven by loadingInterceptor counting
// every HTTP request. Uses flip-ui's loader asset so the console reads as the same product.
@Component({
  selector: 'app-global-loading-indicator',
  standalone: true,
  template: `
    @if (loading.isLoading()) {
      <div class="gl-overlay" role="status" aria-live="polite" aria-label="Loading">
        <span class="gl-badge"><img src="assets/logos/flip-loader.svg" alt="" /></span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .gl-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 300;
        background: rgba(248, 249, 253, 0.58);
        backdrop-filter: blur(2px);
        pointer-events: none;
      }
      .gl-badge {
        display: grid;
        place-items: center;
        width: 76px;
        height: 76px;
        border: 1px solid #e6e8f0;
        border-radius: 20px;
        background: #fff;
        box-shadow: 0 18px 45px rgba(42, 45, 86, 0.12);
      }
      .gl-badge img {
        display: block;
        width: 48px;
        height: 48px;
      }
    `
  ]
})
export class GlobalLoadingIndicatorComponent {
  loading = inject(LoadingService);
}

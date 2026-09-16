import { Injectable, computed, signal } from '@angular/core';

// Backs a single global "something is loading" indicator instead of every component rolling its
// own local spinner — a plain in-flight counter (not a boolean) so two overlapping requests don't
// let the first one's completion hide the indicator while the second is still running.
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly activeRequests = signal(0);

  isLoading = computed(() => this.activeRequests() > 0);

  start(): void {
    this.activeRequests.update((n) => n + 1);
  }

  stop(): void {
    this.activeRequests.update((n) => Math.max(0, n - 1));
  }
}

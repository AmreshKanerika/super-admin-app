import { Injectable, Signal, computed, signal } from '@angular/core';

export type ViewMode = 'cards' | 'list';

const STORAGE_KEY = 'flip-console.view-modes.v2';

/**
 * Remembers whether each screen was last read as cards or as a list.
 *
 * Kept per screen rather than globally: the right default genuinely differs — Plans reads as
 * cards because a plan is a thing you browse, Subscriptions reads as a list because it is a
 * queue you scan. Forcing one choice across all four would make the toggle feel like a setting
 * rather than a preference.
 *
 * Persisted so the choice survives a reload, but every storage access is guarded: localStorage
 * throws in a private window and can come back empty after a cache clear, and a view preference
 * is never worth failing a screen over.
 */
@Injectable({ providedIn: 'root' })
export class ViewModeService {
  private readonly modes = signal<Record<string, ViewMode>>(readStoredModes());

  /** Reactive view mode for one screen, falling back until the reader chooses. */
  mode(screen: string, fallback: ViewMode): Signal<ViewMode> {
    return computed(() => this.modes()[screen] ?? fallback);
  }

  set(screen: string, mode: ViewMode): void {
    this.modes.update((current) => {
      const next = { ...current, [screen]: mode };
      writeStoredModes(next);
      return next;
    });
  }
}

function readStoredModes(): Record<string, ViewMode> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Anything unrecognised is dropped rather than trusted: this value is user-writable, and a
    // bad entry would otherwise render a screen with neither view showing.
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === 'cards' || value === 'list')
    ) as Record<string, ViewMode>;
  } catch {
    return {};
  }
}

function writeStoredModes(modes: Record<string, ViewMode>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modes));
  } catch {
    // Storage unavailable (private window, blocked site data). The choice still applies for
    // this session; only its persistence is lost.
  }
}

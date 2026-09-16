import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'critical' | 'neutral';
  durationMs: number;
}

let nextId = 1;

const TOAST_DURATION_MS = 5000;
const MAX_VISIBLE = 4;

interface Countdown {
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
  remainingMs: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  private countdowns = new Map<number, Countdown>();

  show(message: string, tone: Toast['tone'] = 'success', durationMs = TOAST_DURATION_MS): void {
    const toast: Toast = { id: nextId++, message, tone, durationMs };

    // A burst of toasts (e.g. saving several limit rows at once) should not cover the screen —
    // the oldest drop off rather than the stack growing without bound.
    this.toasts.update((list) => [...list, toast].slice(-MAX_VISIBLE));
    this.countdowns.forEach((_, id) => {
      if (!this.toasts().some((t) => t.id === id)) {
        this.clearCountdown(id);
      }
    });

    this.startCountdown(toast.id, durationMs);
  }

  // Reading a message shouldn't be a race against its own timer: hovering (or focusing the close
  // button) holds the toast open, and the remaining time resumes when the pointer leaves.
  pause(id: number): void {
    const countdown = this.countdowns.get(id);
    if (!countdown) {
      return;
    }
    clearTimeout(countdown.timer);
    countdown.remainingMs = Math.max(0, countdown.remainingMs - (Date.now() - countdown.startedAt));
  }

  resume(id: number): void {
    const countdown = this.countdowns.get(id);
    if (!countdown) {
      return;
    }
    this.startCountdown(id, countdown.remainingMs);
  }

  dismiss(id: number): void {
    this.clearCountdown(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private startCountdown(id: number, remainingMs: number): void {
    const existing = this.countdowns.get(id);
    if (existing) {
      clearTimeout(existing.timer);
    }
    this.countdowns.set(id, {
      timer: setTimeout(() => this.dismiss(id), remainingMs),
      startedAt: Date.now(),
      remainingMs
    });
  }

  private clearCountdown(id: number): void {
    const countdown = this.countdowns.get(id);
    if (countdown) {
      clearTimeout(countdown.timer);
      this.countdowns.delete(id);
    }
  }
}

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Application } from '../models';
import { ToastService } from '../core/toast.service';
import { API_BASE_URL } from '../core/api-config';

@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private readonly apps = signal<Application[]>([]);

  constructor() {
    this.http.get<Application[]>(`${API_BASE_URL}/platform/applications`).subscribe({
      next: (apps) => {
        console.info('Loaded applications from API, count=', apps?.length ?? 0);
        this.apps.set(apps);
      },
      error: (err) => {
        console.error('Failed to load applications', err);
        this.toast.show("Couldn't load the application catalog — check your connection and refresh.", 'critical');
      }
    });
  }

  list() {
    return this.apps;
  }

  roots(): Application[] {
    return this.apps().filter((a) => a.parentAppId === null);
  }

  childrenOf(appId: string): Application[] {
    return this.apps().filter((a) => a.parentAppId === appId);
  }

  byId(appId: string): Application | undefined {
    return this.apps().find((a) => a.appId === appId);
  }

  descendantsInclusive(appId: string): string[] {
    const children = this.childrenOf(appId).map((c) => c.appId);
    return [appId, ...children];
  }

  // Walks the full catalog tree to whatever depth it actually goes — a plan's applications aren't
  // just root + one level of children (e.g. Migration has its own children like "SSAS to Fabric"),
  // and anywhere that only checked roots()/childrenOf(root) one level deep silently dropped every
  // app past the second level.
  flattenedTree(): { app: Application; depth: number }[] {
    const result: { app: Application; depth: number }[] = [];
    const visit = (app: Application, depth: number) => {
      result.push({ app, depth });
      for (const child of this.childrenOf(app.appId)) visit(child, depth + 1);
    };
    for (const root of this.roots()) visit(root, 0);
    return result;
  }
}

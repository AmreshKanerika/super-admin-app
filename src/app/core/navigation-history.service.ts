import { Injectable, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';


@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private readonly router = inject(Router);
  private readonly pages: string[] = [];
  private browserTraversal = false;
  constructor() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) this.browserTraversal = event.navigationTrigger === 'popstate';
      if (event instanceof NavigationEnd) this.record(event.urlAfterRedirects, this.browserTraversal);
    });
  }
  record(url: string, browserTraversal = false): void {
    if (url.split('?')[0] === '/login') { this.pages.length = 0; return; }
    const last = this.pages[this.pages.length - 1];
    if (last?.split(/[?#]/)[0] === url.split(/[?#]/)[0]) {
      this.pages[this.pages.length - 1] = url;
      return;
    }
    const previous = this.pages.lastIndexOf(url);
    if (browserTraversal && previous >= 0) this.pages.splice(previous + 1);
    else this.pages.push(url);
  }
  back(fallback: string | null): void {
    const target = this.pages.length > 1 ? this.pages[this.pages.length - 2] : fallback || '/organizations';
    if (this.pages.length > 1) this.pages.pop();
    void this.router.navigateByUrl(target, { replaceUrl: true });
  }
}

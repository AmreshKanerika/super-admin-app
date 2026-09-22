import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, input, output } from '@angular/core';

@Component({
  selector: 'app-scroll-sentinel',
  standalone: true,
  template: `<div #anchor class="anchor" aria-hidden="true"></div>`,
  styles: [
    `
      :host {
        display: block;
      }
      .anchor {
        height: 1px;
      }
    `
  ]
})
export class ScrollSentinelComponent implements AfterViewInit, OnDestroy {
  readonly loadBeforeReachingBottomBy = input('420px');
  readonly reached = output<void>();

  @ViewChild('anchor', { static: true }) private anchor!: ElementRef<HTMLElement>;

  private observer?: IntersectionObserver;
  private pendingFrame = 0;

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.reached.emit();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.reached.emit();
        this.reobserveSoStillVisibleAnchorKeepsLoading();
      },
      { rootMargin: this.loadBeforeReachingBottomBy() }
    );

    this.observer.observe(this.anchor.nativeElement);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.pendingFrame);
    this.observer?.disconnect();
  }

  private reobserveSoStillVisibleAnchorKeepsLoading(): void {
    cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = requestAnimationFrame(() => {
      if (!this.observer) return;
      this.observer.unobserve(this.anchor.nativeElement);
      this.observer.observe(this.anchor.nativeElement);
    });
  }
}

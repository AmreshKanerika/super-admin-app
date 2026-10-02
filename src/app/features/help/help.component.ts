import { AfterViewInit, Component, HostListener, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { HELP_FAQ, HELP_GUIDES, HELP_STAGES, HelpFaq, HelpGuide, HelpStep } from './help-content';

interface Lightbox {
  src: string;
  title: string;
  caption?: string;
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss', './help-steps.scss']
})
export class HelpComponent implements AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);

  /** The whole guide and FAQ as one PDF, built from the same content by `npm run help:pdf`. */
  readonly pdfUrl = 'assets/help/flip-platform-console-user-guide.pdf';
  readonly stages = HELP_STAGES;
  readonly guides = HELP_GUIDES;

  search = signal('');
  activeId = signal(HELP_GUIDES[0].id);
  openFaq = signal<Set<number>>(new Set());
  lightbox = signal<Lightbox | null>(null);
  /** Remembered per browser, so a reader who prefers the wide view keeps it. */
  readingMode = signal(readPreference(READING_MODE_KEY));
  /** The contents panel on narrow screens, where it folds into one button. */
  tocOpen = signal(false);

  /** Guides shown with their steps. The rest show only their header, like a docs index. */
  openGuides = signal<Set<string>>(new Set([HELP_GUIDES[0].id]));
  /** Sidebar stage groups the reader has opened. The stage being read is always open. */
  openStages = signal<Set<string>>(new Set([HELP_GUIDES[0].stage]));

  private observer?: IntersectionObserver;
  private scrollIdleTimer?: ReturnType<typeof setTimeout>;

  /** True while the reader is scrolling, and for a moment after: the exit button steps aside. */
  scrolling = signal(false);

  // Captures scrolling of the app's content area as well as the window.
  private readonly onAnyScroll = () => {
    this.scrolling.set(true);
    clearTimeout(this.scrollIdleTimer);
    this.scrollIdleTimer = setTimeout(() => this.scrolling.set(false), 800);
  };

  private query = computed(() => this.search().trim().toLowerCase());

  allGuidesOpen = computed(() => this.guides.every((g) => this.openGuides().has(g.id)));

  constructor() {
    // The sidebar follows the reader like an accordion: the stage being read is open and the rest
    // fold away, scrolling down or up. A stage opened by hand stays open until the reader moves on.
    effect(() => {
      const stage = this.activeStage();
      untracked(() => this.openStages.set(new Set([stage])));
    });
    // Keep the highlighted guide visible inside the sidebar's own scroll area.
    effect(() => {
      this.activeId();
      untracked(() => setTimeout(() => this.revealActiveLink()));
    });
  }

  activeGuideTitle = computed(() => this.guides.find((g) => g.id === this.activeId())?.title ?? 'Guides');

  private revealActiveLink(): void {
    const toc = document.querySelector<HTMLElement>('.toc');
    const link = toc?.querySelector<HTMLElement>('.toc-link.active');
    if (!toc || !link || toc.scrollHeight <= toc.clientHeight) return;
    const top = link.offsetTop;
    const bottom = top + link.offsetHeight;
    if (top < toc.scrollTop + 60 || bottom > toc.scrollTop + toc.clientHeight - 20) {
      toc.scrollTo({ top: Math.max(0, top - toc.clientHeight / 3), behavior: 'smooth' });
    }
  }

  /** A search shows every match in full, so nothing it found is hidden behind a toggle. */
  isGuideOpen(id: string): boolean {
    return !!this.query() || this.openGuides().has(id);
  }

  isStageOpen(id: string): boolean {
    return !!this.query() || this.openStages().has(id);
  }

  toggleGuide(id: string): void {
    const next = new Set(this.openGuides());
    next.has(id) ? next.delete(id) : next.add(id);
    this.openGuides.set(next);
    setTimeout(() => this.observeSections());
  }

  toggleStage(id: string): void {
    const next = new Set(this.openStages());
    next.has(id) ? next.delete(id) : next.add(id);
    this.openStages.set(next);
  }

  expandAllGuides(open: boolean): void {
    this.openGuides.set(open ? new Set(this.guides.map((g) => g.id)) : new Set());
    setTimeout(() => this.observeSections());
  }

  visibleGuides = computed(() => {
    const q = this.query();
    return q ? this.guides.filter((g) => guideText(g).includes(q)) : this.guides;
  });

  faq = computed(() => {
    const q = this.query();
    const items = HELP_FAQ.map((item, index) => ({ ...item, index })).filter(
      (item) => !q || `${item.q} ${item.a} ${item.group}`.toLowerCase().includes(q)
    );
    const groups: { name: string; items: (HelpFaq & { index: number })[] }[] = [];
    for (const item of items) {
      let group = groups.find((g) => g.name === item.group);
      if (!group) groups.push((group = { name: item.group, items: [] }));
      group.items.push(item);
    }
    return groups;
  });

  faqCount = computed(() => this.faq().reduce((n, g) => n + g.items.length, 0));

  /** Table of contents grouped by lifecycle stage, following the search filter. */
  toc = computed(() =>
    this.stages
      .map((stage) => ({ stage, guides: this.visibleGuides().filter((g) => g.stage === stage.id) }))
      .filter((entry) => entry.guides.length)
  );

  activeStage = computed(() => this.guides.find((g) => g.id === this.activeId())?.stage ?? this.stages[0].id);

  stageNumber(stageId: string): number {
    return this.stages.findIndex((s) => s.id === stageId) + 1;
  }

  stageLabel(stageId: string): string {
    return this.stages.find((s) => s.id === stageId)?.label ?? '';
  }

  guideTitle(id?: string): string {
    return this.guides.find((g) => g.id === id)?.title ?? '';
  }

  ngAfterViewInit(): void {
    const fragment = this.route.snapshot.fragment;
    if (fragment) setTimeout(() => this.scrollTo(fragment, 'auto'));
    this.observeSections();
    document.addEventListener('scroll', this.onAnyScroll, { capture: true, passive: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    clearTimeout(this.scrollIdleTimer);
    document.removeEventListener('scroll', this.onAnyScroll, { capture: true });
  }

  scrollTo(id: string, behavior: ScrollBehavior = 'smooth'): void {
    this.tocOpen.set(false);
    // Opening a guide from the sidebar or an FAQ link shows its steps, then scrolls once laid out.
    if (this.guides.some((g) => g.id === id) && !this.openGuides().has(id)) {
      this.openGuides.set(new Set([...this.openGuides(), id]));
      setTimeout(() => this.scrollTo(id, behavior));
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior, block: 'start' });
    if (this.guides.some((g) => g.id === id)) this.activeId.set(id);
    history.replaceState(null, '', `${location.pathname}#${id}`);
  }

  onSearch(value: string): void {
    this.search.set(value);
    setTimeout(() => {
      if (value.trim()) document.querySelector('.help-layout')?.scrollIntoView({ block: 'start' });
      this.observeSections();
    });
  }

  toggleFaq(index: number): void {
    const next = new Set(this.openFaq());
    next.has(index) ? next.delete(index) : next.add(index);
    this.openFaq.set(next);
  }

  expandAllFaq(open: boolean): void {
    this.openFaq.set(open ? new Set(HELP_FAQ.map((_, i) => i)) : new Set());
  }

  openImage(guide: HelpGuide, step: HelpStep): void {
    if (step.image) this.lightbox.set({ src: step.image, title: `${guide.title} — ${step.title}`, caption: step.caption });
  }

  @HostListener('document:keydown.escape')
  closeImage(): void {
    // Esc closes an enlarged screenshot first; otherwise it leaves reading mode.
    if (this.lightbox()) {
      this.lightbox.set(null);
    } else if (this.readingMode()) {
      this.toggleReadingMode();
    }
  }

  /** Maximise: hide the contents sidebar so the guide uses the full width. */
  toggleReadingMode(): void {
    const next = !this.readingMode();
    this.readingMode.set(next);
    writePreference(READING_MODE_KEY, next);
    setTimeout(() => this.observeSections());
  }

  /** Highlights the guide being read in the table of contents. */
  private observeSections(): void {
    this.observer?.disconnect();
    if (typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) this.activeId.set(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    document.querySelectorAll('.guide[id]').forEach((el) => this.observer!.observe(el));
  }
}

function guideText(g: HelpGuide): string {
  return [
    g.title,
    g.summary,
    g.where.label,
    ...g.steps.flatMap((s) => [s.title, s.text, s.result ?? '', ...(s.actions ?? []), ...(s.fields ?? []).flatMap((f) => [f.name, f.hint])]),
    ...(g.notes ?? []).map((n) => n.text)
  ]
    .join(' ')
    .toLowerCase();
}

const READING_MODE_KEY = 'help-reading-mode';

function readPreference(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writePreference(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage can be unavailable (private mode); the toggle still works for this visit.
  }
}

import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalShellComponent } from '../../core/ui/modal-shell.component';
import { FormsModule } from '@angular/forms';
import { ApplicationDraft, ApplicationsService } from '../../services/applications.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { Application, Scope } from '../../models';
import { displayNameOrFallback } from '../../core/app-name.util';
import { TreeBranchComponent } from '../../core/ui/tree-branch.component';
import { allParentIds, buildTreeRows, collectAncestorIds } from '../../core/ui/app-tree.util';
import { AssignPlansComponent } from './assign-plans.component';
import { MigrationTypeFormComponent } from './migration-type-form.component';
import { MigrationTypeSaveResponse } from '../../models';

/** Mirrors com.flip.enums.Scopes. The server rejects anything outside this set. */
const ALL_SCOPES: Scope[] = ['ALL', 'VIEW', 'ADD', 'EDIT', 'EXECUTE', 'DELETE'];

const SCOPE_HINTS: Record<Scope, string> = {
  ALL: 'Everything below. Grant instead of, not alongside, the individual scopes.',
  VIEW: 'Open and read, without changing anything.',
  ADD: 'Create new items.',
  EDIT: 'Change items that already exist.',
  EXECUTE: 'Run the application — what runtime limits are counted against.',
  DELETE: 'Remove items permanently.'
};

/** A row of the catalogue tree: the app plus the structure needed to draw it. */
interface CatalogRow {
  app: Application;
  label: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  childCount: number;
  rails: boolean[];
  isLastChild: boolean;
  familyColourIndex: number;
  initial: string;
}

const FAMILY_COLOUR_COUNT = 6;

function lastRootIndexAtOrBefore(rows: readonly { depth: number }[], index: number): number {
  let rootsSeen = -1;
  for (let position = 0; position <= index; position++) {
    if (rows[position].depth === 0) rootsSeen++;
  }
  return Math.max(0, rootsSeen);
}

@Component({
  selector: 'app-applications',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    EmptyStateComponent,
    TreeBranchComponent,
    AssignPlansComponent,
    MigrationTypeFormComponent,
    ModalShellComponent
  ],
  templateUrl: './applications.component.html',
  styleUrls: ['./applications.component.scss', './application-editor.scss']
})
export class ApplicationsComponent {
  applications = inject(ApplicationsService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  readonly allScopes = ALL_SCOPES;
  readonly scopeHints = SCOPE_HINTS;

  readonly search = signal('');
  readonly justCreatedAppId = signal<string | null>(null);

  readonly saving = signal(false);

  // --- follow-up panels ------------------------------------------------------
  //
  // Held as ids and resolved against the live catalog, so a panel sees flags the server recomputes
  // after each write (migrationConfigured, planCount) rather than a stale snapshot.
  readonly assigningAppId = signal<string | null>(null);
  readonly migrationAppId = signal<string | null>(null);
  /** Set while walking the steps that follow creating an application. */
  readonly setupFlow = signal<{ appId: string; migration: boolean } | null>(null);

  readonly assigningApp = computed(() => {
    const id = this.assigningAppId();
    return id ? this.applications.byId(id) ?? null : null;
  });
  readonly migrationApp = computed(() => {
    const id = this.migrationAppId();
    return id ? this.applications.byId(id) ?? null : null;
  });

  readonly migrationStepLabel = computed(() => {
    const flow = this.setupFlow();
    return flow && flow.appId === this.migrationAppId() ? 'Step 2 of 3 · Migration details' : null;
  });
  readonly assignStepLabel = computed(() => {
    const flow = this.setupFlow();
    if (!flow || flow.appId !== this.assigningAppId()) return null;
    return flow.migration ? 'Step 3 of 3 · Subscription plans' : 'Step 2 of 2 · Subscription plans';
  });

  /** null = closed, 'new' = creating, otherwise the appId being edited. */
  readonly editing = signal<string | null>(null);

  // Signals, not plain fields. The validity computeds below read these, and a computed only
  // re-runs when a SIGNAL it reads changes — a plain field would leave them frozen at whatever
  // they evaluated to on first render (false, against an empty string), so every machine name
  // would look invalid forever and the Create button would never enable.
  readonly draftAppName = signal('');
  readonly draftDisplayName = signal('');
  readonly draftParentAppId = signal('');
  readonly draftScopes = signal<Set<Scope>>(new Set());

  /** True once the machine name has been typed in by hand, so auto-suggest stops overwriting it. */
  private appNameTouched = false;

  /** Apps whose children are showing. Empty means fully collapsed to top-level apps. */
  readonly expandedIds = signal<ReadonlySet<string>>(new Set<string>());

  /**
   * Ids matching the search, or null when there is none.
   *
   * Passed to the tree builder rather than used to filter a flat list: it opens the ancestors of
   * every match on its own, so a deeply nested app is found with the path that explains where it
   * lives instead of appearing as a context-free row.
   */
  private readonly matchedIds = computed<ReadonlySet<string> | null>(() => {
    const query = this.search().trim().toLowerCase();
    if (!query) return null;
    return new Set(
      this.applications
        .list()()
        .filter((app) => this.displayNameOf(app).toLowerCase().includes(query) || app.appName.toLowerCase().includes(query))
        .map((app) => app.appId)
    );
  });

  readonly rows = computed<CatalogRow[]>(() =>
    buildTreeRows(
      this.applications.list()(),
      { expandedIds: this.expandedIds(), matchedIds: this.matchedIds() },
      (first, second) => this.displayNameOf(first).localeCompare(this.displayNameOf(second))
    ).map((row) => ({
      app: row.item,
      label: this.displayNameOf(row.item),
      depth: row.depth,
      hasChildren: row.hasChildren,
      expanded: row.expanded,
      childCount: row.childCount,
      rails: row.rails,
      isLastChild: row.isLastChild,
      familyColourIndex: 0,
      initial: ''
    })).map((row, index, all) => {
      const rootIndex = lastRootIndexAtOrBefore(all, index);
      return {
        ...row,
        familyColourIndex: rootIndex % FAMILY_COLOUR_COUNT,
        initial: (row.label || row.app.appName || '?').trim().charAt(0).toUpperCase()
      };
    })
  );

  private readonly parentIds = computed(() => allParentIds(this.applications.list()()));

  readonly hasHierarchy = computed(() => this.parentIds().length > 0);
  readonly allExpanded = computed(() => {
    const parents = this.parentIds();
    const expanded = this.expandedIds();
    return parents.length > 0 && parents.every((appId) => expanded.has(appId));
  });

  trackByApplicationId = (_index: number, row: CatalogRow): string => row.app.appId;

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    // The follow-up panels handle their own Escape through app-modal-shell.
    if (this.assigningAppId() || this.migrationAppId()) return;
    if (this.editing() !== null && !this.saving()) this.cancel();
  }

  closeIfBackdropClicked(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.saving()) this.cancel();
  }

  toggleNode(appId: string): void {
    this.expandedIds.update((current) => {
      const next = new Set(current);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  expandAll(): void {
    this.expandedIds.set(new Set(this.parentIds()));
  }

  collapseAll(): void {
    this.expandedIds.set(new Set<string>());
  }

  readonly total = computed(() => this.applications.list()().length);

  /** Candidate parents for the current draft, minus the app itself and its descendants. */
  readonly parentOptions = computed(() => {
    const editingId = this.editing();
    const excluded = editingId && editingId !== 'new' ? new Set(this.descendantsOf(editingId)) : new Set<string>();
    return this.applications
      .flattenedTree()
      .filter(({ app }) => !excluded.has(app.appId))
      .map(({ app, depth }) => ({ app, depth, label: this.displayNameOf(app) }));
  });

  readonly isCreating = computed(() => this.editing() === 'new');

  /**
   * What the machine key will actually be stored as. The server upper-cases and swaps
   * spaces for underscores, so showing the result as it is typed stops the first
   * attempt being a surprise.
   */
  readonly normalisedAppName = computed(() => this.draftAppName().trim().toUpperCase().replace(/\s+/g, '_'));

  readonly appNameValid = computed(() => /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(this.normalisedAppName()));

  readonly nameTaken = computed(() => {
    if (!this.isCreating()) return false;
    const candidate = this.normalisedAppName();
    return !!candidate && this.applications.list()().some((app) => app.appName.toUpperCase() === candidate);
  });

  readonly canSave = computed(() => {
    if (this.saving()) return false;
    if (!this.draftDisplayName().trim()) return false;
    if (this.isCreating() && (!this.appNameValid() || this.nameTaken())) return false;
    return true;
  });

  /**
   * An application an organization already holds is frozen: its scopes are what live users'
   * permissions are computed from, and its machine name is what metering calls resolve. The
   * server refuses either way — these just stop the button from inviting the attempt.
   */
  canEdit(app: Application): boolean {
    return app.editable !== false;
  }

  canDelete(app: Application): boolean {
    return app.deletable !== false;
  }

  editLock(app: Application): string {
    return app.editLockReason ?? '';
  }

  deleteLock(app: Application): string {
    return app.deleteLockReason ?? '';
  }

  /** One short phrase for the row's status column. */
  usageSummary(app: Application): string {
    const parts: string[] = [];
    if (app.assignedOrgCount > 0) parts.push(`${app.assignedOrgCount} org${app.assignedOrgCount === 1 ? '' : 's'}`);
    if (app.planCount > 0) parts.push(`${app.planCount} plan${app.planCount === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'Not assigned';
  }

  displayNameOf(app: Application): string {
    return displayNameOrFallback(app, app.appId);
  }

  /** True when the label is only a fallback, so the row can invite someone to set a real one. */
  usesFallbackLabel(app: Application): boolean {
    return !app.displayName;
  }

  private descendantsOf(appId: string): string[] {
    const out: string[] = [appId];
    const walk = (parentId: string) => {
      for (const child of this.applications.childrenOf(parentId)) {
        out.push(child.appId);
        walk(child.appId);
      }
    };
    walk(appId);
    return out;
  }

  parentLabel(app: Application): string {
    if (!app.parentAppId) return '—';
    const parent = this.applications.byId(app.parentAppId);
    return parent ? this.displayNameOf(parent) : 'Unknown';
  }

  // --- form ----------------------------------------------------------------

  startCreate(parentAppId: string | null = null): void {
    this.editing.set('new');
    this.appNameTouched = false;
    this.draftAppName.set('');
    this.draftDisplayName.set('');
    this.draftParentAppId.set(parentAppId ?? '');
    this.draftScopes.set(new Set<Scope>(['ALL']));
  }

  startEdit(app: Application): void {
    if (!this.canEdit(app)) return;
    this.editing.set(app.appId);
    this.appNameTouched = true;
    this.draftAppName.set(app.appName);
    this.draftDisplayName.set(displayNameOrFallback(app));
    this.draftParentAppId.set(app.parentAppId ?? '');
    this.draftScopes.set(new Set<Scope>(app.scopes ?? []));
  }

  cancel(): void {
    this.editing.set(null);
  }

  toggleScope(scope: Scope): void {
    const next = new Set(this.draftScopes());
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    // ALL supersedes the rest; holding both states invites a reader to wonder which wins.
    if (scope === 'ALL' && next.has('ALL')) {
      this.draftScopes.set(new Set<Scope>(['ALL']));
      return;
    }
    if (scope !== 'ALL') next.delete('ALL');
    this.draftScopes.set(next);
  }

  hasScope(scope: Scope): boolean {
    return this.draftScopes().has(scope);
  }

  onAppNameInput(value: string): void {
    // Typing here takes ownership of the field — suggestAppName() must not clobber it afterwards.
    this.appNameTouched = true;
    this.draftAppName.set(value);
  }

  /** Suggests a machine key from the label, so the two never drift apart by accident. */
  suggestAppName(): void {
    // Only fills a field nobody has typed in. Overwriting a hand-entered machine name because the
    // label was edited afterwards silently undoes deliberate work.
    if (!this.isCreating() || this.appNameTouched || !this.draftDisplayName().trim()) return;
    this.draftAppName.set(
      this.draftDisplayName()
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    );
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    const draft: ApplicationDraft = {
      appName: this.normalisedAppName(),
      displayName: this.draftDisplayName().trim(),
      parentAppId: this.draftParentAppId() || null,
      scopes: [...this.draftScopes()]
    };

    this.saving.set(true);
    try {
      if (this.isCreating()) {
        const created = await this.applications.create(draft);
        this.revealApplication(created);
        this.toast.show(`'${draft.displayName}' added to the catalog.`, 'success');
        this.startSetupFlow(this.applications.byId(created.appId) ?? created);
      } else {
        const appId = this.editing()!;
        const { appName, ...rest } = draft;
        void appName;
        await this.applications.update(appId, rest);
        this.toast.show(`'${draft.displayName}' updated`, 'success');
      }
      this.editing.set(null);
    } catch (error: unknown) {
      this.toast.show(this.messageOf(error, 'Failed to save the application'), 'critical');
    } finally {
      this.saving.set(false);
    }
  }

  // --- follow-up flows -------------------------------------------------------

  /** After creating: migration details first (migration apps only), then subscription plans. */
  private startSetupFlow(app: Application): void {
    this.setupFlow.set({ appId: app.appId, migration: app.migrationApplication });
    if (app.migrationApplication) this.migrationAppId.set(app.appId);
    else this.assigningAppId.set(app.appId);
  }

  openAssignments(app: Application): void {
    this.setupFlow.set(null);
    this.assigningAppId.set(app.appId);
  }

  openMigrationDetails(app: Application): void {
    if (!app.migrationApplication) return;
    this.setupFlow.set(null);
    this.migrationAppId.set(app.appId);
  }

  onMigrationSaved(response: MigrationTypeSaveResponse): void {
    const appId = this.migrationAppId();
    // Saving writes master.migration_types only; organization schemas get their copy when the app is
    // added to a plan, or when a plan that includes it is assigned to an organization.
    this.toast.show(`Migration details saved (id ${response.migrationType.id}).`, 'success');
    this.migrationAppId.set(null);
    if (appId && this.setupFlow()?.appId === appId) this.assigningAppId.set(appId);
  }

  onMigrationClosed(): void {
    const appId = this.migrationAppId();
    this.migrationAppId.set(null);
    // Skipping migration details during setup still moves on to choosing plans.
    if (appId && this.setupFlow()?.appId === appId) this.assigningAppId.set(appId);
  }

  onAssignmentsClosed(): void {
    this.assigningAppId.set(null);
    this.setupFlow.set(null);
  }

  private revealApplication(app: Application): void {
    const query = this.search().trim().toLowerCase();
    const hiddenByCurrentSearch =
      !!query &&
      !displayNameOrFallback(app).toLowerCase().includes(query) &&
      !app.appName.toLowerCase().includes(query);
    if (hiddenByCurrentSearch) this.search.set('');

    const ancestorIds = collectAncestorIds(this.applications.list()(), app.appId);
    if (ancestorIds.length) {
      this.expandedIds.update((current) => new Set([...current, ...ancestorIds]));
    }

    this.justCreatedAppId.set(app.appId);
    setTimeout(() => {
      if (this.justCreatedAppId() === app.appId) this.justCreatedAppId.set(null);
    }, 4000);
  }

  async remove(app: Application): Promise<void> {
    if (!this.canDelete(app)) return;
    const result = await this.confirm.open({
      title: `Delete ${this.displayNameOf(app)}?`,
      message:
        'This removes the application from the platform catalog for every organization. It is refused ' +
        'if any plan, organization limit or role still references it — so nothing in use can be deleted by accident.',
      confirmLabel: 'Delete application',
      danger: true,
      requireTypedText: app.appName
    });
    if (!result.confirmed) return;

    try {
      await this.applications.remove(app.appId);
      this.toast.show(`'${this.displayNameOf(app)}' deleted`, 'success');
      if (this.editing() === app.appId) this.editing.set(null);
    } catch (error: unknown) {
      // The server's refusal names what still holds the app, which is the only useful
      // thing to show here — so it is surfaced verbatim rather than summarised.
      this.toast.show(this.messageOf(error, 'Failed to delete the application'), 'critical');
    }
  }

  private messageOf(error: unknown, fallback: string): string {
    const httpError = error as { error?: { message?: string }; message?: string };
    return httpError?.error?.message || httpError?.message || fallback;
  }
}

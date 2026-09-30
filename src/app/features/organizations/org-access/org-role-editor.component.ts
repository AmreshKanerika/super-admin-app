import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalShellComponent } from '../../../core/ui/modal-shell.component';
import { OrgAccessService } from '../../../services/org-access.service';
import { ApplicationsService } from '../../../services/applications.service';
import { ToastService } from '../../../core/toast.service';
import { OrgRbacScope, OrgRole, OrgRoleAppOption } from '../../../models';

/** Same order the catalog uses (com.flip.enums.Scopes); anything unknown goes last. */
const SCOPE_ORDER = ['ALL', 'VIEW', 'ADD', 'EDIT', 'EXECUTE', 'DELETE'];

interface AppRow {
  app: OrgRoleAppOption;
  label: string;
  depth: number;
  scopes: OrgRbacScope[];
}

/**
 * Create or edit a custom role: a name plus the app scopes it grants. Only apps on the
 * organization's active plans are offered - the server creates one subscription role per
 * subscription that contributes those apps and groups them as one role.
 */
@Component({
  selector: 'app-org-role-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalShellComponent],
  templateUrl: './org-role-editor.component.html',
  styleUrl: './org-role-editor.component.scss'
})
export class OrgRoleEditorComponent implements OnInit {
  @Input({ required: true }) orgId!: string;
  @Input({ required: true }) orgLabel!: string;
  /** null = create a new custom role. */
  @Input() role: OrgRole | null = null;
  /** Names already used in the organization, to catch a clash before the server does. */
  @Input() takenNames: string[] = [];
  /** Emits the saved role's name, so a caller can find and select it after reloading. */
  @Output() saved = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  private access = inject(OrgAccessService);
  private applications = inject(ApplicationsService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  /** Validation messages appear only once someone has tried to save. */
  readonly tried = signal(false);
  readonly apps = signal<OrgRoleAppOption[]>([]);
  readonly name = signal('');
  readonly description = signal('');
  readonly search = signal('');
  readonly onlySelected = signal(false);
  /** appId -> selected scope ids. */
  readonly selected = signal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());

  readonly isEdit = computed(() => this.role !== null);

  readonly rows = computed<AppRow[]>(() => {
    const all = this.apps();
    const ids = new Set(all.map((a) => a.appId));
    const label = (app: OrgRoleAppOption) => this.applications.displayNameForAppId(app.appId) || app.appName;
    const byLabel = (a: OrgRoleAppOption, b: OrgRoleAppOption) => label(a).localeCompare(label(b));
    const query = this.search().trim().toLowerCase();
    const onlySelected = this.onlySelected();
    const matches = (app: OrgRoleAppOption) =>
      (!onlySelected || this.selected().has(app.appId)) &&
      (!query || label(app).toLowerCase().includes(query) || app.appName.toLowerCase().includes(query));
    const scopesOf = (app: OrgRoleAppOption) =>
      [...(app.scopes ?? [])].sort((a, b) => rank(a.scopeName) - rank(b.scopeName));

    // Children sit under their parent when the parent is also on the org's plans.
    const roots = all.filter((a) => !a.parentAppId || !ids.has(a.parentAppId)).sort(byLabel);
    const out: AppRow[] = [];
    const visit = (app: OrgRoleAppOption, depth: number) => {
      // A selected app stays visible while searching, so a search can't hide what the role grants.
      if (matches(app) || (!onlySelected && this.selected().has(app.appId))) out.push({ app, label: label(app), depth, scopes: scopesOf(app) });
      all.filter((c) => c.parentAppId === app.appId).sort(byLabel).forEach((child) => visit(child, depth + 1));
    };
    roots.forEach((root) => visit(root, 0));
    return out;
  });

  /** Labels of the apps currently granted, for the summary strip. */
  readonly selectedLabels = computed(() => {
    const byId = new Map(this.apps().map((a) => [a.appId, a]));
    return [...this.selected().entries()]
      .filter(([, scopes]) => scopes.size > 0)
      .map(([appId]) => this.applications.displayNameForAppId(appId) || byId.get(appId)?.appName || appId)
      .sort((a, b) => a.localeCompare(b));
  });

  readonly selectableCount = computed(() => this.apps().filter((a) => a.selectable).length);

  readonly selectedAppCount = computed(() => [...this.selected().values()].filter((s) => s.size > 0).length);
  readonly selectedScopeCount = computed(() => [...this.selected().values()].reduce((n, s) => n + s.size, 0));

  readonly nameError = computed(() => {
    const value = this.name().trim().replace(/\s+/g, ' ');
    if (!value) return 'Role name is required.';
    if (['admin', 'developer'].includes(value.toLowerCase())) return 'Admin and Developer are built-in roles; choose another name.';
    const original = this.role?.roleName.trim().toLowerCase();
    if (value.toLowerCase() !== original && this.takenNames.some((n) => n.trim().toLowerCase() === value.toLowerCase())) {
      return 'A role with this name already exists in this organization.';
    }
    return null;
  });

  readonly canSave = computed(() => !this.saving() && !this.loading() && !this.nameError() && this.selectedAppCount() > 0);

  async ngOnInit(): Promise<void> {
    if (this.role) {
      this.name.set(this.role.roleName);
      this.description.set(this.role.roleDescription ?? '');
      const initial = new Map<string, Set<string>>();
      for (const app of this.role.apps ?? []) {
        initial.set(app.appId, new Set((app.scopes ?? []).map((s) => s.appScopeId)));
      }
      this.selected.set(initial);
    }
    try {
      this.apps.set(await this.access.listRoleApps(this.orgId));
    } catch (error: unknown) {
      this.toast.show(messageOf(error, "Couldn't load the organization's apps"), 'critical');
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  isOn(appId: string, scopeId: string): boolean {
    return this.selected().get(appId)?.has(scopeId) ?? false;
  }

  appState(row: AppRow): 'all' | 'some' | 'none' {
    const chosen = this.selected().get(row.app.appId)?.size ?? 0;
    if (!chosen) return 'none';
    const allScope = row.scopes.find((s) => s.scopeName === 'ALL');
    if ((allScope && this.isOn(row.app.appId, allScope.appScopeId)) || chosen >= row.scopes.length) return 'all';
    return 'some';
  }

  /** Whole-app toggle: grants ALL when the app has it (it supersedes the rest), otherwise every scope. */
  toggleApp(row: AppRow): void {
    if (!row.app.selectable) return;
    this.update(row.app.appId, (current) => {
      if (current.size) return new Set();
      const allScope = row.scopes.find((s) => s.scopeName === 'ALL');
      return new Set(allScope ? [allScope.appScopeId] : row.scopes.map((s) => s.appScopeId));
    });
  }

  toggleScope(row: AppRow, scope: OrgRbacScope): void {
    if (!row.app.selectable) return;
    this.update(row.app.appId, (current) => {
      const next = new Set(current);
      if (next.has(scope.appScopeId)) {
        next.delete(scope.appScopeId);
        return next;
      }
      // ALL and the individual scopes are alternatives, never both.
      if (scope.scopeName === 'ALL') return new Set([scope.appScopeId]);
      const allScope = row.scopes.find((s) => s.scopeName === 'ALL');
      if (allScope) next.delete(allScope.appScopeId);
      next.add(scope.appScopeId);
      return next;
    });
  }

  /**
   * Applies one app's new scope selection, then keeps the tree consistent:
   *  - turning a child on turns its parents on (with their default scopes);
   *  - turning a parent off turns all of its children off;
   *  - turning off a parent's last selected child turns the parent off (and so on upwards).
   */
  private update(appId: string, change: (current: ReadonlySet<string>) => Set<string>): void {
    this.selected.update((map) => {
      const next = new Map(map);
      const wasOn = (map.get(appId)?.size ?? 0) > 0;
      const value = change(map.get(appId) ?? new Set());
      if (value.size) next.set(appId, value);
      else next.delete(appId);
      const isOn = value.size > 0;

      if (isOn && !wasOn) this.turnOnAncestors(appId, next);
      if (!isOn && wasOn) {
        this.turnOffDescendants(appId, next);
        this.turnOffEmptyAncestors(appId, next);
      }
      return next;
    });
  }

  private readonly appById = computed(() => new Map(this.apps().map((a) => [a.appId, a])));

  private readonly childIdsByParent = computed(() => {
    const children = new Map<string, string[]>();
    for (const app of this.apps()) {
      if (!app.parentAppId || !this.appById().has(app.parentAppId)) continue;
      const list = children.get(app.parentAppId) ?? [];
      list.push(app.appId);
      children.set(app.parentAppId, list);
    }
    return children;
  });

  private parentOf(appId: string): OrgRoleAppOption | undefined {
    const parentId = this.appById().get(appId)?.parentAppId;
    return parentId ? this.appById().get(parentId) : undefined;
  }

  /** What a parent gets when a child switches it on: ALL when the app has it, otherwise every scope. */
  private defaultScopes(app: OrgRoleAppOption): Set<string> {
    const all = (app.scopes ?? []).find((s) => s.scopeName === 'ALL');
    return new Set(all ? [all.appScopeId] : (app.scopes ?? []).map((s) => s.appScopeId));
  }

  private turnOnAncestors(appId: string, map: Map<string, ReadonlySet<string>>): void {
    for (let parent = this.parentOf(appId); parent; parent = this.parentOf(parent.appId)) {
      if (!parent.selectable || (map.get(parent.appId)?.size ?? 0) > 0) continue;
      const scopes = this.defaultScopes(parent);
      if (scopes.size) map.set(parent.appId, scopes);
    }
  }

  private turnOffDescendants(appId: string, map: Map<string, ReadonlySet<string>>): void {
    for (const childId of this.childIdsByParent().get(appId) ?? []) {
      map.delete(childId);
      this.turnOffDescendants(childId, map);
    }
  }

  private turnOffEmptyAncestors(appId: string, map: Map<string, ReadonlySet<string>>): void {
    const parent = this.parentOf(appId);
    if (!parent || !map.has(parent.appId)) return;
    const anyChildOn = (this.childIdsByParent().get(parent.appId) ?? []).some((id) => (map.get(id)?.size ?? 0) > 0);
    if (anyChildOn) return;
    map.delete(parent.appId);
    this.turnOffEmptyAncestors(parent.appId, map);
  }

  /** Why Save is disabled, in plain words; null when it isn't. */
  readonly saveBlocker = computed(() => {
    if (this.loading() || this.saving()) return null;
    if (!this.name().trim()) return 'Enter a role name';
    if (this.nameError()) return this.nameError();
    if (!this.selectedAppCount()) return 'Grant at least one app';
    return null;
  });

  async save(): Promise<void> {
    this.tried.set(true);
    if (!this.canSave()) return;
    const payload = {
      roleName: this.name().trim().replace(/\s+/g, ' '),
      roleDescription: this.description().trim() || null,
      appsEnabled: [...this.selected().entries()]
        .filter(([, scopes]) => scopes.size > 0)
        .map(([appId, scopes]) => ({ appId, scopeIds: [...scopes] }))
    };
    this.saving.set(true);
    try {
      if (this.role) await this.access.updateRole(this.orgId, this.orgLabel, this.role.roleId, payload);
      else await this.access.createRole(this.orgId, this.orgLabel, payload);
      this.toast.show(this.role ? `Role '${payload.roleName}' updated` : `Role '${payload.roleName}' created`, 'success');
      this.saved.emit(payload.roleName);
    } catch (error: unknown) {
      this.toast.show(messageOf(error, 'Could not save the role'), 'critical');
    } finally {
      this.saving.set(false);
    }
  }

  trackByApp = (_: number, row: AppRow) => row.app.appId;
}

function rank(scopeName: string): number {
  const index = SCOPE_ORDER.indexOf(scopeName);
  return index === -1 ? SCOPE_ORDER.length : index;
}

export function messageOf(error: unknown, fallback: string): string {
  const http = error as { status?: number; error?: { message?: string } };
  if (http?.status === 0) return 'Could not reach the server. Check your connection and try again.';
  return http?.error?.message || fallback;
}

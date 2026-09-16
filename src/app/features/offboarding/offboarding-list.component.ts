import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { StatusPillComponent } from '../../core/ui/status-pill.component';
import { formatDate } from '../../core/status.util';
import { OrganizationsService } from '../../services/organizations.service';
import { OffboardingService } from '../../services/offboarding.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { OffboardingPreCheck } from '../../models';

@Component({
  selector: 'app-offboarding-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent, StatusPillComponent],
  templateUrl: './offboarding-list.component.html',
  styleUrl: './offboarding-list.component.scss'
})
export class OffboardingListComponent implements OnInit {
  organizations = inject(OrganizationsService);
  offboarding = inject(OffboardingService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private route = inject(ActivatedRoute);

  showBack = false;
  backUrl: string | null = null;

  formatDate = formatDate;

  search = signal('');
  statusFilter = signal<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL');

  // Split once so both the counts and the filtered list read from the same partition.
  private matchingSearch = computed(() => {
    const term = this.search().trim().toLowerCase();
    const list = this.organizations.list()();
    if (!term) return list;
    return list.filter(
      (o) => o.organizationName.toLowerCase().includes(term) || o.domainName.toLowerCase().includes(term)
    );
  });

  counts = computed(() => {
    const list = this.matchingSearch();
    const expired = list.filter((o) => o.isDecommissioned).length;
    return { all: list.length, active: list.length - expired, expired };
  });

  filtered = computed(() => {
    const list = this.matchingSearch();
    const filter = this.statusFilter();
    if (filter === 'ACTIVE') return list.filter((o) => !o.isDecommissioned);
    if (filter === 'EXPIRED') return list.filter((o) => o.isDecommissioned);
    return list;
  });

  setFilter(filter: 'ALL' | 'ACTIVE' | 'EXPIRED'): void {
    this.statusFilter.set(filter);
  }

  targetOrgId = signal<string | null>(null);
  preCheck = signal<OffboardingPreCheck | null>(null);
  precheckLoading = signal(false);
  reason = '';
  confirmText = '';
  submitting = signal(false);

  ngOnInit(): void {
    const orgId = this.route.snapshot.queryParamMap.get('orgId');
    if (orgId) this.startOffboard(orgId);

    const from = this.route.snapshot.queryParamMap.get('from');
    if (from === 'overview') {
      this.showBack = true;
      this.backUrl = null;
    }
  }

  async startOffboard(orgId: string): Promise<void> {
    this.targetOrgId.set(orgId);
    this.reason = '';
    this.confirmText = '';
    this.precheckLoading.set(true);
    try {
      this.preCheck.set(await this.offboarding.preCheck(orgId));
    } catch (err) {
      this.toast.show('Could not load pre-check data — check your connection and try again.', 'critical');
      this.closeModal();
    } finally {
      this.precheckLoading.set(false);
    }
  }

  closeModal(): void {
    this.targetOrgId.set(null);
    this.preCheck.set(null);
  }

  targetOrgName(): string {
    const id = this.targetOrgId();
    return id ? this.organizations.byId(id)?.organizationName ?? '' : '';
  }

  canExecute(): boolean {
    return this.confirmText === this.targetOrgName() && !!this.reason.trim();
  }

  async execute(): Promise<void> {
    const orgId = this.targetOrgId();
    if (!orgId || !this.canExecute()) return;
    this.submitting.set(true);
    try {
      await this.offboarding.expire(orgId, this.reason);
      this.toast.show('Organization expired — access is blocked, no data was deleted', 'success');
      this.closeModal();
    } catch (err: unknown) {
      this.toast.show(this.errorMessage(err, 'Failed to expire organization'), 'critical');
    } finally {
      this.submitting.set(false);
    }
  }

  async reactivate(orgId: string): Promise<void> {
    try {
      await this.offboarding.reactivate(orgId);
      this.toast.show('Organization reactivated', 'success');
    } catch (err: unknown) {
      this.toast.show(this.errorMessage(err, 'Failed to reactivate organization'), 'critical');
    }
  }

  async purgeNow(orgId: string): Promise<void> {
    const orgName = this.organizations.byId(orgId)?.organizationName ?? orgId;
    // This is a slow, real backend operation (hard-delete + archive + Keycloak realm + DNS
    // teardown) — onConfirm keeps the dialog open with a "Working…" spinner until it actually
    // finishes, instead of the dialog closing the instant the button is clicked and leaving several
    // silent seconds before a toast eventually appears.
    const result = await this.confirm.open({
      title: `Permanently delete ${orgName}?`,
      message: 'This immediately archives and permanently deletes every record for this organization — its data, database, login system, and web address. This cannot be undone. Expiring the organization (the default "Offboard" action) does not do this — use it instead unless you specifically need to destroy the data.',
      danger: true,
      requireTypedText: orgName,
      confirmLabel: 'Permanently delete',
      onConfirm: async () => {
        await this.offboarding.purgeNow(orgId, 'Purged via "Purge now" action');
      }
    });
    if (!result.confirmed) return;
    this.toast.show('Organization archived and permanently deleted', 'success');
  }

  private errorMessage(err: unknown, fallback: string): string {
    const httpError = err as { error?: { message?: string }; message?: string };
    return httpError?.error?.message || httpError?.message || fallback;
  }
}

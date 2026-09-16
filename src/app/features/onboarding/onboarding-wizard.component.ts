import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ModalShellComponent } from '../../core/ui/modal-shell.component';
import { PlanBuilderComponent } from '../plans/plan-builder.component';
import { OrganizationsService } from '../../services/organizations.service';
import { PlansService } from '../../services/plans.service';
import { OnboardingService, OnboardingDraft } from '../../services/onboarding.service';
import { ToastService } from '../../core/toast.service';
import { SubscriptionPlan } from '../../models';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 365);
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-onboarding-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, ModalShellComponent, PlanBuilderComponent],
  templateUrl: './onboarding-wizard.component.html',
  styleUrl: './onboarding-wizard.component.scss'
})
export class OnboardingWizardComponent {
  private router = inject(Router);
  private toast = inject(ToastService);
  organizations = inject(OrganizationsService);
  plans = inject(PlansService);
  onboarding = inject(OnboardingService);

  stepLabels = ['Organization', 'Admin user', 'Plan', 'Review', 'Provisioning'];
  step = signal(0);

  organizationName = '';
  domainPrefix = '';
  isPaidOrg = true;

  adminFirstName = '';
  adminLastName = '';
  adminEmail = '';

  planId = '';
  planStartDate = today();
  planEndDate = defaultEndDate();

  showCustomPlanModal = signal(false);
  submitting = signal(false);
  errors: string[] = [];

  run = this.onboarding.currentRun();

  // null = not checked yet / in flight. The local check below is an instant first filter; the
  // authoritative answer comes from the backend (Cloudflare DNS + organizations1), since this console
  // can only see organizations it has already loaded.
  domainRemoteAvailable = signal<boolean | null>(null);
  domainChecking = signal(false);
  private domainCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private domainCheckSeq = 0;

  // Fetched once from the backend (the only place this environment's base domain is configured) so
  // the wizard can preview the organization's real future web address as the prefix is typed.
  baseDomain = signal<string | null>(null);

  // A plain method, not computed() — domainPrefix is a plain ngModel-bound string, not a signal, so
  // a computed() here would freeze at whatever domainPrefix was when baseDomain last changed instead
  // of tracking each keystroke. Called directly from the template, it re-evaluates on every change
  // detection pass the same way the existing domainAvailable() method already does.
  fullWebAddress(): string | null {
    const prefix = this.domainPrefix.trim().toLowerCase();
    const domain = this.baseDomain();
    return prefix && domain ? `https://${prefix}.${domain}` : null;
  }

  constructor() {
    this.onboarding.getBaseDomain().then((domain) => this.baseDomain.set(domain));
  }

  domainAvailable(): boolean {
    if (!this.domainPrefix.trim()) return true;
    if (!this.organizations.domainPrefixAvailable(this.domainPrefix)) return false;
    return this.domainRemoteAvailable() !== false;
  }

  onDomainPrefixChange(): void {
    this.domainRemoteAvailable.set(null);
    if (this.domainCheckTimer) clearTimeout(this.domainCheckTimer);

    const prefix = this.domainPrefix.trim().toLowerCase();
    if (!prefix) {
      this.domainChecking.set(false);
      return;
    }

    // Debounced so typing a prefix doesn't fire a Cloudflare lookup per keystroke.
    this.domainCheckTimer = setTimeout(() => this.runDomainCheck(prefix), 450);
  }

  private async runDomainCheck(prefix: string): Promise<void> {
    const seq = ++this.domainCheckSeq;
    this.domainChecking.set(true);
    try {
      const available = await this.onboarding.checkDomainPrefixAvailable(prefix);
      // Ignore a response that arrived after the user kept typing.
      if (seq === this.domainCheckSeq) this.domainRemoteAvailable.set(available);
    } catch {
      // Availability is unknown, not "taken" — don't block the wizard on a transient lookup failure;
      // the backend re-validates authoritatively before it creates anything.
      if (seq === this.domainCheckSeq) this.domainRemoteAvailable.set(null);
    } finally {
      if (seq === this.domainCheckSeq) this.domainChecking.set(false);
    }
  }

  nameAvailable(): boolean {
    if (!this.organizationName.trim()) return true;
    return !this.organizations.nameExists(this.organizationName);
  }

  canGoNext(): boolean {
    switch (this.step()) {
      case 0:
        return !!this.organizationName.trim() && this.nameAvailable() && !!this.domainPrefix.trim() && this.domainAvailable();
      case 1:
        return !!this.adminFirstName.trim() && !!this.adminLastName.trim() && /.+@.+\..+/.test(this.adminEmail);
      case 2:
        return !!this.planId;
      default:
        return true;
    }
  }

  next(): void {
    if (!this.canGoNext()) return;
    if (this.step() === 3) {
      this.startProvisioning();
      return;
    }
    this.step.set(this.step() + 1);
  }

  back(): void {
    this.step.set(Math.max(0, this.step() - 1));
  }

  goToStep(i: number): void {
    if (i <= this.step() && this.step() < 4) this.step.set(i);
  }

  planName(id: string): string {
    return this.plans.byId(id)?.planName ?? id;
  }

  defaultPlans() {
    return this.plans.list()().filter((p) => p.planType === 'DEFAULT');
  }

  customPlans() {
    return this.plans.list()().filter((p) => p.planType === 'CUSTOM' && p.planState !== 'ARCHIVED');
  }

  onPlanSelectChange(): void {
    if ((this.planId as string) === '__create_custom__') {
      this.planId = '';
      this.showCustomPlanModal.set(true);
    }
  }

  onCustomPlanCreated(plan: SubscriptionPlan): void {
    this.planId = plan.planId;
    this.showCustomPlanModal.set(false);
    this.toast.show(`Custom plan "${plan.planName}" ready to assign`, 'success');
  }

  private buildDraft(): OnboardingDraft {
    return {
      organizationName: this.organizationName,
      domainPrefix: this.domainPrefix,
      isPaidOrg: this.isPaidOrg,
      adminFirstName: this.adminFirstName,
      adminLastName: this.adminLastName,
      adminEmail: this.adminEmail,
      planId: this.planId,
      planStartDate: this.planStartDate,
      planEndDate: this.planEndDate
    };
  }

  async startProvisioning(): Promise<void> {
    this.errors = this.onboarding.validate(this.buildDraft());
    if (this.errors.length) return;
    this.step.set(4);
    this.submitting.set(true);
    try {
      await this.onboarding.start(this.buildDraft());
    } finally {
      this.submitting.set(false);
    }
  }

  async retry(): Promise<void> {
    this.submitting.set(true);
    try {
      await this.onboarding.retry();
    } finally {
      this.submitting.set(false);
    }
  }

  rollback(): void {
    this.onboarding.rollback();
  }

  startOver(): void {
    this.onboarding.reset();
    this.organizationName = '';
    this.domainPrefix = '';
    this.adminFirstName = '';
    this.adminLastName = '';
    this.adminEmail = '';
    this.planId = '';
    this.step.set(0);
  }

  goToNewOrg(): void {
    const run = this.run();
    const org = this.organizations.list()().find((o) => o.organizationName === run?.organizationName);
    this.onboarding.reset();
    if (org) this.router.navigate(['/organizations', org.orgId]);
    else this.router.navigate(['/organizations']);
  }

  async copyCredentials(): Promise<void> {
    const run = this.run();
    if (!run) return;
    const text = `Login: ${run.domainUrl}\nUsername: ${run.adminUsername}\nPassword: ${run.adminPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show('Credentials copied to clipboard', 'success');
    } catch {
      this.toast.show('Could not copy — select and copy manually', 'critical');
    }
  }

  downloadCredentials(): void {
    const run = this.run();
    if (!run) return;
    const text = `FLIP organization credentials — one-time only\n\nOrganization: ${run.organizationName}\nLogin URL: ${run.domainUrl}\nUsername: ${run.adminUsername}\nPassword: ${run.adminPassword}\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${run.organizationName.toLowerCase().replace(/\s+/g, '-')}-credentials.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ModalShellComponent } from '../../core/ui/modal-shell.component';
import { PlanBuilderComponent } from '../plans/plan-builder.component';
import { ApplicationsService } from '../../services/applications.service';
import { PlansService } from '../../services/plans.service';
import { ToastService } from '../../core/toast.service';
import { OrganizationsService } from '../../services/organizations.service';
import { SubscriptionsService } from '../../services/subscriptions.service';
import {
  ExistingOrganizationSubscriptionDraft,
  OrganizationOnboardingDraft,
  OrganizationOnboardingService,
  SubscriptionDraft,
  emptySubscriptionDraft,
  generateTemporaryPassword
} from '../../services/organization-onboarding.service';
import { OnboardedSubscription, OnboardingPlan, OrganizationOnboardingResult, SubscriptionOnboardingResult, SubscriptionPlan } from '../../models';
import { planDisplayNameOrFallback } from '../../core/plan-name.util';

type WizardMode = 'NEW_ORGANIZATION' | 'EXISTING_ORGANIZATION';
type RunStatus = 'IDLE' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

@Component({
  selector: 'app-subscription-onboarding-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, ModalShellComponent, PlanBuilderComponent],
  templateUrl: './subscription-onboarding-wizard.component.html',
  styleUrl: './onboarding-wizard.component.scss'
})
export class SubscriptionOnboardingWizardComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private organizations = inject(OrganizationsService);
  private subscriptionsService = inject(SubscriptionsService);
  private plans = inject(PlansService);
  onboarding = inject(OrganizationOnboardingService);

  private applications = inject(ApplicationsService);
  readonly requestedApplicationId = this.route.snapshot.queryParamMap.get('applicationId');
  readonly requestedApplication = computed(() => this.requestedApplicationId ? this.applications.byId(this.requestedApplicationId) : undefined);
  private includesRequestedApplication(plan: OnboardingPlan): boolean {
    if (!this.requestedApplicationId) return true;
    return plan.primaryAppId === this.requestedApplicationId || !!this.plans.byId(plan.planId)?.apps.some(app => app.appId === this.requestedApplicationId && app.accessStatus === 'ENABLED');
  }

  mode: WizardMode = 'NEW_ORGANIZATION';
  organizationId: string | null = null;

  organizationName = '';
  domainPrefix = '';
  domainName = '';
  editDomainName = false;
  emailDomain = '';
  orgExternalId = '';
  paidOrg = true;
  dedicatedSchemaRequired = true;
  diAppProvisionRequired = false;

  adminFirstName = '';
  adminLastName = '';
  adminEmail = '';

  subscriptionAdminUsername = '';
  subscriptions: SubscriptionDraft[] = [emptySubscriptionDraft()];

  step = signal(0);
  errors: string[] = [];
  submitting = signal(false);

  runStatus = signal<RunStatus>('IDLE');
  runMessage = signal('');
  organizationResult = signal<OrganizationOnboardingResult | null>(null);
  subscriptionResult = signal<SubscriptionOnboardingResult | null>(null);
  generatedAdminPassword = signal('');

  plansLoading = signal(true);
  plansError = signal('');
  baseDomain = signal<string | null>(null);
  environmentLabel = signal<string | null>(null);
  baseDomainDerived = signal(false);
  reservationDays = signal(15);
  domainChecking = signal(false);
  domainRemoteAvailable = signal<boolean | null>(null);

  private domainCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private domainCheckSequence = 0;

  constructor() {
    this.organizationId = this.route.snapshot.paramMap.get('id');
    this.mode = this.organizationId ? 'EXISTING_ORGANIZATION' : 'NEW_ORGANIZATION';

    this.onboarding
      .loadPlans()
      .catch((error: Error) => this.plansError.set(error.message))
      .finally(() => this.plansLoading.set(false));

    if (this.mode === 'NEW_ORGANIZATION') {
      this.onboarding.getEnvironmentConfig().then((config) => {
        if (!config) {
          return;
        }
        this.baseDomain.set(config.baseDomain);
        this.environmentLabel.set(config.environment);
        this.baseDomainDerived.set(config.derivedFromDatasource);
        this.reservationDays.set(config.domainReservationDays);
      });
    }
  }

  stepLabels(): string[] {
    return this.mode === 'NEW_ORGANIZATION'
      ? ['Organization', 'Admin user', 'Subscriptions', 'Review', 'Provisioning']
      : ['Subscription admin', 'Subscriptions', 'Review', 'Provisioning'];
  }

  lastEditableStep(): number {
    return this.stepLabels().length - 2;
  }

  organizationStep(): number {
    return 0;
  }

  adminStep(): number {
    return this.mode === 'NEW_ORGANIZATION' ? 1 : 0;
  }

  subscriptionsStep(): number {
    return this.mode === 'NEW_ORGANIZATION' ? 2 : 1;
  }

  reviewStep(): number {
    return this.mode === 'NEW_ORGANIZATION' ? 3 : 2;
  }

  provisioningStep(): number {
    return this.mode === 'NEW_ORGANIZATION' ? 4 : 3;
  }

  organizationLabel(): string {
    if (this.mode === 'NEW_ORGANIZATION') {
      return this.organizationName;
    }
    const organization = this.organizations.list()().find((candidate) => candidate.orgId === this.organizationId);
    return organization?.organizationName ?? (this.organizationId ?? '');
  }

  readyPlans(): OnboardingPlan[] {
    return this.onboarding.availablePlans()().filter((plan) => plan.onboardingReady && this.includesRequestedApplication(plan));
  }

  blockedPlans(): OnboardingPlan[] {
    return this.onboarding.availablePlans()().filter((plan) => !plan.onboardingReady && this.includesRequestedApplication(plan));
  }

  planById(planId: string): OnboardingPlan | undefined {
    return this.onboarding.planById(planId);
  }

  planName(planId: string): string {
    return planDisplayNameOrFallback(this.planById(planId), planId);
  }

  planIsSelectedElsewhere(planId: string, index: number): boolean {
    return this.subscriptions.some((subscription, position) => position !== index && subscription.planId === planId);
  }

  readonly planModalOpen = signal(false);
  readonly planModalError = signal('');
  private planModalTargetIndex = -1;

  openPlanBuilder(index: number): void {
    this.planModalTargetIndex = index;
    this.planModalError.set('');
    this.planModalOpen.set(true);
  }

  closePlanBuilder(): void {
    this.planModalOpen.set(false);
    this.planModalTargetIndex = -1;
  }

  // The builder writes the plan through /platform/plans; the wizard's own picker is fed by
  // /api/v1/onboarding/plans, which additionally reports whether the plan has the ADMIN role
  // template subscription provisioning needs — so reload from there rather than trusting the
  // builder's response, and refuse to auto-select a plan onboarding would reject.
  async onPlanCreated(plan: SubscriptionPlan): Promise<void> {
    const targetIndex = this.planModalTargetIndex;
    try {
      const availablePlans = await this.onboarding.loadPlans(true);
      const createdPlan = availablePlans.find((candidate) => candidate.planId === plan.planId);

      if (!createdPlan) {
        this.planModalError.set(`"${plan.planName}" was created but is not available for onboarding yet.`);
        return;
      }
      if (!createdPlan.onboardingReady) {
        this.planModalError.set(`"${plan.planName}" was created but cannot be onboarded — ${createdPlan.readinessMessage}.`);
        return;
      }

      if (targetIndex >= 0 && targetIndex < this.subscriptions.length) {
        this.subscriptions[targetIndex].planId = createdPlan.planId;
        this.onPlanChange(targetIndex);
      }
      this.plans.refresh().catch((error) => console.error('Failed to refresh the plan catalog', error));
      this.closePlanBuilder();
      this.toast.show(`Plan "${createdPlan.planName}" created and selected`, 'success');
    } catch (error) {
      this.planModalError.set((error as Error).message);
    }
  }

  addSubscription(): void {
    this.subscriptions = [...this.subscriptions, emptySubscriptionDraft()];
  }

  removeSubscription(index: number): void {
    if (this.subscriptions.length === 1) {
      return;
    }
    this.subscriptions = this.subscriptions.filter((_, position) => position !== index);
  }

  onPlanChange(index: number): void {
    const plan = this.planById(this.subscriptions[index].planId);
    if (plan && !plan.developerRoleTemplateAvailable) {
      this.subscriptions[index].provisionDeveloperRole = false;
    }
  }

  // The effective URL: the explicit override when one is typed, otherwise prefix + the base domain
  // the backend derived for this environment.
  resolvedDomainName(): string | null {
    const override = this.domainName.trim().toLowerCase();
    if (override) {
      return override.replace(/^https?:\/\//, '');
    }
    const prefix = this.domainPrefix.trim().toLowerCase();
    const domain = this.baseDomain();
    return prefix && domain ? `${prefix}.${domain}` : null;
  }

  fullWebAddress(): string | null {
    const resolved = this.resolvedDomainName();
    return resolved ? `https://${resolved}` : null;
  }

  toggleEditDomainName(): void {
    this.editDomainName = !this.editDomainName;
    if (this.editDomainName && !this.domainName.trim()) {
      this.domainName = this.fullWebAddress() ?? '';
    }
    if (!this.editDomainName) {
      this.domainName = '';
    }
  }

  onDomainPrefixChange(): void {
    this.domainRemoteAvailable.set(null);
    if (this.domainCheckTimer) {
      clearTimeout(this.domainCheckTimer);
    }

    const prefix = this.domainPrefix.trim().toLowerCase();
    if (!prefix) {
      this.domainChecking.set(false);
      return;
    }
    this.domainCheckTimer = setTimeout(() => this.runDomainCheck(prefix), 450);
  }

  private async runDomainCheck(prefix: string): Promise<void> {
    const sequence = ++this.domainCheckSequence;
    this.domainChecking.set(true);
    try {
      const available = await this.onboarding.checkDomainPrefixAvailable(prefix);
      if (sequence === this.domainCheckSequence) {
        this.domainRemoteAvailable.set(available);
      }
    } catch {
      if (sequence === this.domainCheckSequence) {
        this.domainRemoteAvailable.set(null);
      }
    } finally {
      if (sequence === this.domainCheckSequence) {
        this.domainChecking.set(false);
      }
    }
  }

  domainAvailable(): boolean {
    if (!this.domainPrefix.trim()) {
      return true;
    }
    if (!this.organizations.domainPrefixAvailable(this.domainPrefix)) {
      return false;
    }
    return this.domainRemoteAvailable() !== false;
  }

  nameAvailable(): boolean {
    if (!this.organizationName.trim()) {
      return true;
    }
    return !this.organizations.nameExists(this.organizationName);
  }

  canGoNext(): boolean {
    const currentStep = this.step();
    if (this.mode === 'NEW_ORGANIZATION' && currentStep === this.organizationStep()) {
      return (
        !!this.organizationName.trim() &&
        this.nameAvailable() &&
        !!this.domainPrefix.trim() &&
        this.domainAvailable()
      );
    }
    if (currentStep === this.adminStep()) {
      if (this.mode === 'NEW_ORGANIZATION') {
        return !!this.adminFirstName.trim() && !!this.adminLastName.trim() && /.+@.+\..+/.test(this.adminEmail);
      }
      return true;
    }
    if (currentStep === this.subscriptionsStep()) {
      return this.subscriptions.every((subscription) => !!subscription.planId);
    }
    return true;
  }

  next(): void {
    if (!this.canGoNext()) {
      return;
    }
    if (this.step() === this.reviewStep()) {
      this.startProvisioning();
      return;
    }
    this.step.set(this.step() + 1);
  }

  back(): void {
    this.step.set(Math.max(0, this.step() - 1));
  }

  goToStep(index: number): void {
    if (index <= this.step() && this.step() <= this.reviewStep()) {
      this.step.set(index);
    }
  }

  private buildOrganizationDraft(): OrganizationOnboardingDraft {
    return {
      organizationName: this.organizationName,
      domainPrefix: this.domainPrefix,
      // Always the full https URL (default or edited) - it is stored as-is in organizations1.domain_name
      domainName: this.fullWebAddress() ?? '',
      emailDomain: this.emailDomain,
      orgExternalId: this.orgExternalId,
      paidOrg: this.paidOrg,
      dedicatedSchemaRequired: this.dedicatedSchemaRequired,
      diAppProvisionRequired: this.diAppProvisionRequired,
      adminFirstName: this.adminFirstName,
      adminLastName: this.adminLastName,
      adminEmail: this.adminEmail,
      subscriptions: this.subscriptions
    };
  }

  private buildSubscriptionDraft(): ExistingOrganizationSubscriptionDraft {
    return {
      subscriptionAdminUsername: this.subscriptionAdminUsername,
      subscriptions: this.subscriptions
    };
  }

  async startProvisioning(): Promise<void> {
    this.errors =
      this.mode === 'NEW_ORGANIZATION'
        ? this.onboarding.validateOrganizationDraft(this.buildOrganizationDraft())
        : this.onboarding.validateSubscriptionDrafts(this.subscriptions);
    if (this.errors.length) {
      return;
    }

    this.step.set(this.provisioningStep());
    this.submitting.set(true);
    this.runStatus.set('RUNNING');
    this.runMessage.set('');

    try {
      if (this.mode === 'NEW_ORGANIZATION') {
        const adminPassword = generateTemporaryPassword();
        const result = await this.onboarding.onboardOrganization(this.buildOrganizationDraft(), adminPassword);
        this.generatedAdminPassword.set(adminPassword);
        this.organizationResult.set(result);
        this.runMessage.set(result.message);
      } else {
        const result = await this.onboarding.onboardSubscriptions(this.organizationId!, this.buildSubscriptionDraft());
        this.subscriptionResult.set(result);
        this.runMessage.set(result.message);
      }
      this.runStatus.set('SUCCEEDED');
      await Promise.all([this.organizations.refresh(), this.subscriptionsService.refresh()]);
    } catch (error) {
      this.runStatus.set('FAILED');
      this.runMessage.set((error as Error).message);
    } finally {
      this.submitting.set(false);
    }
  }

  provisionedSubscriptions(): OnboardedSubscription[] {
    return this.organizationResult()?.subscriptions ?? this.subscriptionResult()?.subscriptions ?? [];
  }

  warnings(): string[] {
    return this.organizationResult()?.warnings ?? [];
  }

  async retry(): Promise<void> {
    this.step.set(this.reviewStep());
    await this.startProvisioning();
  }

  startOver(): void {
    this.organizationResult.set(null);
    this.subscriptionResult.set(null);
    this.generatedAdminPassword.set('');
    this.runStatus.set('IDLE');
    this.runMessage.set('');
    this.subscriptions = [emptySubscriptionDraft()];
    this.errors = [];
    this.step.set(0);
  }

  goToOrganization(): void {
    const organizationId = this.organizationResult()?.organizationId ?? this.organizationId;
    if (organizationId) {
      this.router.navigate(['/organizations', organizationId]);
      return;
    }
    this.router.navigate(['/organizations']);
  }

  async copyCredentials(): Promise<void> {
    const result = this.organizationResult();
    if (!result) {
      return;
    }
    const text = `Login: https://${result.domainName.replace(/^https?:\/\//, '')}\nUsername: ${result.adminUser.username}\nPassword: ${this.generatedAdminPassword()}`;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show('Credentials copied to clipboard', 'success');
    } catch {
      this.toast.show('Could not copy — select and copy manually', 'critical');
    }
  }

  downloadCredentials(): void {
    const result = this.organizationResult();
    if (!result) {
      return;
    }
    const subscriptionLines = result.subscriptions
      .map((subscription) => `  - ${subscription.planName} (${subscription.primaryAppName}) admin role: ${subscription.adminSubscriptionRoleName}`)
      .join('\n');
    const text = `FLIP organization credentials — one-time only\n\nOrganization: ${result.organizationName}\nLogin URL: https://${result.domainName.replace(/^https?:\/\//, '')}\nUsername: ${result.adminUser.username}\nPassword: ${this.generatedAdminPassword()}\n\nSubscriptions:\n${subscriptionLines}\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.organizationName.toLowerCase().replace(/\s+/g, '-')}-credentials.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

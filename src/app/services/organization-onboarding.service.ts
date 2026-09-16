import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../core/api-config';
import { AuthService } from '../core/auth/auth.service';
import {
  OnboardingPlan,
  OnboardedSubscription,
  OrganizationDomain,
  OrganizationOnboardingResult,
  PlatformEnvironmentConfig,
  SubscriptionOnboardingResult
} from '../models';

export interface SubscriptionDraft {
  planId: string;
  planStartDate: string;
  planEndDate: string;
  orgPlanLimit: number | null;
  provisionDeveloperRole: boolean;
}

export interface OrganizationOnboardingDraft {
  organizationName: string;
  domainPrefix: string;
  domainName: string;
  emailDomain: string;
  orgExternalId: string;
  paidOrg: boolean;
  dedicatedSchemaRequired: boolean;
  diAppProvisionRequired: boolean;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  subscriptions: SubscriptionDraft[];
}

export interface ExistingOrganizationSubscriptionDraft {
  subscriptionAdminUsername: string;
  subscriptions: SubscriptionDraft[];
}

const ONBOARDING_BASE_URL = `${API_BASE_URL}/api/v1/onboarding`;

export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const randomValues = new Uint32Array(20);
  crypto.getRandomValues(randomValues);
  const body = Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
  return `Fl1p-${body}!`;
}

export function emptySubscriptionDraft(): SubscriptionDraft {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 365);
  return {
    planId: '',
    planStartDate: startDate.toISOString().slice(0, 10),
    planEndDate: endDate.toISOString().slice(0, 10),
    orgPlanLimit: null,
    provisionDeveloperRole: false
  };
}

@Injectable({ providedIn: 'root' })
export class OrganizationOnboardingService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private readonly plans = signal<OnboardingPlan[]>([]);
  private readonly plansLoaded = signal(false);

  availablePlans() {
    return this.plans;
  }

  planById(planId: string): OnboardingPlan | undefined {
    return this.plans().find((plan) => plan.planId === planId);
  }

  async loadPlans(forceReload = false): Promise<OnboardingPlan[]> {
    if (this.plansLoaded() && !forceReload) {
      return this.plans();
    }
    try {
      const plans = await firstValueFrom(this.http.get<OnboardingPlan[]>(`${ONBOARDING_BASE_URL}/plans`));
      this.plans.set(plans);
      this.plansLoaded.set(true);
      return plans;
    } catch (error) {
      console.error('Failed to load onboarding plans', error);
      throw new Error(this.describeError(error));
    }
  }

  async checkDomainPrefixAvailable(domainPrefix: string): Promise<boolean> {
    const prefix = domainPrefix.trim().toLowerCase();
    if (!prefix) {
      return false;
    }
    return firstValueFrom(
      this.http.get<boolean>(`${API_BASE_URL}/user/checkDomainAvailability`, { params: { subdomainName: prefix } })
    );
  }

  private environmentPromise: Promise<PlatformEnvironmentConfig | null> | null = null;

  // The base domain is resolved by the backend from the datasource it is wired to, so an instance
  // pointed at SIT cannot preview a dev or prod URL.
  async getEnvironmentConfig(): Promise<PlatformEnvironmentConfig | null> {
    if (!this.environmentPromise) {
      this.environmentPromise = firstValueFrom(
        this.http.get<PlatformEnvironmentConfig>(`${API_BASE_URL}/platform/environment-config`)
      ).catch((error) => {
        console.error('Failed to load environment config', error);
        this.environmentPromise = null;
        return null;
      });
    }
    return this.environmentPromise;
  }

  async getBaseDomain(): Promise<string | null> {
    return (await this.getEnvironmentConfig())?.baseDomain ?? null;
  }

  async getDomain(organizationId: string): Promise<OrganizationDomain> {
    return firstValueFrom(this.http.get<OrganizationDomain>(`${ONBOARDING_BASE_URL}/organizations/${organizationId}/domain`));
  }

  async activateDomain(organizationId: string, dnsAlreadyProvisioned = false): Promise<OrganizationDomain> {
    const actorId = this.requireActorId();
    try {
      return await firstValueFrom(
        this.http.post<OrganizationDomain>(
          `${ONBOARDING_BASE_URL}/organizations/${organizationId}/domain/activate?actorUserId=${actorId}&dnsAlreadyProvisioned=${dnsAlreadyProvisioned}`,
          {}
        )
      );
    } catch (error) {
      throw new Error(this.describeError(error));
    }
  }

  // Retries data integration app provisioning, or records that one was created outside this
  // console. The provisioning service runs per-environment and is handed the organization's own
  // database credentials, so it legitimately cannot reach a locally-onboarded organization - the
  // adopt path is what unblocks those.
  async provisionDiApp(organizationId: string, alreadyProvisioned: boolean): Promise<OrganizationDomain> {
    const actorId = this.requireActorId();
    try {
      return await firstValueFrom(
        this.http.post<OrganizationDomain>(
          `${ONBOARDING_BASE_URL}/organizations/${organizationId}/di-app/provision?actorUserId=${actorId}&alreadyProvisioned=${alreadyProvisioned}`,
          {}
        )
      );
    } catch (error) {
      throw new Error(this.describeError(error));
    }
  }

  async deactivateDomain(organizationId: string): Promise<OrganizationDomain> {
    const actorId = this.requireActorId();
    try {
      return await firstValueFrom(
        this.http.post<OrganizationDomain>(
          `${ONBOARDING_BASE_URL}/organizations/${organizationId}/domain/deactivate?actorUserId=${actorId}`,
          {}
        )
      );
    } catch (error) {
      throw new Error(this.describeError(error));
    }
  }

  validateOrganizationDraft(draft: OrganizationOnboardingDraft): string[] {
    const errors: string[] = [];
    if (!draft.organizationName.trim()) {
      errors.push('Organization name is required.');
    }
    if (!draft.domainPrefix.trim()) {
      errors.push('Web address is required.');
    } else if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(draft.domainPrefix.trim().toLowerCase())) {
      errors.push('Web address may only contain lowercase letters, digits and hyphens.');
    }
    if (!/.+@.+\..+/.test(draft.adminEmail.trim())) {
      errors.push('A valid admin email is required.');
    }
    errors.push(...this.validateSubscriptionDrafts(draft.subscriptions));
    return errors;
  }

  validateSubscriptionDrafts(subscriptions: SubscriptionDraft[]): string[] {
    const errors: string[] = [];
    if (!subscriptions.length) {
      errors.push('At least one subscription is required.');
      return errors;
    }

    const selectedPlanIds = new Set<string>();
    const selectedPrimaryAppIds = new Set<string>();

    subscriptions.forEach((subscription, index) => {
      const position = index + 1;
      if (!subscription.planId) {
        errors.push(`Subscription ${position}: a plan must be selected.`);
        return;
      }
      if (selectedPlanIds.has(subscription.planId)) {
        errors.push(`Subscription ${position}: this plan is already selected.`);
        return;
      }
      selectedPlanIds.add(subscription.planId);

      const plan = this.planById(subscription.planId);
      if (!plan) {
        errors.push(`Subscription ${position}: the selected plan is no longer available.`);
        return;
      }
      if (!plan.onboardingReady) {
        errors.push(`Subscription ${position}: ${plan.planName} cannot be onboarded — ${plan.readinessMessage}.`);
        return;
      }
      if (plan.primaryAppId) {
        if (selectedPrimaryAppIds.has(plan.primaryAppId)) {
          errors.push(`Subscription ${position}: another selected plan already covers ${plan.primaryAppName}.`);
          return;
        }
        selectedPrimaryAppIds.add(plan.primaryAppId);
      }
      if (subscription.provisionDeveloperRole && !plan.developerRoleTemplateAvailable) {
        errors.push(`Subscription ${position}: ${plan.planName} has no developer role template.`);
      }
      if (subscription.planEndDate <= subscription.planStartDate) {
        errors.push(`Subscription ${position}: the end date must be after the start date.`);
      }
    });

    return errors;
  }

  async onboardOrganization(draft: OrganizationOnboardingDraft, adminPassword: string): Promise<OrganizationOnboardingResult> {
    const onboardedBy = this.requireActorId();
    const body = {
      onboardedBy,
      organization: {
        organizationName: draft.organizationName.trim(),
        domainPrefix: draft.domainPrefix.trim().toLowerCase(),
        domainName: draft.domainName.trim().toLowerCase() || null,
        keycloakRealmName: null,
        orgExternalId: draft.orgExternalId.trim() || null,
        emailDomain: draft.emailDomain.trim().toLowerCase() || null,
        paidOrg: draft.paidOrg,
        dedicatedSchemaRequired: draft.dedicatedSchemaRequired,
        diAppProvisionRequired: draft.diAppProvisionRequired
      },
      adminUser: {
        username: draft.adminEmail.trim().toLowerCase(),
        password: adminPassword,
        firstName: draft.adminFirstName.trim(),
        lastName: draft.adminLastName.trim()
      },
      subscriptions: draft.subscriptions.map((subscription) => this.toSubscriptionPayload(subscription))
    };

    try {
      return await firstValueFrom(
        this.http.post<OrganizationOnboardingResult>(`${ONBOARDING_BASE_URL}/organizations`, body)
      );
    } catch (error) {
      console.error('Organization onboarding failed', error);
      throw new Error(this.describeError(error));
    }
  }

  async onboardSubscriptions(
    organizationId: string,
    draft: ExistingOrganizationSubscriptionDraft
  ): Promise<SubscriptionOnboardingResult> {
    const onboardedBy = this.requireActorId();
    const body = {
      onboardedBy,
      subscriptionAdminUsername: draft.subscriptionAdminUsername.trim().toLowerCase() || null,
      subscriptions: draft.subscriptions.map((subscription) => this.toSubscriptionPayload(subscription))
    };

    try {
      return await firstValueFrom(
        this.http.post<SubscriptionOnboardingResult>(
          `${ONBOARDING_BASE_URL}/organizations/${organizationId}/subscriptions`,
          body
        )
      );
    } catch (error) {
      console.error('Subscription onboarding failed', error);
      throw new Error(this.describeError(error));
    }
  }

  async listOnboardedSubscriptions(organizationId: string): Promise<OnboardedSubscription[]> {
    try {
      return await firstValueFrom(
        this.http.get<OnboardedSubscription[]>(`${ONBOARDING_BASE_URL}/organizations/${organizationId}/subscriptions`)
      );
    } catch (error) {
      console.error('Failed to load onboarded subscriptions', error);
      throw new Error(this.describeError(error));
    }
  }

  private toSubscriptionPayload(subscription: SubscriptionDraft) {
    return {
      planId: subscription.planId,
      planStartDate: subscription.planStartDate,
      planEndDate: subscription.planEndDate,
      orgPlanLimit: subscription.orgPlanLimit,
      provisionDeveloperRole: subscription.provisionDeveloperRole
    };
  }

  private requireActorId(): string {
    const actorId = this.auth.getUserId();
    if (!actorId) {
      throw new Error('Your session has expired — sign in again before onboarding.');
    }
    return actorId;
  }

  private describeError(error: unknown): string {
    const httpError = error as { error?: { message?: string }; message?: string };
    return httpError?.error?.message || httpError?.message || 'The onboarding request failed unexpectedly.';
  }
}

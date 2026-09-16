import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ProvisioningRun } from '../models';
import { PROVISIONING_STEP_TEMPLATE } from '../data/mock-data';
import { OrganizationsService } from './organizations.service';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { AuthService } from '../core/auth/auth.service';
import { API_BASE_URL } from '../core/api-config';

export interface OnboardingDraft {
  organizationName: string;
  domainPrefix: string;
  isPaidOrg: boolean;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  planId: string;
  planStartDate: string;
  planEndDate: string;
}

interface OrganizationSetupResponse {
  organizationId: string;
  organizationName: string;
  message: string;
  // Echoes back the organization as the backend resolved it — notably domainName, which the backend
  // derives from the prefix plus the environment's configured base domain.
  organizationDetail?: { domainName?: string };
}

// The admin never chooses this password (Keycloak forces a reset on first login), but it is still a
// real credential in transit and on screen — Math.random() is not a CSPRNG and its output is
// predictable, so it must not be used to mint one.
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  // Guarantees the symbol/digit/case mix Keycloak password policies typically require.
  return `Fl1p-${body}!`;
}

let runCounter = 1;

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private http = inject(HttpClient);
  private organizations = inject(OrganizationsService);
  private plans = inject(PlansService);
  private subscriptions = inject(SubscriptionsService);
  private auth = inject(AuthService);

  private readonly run = signal<ProvisioningRun | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;
  private draft: OnboardingDraft | null = null;

  currentRun() {
    return this.run;
  }

  validate(draft: OnboardingDraft): string[] {
    const errors: string[] = [];
    if (!draft.organizationName.trim()) errors.push('Organization name is required.');
    else if (this.organizations.nameExists(draft.organizationName)) errors.push('An organization with this name already exists.');
    if (!draft.domainPrefix.trim()) errors.push('Web address is required.');
    else if (!this.organizations.domainPrefixAvailable(draft.domainPrefix)) errors.push('This web address is already taken.');
    if (!draft.adminEmail.trim()) errors.push('Admin email is required.');
    if (!draft.planId) errors.push('A plan must be selected.');
    return errors;
  }

  async start(draft: OnboardingDraft): Promise<void> {
    this.draft = draft;
    const steps = PROVISIONING_STEP_TEMPLATE.map((s, i) => ({ ...s, status: i === 0 ? ('CURRENT' as const) : ('PENDING' as const) }));
    this.run.set({
      id: `run-${runCounter++}`,
      organizationName: draft.organizationName,
      status: 'RUNNING',
      steps
      // domainUrl is filled in from the backend's resolved domain once setup returns — it depends on
      // the environment's configured base domain, which only the backend knows.
    });
    this.tick();

    const adminPassword = generatePassword();
    try {
      const response = await this.submit(draft, adminPassword);
      this.succeed(response, adminPassword);
      // Onboarding creates the org's org_subscribed_plan row via this same setup call, but that's
      // invisible to SubscriptionsService until it refetches — without this, every plan-usage view
      // (plan detail's "organizations on this plan", dashboard metrics, the delete-plan guard) stays
      // stale showing zero subscribers for a plan that was in fact just assigned.
      await Promise.all([this.organizations.refresh(), this.subscriptions.refresh()]);
    } catch (err: unknown) {
      this.markFailed(this.describeError(err));
    }
  }

  // Real availability check against Cloudflare + organizations1, via the same backend endpoint the
  // self-service signup flow uses. The local list can only see organizations this console has already
  // loaded, so on its own it silently misses a prefix that exists in DNS or was created elsewhere.
  async checkDomainPrefixAvailable(domainPrefix: string): Promise<boolean> {
    const prefix = domainPrefix.trim().toLowerCase();
    if (!prefix) return false;
    return firstValueFrom(
      this.http.get<boolean>(`${API_BASE_URL}/user/checkDomainAvailability`, { params: { subdomainName: prefix } })
    );
  }

  private baseDomainPromise: Promise<string | null> | null = null;

  // This environment's base domain (e.g. "dev.flipnow.cloud"), fetched once and cached for the life
  // of the app — lets the wizard preview an organization's full future URL live, without hardcoding
  // a suffix client-side that could drift from whatever DNS record the backend actually creates.
  async getBaseDomain(): Promise<string | null> {
    if (!this.baseDomainPromise) {
      this.baseDomainPromise = firstValueFrom(this.http.get<{ baseDomain: string }>(`${API_BASE_URL}/platform/environment-config`))
        .then((res) => res.baseDomain)
        .catch((err) => {
          console.error('Failed to load environment config', err);
          this.baseDomainPromise = null;
          return null;
        });
    }
    return this.baseDomainPromise;
  }

  private async submit(draft: OnboardingDraft, adminPassword: string): Promise<OrganizationSetupResponse> {
    const plan = this.plans.byId(draft.planId);
    if (!plan) throw new Error('Selected plan could not be found — please go back and re-select it.');

    // Every created_by column on the organization, admin user, and subscription must point at the
    // super admin actually performing the onboarding. This previously sent three independent
    // crypto.randomUUID() values, writing UUIDs that match no real user into the audit columns and
    // making it impossible to tell who provisioned a tenant.
    const actorId = this.auth.getUserId();
    if (!actorId) throw new Error('Your session has expired — sign in again before onboarding an organization.');

    const prefix = draft.domainPrefix.trim().toLowerCase();

    const body = {
      organization: {
        organizationName: draft.organizationName,
        createdBy: actorId,
        isDIAppProvisionRequired: false,
        isUseDefaultSchemaDetails: false,
        keycloakRealmName: `flip-${prefix}`,
        domainPrefix: prefix,
        // domainName is deliberately omitted: the backend appends this environment's configured
        // Cloudflare base domain to the prefix. Sending a hardcoded suffix from here produced a
        // stored domain (and Keycloak client root URL) that disagreed with the DNS record actually
        // created — e.g. "acme.flipnow.cloud" persisted while DNS got "acme.<base-domain>".
        isPaidOrg: draft.isPaidOrg
      },
      adminUser: {
        username: draft.adminEmail,
        password: adminPassword,
        firstName: draft.adminFirstName,
        lastName: draft.adminLastName,
        createdBy: actorId
      },
      subscriptionPlan: {
        planName: plan.planName,
        planType: plan.planType,
        createdBy: actorId,
        billingMode: plan.billingMode,
        planStartDate: draft.planStartDate,
        planEndDate: draft.planEndDate
      },
      // The selected plan (default or custom) already exists with its own apps_by_plan rows by the
      // time it's selectable here — nothing to define inline.
      assignedApps: []
    };

    return firstValueFrom(this.http.post<OrganizationSetupResponse>(`${API_BASE_URL}/organizations/setup`, body));
  }

  private describeError(err: unknown): string {
    const httpError = err as { error?: { message?: string }; message?: string };
    return httpError?.error?.message || httpError?.message || 'Organization setup failed unexpectedly.';
  }

  private tick(): void {
    this.clearTimer();
    this.timer = setInterval(() => this.advanceCosmetic(), 700);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Purely a loading animation over the real in-flight request — holds on the last step until the
  // actual response (success or failure) arrives, since the backend runs this as one atomic call.
  private advanceCosmetic(): void {
    const run = this.run();
    if (!run || run.status !== 'RUNNING') {
      this.clearTimer();
      return;
    }
    const currentIndex = run.steps.findIndex((s) => s.status === 'CURRENT');
    if (currentIndex === -1 || currentIndex === run.steps.length - 1) {
      this.clearTimer();
      return;
    }
    const steps = run.steps.map((s, i) => {
      if (i === currentIndex) return { ...s, status: 'DONE' as const };
      if (i === currentIndex + 1) return { ...s, status: 'CURRENT' as const };
      return s;
    });
    this.run.set({ ...run, steps });
  }

  private succeed(response: OrganizationSetupResponse, adminPassword: string): void {
    this.clearTimer();
    const run = this.run();
    if (!run || !this.draft) return;
    const steps = run.steps.map((s) => ({ ...s, status: 'DONE' as const }));
    const warning = response.message?.includes('WARNING') ? response.message : undefined;
    const resolvedDomain = response.organizationDetail?.domainName;
    this.run.set({
      ...run,
      steps,
      status: 'SUCCEEDED',
      domainUrl: resolvedDomain ? `https://${resolvedDomain.replace(/^https?:\/\//, '')}` : run.domainUrl,
      adminUsername: this.draft.adminEmail,
      adminPassword,
      note: warning
    });
  }

  private markFailed(note: string): void {
    this.clearTimer();
    const run = this.run();
    if (!run) return;
    const currentIndex = run.steps.findIndex((s) => s.status === 'CURRENT');
    const steps = run.steps.map((s, i) => (i === currentIndex ? { ...s, status: 'FAILED' as const } : s));
    this.run.set({ ...run, steps, status: 'FAILED', note });
  }

  async retry(): Promise<void> {
    if (!this.draft) return;
    await this.start(this.draft);
  }

  rollback(): void {
    this.clearTimer();
    const run = this.run();
    if (!run) return;
    this.run.set({
      ...run,
      status: 'ROLLED_BACK',
      note: 'Discarded. If anything was partially set up before the failure (database, login, web address), a technical admin should confirm it was cleaned up before you retry with the same name or web address.'
    });
  }

  reset(): void {
    this.clearTimer();
    this.run.set(null);
    this.draft = null;
  }
}

import {
  Application,
  AppUsage,
  OrgSubscribedPlan,
  ProvisioningStep,
  SubscriptionPlan
} from '../models';

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// tiny deterministic PRNG so usage numbers stay stable across reloads while testing
let seed = 42;
function rand(): number {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
function randInt(min: number, max: number): number {
  return Math.floor(min + rand() * (max - min));
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export const APPLICATIONS: Application[] = [
  { appId: 'app-ai-workbench', appName: 'AI Workbench', displayName: null, parentAppId: null, scopes: ['VIEW', 'EXECUTE', 'ALL'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-excel-studio', appName: 'Excel Studio', displayName: null, parentAppId: null, scopes: ['VIEW', 'EDIT', 'ADD', 'DELETE'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-insight-vault', appName: 'Insight Vault', displayName: null, parentAppId: null, scopes: ['VIEW', 'EDIT'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-data-integration', appName: 'Data Integration', displayName: null, parentAppId: null, scopes: ['VIEW', 'EXECUTE', 'ALL'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-connection-manager', appName: 'Connection Manager', displayName: null, parentAppId: 'app-data-integration', scopes: ['VIEW', 'EDIT', 'EXECUTE'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-pipeline', appName: 'Pipeline', displayName: null, parentAppId: 'app-data-integration', scopes: ['VIEW', 'EXECUTE', 'DELETE'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-scheduler', appName: 'Scheduler', displayName: null, parentAppId: 'app-data-integration', scopes: ['VIEW', 'EDIT', 'EXECUTE'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-migration', appName: 'Migration', displayName: null, parentAppId: null, scopes: ['VIEW', 'EXECUTE', 'DELETE'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-mdm', appName: 'MDM', displayName: null, parentAppId: null, scopes: ['VIEW', 'EDIT'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-pdf-extractor', appName: 'PDF Extractor', displayName: null, parentAppId: null, scopes: ['VIEW', 'EXECUTE'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false },
  { appId: 'app-validation', appName: 'Validation', displayName: null, parentAppId: null, scopes: ['VIEW', 'EXECUTE'], assignedOrgCount: 0, planCount: 0, childCount: 0, editable: true, deletable: true, editLockReason: null, deleteLockReason: null, migrationApplication: false, migrationConfigured: false }
];

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const PLANS: SubscriptionPlan[] = [
  {
    planId: 'plan-trial',
    planName: 'Trial', displayName: null,
    description: 'Time-boxed evaluation plan with modest limits across the core applications.',
    planType: 'DEFAULT',
    planState: 'ACTIVE',
    billingMode: 'PREPAID',
    primaryAppId: 'app-ai-workbench',
    isSystemDefault: true,
    assignedOrgCount: 0,
    createdDate: daysFromNow(-540),
    apps: [
      { appId: 'app-ai-workbench', accessStatus: 'ENABLED', designTimeLimit: 5, runtimeLimit: 25 },
      { appId: 'app-excel-studio', accessStatus: 'ENABLED', designTimeLimit: 5, runtimeLimit: 25 },
      { appId: 'app-data-integration', accessStatus: 'ENABLED', designTimeLimit: 3, runtimeLimit: 15 },
      { appId: 'app-connection-manager', accessStatus: 'ENABLED', designTimeLimit: 3, runtimeLimit: 15 },
      { appId: 'app-insight-vault', accessStatus: 'DISABLED', designTimeLimit: 0, runtimeLimit: 0 }
    ]
  },
  {
    planId: 'plan-basic',
    planName: 'Basic', displayName: null,
    description: 'Entry paid tier for small teams running a handful of integrations.',
    planType: 'DEFAULT',
    planState: 'ACTIVE',
    billingMode: 'PREPAID',
    primaryAppId: 'app-data-integration',
    isSystemDefault: true,
    assignedOrgCount: 0,
    createdDate: daysFromNow(-540),
    apps: [
      { appId: 'app-ai-workbench', accessStatus: 'ENABLED', designTimeLimit: 20, runtimeLimit: 200 },
      { appId: 'app-excel-studio', accessStatus: 'ENABLED', designTimeLimit: 20, runtimeLimit: 200 },
      { appId: 'app-data-integration', accessStatus: 'ENABLED', designTimeLimit: 15, runtimeLimit: 150 },
      { appId: 'app-connection-manager', accessStatus: 'ENABLED', designTimeLimit: 15, runtimeLimit: 150 },
      { appId: 'app-pipeline', accessStatus: 'ENABLED', designTimeLimit: 10, runtimeLimit: 100 },
      { appId: 'app-scheduler', accessStatus: 'ENABLED', designTimeLimit: 10, runtimeLimit: 100 },
      { appId: 'app-insight-vault', accessStatus: 'DISABLED', designTimeLimit: 0, runtimeLimit: 0 },
      { appId: 'app-migration', accessStatus: 'DISABLED', designTimeLimit: 0, runtimeLimit: 0 }
    ]
  },
  {
    planId: 'plan-premium',
    planName: 'Premium', displayName: null,
    description: 'Growth tier — higher limits, adds Migration and Insight Vault.',
    planType: 'DEFAULT',
    planState: 'ACTIVE',
    billingMode: 'PREPAID',
    primaryAppId: 'app-data-integration',
    isSystemDefault: true,
    assignedOrgCount: 0,
    createdDate: daysFromNow(-540),
    apps: [
      { appId: 'app-ai-workbench', accessStatus: 'ENABLED', designTimeLimit: 100, runtimeLimit: 1000 },
      { appId: 'app-excel-studio', accessStatus: 'ENABLED', designTimeLimit: -1, runtimeLimit: -1 },
      { appId: 'app-insight-vault', accessStatus: 'ENABLED', designTimeLimit: 50, runtimeLimit: 500 },
      { appId: 'app-data-integration', accessStatus: 'ENABLED', designTimeLimit: 50, runtimeLimit: 500 },
      { appId: 'app-connection-manager', accessStatus: 'ENABLED', designTimeLimit: 50, runtimeLimit: 500 },
      { appId: 'app-pipeline', accessStatus: 'ENABLED', designTimeLimit: 50, runtimeLimit: 500 },
      { appId: 'app-scheduler', accessStatus: 'ENABLED', designTimeLimit: 50, runtimeLimit: 500 },
      { appId: 'app-migration', accessStatus: 'ENABLED', designTimeLimit: 50, runtimeLimit: 500 },
      { appId: 'app-mdm', accessStatus: 'DISABLED', designTimeLimit: 0, runtimeLimit: 0 }
    ]
  },
  {
    planId: 'plan-enterprise',
    planName: 'Enterprise', displayName: null,
    description: 'Full catalogue, unlimited by default, for large multi-department tenants.',
    planType: 'DEFAULT',
    planState: 'ACTIVE',
    billingMode: 'PREPAID',
    primaryAppId: 'app-data-integration',
    isSystemDefault: true,
    assignedOrgCount: 0,
    createdDate: daysFromNow(-540),
    apps: APPLICATIONS.map((a) => ({
      appId: a.appId,
      accessStatus: 'ENABLED' as const,
      designTimeLimit: -1,
      runtimeLimit: -1
    }))
  },
  {
    planId: 'plan-meridian-custom',
    planName: 'Meridian Custom', displayName: null,
    description: 'Built for Harborview Logistics — Data Integration suite plus AI Workbench, capped runtime on Pipeline.',
    planType: 'CUSTOM',
    planState: 'ACTIVE',
    billingMode: 'METERED',
    primaryAppId: 'app-data-integration',
    isSystemDefault: false,
    assignedOrgCount: 0,
    createdDate: daysFromNow(-96),
    apps: [
      { appId: 'app-ai-workbench', accessStatus: 'ENABLED', designTimeLimit: 40, runtimeLimit: -1 },
      { appId: 'app-data-integration', accessStatus: 'ENABLED', designTimeLimit: -1, runtimeLimit: -1 },
      { appId: 'app-connection-manager', accessStatus: 'ENABLED', designTimeLimit: -1, runtimeLimit: -1 },
      { appId: 'app-pipeline', accessStatus: 'ENABLED', designTimeLimit: 60, runtimeLimit: 800 },
      { appId: 'app-scheduler', accessStatus: 'ENABLED', designTimeLimit: -1, runtimeLimit: -1 },
      { appId: 'app-validation', accessStatus: 'ENABLED', designTimeLimit: 20, runtimeLimit: 300 }
    ]
  },
  {
    planId: 'plan-legacy-starter',
    planName: 'Legacy Starter', displayName: null,
    description: 'Retired entry tier, kept only for historical reference on old subscriptions.',
    planType: 'CUSTOM',
    planState: 'ARCHIVED',
    billingMode: 'PREPAID',
    primaryAppId: 'app-excel-studio',
    isSystemDefault: false,
    assignedOrgCount: 0,
    createdDate: daysFromNow(-720),
    apps: [
      { appId: 'app-excel-studio', accessStatus: 'ENABLED', designTimeLimit: 10, runtimeLimit: 80 },
      { appId: 'app-ai-workbench', accessStatus: 'DISABLED', designTimeLimit: 0, runtimeLimit: 0 }
    ]
  }
];

// ---------------------------------------------------------------------------
// Org subscribed plans
// ---------------------------------------------------------------------------

export const ORG_SUBSCRIBED_PLANS: OrgSubscribedPlan[] = [
  { subscriptionId: 'sub-1', orgId: 'org-meridian-health', planId: 'plan-enterprise', planStartDate: daysFromNow(-560), planEndDate: daysFromNow(246), planStatus: 'ACTIVE' },
  { subscriptionId: 'sub-2', orgId: 'org-acme-analytics', planId: 'plan-premium', planStartDate: daysFromNow(-353), planEndDate: daysFromNow(12), planStatus: 'ACTIVE' },
  { subscriptionId: 'sub-3', orgId: 'org-northwind-labs', planId: 'plan-enterprise', planStartDate: daysFromNow(-310), planEndDate: daysFromNow(21), planStatus: 'ACTIVE' },
  { subscriptionId: 'sub-4', orgId: 'org-solace-bank', planId: 'plan-enterprise', planStartDate: daysFromNow(-410), planEndDate: daysFromNow(27), planStatus: 'ACTIVE' },
  { subscriptionId: 'sub-5', orgId: 'org-larkspur-retail', planId: 'plan-trial', planStartDate: daysFromNow(-49), planEndDate: daysFromNow(-4), planStatus: 'EXPIRED' },
  { subscriptionId: 'sub-6', orgId: 'org-cobalt-freight', planId: 'plan-basic', planStartDate: daysFromNow(-190), planEndDate: daysFromNow(175), planStatus: 'SUSPENDED', statusReason: 'Payment failed — card declined twice' },
  { subscriptionId: 'sub-7', orgId: 'org-harborview-logistics', planId: 'plan-meridian-custom', planStartDate: daysFromNow(-96), planEndDate: daysFromNow(180), planStatus: 'ACTIVE' },
  { subscriptionId: 'sub-8', orgId: 'org-pinecrest-university', planId: 'plan-basic', planStartDate: daysFromNow(-700), planEndDate: daysFromNow(2), planStatus: 'ACTIVE' },
  { subscriptionId: 'sub-9', orgId: 'org-verdant-foods', planId: 'plan-premium', planStartDate: daysFromNow(-260), planEndDate: daysFromNow(-30), planStatus: 'CANCELLED' },
  { subscriptionId: 'sub-10', orgId: 'org-blue-anchor', planId: 'plan-trial', planStartDate: daysFromNow(-9), planEndDate: daysFromNow(5), planStatus: 'ACTIVE' }
];

// ---------------------------------------------------------------------------
// App usage (per org, derived loosely from the org's plan)
// ---------------------------------------------------------------------------

export const APP_USAGE: AppUsage[] = ORG_SUBSCRIBED_PLANS.flatMap((sub) => {
  const plan = PLANS.find((p) => p.planId === sub.planId)!;
  return plan.apps
    .filter((a) => a.accessStatus === 'ENABLED')
    .map((a) => {
      const dtLimit = a.designTimeLimit;
      const rtLimit = a.runtimeLimit;
      const dtUsed = dtLimit === -1 ? randInt(20, 400) : randInt(0, dtLimit);
      const rtUsed = rtLimit === -1 ? randInt(100, 4000) : randInt(0, rtLimit);
      return {
        orgId: sub.orgId,
        appId: a.appId,
        appName: null,
        designTimeLimit: dtLimit,
        designTimeUsed: dtUsed,
        // Unlimited stays unlimited rather than becoming a negative remainder.
        designTimeRemaining: dtLimit === -1 ? -1 : Math.max(0, dtLimit - dtUsed),
        runtimeLimit: rtLimit,
        runtimeUsed: rtUsed,
        runtimeRemaining: rtLimit === -1 ? -1 : Math.max(0, rtLimit - rtUsed),
        accessStatus: a.accessStatus
      };
    });
});

// force one clearly near-limit row and one clearly unlimited row for visual testing
(() => {
  const near = APP_USAGE.find((u) => u.orgId === 'org-acme-analytics' && u.appId === 'app-data-integration');
  if (near && near.designTimeLimit > 0) {
    near.designTimeUsed = Math.round(near.designTimeLimit * 0.94);
  }
})();

// ---------------------------------------------------------------------------
// Onboarding provisioning pipeline template
// ---------------------------------------------------------------------------

export const PROVISIONING_STEP_TEMPLATE: ProvisioningStep[] = [
  { key: 'VALIDATE', label: 'Validating details', status: 'PENDING' },
  { key: 'ORG', label: 'Creating organization', status: 'PENDING' },
  { key: 'SCHEMA', label: 'Setting up your workspace', status: 'PENDING' },
  { key: 'ADMIN_USER', label: 'Creating admin user', status: 'PENDING' },
  { key: 'PLAN', label: 'Creating subscription plan', status: 'PENDING' },
  { key: 'PLAN_LINK', label: 'Linking plan to organization', status: 'PENDING' },
  { key: 'APPS', label: 'Enabling applications', status: 'PENDING' },
  { key: 'ROLES', label: 'Setting up user permissions', status: 'PENDING' },
  { key: 'ROLE_GRANT', label: 'Granting admin access', status: 'PENDING' },
  { key: 'KEYCLOAK_REALM', label: 'Setting up secure login', status: 'PENDING' },
  { key: 'DNS', label: 'Setting up your web address', status: 'PENDING' },
  { key: 'TABLES', label: 'Finalizing your workspace', status: 'PENDING' }
];

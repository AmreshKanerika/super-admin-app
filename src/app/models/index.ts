export type PlanStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'UNSUBSCRIBED'
  | 'UPCOMING'
  | 'CANCELLED';

export type PlanType = 'DEFAULT' | 'CUSTOM';
export type PlanState = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type BillingMode = 'PREPAID' | 'METERED';
export type AccessStatus = 'ENABLED' | 'DISABLED' | 'HIDDEN';
export type Scope = 'ADD' | 'EDIT' | 'EXECUTE' | 'DELETE' | 'VIEW' | 'ALL';

export interface Application {
  appId: string;
  /** Machine key the platform resolves apps by, e.g. INFORMATICA_TO_DATABRICKS. */
  appName: string;
  /** Human-facing label the console renders. Server falls back to appName when unset. */
  displayName: string | null;
  parentAppId: string | null;
  scopes: Scope[];

  // Server-computed lock picture. Advisory — every write is re-checked server-side — but it is
  // what lets the catalog disable a button instead of letting someone click into a refusal.
  /** Distinct organizations holding this application through a plan they subscribe to. */
  assignedOrgCount: number;
  planCount: number;
  childCount: number;
  editable: boolean;
  deletable: boolean;
  /** Why editing is blocked. Null when editable. */
  editLockReason: string | null;
  /** Why deleting is blocked. Null when deletable. */
  deleteLockReason: string | null;
  /** Nested directly under Migration, so it carries migration details copied to assigned orgs. */
  migrationApplication: boolean;
  /** A migration application whose migration details have been saved. */
  migrationConfigured: boolean;
}

/** Mirrors com.flip.enums.MigrationSyncStatus. */
export type MigrationSyncStatus =
  | 'SYNCED'
  | 'REMOVED'
  | 'NOT_PRESENT'
  | 'SKIPPED_NO_SCHEMA'
  | 'SKIPPED_NO_TABLE'
  | 'CONFLICT'
  | 'FAILED';

export interface PlanOrganization {
  orgId: string;
  organizationName: string;
  domainPrefix: string | null;
}

/** A subscription plan seen from one application. */
export interface AppPlanOption {
  planId: string;
  planName: string;
  displayName: string | null;
  planType: string | null;
  billingMode: string | null;
  /** The app is this plan's primary application, so it can't be removed from here. */
  primaryApplication: boolean;
  /** Set only for plans that include the app. */
  accessStatus: string | null;
  designTimeLimit: number | null;
  runtimeLimit: number | null;
  /** Organizations with an ACTIVE subscription to the plan. */
  organizations: PlanOrganization[];
}

export interface AppPlanAssignments {
  /** Plans that already include the app. */
  assigned: AppPlanOption[];
  /** Plans it can still be added to — an app is on a plan at most once. */
  available: AppPlanOption[];
}

/** What an assign / remove / sync did for one organization subscribed to the plan. */
export interface OrgAccessResult {
  orgId: string;
  organizationName: string;
  access: 'GRANTED' | 'REVOKED' | 'KEPT_BY_OTHER_PLAN' | 'SYNCED';
  /** Null when the application has no migration details to copy. */
  migrationSync: MigrationSyncStatus | null;
  message: string | null;
}

export interface PlanAssignmentResult {
  planId: string;
  planName: string | null;
  action: 'ADDED' | 'ALREADY_ON_PLAN' | 'REMOVED' | 'NOT_ON_PLAN' | 'SYNCED' | 'BLOCKED' | 'NOT_FOUND';
  message: string | null;
  rolesUpdated: number;
  organizations: OrgAccessResult[];
}

/** A JSON value stored as jsonb and copied verbatim into each assigned org's migration_types. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface MigrationTypeConfig {
  /** Assigned by the server on first save; absent before that. */
  id?: number;
  appId?: string;
  name: string;
  description: string | null;
  sourceFileImage: string | null;
  targetFileImage: string | null;
  migrationTypeUrl: string | null;
  migrationAdditionalFormAttributes: JsonValue;
  migrationFormAttributes: JsonValue;
  targetMigrationDetails: JsonValue;
  migrationAttributes: JsonValue;
  migrationSourceForm: JsonValue;
  migrationTargetForm: JsonValue;
  healthCheckApiUrl: string | null;
  migrationBlobFolder: string | null;
  processingType: string | null;
  migrationEncryptionConfig: JsonValue;
  preMigrationInfo: JsonValue;
  inventorySupported: boolean;
  encryptionApiUrl: string | null;
  createdDate?: string | null;
  modifiedDate?: string | null;
}

export interface MigrationTypeSaveResponse {
  migrationType: MigrationTypeConfig;
  syncResults: OrgAccessResult[];
}

export interface ApplicationScopeRow {
  appScopeId: string;
  appId: string;
  scopeName: Scope;
}

export interface AppLimitConfig {
  appId: string;
  accessStatus: AccessStatus;
  designTimeLimit: number; // -1 = unlimited
  runtimeLimit: number; // -1 = unlimited
}

export interface SubscriptionPlan {
  planId: string;
  planName: string;
  /** Human-facing label the console renders. Null until an admin names the plan. */
  displayName: string | null;
  description: string;
  planType: PlanType;
  planState: PlanState;
  billingMode: BillingMode;
  primaryAppId: string | null;
  isSystemDefault: boolean;
  apps: AppLimitConfig[];
  createdDate: string;
  assignedOrgCount: number;
}

export interface Organization {
  orgId: string;
  organizationName: string;
  domainPrefix: string;
  domainName: string | null;   // null for orgs that never had a URL assigned
  schemaName: string;
  keycloakRealmName: string;
  isPaidOrg: boolean;
  isDecommissioned: boolean;
  isSsoEnabled?: boolean;              // users sign in with Microsoft (set by Azure Marketplace onboarding)
  azureMarketplaceManaged?: boolean;   // billed in the customer's Azure subscription: plans and paid status are read only here
  emailDomain?: string | null;         // every user is expected on this domain; null = no rule
  createdDate: string;
  adminName: string;
  adminEmail: string;
  pendingDeletionAt: string | null;
  deletionReason: string | null;
  domainStatus: DomainStatus | null;
  dnsRecordCreated: boolean;
  domainExpiresAt: string | null;
  domainDaysUntilExpiry: number | null;
}

export interface OrgSubscribedPlan {
  subscriptionId: string;
  orgId: string;
  planId: string;
  planStartDate: string;
  planEndDate: string | null;   // null = open-ended subscription
  planStatus: PlanStatus;
  statusReason?: string;
  azureMarketplaceManaged?: boolean;
}

export type PlanChangeEffective = 'NOW' | 'AT_EXPIRY';

export interface PlanUsageSummary {
  orgId: string;
  subscriptionId: string;
  planId: string;
  planName: string;
  orgPlanLimit: number;
  orgUsedLimit: number;
  orgRemainingLimit: number;
  planStartDate: string;
  planEndDate: string;
  daysRemaining: number;
}

export interface AppUsage {
  orgId: string;
  appId: string;
  appName: string | null;
  designTimeLimit: number;
  designTimeUsed: number;
  // Stored server-side rather than derived: for an unlimited app (-1) "remaining"
  // is the sentinel, not limit-minus-used, so recomputing it here would turn
  // unlimited into a negative number.
  designTimeRemaining: number;
  runtimeLimit: number;
  runtimeUsed: number;
  runtimeRemaining: number;
  accessStatus: AccessStatus;
}

export type NotificationOffset = 30 | 15 | 7 | 1 | 0;

export interface NotificationSettings {
  offsets: NotificationOffset[];
  ccRecipients: string[];
  enabled: boolean;
}

export interface NotificationLogEntry {
  id: string;
  orgId: string;
  subscriptionId: string;
  offsetDays: NotificationOffset;
  recipient: string;
  subject: string;
  status: 'SENT' | 'FAILED' | 'QUEUED';
  sentDate: string;
}


export interface AuditLogEntry {
  id: string;
  actorEmail: string;
  actorName?: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel: string;
  result: 'SUCCESS' | 'FAILURE';
  createdDate: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

export type ProvisioningStepStatus = 'DONE' | 'CURRENT' | 'PENDING' | 'FAILED';

export interface ProvisioningStep {
  key: string;
  label: string;
  status: ProvisioningStepStatus;
}

export interface ProvisioningRun {
  id: string;
  organizationName: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ROLLED_BACK';
  steps: ProvisioningStep[];
  adminUsername?: string;
  adminPassword?: string;
  domainUrl?: string;
  note?: string;
}

export interface OffboardingPreCheck {
  orgId: string;
  activeUsers: number;
  runningJobs: number;
  openSubscriptions: number;
  eligible: boolean;
}

export interface OrganizationArchiveSummary {
  id: string;
  orgId: string;
  organizationName: string;
  domainName: string | null;
  adminEmail: string | null;
  reason: string | null;
  archivedBy: string | null;
  archivedDate: string;
}

export type ConsoleUserRole = 'SUPER_ADMIN' | 'SALES';

export interface ConsoleUser {
  id: string;
  keycloakSubjectId: string | null;
  email: string;
  displayName: string | null;
  role: ConsoleUserRole;
  // Only present on the response right after creating a brand-new login — never on list().
  temporaryPassword?: string | null;
}

export interface OnboardingPlan {
  planId: string;
  planName: string;
  planType: PlanType;
  billingMode: BillingMode;
  primaryAppId: string | null;
  primaryAppName: string | null;
  adminRoleTemplateName: string | null;
  developerRoleTemplateAvailable: boolean;
  entitledAppNames: string[];
  onboardingReady: boolean;
  readinessMessage: string | null;
}

export interface OnboardedSubscription {
  subscriptionId: string;
  planId: string;
  planName: string | null;
  primaryAppId: string | null;
  primaryAppName: string | null;
  planStatus: PlanStatus;
  planStartDate: string;
  planEndDate: string;
  orgPlanLimit: number;
  adminSubscriptionRoleId: string | null;
  adminSubscriptionRoleName: string | null;
  developerSubscriptionRoleId: string | null;
  developerSubscriptionRoleName: string | null;
}

export interface OnboardedAdminUser {
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  newlyCreated: boolean;
}

export interface OrganizationOnboardingResult {
  organizationId: string;
  organizationName: string;
  domainPrefix: string;
  domainName: string;
  keycloakRealmName: string;
  schemaName: string;
  dedicatedSchemaCreated: boolean;
  organizationCreated: boolean;
  adminUser: OnboardedAdminUser;
  subscriptions: OnboardedSubscription[];
  warnings: string[];
  message: string;
  completedAt: string;
  domainStatus: DomainStatus;
  domainExpiresAt: string | null;
}

export interface SubscriptionOnboardingResult {
  organizationId: string;
  organizationName: string;
  subscriptionAdmin: OnboardedAdminUser;
  subscriptions: OnboardedSubscription[];
  message: string;
  completedAt: string;
}

export type DomainStatus = 'INACTIVE' | 'ACTIVE' | 'RELEASED';

export interface OrganizationDomain {
  organizationId: string;
  organizationName: string;
  domainPrefix: string;
  domainName: string;
  domainStatus: DomainStatus;
  dnsRecordCreated: boolean;
  reservedAt: string | null;
  expiresAt: string | null;
  activatedAt: string | null;
  daysUntilExpiry: number | null;
  diAppRequested: boolean;
  diAppStatus: DiAppStatus;
  diAppMessage: string | null;
  adminUsername: string | null;
  temporaryPassword: string | null;
  message: string | null;
}

export type DiAppStatus = 'NOT_REQUIRED' | 'PENDING' | 'PROVISIONED' | 'FAILED';

export interface PlatformEnvironmentConfig {
  baseDomain: string;
  environment: string;
  derivedFromDatasource: boolean;
  domainReservationDays: number;
}

/** The organization-level allowance — the counter a one-click reset puts back to zero. */
export interface OrgPlanUsage {
  orgId: string;
  planName: string | null;
  orgPlanLimit: number;
  orgUsedLimit: number;
  orgRemainingLimit: number;
}

/**
 * Which consumption counters a reset clears. Design-time and runtime are enforced
 * independently, so a customer blocked on one is not necessarily blocked on the other.
 * No scope ever changes a limit — only used/remaining.
 */
export type UsageResetScope = 'DESIGN_TIME' | 'RUNTIME' | 'BOTH';

export interface UsageResetTarget {
  planId: string;
  appId: string;
}

export interface OrgUsageSnapshot {
  orgId: string;
  plans: {
    planId: string;
    planName: string | null;
    limit: number | null;
    used: number | null;
    remaining: number | null;
    apps: {
      appId: string;
      appName: string | null;
      accessStatus: AccessStatus | null;
      designTimeLimit: number | null;
      designTimeUsed: number | null;
      designTimeRemaining: number | null;
      runtimeLimit: number | null;
      runtimeUsed: number | null;
      runtimeRemaining: number | null;
    }[];
  }[];
}

export interface ResetOrgUsageResult {
  orgId: string;
  scope: UsageResetScope;
  rowsReset: number;
  designTimeRowsReset: number;
  runtimeRowsReset: number;
  plans: {
    planId: string | null;
    planName: string | null;
    orgPlanLimit: number | null;
    orgUsedLimit: number | null;
    orgRemainingLimit: number | null;
    previousUsedLimit: number | null;
  }[];
  message: string;
}

// --- Organization users & roles (platform console) -------------------------------------------

/** A role as the console shows it: the custom-role bundle id for custom roles, the subscription role id otherwise. */
export interface OrgUserRoleRef {
  roleId: string;
  roleName: string;
  roleType: 'ADMIN' | 'DEVELOPER' | 'CUSTOM' | string | null;
}

export interface OrgUser {
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  /** This org is the user's home organization rather than an additional membership. */
  homeOrganization: boolean;
  /** The org's original Admin (first Admin, at onboarding): can't be removed or lose Admin. */
  primaryAdmin: boolean;
  createdDate: string | null;
  roles: OrgUserRoleRef[];
}

export interface OrgPendingInvite {
  inviteId: number;
  username: string;
  expiresAt: string | null;
  roles: OrgUserRoleRef[];
}

export interface OrgUsersResponse {
  users: OrgUser[];
  pendingInvites: OrgPendingInvite[];
}

export interface CreateOrgUserResult {
  user: OrgUser;
  /** Shown once. Null when the person already had a login for this org and keeps their password. */
  temporaryPassword: string | null;
  signInUrl: string | null;
  /** SSO organization: the user signs in with Microsoft and has no FLIP password. */
  ssoSignIn?: boolean;
  emailSent: boolean;
  emailError: string | null;
  message: string | null;
}

export interface OrgRbacScope {
  appScopeId: string;
  scopeName: string;
}

export interface OrgRoleApp {
  appId: string;
  appName: string;
  accessStatus: string | null;
  scopes: OrgRbacScope[];
}

export interface OrgRole {
  /** Bundle id for custom roles, subscription role id for Admin/Developer. */
  roleId: string;
  roleName: string;
  roleType: 'ADMIN' | 'DEVELOPER' | 'CUSTOM';
  roleDescription: string | null;
  customRoleBundleId: string | null;
  subscriptionRoleIds: string[];
  orgSubscribedPlanId: string | null;
  planId: string | null;
  editable: boolean;
  apps: OrgRoleApp[];
}

/** An app on the org's active plans, with the scopes a custom role can grant. */
export interface OrgRoleAppOption {
  appId: string;
  appName: string;
  parentAppId: string | null;
  accessStatus: string | null;
  limitsExhausted: boolean;
  limitMessage: string | null;
  selectable: boolean;
  scopes: OrgRbacScope[];
}

export interface OrgRoleUpsert {
  roleName: string;
  roleDescription: string | null;
  appsEnabled: { appId: string; scopeIds: string[] }[];
}

// --- Organization file-processing insights (read from the organization's own schema) ---

export interface ProcessingTotals {
  filesProcessed: number;
  pagesProcessed: number;
  manualReview: number;
}

/** One source file type (PDF, XLSX, XLS, CSV or ZIP). */
export interface ProcessingFileTypeRow {
  fileType: string;
  filesProcessed: number;
  manualReview: number;
}

export interface ProcessingInsights {
  from: string;
  to: string;
  availableMonths: string[];
  schema: string;
  sharedWithOrganizations: number;
  missingTables: string[];
  totals: ProcessingTotals;
  byFileType: ProcessingFileTypeRow[];
}

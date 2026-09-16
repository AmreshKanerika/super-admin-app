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
  appName: string;
  parentAppId: string | null;
  scopes: Scope[];
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
  domainName: string;
  schemaName: string;
  keycloakRealmName: string;
  isPaidOrg: boolean;
  isDecommissioned: boolean;
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
  planEndDate: string;
  planStatus: PlanStatus;
  statusReason?: string;
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
  designTimeLimit: number;
  designTimeUsed: number;
  runtimeLimit: number;
  runtimeUsed: number;
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

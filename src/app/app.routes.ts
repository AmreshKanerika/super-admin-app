import { Routes } from '@angular/router';
import { ShellComponent } from './core/layout/shell.component';
import { authGuard, roleGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', loadComponent: () => import('./features/overview/overview.component').then((m) => m.OverviewComponent) },
      {
        path: 'organizations',
        loadComponent: () => import('./features/organizations/organizations-list.component').then((m) => m.OrganizationsListComponent)
      },
      {
        path: 'organizations/:id',
        loadComponent: () => import('./features/organizations/organization-detail.component').then((m) => m.OrganizationDetailComponent)
      },
      // Application limits are per-organization, so they live on the organization's own
      // "Apps & limits" tab rather than as a separate section. Old links land on the list.
      { path: 'limits', redirectTo: 'organizations', pathMatch: 'full' },
      {
        path: 'plans',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/plans/plans-list.component').then((m) => m.PlansListComponent)
      },
      {
        path: 'plans/new',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/plans/plan-builder.component').then((m) => m.PlanBuilderComponent)
      },
      {
        path: 'plans/:id/edit',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/plans/plan-builder.component').then((m) => m.PlanBuilderComponent)
      },
      {
        path: 'plans/:id',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/plans/plan-detail.component').then((m) => m.PlanDetailComponent)
      },
      {
        path: 'onboarding/new',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () =>
          import('./features/onboarding/subscription-onboarding-wizard.component').then(
            (m) => m.SubscriptionOnboardingWizardComponent
          )
      },
      {
        path: 'onboarding/legacy',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/onboarding/onboarding-wizard.component').then((m) => m.OnboardingWizardComponent)
      },
      {
        path: 'organizations/:id/subscriptions/new',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () =>
          import('./features/onboarding/subscription-onboarding-wizard.component').then(
            (m) => m.SubscriptionOnboardingWizardComponent
          )
      },
      {
        path: 'subscriptions',
        loadComponent: () => import('./features/subscriptions/subscriptions-list.component').then((m) => m.SubscriptionsListComponent)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent)
      },
      {
        path: 'offboarding',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/offboarding/offboarding-list.component').then((m) => m.OffboardingListComponent)
      },
      {
        path: 'audit-log',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/audit-log/audit-log.component').then((m) => m.AuditLogComponent)
      },
      {
        path: 'console-users',
        canActivate: [roleGuard(['SUPER_ADMIN'])],
        loadComponent: () => import('./features/console-users/console-users.component').then((m) => m.ConsoleUsersComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'overview' }
];

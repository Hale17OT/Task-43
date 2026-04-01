import { Routes } from '@angular/router';
import { authGuard, roleGuard, permissionGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },

  // Client routes — permission-gated
  {
    path: 'client/dashboard',
    loadComponent: () =>
      import('./features/client/client-dashboard.component').then(m => m.ClientDashboardComponent),
    canActivate: [permissionGuard('client.dashboard', 'client')],
  },
  {
    path: 'client/bookings/create',
    loadComponent: () =>
      import('./features/client/booking-create.component').then(m => m.BookingCreateComponent),
    canActivate: [permissionGuard('client.bookings', 'client')],
  },
  {
    path: 'client/bookings',
    loadComponent: () =>
      import('./features/client/booking-list.component').then(m => m.BookingListComponent),
    canActivate: [permissionGuard('client.bookings', 'client')],
  },
  {
    path: 'client/credit-history',
    loadComponent: () =>
      import('./features/client/credit-history.component').then(m => m.CreditHistoryComponent),
    canActivate: [permissionGuard('client.credit', 'client')],
  },

  // Lawyer routes — permission-gated
  {
    path: 'lawyer/dashboard',
    loadComponent: () =>
      import('./features/lawyer/lawyer-dashboard.component').then(m => m.LawyerDashboardComponent),
    canActivate: [permissionGuard('lawyer.dashboard', 'lawyer')],
  },
  {
    path: 'lawyer/availability',
    loadComponent: () =>
      import('./features/lawyer/availability-manager.component').then(m => m.AvailabilityManagerComponent),
    canActivate: [permissionGuard('lawyer.availability', 'lawyer')],
  },
  {
    path: 'lawyer/bookings',
    loadComponent: () =>
      import('./features/lawyer/booking-requests.component').then(m => m.BookingRequestsComponent),
    canActivate: [permissionGuard('lawyer.bookings', 'lawyer')],
  },

  // Admin routes — permission-gated to match sidebar visibility
  {
    path: 'admin/dashboard',
    loadComponent: () =>
      import('./features/admin/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [permissionGuard('admin.dashboard', 'admin', 'super_admin')],
  },
  {
    path: 'admin/jobs',
    loadComponent: () =>
      import('./features/admin/job-monitor.component').then(m => m.JobMonitorComponent),
    canActivate: [permissionGuard('admin.jobs', 'admin', 'super_admin')],
  },
  {
    path: 'admin/arbitration',
    loadComponent: () =>
      import('./features/admin/arbitration.component').then(m => m.ArbitrationComponent),
    canActivate: [permissionGuard('admin.arbitration', 'admin', 'super_admin')],
  },
  {
    path: 'admin/users',
    loadComponent: () =>
      import('./features/admin/user-management.component').then(m => m.UserManagementComponent),
    canActivate: [permissionGuard('admin.users', 'admin', 'super_admin')],
  },
  {
    path: 'admin/organizations',
    loadComponent: () =>
      import('./features/admin/org-management.component').then(m => m.OrgManagementComponent),
    canActivate: [permissionGuard('admin.organizations', 'super_admin')],
  },
  {
    path: 'admin/config',
    loadComponent: () =>
      import('./features/admin/config-management.component').then(m => m.ConfigManagementComponent),
    canActivate: [permissionGuard('admin.config', 'admin', 'super_admin')],
  },

  // Reviews routes (shared across roles)
  {
    path: 'reviews/dispute/:reviewId',
    loadComponent: () =>
      import('./features/reviews/dispute-form.component').then(m => m.DisputeFormComponent),
    canActivate: [permissionGuard('reviews', 'client', 'lawyer', 'admin', 'super_admin')],
  },
  {
    path: 'reviews/new/:bookingId',
    loadComponent: () =>
      import('./features/reviews/review-form.component').then(m => m.ReviewFormComponent),
    canActivate: [permissionGuard('reviews', 'client', 'lawyer', 'admin', 'super_admin')],
  },
  {
    path: 'reviews',
    loadComponent: () =>
      import('./features/reviews/review-list.component').then(m => m.ReviewListComponent),
    canActivate: [permissionGuard('reviews', 'client', 'lawyer', 'admin', 'super_admin')],
  },

  // Reports routes — permission-gated
  {
    path: 'reports/subscriptions',
    loadComponent: () =>
      import('./features/reports/subscription-manager.component').then(m => m.SubscriptionManagerComponent),
    canActivate: [permissionGuard('reports.subscriptions', 'admin', 'super_admin')],
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./features/reports/report-viewer.component').then(m => m.ReportViewerComponent),
    canActivate: [permissionGuard('reports', 'admin', 'super_admin')],
  },

  // Notifications — permission-gated
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications/notification-inbox.component').then(m => m.NotificationInboxComponent),
    canActivate: [permissionGuard('notifications', 'client', 'lawyer', 'admin', 'super_admin')],
  },

  // Default redirect
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];

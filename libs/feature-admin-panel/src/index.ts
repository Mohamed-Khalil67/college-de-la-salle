import type { Routes } from '@angular/router';

export const ADMIN_PANEL_ROUTES: Routes = [
  {
    path: '',
    title: 'إدارة الصلاحيات',
    loadComponent: () => import('./lib/admin-panel.page').then((m) => m.AdminPanelPage),
  },
];

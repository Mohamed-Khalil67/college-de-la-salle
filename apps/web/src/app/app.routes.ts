import type { Routes } from '@angular/router';
import { ADMIN_NAV } from './admin/admin.routes';
import { anonymousGuard, firstAccessGuard, roleGuard, structureGuard } from './core/auth/auth.guards';
import { ELEVE_NAV } from './eleve/eleve.routes';
import { ENSEIGNANT_NAV } from './enseignant/enseignant.routes';

const spaceLayout = () => import('./layout/space-layout').then((m) => m.SpaceLayout);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/public-layout').then((m) => m.PublicLayout),
    loadChildren: () => import('./public/public.routes').then((m) => m.PUBLIC_ROUTES),
  },
  {
    path: 'connexion',
    title: 'Connexion',
    canMatch: [anonymousGuard],
    loadComponent: () => import('./auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'premier-acces',
    title: 'Premier accès',
    canMatch: [firstAccessGuard],
    loadComponent: () => import('./auth/first-access-page').then((m) => m.FirstAccessPage),
  },
  {
    path: 'eleve',
    canMatch: [roleGuard('student')],
    data: { areaLabel: 'Espace élève', nav: ELEVE_NAV },
    loadComponent: spaceLayout,
    loadChildren: () => import('./eleve/eleve.routes').then((m) => m.ELEVE_ROUTES),
  },
  {
    path: 'enseignant',
    canMatch: [roleGuard('teacher')],
    data: { areaLabel: 'Espace enseignant', nav: ENSEIGNANT_NAV },
    loadComponent: spaceLayout,
    loadChildren: () => import('./enseignant/enseignant.routes').then((m) => m.ENSEIGNANT_ROUTES),
  },
  {
    path: 'admin',
    canMatch: [structureGuard],
    data: { areaLabel: 'Administration', coordinatorAreaLabel: 'Coordination', nav: ADMIN_NAV },
    loadComponent: spaceLayout,
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  // Addresses of the previous site.
  { path: 'espace-eleve', redirectTo: 'eleve' },
  { path: 'espace-enseignant', redirectTo: 'enseignant' },
  { path: '**', redirectTo: '' },
];

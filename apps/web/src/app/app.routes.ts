import type { Routes } from '@angular/router';
import { anonymousGuard, firstAccessGuard, roleGuard, structureGuard } from './core/auth/auth.guards';
import type { SiteLocale } from './i18n/locale';
import { ADMIN_NAV, ELEVE_NAV, ENSEIGNANT_NAV } from './layout/space-navs';

const spaceLayout = () => import('./layout/space-layout').then((m) => m.SpaceLayout);

/** The French words come in their own chunk, loaded with the public and sign-in routes. */
const fr = () => import('./i18n/fr').then((m): SiteLocale => m.FR);
const publicSite = () =>
  Promise.all([import('./features/public/public.routes'), fr()]).then(([m, l]) => m.publicRoutes(l));
const login = () => Promise.all([import('./features/auth/login.routes'), fr()]).then(([m, l]) => m.loginRoutes(l));

export const routes: Routes = [
  {
    path: 'connexion/oubli',
    title: 'Mot de passe oublié',
    canMatch: [anonymousGuard],
    loadComponent: () => import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
  },
  {
    // Opened from the e-mailed link; no guard, so a signed-in user can still use it.
    path: 'connexion/reinitialiser',
    title: 'Nouveau mot de passe',
    loadComponent: () => import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'premier-acces',
    title: 'Premier accès',
    canMatch: [firstAccessGuard],
    loadComponent: () => import('./features/auth/first-access-page').then((m) => m.FirstAccessPage),
  },
  {
    path: 'eleve',
    canMatch: [roleGuard('student')],
    data: { areaLabel: 'Espace élève', nav: ELEVE_NAV },
    loadComponent: spaceLayout,
    loadChildren: () => import('./features/eleve/eleve.routes').then((m) => m.ELEVE_ROUTES),
  },
  {
    path: 'enseignant',
    canMatch: [roleGuard('teacher')],
    data: { areaLabel: 'Espace enseignant', nav: ENSEIGNANT_NAV },
    loadComponent: spaceLayout,
    loadChildren: () => import('./features/enseignant/enseignant.routes').then((m) => m.ENSEIGNANT_ROUTES),
  },
  {
    path: 'admin',
    canMatch: [structureGuard],
    data: { areaLabel: 'Administration', plannerAreaLabel: 'Planification', nav: ADMIN_NAV },
    loadComponent: spaceLayout,
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: 'connexion', canMatch: [anonymousGuard], loadChildren: login },
  // Addresses of the previous site.
  { path: 'espace-eleve', redirectTo: 'eleve' },
  { path: 'espace-enseignant', redirectTo: 'enseignant' },
  { path: '', loadChildren: publicSite },
  { path: '**', redirectTo: '' },
];

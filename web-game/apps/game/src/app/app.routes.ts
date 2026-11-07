import { Routes, UrlSegment, type UrlMatchResult } from '@angular/router';

const PREFIX = 'scenariusz-';

/** `#/scenariusz-kolonia` → GamePage with preset "kolonia" (W15 C; the address style of the plan). */
export function presetMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  const first = segments[0];
  if (segments.length !== 1 || !first?.path.startsWith(PREFIX)) return null;
  return { consumed: segments, posParams: { preset: new UrlSegment(first.path.slice(PREFIX.length), {}) } };
}

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/main-page').then((m) => m.MainPage), title: 'Znany wszechświat' },
  { path: 'logowanie', loadComponent: () => import('./pages/login-page').then((m) => m.LoginPage), title: 'Logowanie' },
  { path: 'gra', loadComponent: () => import('./pages/game-page').then((m) => m.GamePage), title: 'Gra' },
  { matcher: presetMatcher, loadComponent: () => import('./pages/game-page').then((m) => m.GamePage), title: 'Scenariusz' },
  { path: '**', redirectTo: '' },
];

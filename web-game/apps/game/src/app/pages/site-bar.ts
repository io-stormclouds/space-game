import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TEXT } from '../i18n/pl';

/** Top bar of the entry screens (canvas boards 1 and 2). */
@Component({
  selector: 'wg-site-bar',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <div class="brand">
        <span class="hud-micro">{{ t.app.catalogLine }}</span>
        <span class="name">{{ t.app.gameName }}</span>
      </div>
      @if (mode() === 'main') {
        <nav class="tabs" [attr.aria-label]="t.nav.catalog">
          <span class="tab is-on" aria-current="page">{{ t.nav.catalog }}</span>
          <span class="tab">{{ t.nav.about }}</span>
          <span class="tab">{{ t.nav.rankings }}</span>
        </nav>
        <span class="grow"></span>
        <span class="hud-micro online">■ {{ t.nav.server }}</span>
        <a class="login" routerLink="/logowanie">{{ t.nav.login }} <kbd>Enter</kbd></a>
      } @else {
        <span class="grow"></span>
        <a class="back" routerLink="/">{{ t.nav.back }}</a>
      }
    </header>
  `,
  styles: `
    .bar { display: flex; align-items: stretch; height: 48px; background: var(--hud-color-hull); border-top: 1px solid var(--hud-color-signal); border-bottom: 1px solid var(--hud-color-line); }
    .brand { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 var(--hud-space-6); border-right: 1px solid var(--hud-color-line); }
    .name { font-weight: var(--hud-font-weight-bold); letter-spacing: var(--hud-tracking-title); text-transform: uppercase; }
    .tabs { display: flex; align-items: center; padding: 0 var(--hud-space-5); gap: 0; }
    .tab { padding: 8px 12px; border: 1px solid var(--hud-color-line); font-size: var(--hud-font-size-label); letter-spacing: var(--hud-tracking-label); text-transform: uppercase; color: var(--hud-color-text-dim); }
    .tab.is-on { color: var(--hud-color-signal); border-bottom: 2px solid var(--hud-color-signal); }
    .grow { flex: 1; }
    .online { align-self: center; margin-right: var(--hud-space-6); }
    .login, .back { align-self: center; margin-right: var(--hud-space-6); color: var(--hud-color-signal); text-decoration: none; font-weight: var(--hud-font-weight-bold); letter-spacing: var(--hud-tracking-title); text-transform: uppercase; font-size: var(--hud-font-size-label); }
    .login { padding: 8px 12px; border: 1px solid var(--hud-color-metal); color: var(--hud-color-text); }
    .login:hover { border-color: var(--hud-color-signal); }
    kbd { margin-left: 8px; padding: 0 4px; border: 1px solid var(--hud-color-signal); color: var(--hud-color-signal); font: inherit; font-size: var(--hud-font-size-micro); }
  `,
})
export class SiteBar {
  protected readonly t = inject(TEXT);
  readonly mode = input<'main' | 'login'>('main');
}

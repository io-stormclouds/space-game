import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { currentSession, login, logout, playAsGuest, register, type AccountSession } from '@space-game/api';
import { apiMode } from '../game/game-api';
import { HudFrame, RtsButton } from '@space-game/ui';
import { GameService } from '../game/game.service';
import { TEXT } from '../i18n/pl';
import { SiteBar } from './site-bar';

type Action = 'login' | 'register' | 'guest' | 'play';

/**
 * Logowanie dowódcy (canvas board 2). On the game server (`remote`, R-25): a callsign and an access
 * code log in or make an account, a guest plays without one (where the server allows it), and a
 * logged-in commander continues or logs out; the session is the server's cookie. The offline modes
 * (mock, wasm) accept anything.
 */
@Component({
  selector: 'wg-login-page',
  imports: [SiteBar, HudFrame, RtsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown.enter)': 'submit(session() ? "play" : "login")' },
  template: `
    <div class="page hud-gridfield">
      <wg-site-bar mode="login" />
      <main class="stage">
        <div class="col">
          <form hudFrame class="auth" [label]="t.login.tab" serial="AUTH-02 · TLS" (submit)="$event.preventDefault(); submit(session() ? 'play' : 'login')">
            <span class="hud-micro sg">{{ t.login.channel }}</span>
            <h1 class="hud-title">{{ t.login.title }}</h1>
            <p class="lead">{{ t.login.lead }}</p>
            @if (session(); as s) {
              <p class="who" data-session [attr.data-callsign]="s.callsign">
                {{ t.login.loggedAs(s.callsign) }}
                @if (s.guest) {
                  <span class="dim">· {{ t.login.guestNote }}</span>
                }
              </p>
              <hud-rts-button [label]="t.login.play" hotkey="Enter" variant="primary" [disabledReason]="busy() ? '…' : undefined" (activated)="submit('play')" />
              <hud-rts-button [label]="t.login.logout" [disabledReason]="busy() ? '…' : undefined" (activated)="signOut()" />
            } @else {
              <label class="hud-micro" for="login-id">{{ remote ? t.login.callsign : t.login.id }}</label>
              <input
                id="login-id"
                name="id"
                autocomplete="username"
                [placeholder]="remote ? t.login.callsignPlaceholder : t.login.idPlaceholder"
                [value]="id()"
                (input)="id.set($any($event.target).value)"
              />
              <label class="hud-micro row" for="login-code"><span>{{ t.login.code }}</span><span class="link">{{ t.login.reset }}</span></label>
              <input id="login-code" name="code" type="password" autocomplete="current-password" [value]="code()" (input)="code.set($any($event.target).value)" />
              <label class="check"><input type="checkbox" checked /> <span class="hud-micro">{{ t.login.remember }}</span></label>
              <hud-rts-button [label]="t.login.submit" hotkey="Enter" variant="primary" [disabledReason]="busy() ? '…' : undefined" (activated)="submit('login')" />
              @if (remote) {
                <div class="more">
                  <hud-rts-button [label]="t.login.register" [disabledReason]="busy() ? '…' : undefined" (activated)="submit('register')" />
                  <hud-rts-button [label]="t.login.guest" [disabledReason]="busy() ? '…' : undefined" (activated)="submit('guest')" />
                </div>
              }
            }
            @if (error(); as e) {
              <p class="error" role="alert" data-login-error>{{ e }}</p>
            }
            <span class="hud-micro sg demo">{{ remote ? t.login.online : t.login.demo }}</span>
          </form>
          <section hudFrame class="links" [label]="t.login.links" [ticks]="false">
            @for (line of t.login.linkLines; track $index) {
              <span class="mono" [class.sg]="$last">{{ line }}</span>
            }
          </section>
        </div>
        <section hudFrame class="brief" [label]="t.login.briefTab" serial="BRF · EXP-001">
          <h2 class="hud-title">{{ t.login.briefTitle }}</h2>
          <p class="lead">{{ t.login.brief }}</p>
          <dl>
            <div><dt>{{ t.login.ship }}</dt><dd>{{ t.login.shipValue }}</dd></div>
            <div><dt>{{ t.login.colonists }}</dt><dd>{{ t.login.colonistsValue }}</dd></div>
            <div><dt>{{ t.login.hold }}</dt><dd>2000 j.</dd></div>
            <div><dt>{{ t.login.target }}</dt><dd>Tau Ceti · G8.5V</dd></div>
            <div><dt>{{ t.login.distance }}</dt><dd>11,91 ly</dd></div>
            <div><dt>{{ t.login.planets }}</dt><dd>{{ t.login.planetsValue }}</dd></div>
          </dl>
        </section>
      </main>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .page { display: grid; grid-template-rows: auto 1fr; height: 100%; }
    .stage { display: grid; grid-template-columns: 480px 400px; justify-content: space-around; align-items: center; padding: var(--hud-space-7); }
    .col { display: grid; gap: 64px; }
    .auth, .brief, .links { display: flex; flex-direction: column; gap: var(--hud-space-4); padding: var(--hud-space-7) var(--hud-space-7) var(--hud-space-6); }
    .links { gap: 2px; padding: var(--hud-space-6); }
    h1, h2 { margin: 0; }
    .sg { color: var(--hud-color-signal); }
    .lead { margin: 0 0 var(--hud-space-4); color: var(--hud-color-text-dim); font-size: var(--hud-font-size-label); }
    input:not([type='checkbox']) { height: 44px; padding: 0 12px; background: var(--hud-color-void); border: 1px solid var(--hud-color-metal); color: var(--hud-color-text); font: inherit; }
    input:focus-visible { outline: 2px solid var(--hud-color-signal); }
    .row { display: flex; justify-content: space-between; }
    .link { color: var(--hud-color-signal); text-decoration: underline; }
    .check { display: flex; align-items: center; gap: 8px; margin: var(--hud-space-4) 0; }
    .check input { accent-color: var(--hud-color-signal); }
    .more { display: grid; grid-template-columns: 1fr 1fr; gap: var(--hud-space-4); }
    .who { margin: 0; font-weight: var(--hud-font-weight-bold); }
    .dim { color: var(--hud-color-text-dim); font-weight: normal; }
    .error { margin: 0; color: var(--hud-color-alert); font-size: var(--hud-font-size-label); }
    .mono { font-size: var(--hud-font-size-label); color: var(--hud-color-text-dim); }
    dl { margin: 0; display: grid; }
    dl div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--hud-color-line-faint); }
    dt { color: var(--hud-color-text-dim); font-size: var(--hud-font-size-label); letter-spacing: var(--hud-tracking-label); text-transform: uppercase; }
    dd { margin: 0; font-weight: var(--hud-font-weight-bold); }
  `,
})
export class LoginPage {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  private readonly router = inject(Router);
  protected readonly id = signal('');
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Who is logged in on the game server (remote mode). */
  protected readonly session = signal<AccountSession | null>(null);
  protected readonly remote = apiMode() === 'remote';

  constructor() {
    if (this.remote) currentSession().then((s) => this.session.set(s), (e: unknown) => this.error.set(message(e)));
  }

  protected async submit(action: Action): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    if (!this.remote) return this.enterOffline();
    const callsign = this.id().trim();
    const code = this.code();
    if ((action === 'login' || action === 'register') && (!callsign || !code)) {
      this.error.set(this.t.login.missing);
      return;
    }
    this.busy.set(true);
    try {
      if (action === 'login') await login(callsign, code);
      else if (action === 'register') await register(callsign, code);
      else if (action === 'guest') await playAsGuest();
      // a new page: the game's connection logs in with the new session
      reloadAt('#/gra');
    } catch (e) {
      this.error.set(message(e));
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await logout();
      // a new page: no connection of the old session stays open
      reloadAt('#/logowanie');
    } catch (e) {
      this.error.set(message(e));
      this.busy.set(false);
    }
  }

  /** Mock and wasm: any identifier and code. */
  private async enterOffline(): Promise<void> {
    this.busy.set(true);
    await this.game.start('tau-ceti');
    await this.router.navigateByUrl('/gra');
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Loads the app again at a route (hash routing: the address changes without a navigation first). */
function reloadAt(hash: string): void {
  history.replaceState(null, '', hash);
  location.reload();
}

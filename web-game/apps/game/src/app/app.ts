import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Root: the entry screens and the game are routes (W15 C). */
@Component({
  selector: 'wg-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hud-root' },
  template: `<router-outlet />`,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
})
export class App {}

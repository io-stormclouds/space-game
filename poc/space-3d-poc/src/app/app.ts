import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GameCanvas } from './ui/game-canvas';
import { Hud } from './ui/hud';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameCanvas, Hud],
  host: { class: 'relative block w-full h-full overflow-hidden' },
  template: `
    <app-game-canvas />
    <app-hud />
  `,
})
export class App {}

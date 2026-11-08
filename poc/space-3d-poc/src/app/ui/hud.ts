import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BodyLabels } from './body-labels';
import { BuildMenu } from './build-menu';
import { ColonySwitcher } from './colony-switcher';
import { RoverPanel } from './rover-panel';
import { ShipPanel } from './ship-panel';
import { TilePanel } from './tile-panel';
import { Toast } from './toast';
import { TopBar } from './top-bar';

/** Overlay above the canvas. The container ignores pointer events; panels opt back in. */
@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TopBar, ShipPanel, TilePanel, RoverPanel, BuildMenu, Toast, BodyLabels, ColonySwitcher],
  host: { class: 'absolute inset-0 pointer-events-none select-none' },
  template: `
    <app-body-labels />
    <div class="absolute top-0 left-1/2 -translate-x-1/2"><app-top-bar /></div>
    <div class="absolute top-14 left-1/2 -translate-x-1/2"><app-toast /></div>
    <div class="absolute top-4 left-4"><app-colony-switcher /></div>
    <div class="absolute bottom-28 left-4"><app-tile-panel /></div>
    <div class="absolute bottom-28 right-4 flex flex-col gap-2 items-end"><app-rover-panel /><app-ship-panel /></div>
    <div class="absolute bottom-0 left-1/2 -translate-x-1/2"><app-build-menu /></div>
  `,
})
export class Hud {}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SidePanelComponent } from './ui/side-panel';
import { StatusBarComponent } from './ui/status-bar';
import { ToolBarComponent } from './ui/tool-bar';
import { TopBarComponent } from './ui/top-bar';
import { ViewportComponent } from './ui/viewport';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TopBarComponent, ToolBarComponent, ViewportComponent, SidePanelComponent, StatusBarComponent],
  template: `
    <div class="hud-root app" data-hud-signal="amber">
      <app-top-bar />
      <app-tool-bar />
      <main class="app__view" aria-label="Widok 3D"><app-viewport /></main>
      <app-side-panel />
      <app-status-bar />
    </div>
  `,
})
export class App {}

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardCanvasComponent } from './components/board-canvas/board-canvas.component';
import { TimelineComponent } from './components/timeline/timeline.component';
import { CommandPaletteComponent } from './components/command-palette/command-palette.component';
import { ControlBarComponent } from './components/control-bar/control-bar.component';
import { BuildToolbarComponent } from './components/build-toolbar/build-toolbar.component';
import { EducationalPanelComponent } from './components/educational-panel/educational-panel.component';
import { GameStateService } from './services/game-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    BoardCanvasComponent,
    TimelineComponent,
    CommandPaletteComponent,
    ControlBarComponent,
    BuildToolbarComponent,
    EducationalPanelComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  public readonly gameState = inject(GameStateService);
}

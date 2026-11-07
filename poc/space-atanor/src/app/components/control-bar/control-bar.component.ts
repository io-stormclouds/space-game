import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import { LevelConfig } from '../../../core/engine/types';

@Component({
  selector: 'app-control-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="control-bar-container">
      <!-- Left: Transport Controls -->
      <div class="transport-group">
        <button
          class="btn-control btn-play"
          [class.playing]="gameState.isPlaying()"
          (click)="gameState.togglePlay()"
          [title]="gameState.isPlaying() ? 'Wstrzymaj symulację (Spacja)' : 'Uruchom symulację (Spacja)'"
        >
          @if (gameState.isPlaying()) {
            <span class="icon">⏸</span> Pauza
          } @else {
            <span class="icon">▶</span> Play
          }
        </button>

        <button
          class="btn-control"
          (click)="gameState.stepForward()"
          title="Wykonaj jeden dyskretny cykl (Krok do przodu)"
        >
          <span class="icon">⏭</span> Krok
        </button>

        <button
          class="btn-control btn-reset"
          (click)="gameState.reset()"
          title="Resetuj symulację do cyklu początkowego"
        >
          <span class="icon">↺</span> Reset
        </button>

        <div class="speed-selector">
          @for (spd of speeds; track spd) {
            <button
              class="speed-btn"
              [class.active]="gameState.speed() === spd"
              (click)="gameState.setSpeed(spd)"
            >
              {{ spd }}x
            </button>
          }
        </div>
      </div>

      <!-- Center: Metrics / Stats in Opus Magnum style -->
      <div class="metrics-group">
        <div class="metric-box">
          <span class="metric-label">PRODUKTY</span>
          <span class="metric-val highlight">
            {{ gameState.productsDelivered() }} / {{ gameState.targetRequired() }}
          </span>
        </div>

        <div class="metric-box">
          <span class="metric-label">KOSZT</span>
          <span class="metric-val">{{ gameState.cost() }}G</span>
        </div>

        <div class="metric-box">
          <span class="metric-label">CYKLE</span>
          <span class="metric-val">{{ gameState.currentCycle() }}</span>
        </div>

        <div class="metric-box">
          <span class="metric-label">OBSZAR</span>
          <span class="metric-val">{{ gameState.area() }}</span>
        </div>
      </div>

      <!-- Right: Level Selector -->
      <div class="level-group">
        <span class="level-label">POZIOM:</span>
        <select
          class="level-select"
          [value]="gameState.activeLevel().id"
          (change)="onLevelChange($event)"
        >
          @for (lvl of gameState.availableLevels(); track lvl.id) {
            <option [value]="lvl.id">{{ lvl.name }}</option>
          }
        </select>
      </div>
    </div>
  `,
  styles: [`
    .control-bar-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: linear-gradient(180deg, #272a24 0%, #171916 100%);
      border: 2px solid #575246;
      border-radius: 6px;
      padding: 6px 14px;
      box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.1), 0 3px 6px rgba(0, 0, 0, 0.4);
      flex-wrap: wrap;
    }

    .transport-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-control {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(180deg, #3a3d36 0%, #222520 100%);
      border: 1px solid #6b6352;
      color: #dfd7c2;
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
      letter-spacing: 0.5px;
    }

    .btn-control:hover {
      background: linear-gradient(180deg, #4d5147 0%, #2f332b 100%);
      border-color: #d4af37;
      color: #fff;
    }

    .btn-play {
      background: linear-gradient(180deg, #3d6832 0%, #23431c 100%);
      border-color: #5bb049;
      color: #e8f5e9;
    }

    .btn-play:hover {
      background: linear-gradient(180deg, #4d823f 0%, #2d5524 100%);
      border-color: #81c784;
    }

    .btn-play.playing {
      background: linear-gradient(180deg, #a66a1e 0%, #683e0a 100%);
      border-color: #ffb74d;
      color: #fff;
    }

    .btn-reset:hover {
      border-color: #ef5350;
      color: #ffcdd2;
    }

    .icon {
      font-size: 13px;
    }

    .speed-selector {
      display: flex;
      margin-left: 8px;
      border: 1px solid #4a4537;
      border-radius: 4px;
      overflow: hidden;
    }

    .speed-btn {
      background: #1e201b;
      border: none;
      border-right: 1px solid #4a4537;
      color: #9c9381;
      font-size: 10px;
      font-family: monospace;
      padding: 5px 8px;
      cursor: pointer;
      transition: background 0.1s ease;
    }

    .speed-btn:last-child {
      border-right: none;
    }

    .speed-btn:hover {
      background: #2f322a;
      color: #fff;
    }

    .speed-btn.active {
      background: #c49b45;
      color: #171916;
      font-weight: bold;
    }

    .metrics-group {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #141613;
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid #3d3b33;
    }

    .metric-box {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .metric-label {
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 0.8px;
      color: #7d7564;
    }

    .metric-val {
      font-size: 13px;
      font-family: monospace;
      font-weight: bold;
      color: #e0d8c3;
    }

    .metric-val.highlight {
      color: #ffd54f;
    }

    .level-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .level-label {
      font-size: 10px;
      font-weight: bold;
      color: #8c826e;
      letter-spacing: 0.8px;
    }

    .level-select {
      background: #1e211b;
      border: 1px solid #575246;
      color: #dfd7c2;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      outline: none;
      cursor: pointer;
    }

    .level-select:focus {
      border-color: #d4af37;
    }
  `],
})
export class ControlBarComponent {
  public readonly gameState = inject(GameStateService);
  public readonly speeds = [0.5, 1, 2, 4];

  public onLevelChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const level = this.gameState.availableLevels().find(l => l.id === select.value);
    if (level) {
      this.gameState.setLevel(level);
    }
  }
}

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import { BuildTool } from '../../../renderer/pixiRenderer';

interface ToolItem {
  id: BuildTool;
  name: string;
  symbol: string;
  tooltip: string;
}

@Component({
  selector: 'app-build-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="build-toolbar">
      <div class="tool-label">BUDOWA:</div>
      <div class="tool-buttons">
        @for (tool of tools; track tool.id) {
          <button
            class="tool-btn"
            [class.active]="gameState.buildTool() === tool.id"
            [title]="tool.tooltip"
            (click)="gameState.setBuildTool(tool.id)"
          >
            <span class="tool-symbol">{{ tool.symbol }}</span>
            <span class="tool-name">{{ tool.name }}</span>
          </button>
        }
      </div>

      <div class="rotation-control">
        <span class="rot-label">OBRÓT PODGLĄDU:</span>
        <button class="rot-btn" title="Obróć przeciwnie do zegara" (click)="rotatePreview(-1)">↺</button>
        <span class="rot-value">{{ gameState.previewRotation() }}</span>
        <button class="rot-btn" title="Obróć zgodnie z zegarem" (click)="rotatePreview(1)">↻</button>
      </div>

      @if (gameState.statusMessage()) {
        <div class="status-msg">{{ gameState.statusMessage() }}</div>
      }
    </div>
  `,
  styles: [`
    .build-toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      background: linear-gradient(180deg, #272a24 0%, #171916 100%);
      border: 2px solid #575246;
      border-radius: 6px;
      padding: 5px 12px;
      box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.1), 0 3px 6px rgba(0, 0, 0, 0.4);
      flex-wrap: wrap;
    }

    .tool-label,
    .rot-label {
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.8px;
      color: #8c826e;
    }

    .tool-buttons {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .tool-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: linear-gradient(180deg, #3a3d36 0%, #222520 100%);
      border: 1px solid #6b6352;
      color: #dfd7c2;
      padding: 4px 9px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }

    .tool-btn:hover {
      background: linear-gradient(180deg, #4d5147 0%, #2f332b 100%);
      border-color: #d4af37;
      color: #fff;
    }

    .tool-btn.active {
      background: linear-gradient(180deg, #7c622b 0%, #443414 100%);
      border-color: #ffd54f;
      color: #fff;
      box-shadow: 0 0 8px rgba(255, 213, 79, 0.55);
    }

    .tool-symbol {
      font-size: 13px;
      line-height: 1;
    }

    .rotation-control {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
    }

    .rot-btn {
      width: 26px;
      height: 26px;
      background: #1e201b;
      border: 1px solid #6b6352;
      color: #dfd7c2;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }

    .rot-btn:hover {
      border-color: #d4af37;
      color: #fff;
    }

    .rot-value {
      min-width: 16px;
      text-align: center;
      font-family: monospace;
      font-weight: bold;
      color: #ffe082;
    }

    .status-msg {
      font-size: 11px;
      color: #9ccc65;
      font-family: monospace;
      margin-left: auto;
      max-width: 340px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `],
})
export class BuildToolbarComponent {
  public readonly gameState = inject(GameStateService);

  public readonly tools: ToolItem[] = [
    { id: 'SELECT', name: 'Zaznacz', symbol: '⌖', tooltip: 'Tryb zaznaczania / inspekcji heksów' },
    { id: 'ARM_1', name: 'Ramię L1', symbol: '🦾', tooltip: 'Postaw ramię o długości 1 (kliknij heks bazowy)' },
    { id: 'ARM_2', name: 'Ramię L2', symbol: '🦾', tooltip: 'Postaw ramię o długości 2' },
    { id: 'PISTON', name: 'Tłok', symbol: '⇔', tooltip: 'Postaw ramię teleskopowe (piston)' },
    { id: 'BONDER', name: 'Bonder', symbol: '⛓', tooltip: 'Połącz dwa sąsiednie atomy (glif złącza)' },
    { id: 'UNBONDER', name: 'Unbonder', symbol: '✂', tooltip: 'Rozerwij wiązanie między sąsiednimi atomami' },
    { id: 'DELETE', name: 'Usuń', symbol: '🗑', tooltip: 'Usuń ramię lub glif z planszy' },
  ];

  public rotatePreview(delta: number): void {
    this.gameState.setPreviewRotation(this.gameState.previewRotation() + delta);
  }
}

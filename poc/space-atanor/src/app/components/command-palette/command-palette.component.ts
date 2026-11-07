import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import { ArmCommand } from '../../../core/engine/types';

interface CommandItem {
  id: ArmCommand | 'CLEAR';
  name: string;
  symbol: string;
  hotkey: string;
  tooltip: string;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="palette-container">
      <div class="palette-grid">
        @for (cmd of commands; track cmd.id) {
          <button
            class="cmd-btn"
            [class.active]="gameState.selectedCommand() === cmd.id"
            (click)="selectCommand(cmd.id)"
            [title]="cmd.tooltip + ' [' + cmd.hotkey + ']'"
          >
            <span class="cmd-icon">{{ cmd.symbol }}</span>
            <span class="cmd-hotkey">{{ cmd.hotkey }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .palette-container {
      background: linear-gradient(180deg, #2b2e2a 0%, #191b18 100%);
      border: 2px solid #575246;
      border-radius: 6px;
      padding: 6px;
      box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.1), 0 3px 6px rgba(0, 0, 0, 0.5);
    }

    .palette-grid {
      display: grid;
      grid-template-columns: repeat(5, 38px);
      gap: 4px;
    }

    .cmd-btn {
      width: 38px;
      height: 38px;
      background: linear-gradient(180deg, #3a3b37 0%, #222320 100%);
      border: 1px solid #6b6352;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      user-select: none;
      transition: all 0.15s ease;
      color: #dfd7c2;
    }

    .cmd-btn:hover {
      background: linear-gradient(180deg, #4d4f49 0%, #2f302b 100%);
      border-color: #d4af37;
      color: #fff;
    }

    .cmd-btn.active {
      background: linear-gradient(180deg, #7c622b 0%, #443414 100%);
      border-color: #ffd54f;
      color: #fff;
      box-shadow: 0 0 8px rgba(255, 213, 79, 0.6);
    }

    .cmd-icon {
      font-size: 15px;
      line-height: 1;
      font-weight: bold;
    }

    .cmd-hotkey {
      font-size: 8px;
      font-family: monospace;
      color: #8c8574;
      margin-top: 2px;
      line-height: 1;
    }

    .cmd-btn.active .cmd-hotkey {
      color: #ffe082;
    }
  `],
})
export class CommandPaletteComponent {
  public readonly gameState = inject(GameStateService);

  public readonly commands: CommandItem[] = [
    { id: 'GRAB', name: 'Grab', symbol: '●', hotkey: 'Q', tooltip: 'Chwyć atom pod chwytakiem' },
    { id: 'DROP', name: 'Drop', symbol: '○', hotkey: 'W', tooltip: 'Puść trzymany atom' },
    { id: 'ROTATE_CW', name: 'Rotate CW', symbol: '↻', hotkey: 'E', tooltip: 'Obrót ramienia o 60° w prawo' },
    { id: 'ROTATE_CCW', name: 'Rotate CCW', symbol: '↺', hotkey: 'R', tooltip: 'Obrót ramienia o 60° w lewo' },
    { id: 'PIVOT_CW', name: 'Pivot CW', symbol: '⤾', hotkey: 'T', tooltip: 'Obrót cząsteczki wokół chwytaka w prawo' },
    { id: 'PIVOT_CCW', name: 'Pivot CCW', symbol: '⤿', hotkey: 'Y', tooltip: 'Obrót cząsteczki wokół chwytaka w lewo' },
    { id: 'EXTEND', name: 'Extend', symbol: '⇥', hotkey: 'U', tooltip: 'Wydłużenie ramienia (tłok)' },
    { id: 'RETRACT', name: 'Retract', symbol: '⇤', hotkey: 'I', tooltip: 'Skrócenie ramienia (tłok)' },
    { id: 'TRACK_POS', name: 'Track +', symbol: '⇛', hotkey: 'O', tooltip: 'Przesuń podstawę ramienia po szynie do przodu' },
    { id: 'TRACK_NEG', name: 'Track −', symbol: '⇚', hotkey: 'P', tooltip: 'Przesuń podstawę ramienia po szynie do tyłu' },
    { id: 'REPEAT', name: 'Repeat', symbol: '⮌', hotkey: 'X', tooltip: 'Marker powtórzenia pętli (Loop Reset)' },
    { id: 'CLEAR', name: 'Clear', symbol: '✕', hotkey: 'Del', tooltip: 'Wyczyść pole na osi czasu' },
  ];

  public selectCommand(cmd: ArmCommand | 'CLEAR'): void {
    this.gameState.setSelectedCommand(cmd);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    // Ignore when typing inside input elements
    if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) {
      return;
    }

    const key = event.key.toUpperCase();
    const match = this.commands.find(c => c.hotkey === key || (key === 'DELETE' && c.hotkey === 'Del'));
    if (match) {
      this.selectCommand(match.id);
    }
  }
}

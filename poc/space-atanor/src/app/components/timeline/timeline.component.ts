import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import { ArmCommand, ArmState } from '../../../core/engine/types';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timeline-scroll-container">
      <div class="timeline-table">
        <!-- Header row with cycle numbers -->
        <div class="timeline-row header-row">
          <div class="arm-label-cell header-label">ARM / CYCLE</div>
          <div class="cycles-track">
            @for (cycle of cycleIndices; track cycle) {
              <div
                class="cycle-header-cell"
                [class.active-cycle]="gameState.currentCycle() === cycle"
              >
                {{ cycle }}
              </div>
            }
          </div>
        </div>

        <!-- Arm Rows -->
        @for (arm of arms(); track arm.id) {
          <div class="timeline-row">
            <div class="arm-label-cell">
              <span class="arm-dot"></span>
              <span class="arm-name">{{ getArmDisplayName(arm) }}</span>
            </div>
            <div class="cycles-track">
              @for (cycle of cycleIndices; track cycle) {
                <div
                  class="timeline-slot"
                  [class.active-playhead]="gameState.currentCycle() === cycle"
                  [class.has-command]="getCommand(arm.id, cycle) !== null"
                  (click)="handleSlotClick(arm.id, cycle)"
                  (contextmenu)="handleRightClick($event, arm.id, cycle)"
                  [title]="'Cykl ' + cycle + ': ' + (getCommand(arm.id, cycle) || 'Puste (kliknij, aby wstawić)')"
                >
                  @if (getCommand(arm.id, cycle); as cmd) {
                    <span class="slot-icon" [ngClass]="getCommandClass(cmd)">
                      {{ getCommandSymbol(cmd) }}
                    </span>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .timeline-scroll-container {
      width: 100%;
      overflow-x: auto;
      background: #141613;
      border: 2px solid #3d3b33;
      border-radius: 6px;
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.7);
    }

    .timeline-table {
      display: flex;
      flex-direction: column;
      min-width: 650px;
    }

    .timeline-row {
      display: flex;
      align-items: center;
      border-bottom: 1px solid #282a24;
      height: 34px;
    }

    .timeline-row:last-child {
      border-bottom: none;
    }

    .header-row {
      background: #1e211b;
      border-bottom: 2px solid #4a4537;
      height: 28px;
    }

    .arm-label-cell {
      width: 140px;
      min-width: 140px;
      padding: 0 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      background: #1b1d18;
      border-right: 2px solid #3d3b33;
      height: 100%;
      font-size: 11px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #c9bea9;
      font-weight: 500;
      user-select: none;
    }

    .header-label {
      font-size: 10px;
      font-weight: bold;
      color: #8c826e;
      letter-spacing: 1px;
    }

    .arm-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #9c27b0;
      border: 1px solid #ce93d8;
    }

    .cycles-track {
      display: flex;
      flex: 1;
      height: 100%;
    }

    .cycle-header-cell {
      flex: 1;
      min-width: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-family: monospace;
      color: #857b66;
      border-right: 1px dashed #2d3027;
      user-select: none;
      transition: background 0.1s ease;
    }

    .cycle-header-cell.active-cycle {
      background: rgba(255, 213, 79, 0.2);
      color: #ffe082;
      font-weight: bold;
    }

    .timeline-slot {
      flex: 1;
      min-width: 32px;
      height: 100%;
      border-right: 1px dashed #242720;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      background: #161814;
      transition: background 0.15s ease;
      user-select: none;
    }

    .timeline-slot:hover {
      background: #252820;
    }

    .timeline-slot.active-playhead {
      background: rgba(255, 213, 79, 0.15);
      border-left: 1px solid rgba(255, 213, 79, 0.6);
      border-right: 1px solid rgba(255, 213, 79, 0.6);
    }

    .slot-icon {
      font-size: 14px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 3px;
      font-weight: bold;
    }

    .cmd-grab {
      background: rgba(239, 83, 80, 0.2);
      color: #ff8a80;
      border: 1px solid #ef5350;
    }

    .cmd-drop {
      background: rgba(120, 144, 156, 0.2);
      color: #b0bec5;
      border: 1px solid #90a4ae;
    }

    .cmd-rot-cw {
      background: rgba(76, 175, 80, 0.2);
      color: #81c784;
      border: 1px solid #66bb6a;
    }

    .cmd-rot-ccw {
      background: rgba(33, 150, 243, 0.2);
      color: #64b5f6;
      border: 1px solid #42a5f5;
    }

    .cmd-pivot {
      background: rgba(171, 71, 188, 0.2);
      color: #ba68c8;
      border: 1px solid #ab47bc;
    }

    .cmd-repeat {
      background: rgba(255, 167, 38, 0.25);
      color: #ffb74d;
      border: 1px solid #ffa726;
    }

    .cmd-track {
      background: rgba(96, 125, 139, 0.25);
      color: #b0bec5;
      border: 1px solid #78909c;
    }

    .cmd-other {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: 1px solid #888;
    }
  `],
})
export class TimelineComponent {
  public readonly gameState = inject(GameStateService);

  public readonly cycleIndices = Array.from({ length: 16 }, (_, i) => i);

  public readonly arms = computed<ArmState[]>(() => {
    // Re-read on build changes (adding/removing arms) so the timeline stays in sync.
    this.gameState.buildVersion();
    return this.gameState.getPlacedArms();
  });

  public getCommand(armId: string, cycle: number): ArmCommand | null {
    const tape = this.gameState.instructions()[armId];
    return tape?.[cycle] ?? null;
  }

  public handleSlotClick(armId: string, cycle: number): void {
    const selected = this.gameState.selectedCommand();
    if (selected === 'CLEAR') {
      this.gameState.clearInstruction(armId, cycle);
    } else {
      this.gameState.setInstruction(armId, cycle, selected);
    }
  }

  public handleRightClick(event: MouseEvent, armId: string, cycle: number): void {
    event.preventDefault();
    this.gameState.clearInstruction(armId, cycle);
  }

  public getArmDisplayName(arm: ArmState): string {
    if (arm.id === 'arm-1') return 'Ramię 1 (Alfa)';
    if (arm.id === 'arm-2') return 'Ramię 2 (Beta)';
    return `Ramię ${arm.id}`;
  }

  public getCommandSymbol(cmd: ArmCommand): string {
    switch (cmd) {
      case 'GRAB': return '●';
      case 'DROP': return '○';
      case 'ROTATE_CW': return '↻';
      case 'ROTATE_CCW': return '↺';
      case 'PIVOT_CW': return '⤾';
      case 'PIVOT_CCW': return '⤿';
      case 'EXTEND': return '⇥';
      case 'RETRACT': return '⇤';
      case 'TRACK_POS': return '⇛';
      case 'TRACK_NEG': return '⇚';
      case 'REPEAT': return '⮌';
      default: return '•';
    }
  }

  public getCommandClass(cmd: ArmCommand): string {
    switch (cmd) {
      case 'GRAB': return 'cmd-grab';
      case 'DROP': return 'cmd-drop';
      case 'ROTATE_CW': return 'cmd-rot-cw';
      case 'ROTATE_CCW': return 'cmd-rot-ccw';
      case 'PIVOT_CW':
      case 'PIVOT_CCW': return 'cmd-pivot';
      case 'TRACK_POS':
      case 'TRACK_NEG': return 'cmd-track';
      case 'REPEAT': return 'cmd-repeat';
      default: return 'cmd-other';
    }
  }
}

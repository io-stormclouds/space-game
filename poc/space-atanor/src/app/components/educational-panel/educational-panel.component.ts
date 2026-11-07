import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import { hexTo3D } from '../../../core/grid/hex';

@Component({
  selector: 'app-educational-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="panel-container" [class.collapsed]="isCollapsed()">
      <div class="panel-header" (click)="toggleCollapse()">
        <div class="panel-title">
          <span class="icon">⚛️</span>
          <span>PANEL DYDAKTYCZNY // GRAFY I KINEMATYKA</span>
        </div>
        <button class="toggle-btn">{{ isCollapsed() ? 'Pokaż ▲' : 'Zwiń ▼' }}</button>
      </div>

      @if (!isCollapsed()) {
        <div class="panel-body">
          <!-- Description of Active Level -->
          <div class="section">
            <div class="section-title">CEL I ZASADY ETAPU</div>
            <p class="section-text">{{ gameState.activeLevel().description }}</p>
          </div>

          <!-- Discrete Tick Pipeline Phases -->
          <div class="section">
            <div class="section-title">DYSKRETNY TICK PIPELINE (4 FAZY CYKLU)</div>
            <div class="pipeline-phases">
              <div class="phase-card">
                <span class="phase-num">1</span>
                <span class="phase-name">Dispatch</span>
                <span class="phase-desc">Odczyt rozkazów ramion (Grab/Drop)</span>
              </div>
              <div class="phase-card">
                <span class="phase-num">2</span>
                <span class="phase-name">Kinematyka</span>
                <span class="phase-desc">Obrót/translacja spójnej składowej grafu</span>
              </div>
              <div class="phase-card">
                <span class="phase-num">3</span>
                <span class="phase-name">Kolizje</span>
                <span class="phase-desc">Weryfikacja czy pola heksów nie nakładają się</span>
              </div>
              <div class="phase-card">
                <span class="phase-num">4</span>
                <span class="phase-name">Glify & Izomorfizm</span>
                <span class="phase-desc">Łączenie wiązań i walidacja cząsteczki docelowej</span>
              </div>
            </div>
          </div>

          <!-- Dynamic Graph State Inspector -->
          <div class="section">
            <div class="section-title">STAN GRAFU MOLEKULARNEGO (WĘZŁY I WIĄZANIA)</div>
            <div class="graph-inspector">
              <div class="stat-row">
                <span class="stat-lbl">Liczba węzłów (Atomy):</span>
                <span class="stat-val">{{ activeAtoms().length }}</span>
              </div>
              <div class="stat-row">
                <span class="stat-lbl">Liczba krawędzi (Wiązania):</span>
                <span class="stat-val">{{ activeBonds().length }}</span>
              </div>

              <!-- Atom list -->
              <div class="atoms-list">
                @for (atom of activeAtoms(); track atom.id) {
                  <div class="atom-badge">
                    <span class="badge-type">{{ atom.element }}</span>
                    <span class="badge-pos">q:{{ atom.pos.q }}, r:{{ atom.pos.r }}, s:{{ -atom.pos.q - atom.pos.r }}</span>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .panel-container {
      background: linear-gradient(180deg, #1d211d 0%, #111412 100%);
      border: 2px solid #4a4537;
      border-radius: 6px;
      overflow: hidden;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .panel-header {
      background: linear-gradient(180deg, #2c2f28 0%, #1c1e19 100%);
      padding: 8px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      border-bottom: 1px solid #4a4537;
      user-select: none;
    }

    .panel-title {
      font-size: 11px;
      font-weight: bold;
      letter-spacing: 1px;
      color: #dfd7c2;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .toggle-btn {
      background: transparent;
      border: 1px solid #6b6352;
      color: #b0a794;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 3px;
      cursor: pointer;
    }

    .toggle-btn:hover {
      color: #fff;
      border-color: #d4af37;
    }

    .panel-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 250px;
      overflow-y: auto;
    }

    .section-title {
      font-size: 10px;
      font-weight: bold;
      color: #d4af37;
      letter-spacing: 0.8px;
      margin-bottom: 4px;
    }

    .section-text {
      font-size: 12px;
      color: #c4baab;
      line-height: 1.4;
      margin: 0;
    }

    .pipeline-phases {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }

    .phase-card {
      background: #161815;
      border: 1px solid #33362e;
      border-radius: 4px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .phase-num {
      font-size: 9px;
      font-weight: bold;
      color: #9c27b0;
    }

    .phase-name {
      font-size: 11px;
      font-weight: bold;
      color: #dfd7c2;
    }

    .phase-desc {
      font-size: 9px;
      color: #8c826e;
    }

    .graph-inspector {
      background: #141613;
      border: 1px solid #2d3027;
      border-radius: 4px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #b0a794;
    }

    .stat-val {
      font-family: monospace;
      font-weight: bold;
      color: #ffe082;
    }

    .atoms-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }

    .atom-badge {
      background: #1e211b;
      border: 1px solid #4a4537;
      border-radius: 3px;
      padding: 2px 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-family: monospace;
    }

    .badge-type {
      font-weight: bold;
      color: #ff8a80;
    }

    .badge-pos {
      color: #80cbc4;
    }
  `],
})
export class EducationalPanelComponent {
  public readonly gameState = inject(GameStateService);
  public readonly isCollapsed = signal<boolean>(false);

  public readonly activeAtoms = computed(() => {
    return this.gameState.currentStep()?.atoms ?? [];
  });

  public readonly activeBonds = computed(() => {
    return this.gameState.currentStep()?.bonds ?? [];
  });

  public toggleCollapse(): void {
    this.isCollapsed.update(v => !v);
  }
}

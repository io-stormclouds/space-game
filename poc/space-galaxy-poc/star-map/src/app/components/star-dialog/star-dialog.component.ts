import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StarData } from '../../data/stars.data';

@Component({
  selector: 'app-star-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dialog-overlay" (click)="onOverlayClick($event)">
      <div class="dialog-panel" *ngIf="star">
        <button class="close-btn" (click)="close.emit()">✕</button>

        <div class="star-header">
          <div class="star-icon" [style.background]="starGlow(star)">
            <div class="star-dot" [style.background]="star.color"></div>
          </div>
          <div class="star-title">
            <h2>{{ star.name }}</h2>
            <div class="spectral">
              <span class="badge" [style.background]="spectralBadgeColor(star.spectralClass)">{{ star.spectralClass }}</span>
              <span class="constellation">{{ star.constellation }}</span>
            </div>
          </div>
        </div>

        <p class="description">{{ star.description }}</p>

        <div class="stats-grid">
          <div class="stat">
            <label>Distance</label>
            <span class="val">{{ star.distance === 0 ? '0 ly (home)' : star.distance + ' ly' }}</span>
          </div>
          <div class="stat">
            <label>Temperature</label>
            <span class="val">{{ star.temperature | number }} K</span>
          </div>
          <div class="stat">
            <label>Mass</label>
            <span class="val">{{ star.mass }} M&#9737;</span>
          </div>
          <div class="stat">
            <label>Radius</label>
            <span class="val">{{ star.radius }} R&#9737;</span>
          </div>
          <div class="stat">
            <label>Luminosity</label>
            <span class="val">{{ star.luminosity }} L&#9737;</span>
          </div>
          <div class="stat">
            <label>Abs. Magnitude</label>
            <span class="val">{{ star.absoluteMag }}</span>
          </div>
          <div class="stat" *ngIf="star.planets !== undefined">
            <label>Known Planets</label>
            <span class="val">{{ star.planets }} {{ star.planets === 1 ? 'planet' : 'planets' }}</span>
          </div>
          <div class="stat">
            <label>Position (x,y,z)</label>
            <span class="val">{{ star.x.toFixed(1) }}, {{ star.y.toFixed(1) }}, {{ star.z.toFixed(1) }} pc</span>
          </div>
        </div>

        <div class="temp-bar-wrap">
          <div class="temp-label">Temperature spectrum</div>
          <div class="temp-bar">
            <div class="temp-indicator" [style.left]="tempPercent(star.temperature) + '%'"></div>
          </div>
          <div class="temp-range">
            <span>3 000 K (Red)</span>
            <span>30 000 K (Blue)</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      z-index: 1000;
      pointer-events: all;
    }

    .dialog-panel {
      background: rgba(5, 8, 20, 0.95);
      border: 1px solid rgba(100, 150, 255, 0.3);
      border-radius: 12px;
      padding: 28px;
      width: 360px;
      max-height: 90vh;
      overflow-y: auto;
      margin: 20px;
      color: #e0e8ff;
      font-family: 'Segoe UI', sans-serif;
      box-shadow: 0 0 40px rgba(50, 100, 255, 0.2), 0 0 80px rgba(0,0,50,0.8);
      animation: slideIn 0.25s ease-out;
      scrollbar-width: thin;
      scrollbar-color: rgba(100,150,255,0.3) transparent;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(40px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .close-btn {
      position: absolute;
      top: 14px; right: 14px;
      background: rgba(100,150,255,0.1);
      border: 1px solid rgba(100,150,255,0.25);
      color: #8af;
      border-radius: 50%;
      width: 28px; height: 28px;
      cursor: pointer;
      font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s;
      &:hover { background: rgba(100,150,255,0.25); }
    }

    .star-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .star-icon {
      width: 56px; height: 56px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .star-dot {
      width: 24px; height: 24px;
      border-radius: 50%;
      box-shadow: 0 0 12px currentColor;
    }

    .star-title h2 {
      margin: 0 0 6px;
      font-size: 1.2rem;
      color: #fff;
    }

    .spectral {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: rgba(0,0,0,0.85);
    }

    .constellation {
      color: rgba(160,180,255,0.7);
      font-size: 0.85rem;
    }

    .description {
      font-size: 0.88rem;
      color: rgba(200, 210, 255, 0.8);
      line-height: 1.55;
      border-left: 2px solid rgba(100,150,255,0.4);
      padding-left: 12px;
      margin-bottom: 20px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 20px;
    }

    .stat {
      background: rgba(30, 40, 80, 0.5);
      border: 1px solid rgba(80,120,200,0.2);
      border-radius: 8px;
      padding: 10px 12px;

      label {
        display: block;
        font-size: 0.7rem;
        color: rgba(150,170,255,0.6);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }

      .val {
        display: block;
        font-size: 0.92rem;
        color: #c8d8ff;
        font-weight: 500;
      }
    }

    .temp-bar-wrap {
      margin-top: 4px;

      .temp-label {
        font-size: 0.72rem;
        color: rgba(150,170,255,0.6);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
      }

      .temp-bar {
        height: 8px;
        border-radius: 4px;
        background: linear-gradient(to right, #ff2200, #ff6600, #ffcc00, #ffffff, #aaddff, #6699ff, #4466ff);
        position: relative;
        margin-bottom: 6px;
      }

      .temp-indicator {
        position: absolute;
        top: -3px;
        width: 14px; height: 14px;
        border-radius: 50%;
        background: white;
        border: 2px solid rgba(0,0,0,0.5);
        transform: translateX(-50%);
        box-shadow: 0 0 6px rgba(255,255,255,0.8);
      }

      .temp-range {
        display: flex;
        justify-content: space-between;
        font-size: 0.7rem;
        color: rgba(150,170,255,0.5);
      }
    }
  `]
})
export class StarDialogComponent {
  @Input() star: StarData | null = null;
  @Output() close = new EventEmitter<void>();

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.close.emit();
    }
  }

  starGlow(star: StarData): string {
    return `radial-gradient(circle, ${star.color}55 0%, transparent 70%)`;
  }

  spectralBadgeColor(cls: string): string {
    const c = cls[0];
    const map: Record<string, string> = {
      O: '#6699ff', B: '#99bbff', A: '#ccddff', F: '#ffffee',
      G: '#ffee88', K: '#ffaa44', M: '#ff5522', L: '#cc2200',
      T: '#880000', Y: '#440000', D: '#aaccff'
    };
    return map[c] || '#aaaaaa';
  }

  tempPercent(temp: number): number {
    const min = 3000, max = 30000;
    return Math.max(0, Math.min(100, ((temp - min) / (max - min)) * 100));
  }
}

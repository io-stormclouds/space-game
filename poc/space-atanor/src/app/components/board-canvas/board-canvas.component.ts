import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { PixiRenderer } from '../../../renderer/pixiRenderer';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-board-canvas',
  standalone: true,
  template: `
    <div class="canvas-wrapper" #wrapper>
      <canvas #canvasElement></canvas>
      <div class="canvas-hints">
        <span class="hint-pill">🖱️ Przeciągnij: Przesuń planszę</span>
        <span class="hint-pill">🔍 Kółko myszy: Powiększenie</span>
      </div>
      @if (gameState.hasCrashed()) {
        <div class="crash-banner">
          <div class="crash-title">⚠️ KOLIZJA ATOMÓW (JAM DETECTED)</div>
          <div class="crash-desc">{{ gameState.crashMessage() }}</div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }

    .canvas-wrapper {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: radial-gradient(circle at center, #142824 0%, #0c1815 100%);
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
      outline: none;
    }

    .canvas-hints {
      position: absolute;
      top: 14px;
      right: 14px;
      display: flex;
      gap: 8px;
      pointer-events: none;
      z-index: 10;
    }

    .hint-pill {
      background: rgba(14, 25, 23, 0.75);
      border: 1px solid rgba(196, 155, 69, 0.3);
      color: #b0c4be;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      letter-spacing: 0.5px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .crash-banner {
      position: absolute;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(183, 28, 28, 0.9);
      border: 2px solid #ff5252;
      color: #fff;
      padding: 10px 20px;
      border-radius: 6px;
      box-shadow: 0 4px 20px rgba(255, 23, 68, 0.6);
      text-align: center;
      z-index: 20;
      animation: pulse 1s infinite alternate;
    }

    .crash-title {
      font-weight: bold;
      font-size: 14px;
      letter-spacing: 1px;
    }

    .crash-desc {
      font-size: 12px;
      margin-top: 4px;
      opacity: 0.95;
    }

    @keyframes pulse {
      from { transform: translateX(-50%) scale(1); }
      to { transform: translateX(-50%) scale(1.02); }
    }
  `],
})
export class BoardCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasElement') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('wrapper') wrapperRef!: ElementRef<HTMLDivElement>;

  public readonly gameState = inject(GameStateService);
  private renderer: PixiRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;

  async ngAfterViewInit(): Promise<void> {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new PixiRenderer();
    await this.renderer.init(canvas);

    // Route board clicks into the game state's build system.
    this.renderer.onHexClick = (hex) => {
      // Left click = build/select; ignore other buttons for now.
      this.gameState.handleBoardClick(hex);
    };

    this.gameState.attachRenderer(this.renderer);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.renderer?.updateOriginToCenter();
      });
      this.resizeObserver.observe(this.wrapperRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.renderer?.destroy();
  }
}

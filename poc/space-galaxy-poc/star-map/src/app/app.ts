import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StarCanvasComponent } from './components/star-canvas/star-canvas.component';
import { StarDialogComponent } from './components/star-dialog/star-dialog.component';
import { StarData } from './data/stars.data';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, StarCanvasComponent, StarDialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  selectedStar = signal<StarData | null>(null);
  showHelp = signal(false);

  onStarSelected(star: StarData | null) {
    this.selectedStar.set(star);
  }

  closeDialog() {
    this.selectedStar.set(null);
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommandCard, HudFrame, ResourcePanel } from '@space-game/ui';
import { TEXT } from './i18n/pl';
import { sampleCommands, sampleReadouts } from './shell/sample';

/** F0 shell: resource bar, a frame for the world view and the command card from the design system. */
@Component({
  selector: 'wg-root',
  imports: [ResourcePanel, HudFrame, CommandCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly t = inject(TEXT);
  protected readonly lastCommand = signal<string | null>(null);
  protected readonly readouts = sampleReadouts(this.t);
  protected readonly commands = sampleCommands(this.t, (label) => this.lastCommand.set(label));
}

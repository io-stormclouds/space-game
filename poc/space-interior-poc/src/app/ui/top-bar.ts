import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { WallMode } from '../engine/editor-engine';
import type { Lighting } from '../engine/lighting-presets';
import { EditorStore, MAX_DECK } from '../state/editor-store';

@Component({
  selector: 'app-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="brand">
      <span class="brand__tag">[ Edytor wnętrz ]</span>
      <input
        class="brand__name"
        aria-label="Nazwa projektu"
        [value]="store.layout().name"
        (change)="store.rename($any($event.target).value)"
      />
    </div>

    <div class="bar-group" role="group" aria-label="Plik">
      <button type="button" class="btn" (click)="store.newLayout()">Nowy</button>
      <button type="button" class="btn" (click)="store.loadSample()">Przykład</button>
      <label class="btn">
        Wczytaj
        <input type="file" accept=".json,application/json" hidden (change)="open($event)" />
      </label>
      <button type="button" class="btn" (click)="save()">Zapisz</button>
    </div>

    <div class="bar-group" role="group" aria-label="Historia">
      <button type="button" class="btn" [disabled]="!store.canUndo()" (click)="store.undo()" title="Ctrl+Z">Cofnij</button>
      <button type="button" class="btn" [disabled]="!store.canRedo()" (click)="store.redo()" title="Ctrl+Y">Ponów</button>
    </div>

    <div class="bar-group" role="radiogroup" aria-label="Pokład">
      <span class="hud-micro" title="PageUp / PageDown">Pokład</span>
      @for (d of decks; track d) {
        <button
          type="button"
          class="btn btn--icon deck-btn"
          role="radio"
          [class.is-on]="store.level() === d"
          [class.is-empty]="!store.usedDecks().has(d)"
          [attr.aria-checked]="store.level() === d"
          [title]="store.usedDecks().has(d) ? 'Pokład ' + d : 'Pokład ' + d + ' (pusty)'"
          (click)="store.setLevel(d)"
        >
          {{ d }}
        </button>
      }
    </div>

    <div class="bar-group" role="radiogroup" aria-label="Ściany">
      <span class="hud-micro">Ściany <kbd>C</kbd></span>
      @for (m of wallModes; track m.id) {
        <button type="button" class="btn" role="radio" [attr.aria-checked]="store.wallMode() === m.id" [class.is-on]="store.wallMode() === m.id" (click)="store.wallMode.set(m.id)">{{ m.label }}</button>
      }
    </div>

    <div class="bar-group" role="radiogroup" aria-label="Oświetlenie">
      <span class="hud-micro">Światło <kbd>L</kbd></span>
      @for (m of lights; track m.id) {
        <button type="button" class="btn" role="radio" [attr.aria-checked]="store.lighting() === m.id" [class.is-on]="store.lighting() === m.id" (click)="store.lighting.set(m.id)">{{ m.label }}</button>
      }
      <button
        type="button"
        class="btn btn--icon tune-btn"
        [class.is-on]="store.tuningOpen()"
        [attr.aria-expanded]="store.tuningOpen()"
        [attr.aria-label]="tuned() ? 'Strojenie nocy (zmienione)' : 'Strojenie nocy'"
        title="Strojenie nocy (N)"
        (click)="store.toggleTuning()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" /></svg>
        @if (tuned()) {
          <span class="dot"></span>
        }
      </button>
    </div>

    <div class="bar-group" role="group" aria-label="Widok">
      <button type="button" class="btn" [class.is-on]="store.showGrid()" [attr.aria-pressed]="store.showGrid()" (click)="store.showGrid.set(!store.showGrid())">Siatka</button>
      <button type="button" class="btn" [class.is-on]="store.showLabels()" [attr.aria-pressed]="store.showLabels()" (click)="store.showLabels.set(!store.showLabels())">Etykiety</button>
      <button type="button" class="btn" [class.is-on]="store.showCeilings()" [attr.aria-pressed]="store.showCeilings()" (click)="store.showCeilings.set(!store.showCeilings())">Sufity</button>
    </div>
  `,
  host: { class: 'top-bar' },
})
export class TopBarComponent {
  readonly store = inject(EditorStore);
  readonly decks = Array.from({ length: MAX_DECK + 1 }, (_, i) => i);
  readonly tuned = computed(() => Object.keys(this.store.nightTuning()).length > 0);
  readonly wallModes: { id: WallMode; label: string }[] = [
    { id: 'up', label: 'W górze' },
    { id: 'cutaway', label: 'Przekrój' },
    { id: 'down', label: 'W dole' },
  ];
  readonly lights: { id: Lighting; label: string }[] = [
    { id: 'day', label: 'Dzień' },
    { id: 'night', label: 'Noc' },
  ];

  open(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((text) => this.store.importText(text));
    input.value = '';
  }

  save(): void {
    const blob = new Blob([this.store.exportText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = this.store.layout().name.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-').replace(/^-|-$/g, '') || 'projekt';
    a.download = `${slug}.interior.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.store.notify(`Zapisano ${a.download}`);
  }
}

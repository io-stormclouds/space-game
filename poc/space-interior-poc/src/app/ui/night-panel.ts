import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LIGHT_POOL_MAX, LIGHTING_PRESETS, type LightingPreset } from '../engine/lighting-presets';
import { EditorStore, type NightTuning } from '../state/editor-store';

type NumberKey = { [K in keyof LightingPreset]: LightingPreset[K] extends number ? K : never }[keyof LightingPreset];

interface Knob {
  readonly key: NumberKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

interface KnobGroup {
  readonly title: string;
  readonly knobs: readonly Knob[];
  readonly colors?: readonly { readonly key: 'hemiSky' | 'background'; readonly label: string }[];
  /** Group with an on/off switch (bloom). */
  readonly toggle?: 'bloom';
}

const GROUPS: readonly KnobGroup[] = [
  {
    title: 'Oprawy',
    knobs: [
      { key: 'fixtures', label: 'Siła', min: 0, max: 3, step: 0.05 },
      { key: 'reach', label: 'Zasięg', min: 0.4, max: 2.5, step: 0.05 },
      { key: 'lights', label: 'Ile świateł', min: 4, max: LIGHT_POOL_MAX, step: 1 },
    ],
  },
  {
    title: 'Ekrany i hologramy',
    knobs: [
      { key: 'emissive', label: 'Ekrany', min: 0, max: 5, step: 0.05 },
      { key: 'holo', label: 'Hologramy', min: 0, max: 5, step: 0.05 },
    ],
  },
  {
    title: 'Otoczenie',
    knobs: [
      { key: 'hemi', label: 'Wypełnienie', min: 0, max: 1.5, step: 0.01 },
      { key: 'env', label: 'Odbicia', min: 0, max: 1, step: 0.01 },
      { key: 'exposure', label: 'Ekspozycja', min: 0.3, max: 2.5, step: 0.05 },
    ],
    colors: [
      { key: 'hemiSky', label: 'Barwa' },
      { key: 'background', label: 'Tło' },
    ],
  },
  {
    title: 'Poświata',
    toggle: 'bloom',
    knobs: [
      { key: 'bloomStrength', label: 'Siła', min: 0, max: 2, step: 0.01 },
      { key: 'bloomRadius', label: 'Promień', min: 0, max: 1, step: 0.01 },
      { key: 'bloomThreshold', label: 'Próg', min: 0, max: 2, step: 0.01 },
    ],
  },
];

/** Starting points; "Referencja" is the night matched to the kit's Layout Example Dark render. */
const PRESETS: readonly { readonly id: string; readonly label: string; readonly tuning: NightTuning }[] = [
  { id: 'reference', label: 'Referencja', tuning: {} },
  { id: 'work', label: 'Robocza', tuning: { hemi: 0.3, env: 0.12, exposure: 1.15, fixtures: 1.4, reach: 1.3 } },
  {
    id: 'contrast',
    label: 'Kontrast',
    tuning: { hemi: 0, env: 0, exposure: 0.95, fixtures: 1.5, reach: 0.85, emissive: 2.6, holo: 2.2, bloomStrength: 0.5, bloomRadius: 0.3, bloomThreshold: 0.95 },
  },
  {
    id: 'alert',
    label: 'Alarm',
    tuning: { hemiSky: 0xff3a2a, hemi: 0.14, background: 0x241414, fixtures: 0.55, emissive: 1.4, exposure: 1.05 },
  },
];

const REF = LIGHTING_PRESETS.night;
const COLOR_KEYS = new Set(['background', 'hemiSky', 'hemiGround']);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Floating card over the viewport: live controls of the night lighting. */
@Component({
  selector: 'app-night-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hud-frame card tuning" aria-label="Strojenie nocy">
      <span class="hud-frame__label">Noc · strojenie</span>
      <div class="tuning__head">
        <span class="hud-micro">
          @if (changed()) {
            <span class="hud-signal">Zmieniono {{ changed() }}</span> · zapis w przeglądarce
          } @else {
            Referencja: Layout Example Dark
          }
        </span>
        <button type="button" class="btn btn--icon" aria-label="Zamknij strojenie" title="Zamknij" (click)="store.tuningOpen.set(false)">×</button>
      </div>

      <div class="seg tuning__presets" role="radiogroup" aria-label="Ustawienia wyjściowe">
        @for (p of presets; track p.id) {
          <button type="button" role="radio" class="seg__btn" [class.is-on]="activePreset() === p.id" [attr.aria-checked]="activePreset() === p.id" (click)="store.setNightTuning(p.tuning)">
            {{ p.label }}
          </button>
        }
      </div>

      @for (g of groups; track g.title) {
        <fieldset class="tuning__group">
          <legend class="hud-micro">
            @if (g.toggle) {
              <label class="tuning__switch">
                <input type="checkbox" [checked]="value().bloom" (change)="store.tuneNight({ bloom: $any($event.target).checked })" />
                {{ g.title }}
              </label>
            } @else {
              {{ g.title }}
            }
          </legend>
          @for (k of g.knobs; track k.key) {
            <label class="knob" [class.is-off]="g.toggle && !value().bloom">
              <span class="hud-micro knob__label">{{ k.label }}</span>
              <input
                type="range"
                class="knob__range"
                [min]="k.min"
                [max]="k.max"
                [step]="k.step"
                [value]="value()[k.key]"
                [disabled]="g.toggle && !value().bloom"
                (input)="set(k.key, $any($event.target).valueAsNumber)"
              />
              <span class="knob__value" [class.hud-signal]="isChanged(k.key)">{{ format(k, value()[k.key]) }}</span>
            </label>
          }
          @for (c of g.colors ?? []; track c.key) {
            <label class="knob">
              <span class="hud-micro knob__label">{{ c.label }}</span>
              <input type="color" class="knob__color" [value]="color(c.key)" (input)="setColor(c.key, $any($event.target).value)" />
              <span class="knob__value" [class.hud-signal]="isChanged(c.key)">{{ color(c.key).slice(1) }}</span>
            </label>
          }
        </fieldset>
      }

      <div class="card__actions">
        <button type="button" class="btn" [disabled]="!changed()" (click)="store.setNightTuning({})">Przywróć referencję</button>
        <button type="button" class="btn" (click)="copy()">Kopiuj ustawienia</button>
      </div>
    </section>
  `,
})
export class NightPanelComponent {
  readonly store = inject(EditorStore);
  readonly groups = GROUPS;
  readonly presets = PRESETS;
  /** Effective night preset: the reference with the tuning on top. */
  readonly value = computed<LightingPreset>(() => ({ ...REF, ...this.store.nightTuning() }));
  readonly changed = computed(() => Object.keys(this.store.nightTuning()).length);
  readonly activePreset = computed(() => {
    const t = JSON.stringify(this.store.nightTuning());
    return PRESETS.find((p) => JSON.stringify(normalize(p.tuning)) === t)?.id ?? null;
  });

  set(key: NumberKey, v: number): void {
    if (Number.isFinite(v)) this.store.tuneNight({ [key]: v });
  }

  setColor(key: 'hemiSky' | 'background', v: string): void {
    this.store.tuneNight({ [key]: parseInt(v.slice(1), 16) });
  }

  color(key: 'hemiSky' | 'background'): string {
    return hex(this.value()[key]);
  }

  isChanged(key: keyof LightingPreset): boolean {
    return key in this.store.nightTuning();
  }

  format(k: Knob, v: number): string {
    return k.step >= 1 ? String(v) : v.toFixed(2);
  }

  /** Full night preset as code, to bake a tuning into LIGHTING_PRESETS. */
  copy(): void {
    const v = this.value();
    const text = JSON.stringify(v, (key, val) => (COLOR_KEYS.has(key) ? hex(val as number) : val), 2);
    navigator.clipboard?.writeText(text).then(
      () => this.store.notify('Skopiowano ustawienia nocy'),
      () => this.store.notify('Schowek niedostępny', 'error'),
    );
  }
}

/** A preset's tuning as the store keeps it (same key order as cleanTuning would produce). */
function normalize(t: NightTuning): NightTuning {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) if ((REF as unknown as Record<string, unknown>)[k] !== v) out[k] = v;
  return out as NightTuning;
}

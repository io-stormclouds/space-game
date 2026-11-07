import { InjectionToken } from '@angular/core';

/** Texts the HUD components render themselves. Provide `HUD_TEXT` to translate them. */
export interface HudText {
  /** Accessible name of the resource bar. */
  resources: string;
  /** Suffix of a rate, e.g. "+6,4/min". */
  perMinute: string;
  stateLow: string;
  stateCritical: string;
  /** Accessible name of a command card without context. */
  commands: string;
  /** Accessible name of the command grid. */
  commandGrid: string;
  /** Inspector line when no command is pointed at. */
  inspectorHint: string;
  /** Prefix of the hotkey in the inspector: "KLAWISZ · Q". */
  hotkey: string;
  /** Screen-reader text of a running action: ", w toku 40%". */
  inProgress: string;
}

/** Polish texts, identical to the React components in design-system/. */
export const HUD_TEXT_PL: HudText = {
  resources: 'Surowce',
  perMinute: '/min',
  stateLow: 'niski poziom',
  stateCritical: 'stan krytyczny',
  commands: 'rozkazy',
  commandGrid: 'Rozkazy',
  inspectorHint: 'Wskaż rozkaz lub użyj klawisza skrótu',
  hotkey: 'KLAWISZ',
  inProgress: 'w toku',
};

export const HUD_TEXT = new InjectionToken<HudText>('HUD_TEXT', {
  providedIn: 'root',
  factory: () => HUD_TEXT_PL,
});

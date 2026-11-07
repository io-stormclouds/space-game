import { InjectionToken } from '@angular/core';

/**
 * Polish texts of the app, by key (decision W16 B). Components read them through `TEXT`;
 * another language is another object of the same shape.
 */
export const PL = {
  app: {
    title: 'Space Game · web-game',
  },
  resources: {
    FER: 'Ferryt',
    SIL: 'Silicyt',
    KRI: 'Kriol',
    KAR: 'Karbonit',
    STA: 'Stal',
    BET: 'Beton',
    ENE: 'Energia',
    POP: 'Załoga',
  },
  shell: {
    viewLabel: 'Widok',
    viewSerial: 'F0 · POWŁOKA',
    viewTitle: 'Widok świata',
    viewNote:
      'Sceny układu, planety i galaktyki dojdą w fazie F4. Dane na tym ekranie są statyczne: przepisane z planszy „Kolonia” w kanwie. Żywe dane przyjdą przez GameApi w fazie F2.',
    lastCommand: 'Ostatni rozkaz',
    noCommand: 'Brak rozkazów. Wskaż komórkę rozkazu albo naciśnij jej klawisz.',
  },
  sample: {
    designation: 'KOL · TAU-CETI/E',
    subline: 'DZIEŃ 1 · 00:04',
    selection: 'Port kosmiczny · poz. 2',
    selectionCode: 'B-214',
    commands: {
      produceRover: { label: 'Produkuj łazik', description: '3 min' },
      callShuttle: { label: 'Wezwij prom', description: 'Z Arki-1 na orbicie' },
      upgrade: { label: 'Rozbuduj do L3', reason: 'BRAK: FER 2088 · SIL 1012 · STA 145' },
      rallyPoint: { label: 'Punkt zbiórki', description: 'Dla nowych łazików' },
      colonyReport: { label: 'Raport kolonii', description: 'Produkcja i zużycie' },
      arkHold: { label: 'Ładownia Arki', description: '1580 j. na orbicie' },
    },
  },
};

export type Dictionary = typeof PL;

export const TEXT = new InjectionToken<Dictionary>('TEXT', {
  providedIn: 'root',
  factory: () => PL,
});

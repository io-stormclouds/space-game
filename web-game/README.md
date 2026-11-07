# web-game

Projekt testowy gry na danych mock. Łączy interfejs z kanwy, `design-system/` i mechaniki z trzech PoC. Służy do testów interfejsu, mechanik i wydajności oraz do dalszego projektowania. Plan prac, decyzje i różnice względem PoC i kanwy są w [docs/UNIFICATION.md](docs/UNIFICATION.md).

```bash
npm install          # Node 22, npm 10.9; .npmrc: legacy-peer-deps (jak w 3D PoC)
npm start            # http://localhost:4420
npm run check        # typy, testy, build produkcyjny i e2e, w tej kolejności
```

## Gra

- `#/` — strona główna (katalog gwiazd), `#/logowanie` — logowanie (mock przyjmuje dowolne dane), `#/gra` — gra od przybycia Arki-1 do Tau Ceti.
- Wejście w środek gry: `#/scenariusz-przybycie`, `#/scenariusz-skan`, `#/scenariusz-port`, `#/scenariusz-kolonia`, `#/scenariusz-planeta-matka` (świat 3D PoC).
- Scenariusze obciążenia (F5): `#/scenariusz-obciazenie-s`, `-m`, `-l`.
- Klawisze:
  - `1`–`4`: widoki Planeta, Układ, Galaktyka, Atanor;
  - Spacja: pauza; `+` / `−`: tempo ×1, ×60, ×600;
  - `Esc`: anuluj;
  - `` ` ``: nakładka wydajności;
  - `F2`: panel projektanta (parametry ekonomii, tabele dokumentu, przepływy, dziennik, Atanor, plik zapisu);
  - rozkazy mają klawisze pokazane na karcie.

## Skrypty

| Skrypt | Co robi |
|---|---|
| `typecheck` | `tsc` na całym workspace |
| `test:unit` | vitest dla pakietów (domena, api, mock, sceny) |
| `test:app` | `ng test`: komponenty Angulara, kompilacja AOT, jsdom, mock w wątku |
| `build` | build produkcyjny do `dist/game` |
| `e2e` | Playwright w Chromium przy 1440×900 (WebGL przez SwiftShader), sam uruchamia `ng serve` na porcie 4420 |
| `perf` | build produkcyjny i pomiar scenariuszy obciążenia S/M/L w Chromium; zapisuje `docs/PERF-REPORT.md` |
| `econ:check`, `econ:docs` | zgodność `docs/economy-expansion-design.md` z modelem ekonomii |

## Struktura

```
apps/game/              aplikacja Angular (zoneless, Signals): ekrany, HUD, widok świata, panel projektanta (designer/)
packages/domain/        czysty TypeScript: katalog ekonomii, reguły, symulacja, scenariusze, Atanor, gwiazdy
packages/api/           kontrakt GameApi i klient Web Workera
packages/mock-server/   mock serwera: stały krok, dziennik rozkazów, zapis/powtórka, gracze i rynek
packages/render/        sceny: układ/planeta (Three.js), galaktyka (Three.js), Atanor (PixiJS, leniwie)
packages/ui/            komponenty DS w Angularze
tools/economy-model/    generator dokumentu ekonomii
e2e/                    testy Playwright
docs/                   rejestr ujednolicenia, archiwum kanwy
```

## Zasady

- Kierunek zależności: `apps/game → api, render, ui`; `mock-server → domain`; `render` czyta geometrię z `domain`. Aplikacja nie importuje logiki domeny.
- Mock działa w Web Workerze; cały stan gry to dane (`WorldState`), więc zapis i powtórka są dokładne.
- Teksty interfejsu są w słowniku (`apps/game/src/app/i18n/pl.ts`, `HUD_TEXT` w `packages/ui`).
- Koszty, czasy i tempa są danymi katalogu (`packages/domain/src/economy`), a nie stałymi w kodzie.
- Kodu w `poc/` się nie zmienia.

## Design system

`design-system/` jest podłączony jako `@space-game/hud-design-system` przez zależność `file:`. web-game bierze z niego CSS (tokeny, `base.css`, style komponentów) i wejście `core` bez Reacta. `tsconfig.json` mapuje pakiety workspace na źródła (`paths`), żeby Angular kompilował je razem z aplikacją, także w `ng serve` i `ng test`.

# web-game

Projekt testowy gry na danych mock. Łączy interfejs z kanwy, `design-system/` i mechaniki z trzech PoC. Służy do testów interfejsu, mechanik i wydajności oraz do dalszego projektowania. Plan prac i decyzje są w [docs/UNIFICATION.md](docs/UNIFICATION.md).

```bash
npm install          # Node 22, npm 10.9; .npmrc: legacy-peer-deps (jak w 3D PoC)
npm start            # http://localhost:4420
npm run check        # typy, testy, build produkcyjny i e2e, w tej kolejności
```

| Skrypt | Co robi |
|---|---|
| `typecheck` | `tsc` na całym workspace (aplikacja, pakiety, e2e, konfiguracje) |
| `test:unit` | vitest dla pakietów bez frameworka (domena od F1) |
| `test:app` | `ng test`: komponenty Angulara z `apps/game` i `packages/ui`, kompilacja AOT, jsdom |
| `build` | build produkcyjny do `dist/game` |
| `e2e` | Playwright w Chromium przy 1440×900, sam uruchamia `ng serve` na porcie 4420 |
| `econ:check`, `econ:docs` | zgodność `docs/economy-expansion-design.md` z modelem ekonomii |

## Struktura

```
apps/game/            aplikacja Angular (zoneless, Signals)
packages/ui/          komponenty DS w Angularze: HudFrame, RtsButton, ResourcePanel, CommandCard, HudIcon
packages/…            domain, api, mock-server, render: powstają w F1, F2 i F4
tools/economy-model/  model ekonomii generujący tabele dokumentu
e2e/                  testy Playwright
docs/                 rejestr ujednolicenia, archiwum kanwy
```

## Design system

- **Źródło:** `design-system/` (obok, poza workspace) jest podłączony jako `@space-game/hud-design-system`, przez zależność `file:` w `packages/ui`.
- **Co bierze web-game:**
  - CSS: tokeny, `base.css` i style komponentów, ładowane globalnie w `apps/game/src/styles.css`;
  - wejście `core`, bez Reacta: tokeny, formatowanie liczb, reguły stanu odczytów, ścieżki ikon.
- **Komponenty:** te z `packages/ui` renderują te same klasy i atrybuty co komponenty Reacta, więc arkusz DS działa bez zmian.
- **Rozwiązywanie importów:** `tsconfig.json` mapuje `@space-game/ui` i `@space-game/hud-design-system/core` na źródła (`paths`). Dzięki temu Angular kompiluje je razem z aplikacją, także w `ng serve` i `ng test`.

## Zasady

- Kierunek zależności: `ui → api → domain`. `render` czyta z domeny, a mock zależy tylko od domeny.
- Od F2 aplikacja rozmawia z grą wyłącznie przez `GameApi`.
- Teksty interfejsu są w słowniku (`apps/game/src/app/i18n/pl.ts`, `HUD_TEXT` w `packages/ui`), a nie w szablonach.
- Koszty, czasy i tempa są danymi, a nie stałymi w kodzie.
- Kodu w `poc/` się nie zmienia. Przeniesienie to kopia z wpisem w rejestrze.

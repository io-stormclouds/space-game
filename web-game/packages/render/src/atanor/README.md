# Atanor — widok budynku „Fabryka atanorowa” (F4, W08 A)

Widok `kind: 'atanor'`, `usesThree: false`. Ma własną aplikację PixiJS i jeden własny kontekst WebGL (W13 A).

## Skąd

- **Rysowanie:** port `poc/space-atanor/src/renderer/pixiRenderer.ts`.
- **Pętla i czas:** z `app/services/game-state.service.ts` (600 ms na tick przy 1×, interpolacja).
- **Silnik:** `Atanor` z `@space-game/domain`.
- PoC jest tylko do odczytu.

## Użycie

```ts
import { isAtanorControls, loadAtanorView } from './atanor';
new RenderHost(el, { views: { atanor: () => loadAtanorView() } });   // PixiJS ładuje się dopiero tu
// opcje: { level ('A_NAD'), autoplay (true), ticksPerSecond (1,67), stopAtTarget (false, A7), insets, text }
if (isAtanorControls(view)) { view.play(); view.setLevel('A_KAT'); view.readout(); }
```

- **Poziom:** `input.atanorLevel` przyjmuje `A_NAD`, `A_KAT`, identyfikatory poziomów albo skróty `L1`–`L4`. Zmiana wartości przełącza poziom. `setLevel()` z HUD-u działa niezależnie, dopóki pole się nie zmieni.
- **Sterowanie:** `play`, `pause`, `step` (jeden tick z animacją), `reset` (pauza i tick 0), `setTicksPerSecond` (0,1–120), `levels()`.
- **`readout()`** zwraca:
  - ticki (CYKLE) i głowicę;
  - dostarczone wobec celu oraz `completedAtTick`;
  - `jam` z polami `{reason, message}`;
  - cykle na produkt, okres, obszar rozwiązania i obszar dotąd, ramiona, koszt;
  - zużycie wejść na produkt, `produced` i `consumed`;
  - liczby z dokumentu §8.3 oraz `spec` w kształcie `AtanorSpec`.
- **Przepustowość:** mierzona raz na poziom (`measureAtanorSolution`) na osobnym silniku.
- **`pick`:** zwraca `EMPTY`.

## Zmiany względem PoC

| Obszar | PoC | Tutaj |
|---|---|---|
| Cykl życia | `Application` z `resizeTo` i własnym tickerem | aplikacja na każde `mount`, `autoStart: false`, napędza ją pętla gry; rysuje tylko przy zmianie. `dispose` → `app.destroy(true, …)` zabiera płótno i kontekst |
| Obiekty | nowe `Graphics` i `Text` w każdej klatce, bez `destroy` (wyciek) | trwałe warstwy: plansza i glify raz na poziom; dynamika w jednym `Graphics.clear()`; pula `Text` dla atomów i ramion |
| Styl | mosiądz, fiolet, klejnoty, odblaski, cienie, symbole alchemiczne | paleta DS, kwadratowe atomy, płaskie wypełnienia, bez poświat. Etykiety to kody materiałów (A5). Dla PoC krótkie kody (H2O, SAL, Pb, Au, Hg) zamiast znaków 🜄 🜔 ☿ |
| Interpolacja | atomy liniowo, ramiona po łuku (trzymany atom zjeżdżał z chwytaka) | cząsteczka sztywno na chwytaku (obrót, tłok, szyna, pivot), sprawdzana ze stanem silnika. Kolejność faz: dostarczony produkt wjeżdża na wyjście i znika, nowe atomy pojawiają się na końcu ticka, wiązania w fazie reakcji |
| JAM | czerwone X na wszystkich atomach | ramka `alert` na zderzonych atomach i napis „JAM · powód”; maszyna staje |
| Etykiety portów | pod heksem (nachodziły na sąsiadów) | w górnej części heksu: `WEJ H2 ×10`, `WYJ NAD` |
| Kontekst WebGL | — | PixiJS sprawdza GPU dodatkowymi kontekstami (`getTestContext`, formaty kompresji) i część zostawia. Widok gubi je po pierwszym renderze, a wyniki PixiJS zapamiętuje (W13 A) |

## Pomiary (Chromium 1440×900, ten komputer — P6)

| Wielkość | Wynik |
|---|---|
| Wywołania rysowania na klatkę (licznik na `gl.draw*`) | 2 |
| Trójkąty | 536–840 |
| Tekstury tekstu | 8–14 |
| Klatki | 60 fps |
| Konteksty WebGL | 1 na żywo przez 10 przełączeń galaktyka ↔ atanor (23 utworzone, każdy utracony przy zmianie); 1 płótno w DOM |
| Leniwy chunk (build harnessu) | 912 KB JS bez kompresji (główny `lib` 638 KB, 178 KB gzip). Chunk wejściowy nie zawiera PixiJS |

| Poziom | Cel | Cykle na produkt / obszar / ramiona | Dokument §8.3 |
|---|---|---|---|
| A_NAD | 6/6 w ticku 69 | 12 / 12 / 2 | 12 / 9 / 2 |
| A_KAT | 6/6 w ticku 34 | 6 / 8 / 2 | 10 / 8 / 2 |
| L1 | 6/6 w ticku 50 | 9 / 12 / 2 | — |
| L2 | 6/6 w ticku 39 | 7 / 9 / 2 | — |
| L3 | 5/5 w ticku 45 | 10 / 6 / 1 | — |
| L4 | 5/5 w ticku 45 | 10 / 6 / 1 | — |

- **Po celu:** produkcja trwa dalej (A7): 13 NAD po kilku sekundach przy 60 t/s.
- **Błędny program PoC dla L2:** JAM `ATOM_COLLISION` po 9 tickach, napis widoczny.

Testy: `npx vitest run packages/render/src/atanor`, 19 testów. Obejmują wybór poziomu, promień planszy (L1 19 heksów, L2 37), dopasowanie i heks → piksel, rogi, ruch sztywny i zgodność t = 1 ze stanem silnika, pojawianie i znikanie atomów, znaczniki JAM, readout, zegar ticków, paletę wobec DS, kody atomów i strażnika `isAtanorControls`.

Harness: `npx vite packages/render/harness/atanor --port 4432` (`?level=A_KAT`). Ma przyciski, odczyt i `window.harness.switchCycles(n)`.

## Braki

- **Edytor:** brak stawiania ramion i glifów oraz edycji osi czasu (A6, A9). PoC miał narzędzia budowy i podgląd.
- **Plansza:** brak przesuwania i przybliżania (PoC: przeciąganie i kółko).
- **Wejścia:** są nieograniczone. Bufory z magazynu kolonii (`supply`) nie są podłączone.
- **Ekonomia:** produkt nie trafia do gry.
- **Stan gry w widoku:** silnik żyje w widoku, a `view.ts` zakłada, że sceny nie trzymają stanu gry. Na razie to wizualizacja rozwiązania wzorcowego.
- **Konteksty przy pierwszym montażu:** PixiJS na chwilę tworzy konteksty próbne, tracone zaraz po pierwszym renderze.

## Pytania

1. Kto ma prowadzić symulację budynku: mock w workerze (migawka z polem `atanor`, produkty do magazynu kolonii) czy widok, jak teraz?
2. Czy tempo maszyny ma iść za zegarem gry i tempem (Z6; takt z modelu ekonomii: cykle × takt), czy zostaje osobne `ticksPerSecond`?
3. Czy widok budynku ma liczyć wejścia z magazynu (`supply`), z JAM / `starved` przy braku?
4. Kolory atomów to propozycja: DS nie ma barw materiałów. Czy dodać je do tokenów DS?
5. Czy potrzebne jest przesuwanie i przybliżanie planszy, skoro plansza L1–L5 mieści się w kadrze (promień 2–6)?
6. Teksty `WEJ`, `WYJ`, `JAM`: podawać ze słownika aplikacji przez `options.text` (W16)?

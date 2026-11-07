# Galaktyka — widok mapy gwiazd (F4)

Widok `kind: 'galaxy'`, `usesThree: true`. Rysuje na wspólnym `WebGLRenderer` hosta.

## Skąd

Port `poc/space-galaxy-poc/star-map/src/app/components/star-canvas/star-canvas.component.ts`. Komponent Angulara stał się klasą `GalaxyView`. PoC jest tylko do odczytu.

## Użycie

```ts
import { createGalaxyView } from './galaxy';
new RenderHost(el, { views: { galaxy: () => createGalaxyView() } });
// opcje: { text?, maxLabels? (16), starName?: (nazwaKatalogowa) => string, stars? }
```

- **Dane:** `STARS` z domeny (W10 A) i z migawki: `scenarioId`, `hubs[].star` oraz `players[].homeStar`.
- **Zaznaczenie:** `input.selection` i `input.hover` (`STAR`).
- **`pick(x, y)`:** zwraca `{ kind: 'STAR', starName }` dla najbliższej kropki w promieniu 6 px, w przeciwnym razie `EMPTY`.
- **Kamera:** OrbitControls na płótnie hosta. Przeciąganie obraca, kółko przybliża, przesuwanie jest wyłączone.
- **Klik a przeciągnięcie:** rozróżnia aplikacja. W harnessie klik to ruch o najwyżej 4 px.

## Zmiany względem PoC

| Obszar | PoC | Tutaj | Źródło |
|---|---|---|---|
| Obiekty | kula, sprite poświaty i sprite etykiety na każdą gwiazdę, linie siatki osobno (ok. 185 wywołań) | 6 wywołań: siatka, linie spadku, 2 pierścienie, gwiazdy (1 `Points`), znaczniki (1 `Points`) | zadanie F4 |
| Pozycje | surowe x, y, z (`STAR_DATA`) | `STARS.pos`, długość = `distance` | W10 A |
| Daleka płaszczyzna | 5000 j. ≈ 1019 ly, Deneb ucięty | far ≈ 10 818 ly, maks. oddalenie 7208 ly, wszystkie gwiazdy mieszczą się w kadrze | W09 |
| Styl | poświaty addytywne, 8000 losowych gwiazd tła, siatka 0x223366 | płaskie kropki i ramki, kolor katalogowy w 30%, reszta to `text` lub `textDim` z DS, bez tła | W14 C |
| Etykiety | `CanvasTexture` na gwiazdę, nigdy niezwalniane | DOM w nakładce kontenera, wybór i rozmieszczenie bez nakładania | zadanie F4 |
| Kamera | obrót grupy gwiazd wokół Słońca, zoom 0,3–8 | orbita wokół gwiazdy kolonii, start ok. 22 ly (Mk II w kadrze), do 7208 ly | plansza |
| Zwalnianie | tylko `renderer.dispose()` (geometrie, materiały i tekstury zostawały) | wszystkie geometrie i materiały, nakładka DOM i kontrolki | zadanie F4 |

**FAKT** z planszy „Galaktyka”:

- Mk I 5 ly w kolorze sygnałowym, Mk II 9 ly w kolorze metalu, linia przerywana.
- Kolonia gracza: amber kropka w kwadratowej ramce 24 px.
- Zaznaczenie: narożniki.
- Rozmiary kropek według klasy: A 10, G 9, K 7, M 5, brązowe karły 6 (pusty krążek).

**PROPOZYCJA:**

- Znaczniki: hub to romb, kolonia innego gracza to krąg, najechanie to narożniki w kolorze tekstu.
- Olbrzymy i nadolbrzymy większe o 2–4 px.
- Płaszczyzna odniesienia (z domeny = góra) z siatką 5 ly i liniami spadku dla gwiazd do 25 ly.
- Pierścienie to obrys sfery zasięgu, zawsze okrąg na ekranie.
- Kierunek startowy kamery wzięty z rzutu planszy.

## Pomiary (Chromium 1440×900, ten komputer — P6, RTX 4060 Ti, ANGLE D3D11)

| Wielkość | Wynik |
|---|---|
| Wywołania rysowania i trójkąty | 6 · 0 |
| Pamięć | geometrie 5 · tekstury 0 · programy 3 |
| Po 20 przełączeniach przez hosta i 20 bezpośrednich mount/dispose | 5 · 0 · 3 (bez zmian); 1 nakładka i 1 płótno w DOM |
| Konteksty WebGL na żywo | 1 |
| Klatki | 60 fps |
| Kółko | 10 kroków: 30 → 140 ly; ok. 37 kroków od startu do maksimum |

Testy: `npx vitest run packages/render/src/galaxy`, 26 testów. Obejmują paletę wobec tokenów DS, wygląd gwiazd, odwzorowanie sceny, znaczniki z migawki mocka, pierścienie i obrys sfery, granice kamery z Denebem, wybór i rozmieszczenie etykiet oraz pick.

Harness: `npx vite packages/render/harness/galaxy --port 4432`. Udostępnia `window.harness`: `select`, `stats`, `cycle`, `directCycles`, `scenario`.

## Rozbieżności z planszą (FAKT)

- **Odległości:** plansza ma własne współrzędne. Od Tau Ceti: Lacaille 9352 3,03, Epsilon Eridani 3,05, Syriusz 5,97 ly. Domena (W10) daje 2,61, 2,14 i 5,14 ly.
- **Lista Mk I z domeny:** Epsilon Eridani, Lacaille 9352, YZ Ceti, BL Ceti. Na planszy BL Ceti ma 5,06 ly, więc wypada poza zasięg.
- **Nazwy systemów:** mock i plansza używają nazwy systemu „Alpha Centauri”. `findStar` mapuje ją na składnik główny „Alpha Centauri A”. Tak samo działa każda nazwa + „ A”.

## Braki

- Brak przełączników warstw z planszy: zasięg, huby, kolonie, „tylko niezbadane”. Brak też statusu „niezbadana”, bo migawka nie ma tych danych.
- Brak trasy („Pokaż trasę”) i przeniesienia kamery na zaznaczoną gwiazdę.
- Nazwy gwiazd są katalogowe, po angielsku. Plansza pisze „Słońce”, „Syriusz A/B”, „Gwiazda Barnarda”. Przekład można podać opcją `starName`.

## Pytania

1. Warstwy mapy: pole w `ViewInput` (zmiana `view.ts`) czy metoda widoku `setLayers()`?
2. Polskie nazwy gwiazd w słowniku UI (jak na planszy) czy nazwy katalogowe?
3. Czy zaznaczenie ma centrować kamerę na gwieździe, czy kamera zostaje przy kolonii?
4. Pierścień Mk III (12,5 ly, jest w katalogu)? Czy obrys sfery wystarcza zamiast płaskiego okręgu z planszy?
5. Zasięgi napędów jako liczby w domenie? Dziś są tylko w nazwach `STARSHIP_MODULES` i `STARSHIP_UPGRADES`, a test pilnuje zgodności 5 i 9 ly.
6. Czy mock ma podawać nazwy katalogowe („Alpha Centauri A”) zamiast nazw systemów?
7. Płaszczyzna odniesienia: równikowa (z domeny) czy galaktyczna?

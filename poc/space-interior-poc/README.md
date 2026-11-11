# space-interior-poc — edytor wnętrz statków i stacji

Proof of concept edytora wnętrz na zestawie **Molten Maps SciFi Asset Pack** (CC0). Stawiasz podłogi, ściany, drzwi, szkło i wyposażenie na siatce 4 m. Edytor sam rozpoznaje pomieszczenia i ich funkcję, sprawdza szczelność kadłuba i liczy bilans statku. Analiza rozwiązań i decyzje projektowe są w [ANALIZA.md](ANALIZA.md).

```bash
npm install            # .npmrc: legacy-peer-deps (jak w space-3d-poc)
npm start              # http://localhost:4430
npm run kit            # przebudowa modeli z resources/ (po zmianie paczki)
npx ng test --watch=false
npm run check          # typy + testy + build produkcyjny
```

Stack jak w `space-3d-poc`: Angular 22 (standalone, zoneless, Signals), Three.js 0.187, vitest. Styl interfejsu pochodzi z `design-system/` (podłączony przez `file:`, tylko CSS).

## Co umie

- **Narzędzia:**
  - wybór (klik, Shift+klik, przeciąganie przesuwa obiekty),
  - pomieszczenie (prostokąt: podłoga + ściany do środka),
  - podłoga (prostokąt; Ctrl usuwa),
  - ściana i drzwi (klik na krawędzi albo linia; Ctrl usuwa; R zmienia stronę),
  - obiekt (duch zielony lub czerwony z powodem; R obraca),
  - gumka (klik albo obszar),
  - pipeta.
- **Katalog:** 58 pozycji, 141 wariantów kolorów, 133 ze 136 modeli paczki i 8 modeli budowanych w kodzie (schody i winda; paczka ich nie ma). Miniatury renderowane z modeli.
- **Pokłady 0–3, schody i windy** (katalog „Schody i windy”, narzędzie podłogi, R obraca):
  - **schody:** stopnie w polu, wejście od podświetlonego pola, wyjście pokład wyżej po przeciwnej stronie. Pokład wyżej dostaje otwór i barierki. Są też rampy z paczki.
  - **winda:** przystanek z platformą, drzwiami od frontu i szkłem po bokach. Przystanki jeden nad drugim tworzą szyb, który przedłużysz w inspektorze („Przystanek wyżej / niżej”). Inspektor przenosi też na przystanek na innym pokładzie.
  - **Osiągalność** liczy drzwi, schody i windy.
  - **Uwagi:** schody bez wyjścia lub z zakrytym otworem, winda z jednym przystankiem.
- **Reguły:**
  - podłoga pod całym meblem,
  - pas 0,5 m przy ścianach i drzwiach,
  - kolizje w warstwie (podłoga, blat, ściana, sufit),
  - panele tylko na ścianach,
  - drobiazgi same stają na blatach.
- **Kaskada:** usunięcie podłogi zabiera meble, a drzwi zamiast ściany zabierają wiszący na niej panel. Jedno Ctrl+Z przywraca wszystko.
- **Pomieszczenia i funkcje** wykrywane z wyposażenia: mostek, maszynownia, kwatery, ambulatorium, hydroponika, mesa, sala odpraw, magazyn energii, korytarz.
- **Uwagi:**
  - nieszczelny kadłub,
  - brak barierki nad niższym pokładem,
  - pomieszczenie bez wejścia lub odcięte,
  - drzwi w próżnię,
  - zastawione drzwi,
  - obiekt w złym miejscu.

  Klik na uwagę przenosi kamerę na miejsce.
- **Widok:**
  - obrót: kompas w rogu widoku (tarcza do przeciągania, przyciski co 45°, z góry, środek), `Q` / `E`, ŚPM albo `Alt`+LPM,
  - ściany w górze / przekrój / w dole,
  - dzień lub noc,
  - pokłady 0–3,
  - etykiety pomieszczeń,
  - siatka,
  - sufity (płyty i lampy sufitowe; ich światło działa zawsze).

  Noc jest dopasowana do `Layout Example Dark.png` z paczki: świecą oprawy i ekrany w swoich kolorach (dane `light` w katalogu), a bloom obejmuje tylko emisję.
- **Strojenie nocy** (przycisk z suwakami obok Dzień/Noc albo `N`):
  - **suwaki:** siła, zasięg i liczba świateł opraw, ekrany, hologramy, wypełnienie, odbicia, ekspozycja, barwa wypełnienia, tło, poświata (wł./wył., siła, promień, próg);
  - **ustawienia wyjściowe:** Referencja, Robocza, Kontrast, Alarm;
  - **zapis:** zmiany zapisują się w przeglądarce; „Kopiuj ustawienia” daje gotowy preset.
- **Plik:**
  - autozapis w `localStorage`;
  - eksport i import `*.interior.json` (format wersjonowany);
  - przykład „Korweta badawcza KB-7”: 3 pokłady i 16 pomieszczeń, klatka schodowa na pokład 1 (mesa i kwatery oficerskie), winda na pokłady 0–2 (pokład obserwacyjny).

## Sterowanie

| Wejście | Działanie |
|---|---|
| LPM | narzędzie |
| ŚPM / PPM przeciągnięcie / kółko | obrót / przesuw / zoom do kursora |
| `Alt`+LPM, `Shift`+PPM przeciągnięcie | obrót (bez środkowego przycisku, np. na touchpadzie) |
| kompas „Widok” w prawym dolnym rogu | przeciągnij tarczę: obrót o dowolny kąt; klik: północ u góry; strzałki na tarczy: co 15°; ↺ ↻ = `Q` / `E`; „Z góry” = `T`; „Środek” = `Home` |
| PPM klik, `Esc` | anuluj gest, potem wróć do wyboru, potem odznacz |
| `V` `B` `F` `W` `D` `O` `X` `I` | wybór, pomieszczenie, podłoga, ściana, drzwi, obiekt, gumka, pipeta |
| `R` | obrót ducha lub zaznaczenia (ściana: zmiana strony) |
| `Del` | usuń zaznaczenie |
| `Ctrl+Z`, `Ctrl+Y` | cofnij, ponów |
| `Q` / `E` | obrót widoku o 45° |
| `T` | widok z góry / izometryczny |
| `C`, `L`, `G` | tryb ścian, dzień/noc, siatka |
| `N` | strojenie nocy |
| `PageUp` / `PageDown`, przyciski 0–3 | pokład wyżej / niżej, wybór pokładu |
| `Home` | wyśrodkuj na pokładzie |

## Struktura

```
tools/build-kit.mjs           pipeline: GLB bez atlasu → public/assets/molten, tabela wymiarów
src/app/domain/               czysty TypeScript (bez Angulara i Three.js)
  grid.ts                     siatka 4 m, krawędzie, obroty, prostokąty
  catalog/                    semantyka kitu (catalog.ts) + wymiary (kit-models.generated.ts, models.ts)
  layout.ts, history.ts       dokument (Piece), zmiany, cofanie
  layout-index.ts, placement.ts, rules.ts   zajętość, kształty, reguły stawiania
  planners.ts                 gesty → plany (pokój, linia ścian, prostokąt podłóg, obiekt, schody, winda, kaskada)
  rooms.ts, validation.ts, stats.ts         pomieszczenia, uwagi, bilans
  serialization.ts, sample-layout.ts        format pliku, przykładowy statek
src/app/engine/               Three.js: materiały kitu, instancing, modele budowane w kodzie, światło, duch, nakładki, kamera, miniatury
src/app/state/                EditorStore (Signals), ToolController (gesty → plany)
src/app/ui/                   komponenty HUD (design-system)
```

Kierunek zależności: `ui → state → domain ← engine`.

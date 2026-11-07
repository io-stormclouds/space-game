# Scena planety i układu (`render/src/system`)

Jeden widok dla rodzajów `planet` i `system` (W12 A: jedna ciągła scena, przełącznik ustawia tylko kamerę). Styl według W14 C: modele KayKit w ograniczonej palecie, płaskie cieniowanie i wektorowe nakładki, bez poświat. Źródłem jest silnik 3D PoC (`poc/space-3d-poc/src/app/engine/`). Klasy są zwykłe, bez Angulara.

## Użycie

```ts
import { createSystemView } from './system'; // z render/src; eksport w index.ts dopisuje prowadzący
const host = new RenderHost(el, { assetsBase: 'assets/', views: { planet: createSystemView, system: createSystemView } });
await host.setView('planet');   // montuje widok
await host.setView('system');   // ten sam obiekt: tylko setKind, żadnych nowych zasobów GPU
host.update(input, dt);         // co klatkę: snapshot, frame, focusBodyId, selection, hover, placement
host.pick(x, y, input);         // piksele względem kontenera
```

- **Wejście:**
  - świat bierze się wyłącznie z `input.snapshot.world`;
  - pozycje w klatce z `input.frame`: `time`, łaziki, `transit`;
  - bez `focusBodyId` kamera planety celuje kolejno w: miejsce kolonii, bazę macierzystą, pierwsze odkryte ciało z siatką.
- **`pick`** daje jeden z wyników:
  - `SHIP`, `ROVER`: w przestrzeni ekranu, w promieniu 12 px, chyba że coś stoi przed nimi;
  - `STRUCTURE`: z kafelkiem pod kursorem;
  - `TILE`;
  - `BODY`: także pas, wykrywany testem pierścienia; ciała mniejsze niż 40 px promienia zawsze dają `BODY`;
  - `EMPTY`.
- **Sterowanie po stronie aplikacji:**
  - próg przeciągnięcia `CLICK_THRESHOLD_PX = 5`;
  - ograniczenie hover do ~30 Hz: `HOVER_INTERVAL_MS = 33`.
- **`stats()`:** zwraca draw calls i trójkąty obu przebiegów, czyli sceny i nakładki pikselowej. Host widzi w `renderer.info` tylko ostatni przebieg.
- **`SystemView.ready`:** rozwiązuje się, gdy modele są wczytane. Do tego czasu stoją pudełka o wymiarach z rejestru.

## Co skąd (PoC → tutaj)

| PoC | Tutaj | Zmiana |
|---|---|---|
| `scene-manager.ts` | `system-scene.ts`, `system-view.ts` | adapter `View`; świat z migawki zamiast zdarzeń; renderer współdzielony z hosta |
| `planet-grid-view.ts` (+spec) | `planet-grid-view.ts` (+spec) | paleta DS, odcień złoża według kodu materiału, wyczerpane złoża bledną, obrys kafelków (`writeOutline`) |
| `asteroid-view.ts` | `asteroid-view.ts` | Lambert, wyciszony kolor |
| `structure-view.ts` | `structure-layer.ts`, `buffers.ts` | InstancedMesh na (ciało, model), stany budowy, stopy 1/3/7 kafelków, skały złóż |
| `entity-view-registry.ts`, `picking.service.ts` | `system-scene.ts` (`pick`), `screen-overlay.ts` | jednostki w przestrzeni ekranu, test pudełek modeli, pierścień pasa |
| `camera-controller.ts` | `camera-rig.ts` | dwa ujęcia, przelot 0,7 s, pamięć ujęcia gracza na tryb |
| `model-library.ts` (+spec) | `model-library.ts` (+spec), `model-kit.ts` | GLB składany w pamięci, kolory z UV atlasu zamiast tekstury, placeholdery |
| `model-registry.ts` (+spec) | `model-registry.ts` (+spec) | 14 plików, mapowanie rodzajów z katalogu, części (HQ = wieża + lądowisko) |
| `asset-cache.ts` | pamięci podręczne w `system-scene.ts` | — |
| — | `placement.ts`, `belt-view.ts`, `units-layer.ts`, `labels.ts`, `palette.ts` | nowe |

## Zmiany względem PoC

- **Zakres sceny:**
  - stan z `GameSnapshot` co około 10 Hz;
  - przebudowa tylko przy zmianie sygnatury: ciał, układu budowli, odkrycia albo wyczerpanych złóż;
  - pozycje z `OrbitSolver` przy `frame.time`;
  - statek w locie: `BezierPath.arc(startPos, leadPos, arcLiftFactor)` w `u = frame.transit[id]` albo z czasu (TECH-1); test sprawdza zgodność z `Simulation` w każdym kroku.
- **Kolory:**
  - modele nie ładują PNG: każdy wierzchołek dostaje odcień palety według pola atlasu 8×4 pod swoim UV (`ATLAS_TONES`), z zachowanym gradientem pola;
  - wszystkie modele mają jeden materiał (Lambert, `flatShading`) i nie mają tekstur.
- **Stany budowli:**
  - PLANNED: obrys krawędzi modelu w `textDim`;
  - CONSTRUCTING: bryła rosnąca z `progress` (od 8%) i obrys docelowej sylwetki;
  - UPGRADING: pełna bryła i obrys;
  - ACTIVE: sama bryła.
- **Nakładki (bez poświat):**
  - orbity w kolorze `metal`, orbita ciała w fokusie w `textFaint`;
  - przerywana ścieżka lotu: pozostała część, zaznaczony statek w `signal`;
  - obrys zaznaczonego kafelka lub stopy budowli w `signal`, kursor w `textDim`;
  - duch rozmieszczenia: krawędzie modelu i obrys stopy, `#FFB000` przy poprawnym, `#FF5A4A` przy błędnym;
  - narożniki zaznaczenia i romby statków mniejszych niż 6 px (piksele, kamera ortograficzna);
  - etykiety ciał w DOM: DS mono, wielkie litery; nieodkryte ciało pokazuje `unknownName`.
- **Nieodkryte ciało** (`revealed === false`): szara sfera, bez siatki, złóż i budowli. Po skanie siatka pojawia się bez przebudowy sceny.
- **Pas (`BELT`):** 420 skał (`rock_A`, `rock_B`) w dwóch InstancedMesh. Pierścień kręci się z ω pasa, ziarno pochodzi z id ciała.
- **Dokowanie:** jak w symulacji:
  - nad pierwszym działającym `LAND` (`padDockingOffset`);
  - bez lądowiska 1,25 R nad środkiem;
  - kolejne statki przy tym samym ciele stoją w rzędzie, a Arka jest 1,8 raza większa.
- **Kamera:**
  - planeta: kamera patrzy na środek kolonii albo, bez budowli, na stronę oświetloną;
  - układ: dopasowana do najdalszej orbity, środek w gwieździe;
  - drobne ciała (< 80 px) nie rysują krawędzi kafelków, a poniżej 24 px także budowli.

## Zmierzone (Chromium headless + SwiftShader, 1440×900, harness)

| Ujęcie (Tau Ceti) | Draw calls | Trójkąty |
|---|---|---|
| planeta e: port, 6 placów, łaziki, Arka | 20 | 27,6 tys. |
| układ, ta sama kolonia | 17 | 28,9 tys. |
| układ + lot Arki do f | 18 | 28,9 tys. |
| planeta e + 120 dodatkowych budynków | 24 | 107,9 tys. |
| układ z tymi 120 budynkami | 18 | 28,9 tys. |
| przylot (przed skanem), układ | 16 | 19,1 tys. |
| przylot, planeta „Obiekt 4” | 8 | 15,5 tys. |

- **Mieści się w budżecie:** 100–150 draw calls i 200–400 tys. trójkątów. Draw calls nie rosną z liczbą budowli (instancing).
- **Pamięć GPU:** 20 cykli montowania i zwalniania przez `RenderHost`, czyli widok systemu i widok zastępczy na zmianę. Po każdym cyklu `renderer.info.memory.geometries` wraca do 0, a `textures` wynosi 0 przez cały czas.

## Testy i harness

- **Testy:** `npx vitest run packages/render/src/system`, 63 testy w 7 plikach.
  - `system-view.spec.ts` działa w jsdom z atrapą renderera. Sprawdza:
    - pick: kafelek, budowla, statek, łazik, `EMPTY`, małe ciało w układzie;
    - przełączenie bez nowych zasobów;
    - stany budowy, lot, ducha i zaznaczenie;
    - odkrycie po skanie;
    - `dispose`: każda geometria i materiał, nasłuchy canvasu, DOM, 20 cykli.
  - Pozostałe pliki działają w zwykłym node: rejestr i pliki glTF z dysku, siatka, położenie stóp, krzywa lotu, paleta, pas i kamera.
- **Harness:** `npx vite packages/render/harness/system --port 4431`.
  - Domyślnie gra przepływ kanwy: skan, port, prom, place. Z `?arrival` pokazuje stan przed skanem.
  - Klawisze: `1` i `2` zmieniają widok, `P` włącza ducha HQ, `F` ustawia fokus, `Esc` czyści zaznaczenie.
  - Do Playwrighta służy `window.systemHarness` (`stats`, `cycles(n)`, `stress(n)`, `pick`, `screenOf`). Nazwa jest inna niż `window.harness` z harnessów galaktyki i Atanora.

## Znane luki

- **Nie rysowane:**
  - prom (`world.shuttles`) i zamówienia pojazdów;
  - poziom budowli: L1–L5 mają ten sam model.
- **Orientacja:**
  - budowla na 3 kafelkach jest zwrócona do kafelka kotwicy; `rotation` z rozkazu nie trafia do `Structure`;
  - statek w locie ma oś +Z wzdłuż stycznej, a przechylenie jest nieokreślone.
- **Stałe:**
  - asteroida maleje względem minerałów z pierwszej migawki, więc po zamontowaniu w środku gry skala startowa jest błędna;
  - `padLiftFactor` i `arcLiftFactor` pochodzą z `GAME_CONSTANTS`, bo migawka nie niesie stałych scenariusza.
- **Kamera:** bez przesuwania i klawiatury. Limity przybliżenia ustaliłem sam (planeta 1,3–18 R).
- **Etykiety:** węzły DOM w kontenerze hosta. Mogą się nakładać, gdy ciała są blisko siebie na ekranie.

## Pytania otwarte

1. **`STRUCTURE.tileIndex`:** zwracam kafelek pod kursorem albo kafelek stopy najbliższy trafieniu w model, a nie kotwicę. Tak duch rozmieszczenia podąża za kursorem. Czy tak ma być?
2. **Środek kamery układu:** jest w gwieździe, zgodnie z zadaniem. Komentarz w `view.ts` mówi, że kamera układu centruje się na `focusBodyId`. Które ma obowiązywać?
3. **Rodzaje bez modelu:** SMT, SIR, CON, LST, ATN, FIS i inne dostają `structure_tall`. Propozycje: FARM i HAB dostają `basemodule_A`, GAR `cargodepot_A`, MLT `water_storage`. Czy dograć więcej modeli KayKit (dokument wymienia 70) i które?
4. **Arka:** dokuje jak każdy statek, więc nad lądowiskiem, jeśli jest. Według kanwy Arka zostaje na orbicie. Czy dać jej osobną, wyższą orbitę postojową?
5. **Wybór małych ciał:** ciało poniżej 40 px w ujęciu układu zwraca `BODY`, a nie `TILE`. Czy próg jest dobry?
6. **Etykiety:** zostają w pakiecie `render` (DOM), czy aplikacja wolałaby rysować je sama, na przykład z dodatkowymi danymi?
7. **Ścieżki lotu:** krzywa z domeny (uniesienie +Y) potrafi przejść przez gwiazdę, na przykład lot Arki z e do f. Czy domena ma ją omijać?
8. **Placement:** nie ma pola `rotation`. Czy duch HQ ma się obracać, czy orientacja wynika z kolejności `tiles` (kotwica pierwsza)?

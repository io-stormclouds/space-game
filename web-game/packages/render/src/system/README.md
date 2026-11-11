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
- **`SystemView.ready`:** rozwiązuje się, gdy wczytane są modele zamówione do tej pory: Space Base Bits przy montowaniu, modele skórki medieval, gdy pokaże się ciało z tym biomem. Do tego czasu stoją pudełka o wymiarach z rejestru.

## Co skąd (PoC → tutaj)

| PoC | Tutaj | Zmiana |
|---|---|---|
| `scene-manager.ts` | `system-scene.ts`, `system-view.ts` | adapter `View`; świat z migawki zamiast zdarzeń; renderer współdzielony z hosta |
| `planet-grid-view.ts` (+spec) | `planet-grid-view.ts` (+spec) | paleta DS, odcień złoża według kodu materiału, wyczerpane złoża bledną, obrys kafelków (`writeOutline`) |
| `asteroid-view.ts` | `asteroid-view.ts` | Lambert, wyciszony kolor |
| `structure-view.ts` | `structure-layer.ts`, `buffers.ts` | InstancedMesh na (ciało, model), stany budowy, stopy 1/3/7 kafelków, skały złóż |
| `entity-view-registry.ts`, `picking.service.ts` | `system-scene.ts` (`pick`), `screen-overlay.ts` | jednostki w przestrzeni ekranu, test pudełek modeli, pierścień pasa |
| `camera-controller.ts` | `camera-rig.ts` | dwa ujęcia, przelot 0,7 s, pamięć ujęcia gracza na tryb |
| `model-library.ts` (+spec) | `model-library.ts` (+spec), `model-kit.ts` | dwa źródła jedną ścieżką: GLB składany w pamięci i kolory z UV atlasu (Space Base Bits) albo gotowy GLB i kolory z nazwy materiału (Medieval Hexagon); placeholdery |
| `model-registry.ts` (+spec) | `model-registry.ts` (+spec) | 48 plików (36 Space Base Bits + 12 Medieval Hexagon), rodzaje z katalogu × progi poziomu × skórka (`partsFor`), części z `at` / `fill` / `offset` / `yaw` |
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
  - UPGRADING: pełna bryła i obrys, nadal w wyglądzie obecnego poziomu;
  - ACTIVE: sama bryła.
  - Wygląd zależy od progu poziomu (niżej, „Modele budowli i poziomy”). Plac budowy (L0) wygląda jak L1. Przejście progu przebudowuje warstwę: sygnatura układu zawiera próg, instancja przechodzi do innego `InstancedMesh`, a opustoszały batch jest ukryty i nie kosztuje draw calla.
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

- **Testy:** `npx vitest run packages/render/src/system`, 98 testów w 9 plikach (po T7B).
  - `system-view.spec.ts` działa w jsdom z atrapą renderera. Sprawdza:
    - pick: kafelek, budowla, statek, łazik, `EMPTY`, małe ciało w układzie;
    - przełączenie bez nowych zasobów;
    - stany budowy, lot, ducha i zaznaczenie;
    - odkrycie po skanie;
    - `dispose`: każda geometria i materiał, nasłuchy canvasu, DOM, 20 cykli.
  - Pozostałe pliki działają w zwykłym node: rejestr i pliki glTF z dysku, siatka, położenie stóp, krzywa lotu, paleta, pas i kamera.
  - `model-registry.spec.ts`: każdy z 18 budowalnych rodzajów i HQ ma części na L1, L3 i L5, nigdy samo `structure_tall`; progi różnią się tam, gdzie mówi plan; każda część mieści się w swojej ramce na każdym ciele z siatką.
  - `model-library.spec.ts`: każdy wpis rejestru zgadza się z plikiem (trójkąty, stopa, wysokość, przesunięcie podstawy), każdy plik wskazuje wspólny atlas, każdy wierzchołek dostaje odcień palety.
  - `system-view.spec.ts`: ulepszenie L2 → L3 → L5 przenosi budowlę do batcha modelu danego progu, `dispose` zwalnia wszystko.
  - T5 etap 3: `terrain-tones.spec.ts` (tony = grupa `terrain` DS, tony biomów, materiały Kenney z plików); `terrain.spec.ts`: pliki Kenney (trójkąty, wyśrodkowanie), plik dla każdego id wszystkich planów, kratery i krzewy na tc-d, korony zimowe na tc-f (także w paśmie LOD).
  - T7B: `model-library.spec.ts` sprawdza wpisy `hex` z plikami (te same trójkąty i pudełko co `HexKit`, kolor wierzchołka = `objectTone` materiału, bez przygaszenia); `model-registry.spec.ts` sprawdza skórkę medieval (każdy z 18 rodzajów i HQ na L1/L3/L5, tylko modele hex poza zostawionym sci-fi, mapowanie z tabeli, preload); `system-view.spec.ts`: HAB na Tau Ceti c dostaje batch `house`, ten sam rodzaj na tc-e `basemodule_A`, modele medieval ładują się dopiero po odkryciu c, duch (zamek + lądowisko, młyn wodny) i picking przez pudełko z `kit.box`; `terrain.spec.ts`: ruiny przygaszone, drzewa i skały nie.
- **Stykówka modeli:** `npx vite packages/render/harness/models --port 4432`, potem `node packages/render/harness/models/shot.mjs` zapisuje `docs/img/structures/t7a-sheet.png`. Każdy rodzaj × L1/L3/L5 przez prawdziwe `StructureLayer` i `ModelKit` na płaskich heksach (czasza bardzo dużej sfery). `?only=HQ,LAND&blocks=1` daje zbliżenie wybranych rodzajów, `?skin=medieval` skórkę medieval na trawie (`shot.mjs ../docs/img/structures/t7b-sheet-medieval.png "http://localhost:4432/?skin=medieval"`).
- **Harness:** `npx vite packages/render/harness/system --port 4431`.
  - Domyślnie gra przepływ kanwy: skan, port, prom, place. Z `?arrival` pokazuje stan przed skanem, z `?colony=c` zakłada kolonię na Tau Ceti c (port blisko zamku na suchym lądzie, poza ruinami; domena odrzuca wodę), z `?scenario=planeta-matka` pokazuje Planetę Matkę i Księżyc (bez rozgrywanej kolonii).
  - `node packages/render/harness/system/shot-biomes.mjs [outDir] [baseUrl] [ciała]` (harness na porcie 4433) robi dla każdego ciała z terenem zrzut z orbity (3 R) i zbliżenie (oświetlone pole z największą ilością dekoru, ok. 0,4 R nad gruntem, horyzont poziomo) do `docs/img/planet-terrain/biome-<ciało>-{orbit,close}.png` i wypisuje liczniki klatki oraz udział samego ciała (`own`: teren, dekor, budowle; `decorFull`: cały dekor bez odcinania).
  - `node packages/render/harness/system/shot-colony.mjs [out] [url] [k]` dokłada 10 stojących budowli różnych rodzajów i poziomów obok portu i robi zrzut z k promieni od środka, od strony oświetlonej (domyślnie `docs/img/structures/t7b-tau-ceti-c.png` z `?colony=c`; ciała się nie obracają, więc zrzut rysuje świat w położeniu orbity z t = 0, kiedy osada patrzy na gwiazdę).
  - Klawisze: `1` i `2` zmieniają widok, `P` włącza ducha HQ, `F` ustawia fokus, `Esc` czyści zaznaczenie.
  - Do Playwrighta służy `window.systemHarness` (`stats`, `cycles(n)`, `stress(n, { kinds, levels, near })`, `pick`, `screenOf`). Nazwa jest inna niż `window.harness` z harnessów galaktyki i Atanora.

## Znane luki

- **Nie rysowane:** prom (`world.shuttles`) i zamówienia pojazdów.
- **Orientacja:**
  - budowla na 3 kafelkach jest zwrócona do kafelka kotwicy; `rotation` z rozkazu nie trafia do `Structure`;
  - budowla na 1 kafelku patrzy (+Z modelu) w pierwszy narożnik kafelka, więc strona z drzwiami (garaż) wypada różnie;
  - statek w locie ma oś +Z wzdłuż stycznej, a przechylenie jest nieokreślone.
- **Stałe:**
  - asteroida maleje względem minerałów z pierwszej migawki, więc po zamontowaniu w środku gry skala startowa jest błędna;
  - `padLiftFactor` i `arcLiftFactor` pochodzą z `GAME_CONSTANTS`, bo migawka nie niesie stałych scenariusza.
- **Kamera:** bez przesuwania i klawiatury. Limity przybliżenia ustaliłem sam (planeta 1,3–18 R).
- **Etykiety:** węzły DOM w kontenerze hosta. Mogą się nakładać, gdy ciała są blisko siebie na ekranie.
- **Skórka medieval (T7B):**
  - modele, których używa i dekor ruin, i skórka (`castle`, `house` i 8 innych), pobierają się dwa razy: raz przez `HexKit` (teren), raz przez `ModelLibrary` (budowle). Przeglądarka zwykle poda drugi raz z pamięci podręcznej HTTP; parsowanie jest podwójne;
  - MIN, ICE, SIT i REGX mają ten sam `mine`, a `watchtower` stoi w CON, LST, SMT i HAB L5 (i w ruinach): te rodzaje rozróżnia panel albo drugi model, nie główna bryła;
  - budowla gracza i ruina tego samego modelu różnią się tylko tonem (przygaszenie T-23).

## Pytania otwarte

1. **`STRUCTURE.tileIndex`:** zwracam kafelek pod kursorem albo kafelek stopy najbliższy trafieniu w model, a nie kotwicę. Tak duch rozmieszczenia podąża za kursorem. Czy tak ma być?
2. **Środek kamery układu:** jest w gwieździe, zgodnie z zadaniem. Komentarz w `view.ts` mówi, że kamera układu centruje się na `focusBodyId`. Które ma obowiązywać?
3. **Mapowanie modeli (T7A):** tabela w „Modele budowli i poziomy” to propozycja do akceptacji na stykówce. TNK i MLT na L1–2 oraz MIN, ICE i SIT mają wspólny model (jak w planie). Czy rozróżnić je bardziej?
4. **Arka:** dokuje jak każdy statek, więc nad lądowiskiem, jeśli jest. Według kanwy Arka zostaje na orbicie. Czy dać jej osobną, wyższą orbitę postojową?
5. **Wybór małych ciał:** ciało poniżej 40 px w ujęciu układu zwraca `BODY`, a nie `TILE`. Czy próg jest dobry?
6. **Etykiety:** zostają w pakiecie `render` (DOM), czy aplikacja wolałaby rysować je sama, na przykład z dodatkowymi danymi?
7. **Ścieżki lotu:** krzywa z domeny (uniesienie +Y) potrafi przejść przez gwiazdę, na przykład lot Arki z e do f. Czy domena ma ją omijać?
8. **Placement:** nie ma pola `rotation`. Czy duch HQ ma się obracać, czy orientacja wynika z kolejności `tiles` (kotwica pierwsza)?
9. **Skórka medieval (T7B):** mapowanie w „Skórka medieval” to propozycja po stykówce. Czy SKL jako `archeryrange`, LST jako wieża ze stosem towaru i MIN/ICE/SIT/REGX jako jedna `mine` są do przyjęcia? Czy przygaszenie ruin (0,8 i 30 % do szarości) wystarcza, czy mocniej?

## Modele budowli i poziomy (T7A)

`partsFor(kind, level)` w `model-registry.ts` wybiera części według progu poziomu (decyzja T-21): **L1–2, L3–4, L5**. `partsForKind(kind)` to L1 (duch rozmieszczenia), `modelsForKind(kind)` zwraca modele wszystkich progów. Część (`ModelPart`) to model na części stopy (`at`, indeksy w `structure.tiles`, kotwica = 0), z opcjonalnym własnym wypełnieniem (`fill`), przesunięciem w szerokościach ramki (`offset`: x w prawo, z do przodu, y w górę, ujemne wkopuje) i obrotem (`yaw`). Ten sam kod (`partFrame` + `partMatrix` w `structure-layer.ts`) stawia budowle i ducha. Stykówka: `docs/img/structures/t7a-sheet.png`.

| Typ | L1–2 | L3–4 | L5 |
|---|---|---|---|
| HQ (3) | `structure_tall`@0 + `landingpad_small`@[1,2] | + 2 × `lights` na końcach lądowiska | `basemodule_E`@0 + `landingpad_large`@[1,2] + 2 × `lights` |
| LAND | `landingpad_small` | `landingpad_large` + 2 × `lights` | j.w. |
| HAB | `basemodule_A` | `basemodule_B` | `basemodule_E` |
| FARM | `space_farm_small` | `space_farm_large` | `space_farm_large_sprinkler` |
| GAR | `basemodule_garage` | j.w. | j.w. |
| DEP | `cargodepot_A` | `cargodepot_B` | `cargodepot_C` |
| SKL | `containers_A` | `roofmodule_cargo_A` | `cargo_A_stacked` |
| TNK | `water_storage` | j.w. | j.w. |
| MLT | `water_storage` | `water_storage` + `eco_module` obok siebie | j.w. |
| SOL | `solarpanel` | `roofmodule_solarpanels` | j.w. |
| WND | `windturbine_low` | `windturbine_tall` | j.w. |
| MIN, ICE, SIT | `drill_structure` | `terrain_mining` (wkopany wykop) + `drill_structure` | j.w. |
| REGX | `terrain_mining` (wkopany) + `rocks_B` (hałda) | j.w. | j.w. |
| SMT (3) | `structure_tall`@0 + `cargodepot_B`@[1,2] | j.w. | `structure_tall`@0 + `cargodepot_C`@[1,2] |
| SIR (3) | `structure_low`@0 + `water_storage`@[1,2] | j.w. | `structure_low`@0 + `eco_module`@[1,2] |
| CON | `basemodule_D` + `eco_module` (silos) | j.w. | j.w. |
| LST | `lander_base` + `cargo_A_packed` na nim | j.w. | j.w. |
| ATN (7) | `basemodule_E`@0, na pierścieniu na zmianę `cargodepot_B` i `basemodule_B`, 6 × `tunnel_straight_B`@[0,k] | j.w. | j.w. |
| GAS | `eco_module` | j.w. | j.w. |
| HE3S (3) | `drill_structure`@0 + `water_storage`@[1,2] | j.w. | j.w. |
| pozostałe (era ≥ 2, nieznane id) | `structure_low` | j.w. | j.w. |

- **Odstępstwa od propozycji z planu (§8.1):**
  - HAB L5: `basemodule_E` zamiast `dome`. `dome` to przezroczyste szkło bez atlasu; przekolorowane z UV daje cętkowaną kulę.
  - SKL L3–4: `roofmodule_cargo_A` zamiast `containers_C`, bo w naszej palecie `containers_C` wygląda jak `containers_A`.
  - MLT L3+ („+ `eco_module`”): dwa mniejsze zbiorniki obok siebie, bo dwie części na jednym kafelku nachodziłyby na siebie.
  - `terrain_mining` to blok terenu 2 × 2 × 2 z osią w środku. MIN/ICE/SIT L3+ i REGX wkopują go (`offset.y`) tak, że widać tylko wykop. REGX dostaje hałdę `rocks_B`, żeby nie był samą dziurą.
  - LAND L3+: na 1 kafelku `landingpad_large` wygląda prawie jak `landingpad_small` (oba wpasowane w kafelek), więc dochodzą maszty `lights`. HQ L3+ ma maszty na końcach lądowiska.
  - SMT i SIR L5 dostają większy model (`cargodepot_C`, `eco_module`) zamiast „j.w.”: te modele i tak są w użyciu.
  - CON: sam `basemodule_D` z daleka wygląda jak HAB, więc dochodzi silos `eco_module`.
  - ATN: hale na pierścieniu i tunele do środka. `tunnel_straight_B` zamiast `_A` (284 zamiast 608 trójkątów, 18 zamiast 39 KB).
  - Zastępstwo `DEFAULT_PARTS` to `structure_low` zamiast `structure_tall`. GAS (preset „fabryka”) dostaje `eco_module`, HE3S wiertło i zbiornik: jedno wiertło rozciągnięte na 3 kafelki było na księżycu wyższe niż R/2.
- **Zasoby:** 22 nowe pliki `.gltf` + `.bin` (36 razem), +775 KB surowo, około 243 KB po gzip. `ModelKit.loadAll()` wczytuje je wszystkie przy montowaniu widoku.
- **Draw calls:** jeden `InstancedMesh` na (ciało, model) w użyciu, plus jeden `LineSegments` na model, póki stoją place budowy. 18 budowalnych rodzajów i HQ używają razem 30 modeli: 19–20 w jednym progu, 30 przy kolonii ze wszystkimi rodzajami we wszystkich progach. Przedtem było 8. Kolonia M (L1, wypełniacze SOL, HAB, DEP, SKL, WND, LAND i wydobycie) ma 8 modeli zamiast 7, bo SKL nie dzieli już modelu z DEP. Batch opróżniony przez ulepszenie jest ukryty. `BatchedMesh` (T4) zbierze to w jedno wywołanie.

## Skórka medieval (T7B)

Na ciele z biomem `medieval` (`body.surfaceGrid.terrain.biome`, dziś Tau Ceti c) budowle gracza stoją jako modele KayKit Medieval Hexagon, obok ruin osady. `skinFor(body)` daje `'medieval'` albo `'spacebits'`; `StructureLayer` dostaje skórkę przy budowie warstwy ciała (`layer.skin`), a `partsFor(kind, level, skin)` wybiera części z `KIND_TIERS_MEDIEVAL` (te same progi L1–2 / L3–4 / L5). Duch rozmieszczenia bierze skórkę ciała w fokusie. Plan: `docs/planet-terrain-poc-wnioski-i-plan.md` §8.2.

- **Jedna ścieżka ładowania:** `ModelSpec.source: 'spacebits' | 'hex'` (domyślnie `spacebits`). Dla `hex` `ModelLibrary` pobiera `${assetsBase}kaykit-hex/<id>.gltf.glb` (już GLB, bez tekstur), spłaszcza scenę tym samym kodem co teren (`flattenKitScene` + `kitGeometry` w `hex-kit.ts`) i koloruje wierzchołki po nazwie materiału (`objectTone`, pełne tony). `ModelKit` (pudełko, krawędzie, geometria, placeholder do czasu wczytania, powiadomienia `onLoaded`) działa tak samo dla obu źródeł, więc `StructureLayer`, picking, obrys placów i duch nie mają wyjątków. Geometria hex jest nieindeksowana. `HexKit` zostaje dla kafelków i dekoru terenu.
- **Preload:** `ModelKit.loadAll()` bez argumentu wczytuje tylko `BASE_MODEL_IDS` (36 Space Base Bits). `SystemScene` zamawia `skinModels('medieval')` (12 plików hex) dopiero, gdy buduje powierzchnię ciała z tą skórką, czyli po odkryciu Tau Ceti c; świat bez takiego ciała nie pobiera ich wcale.
- **Pomiary rejestru:** `footprint`, `height`, `baseOffset`, `triangles` wpisów hex zmierzone z plików i sprawdzane w `model-library.spec.ts`. `fill` ≈ stopa / 2, czyli proporcje do kafelka jak w zestawie (kafelek zestawu ma 2 jednostki szerokości, narożniki na ±Z, więc pasuje do ramki 1 kafelka, której przód celuje w narożnik). `watermill` ma koło 0,58 pod podłogą: części wkopują je (`millFloor`), żeby podłoga stała na powierzchni. Duch pomija tylko części, których wierzch jest niżej niż 0,05 szerokości ramki nad powierzchnią (`partTop`): wykop zostaje pominięty, młyn wodny nie.
- **Zasoby:** doszły `archeryrange.gltf.glb` (86 KB) i `watermill.gltf.glb` (86 KB), razem 172 KB surowo, około 64 KB po gzip. Pozostałe 10 modeli skórki było już w `kaykit-hex/` dla ruin.

| Typ | L1–2 | L3–4 | L5 |
|---|---|---|---|
| HQ (3) | `castle`@0 + `landingpad_small`@[1,2] | + 2 × `lights` na końcach lądowiska | `castle`@0 + `landingpad_large`@[1,2] + 2 × `lights` |
| LAND | jak Space Base Bits (`landingpad_small`, potem `landingpad_large` + `lights`) | j.w. | j.w. |
| HAB | `house` | 2 × `house` | 2 × `house` + `watchtower` |
| FARM | `farm_plot` | `farm_plot` + mały `mill` w rogu | j.w. |
| GAR | `barracks` | j.w. | j.w. |
| DEP | `market` | j.w. | j.w. |
| SKL | `archeryrange` (szopa i ogrodzony plac) | j.w. | j.w. |
| TNK | `well` | j.w. | j.w. |
| MLT | `well` + `watermill` obok siebie | j.w. | j.w. |
| SOL | jak Space Base Bits (`solarpanel`, potem `roofmodule_solarpanels`) | j.w. | j.w. |
| WND | `mill` | `mill`, większy | j.w. |
| MIN, ICE, SIT, REGX | `mine` | j.w. | j.w. |
| SMT (3) | `lumbermill`@0 + `watchtower`@[1,2] | j.w. | j.w. |
| SIR (3) | `well`@0 + `watermill`@[1,2] | j.w. | j.w. |
| CON | `watchtower` | j.w. | j.w. |
| LST | `watchtower` + `farm_plot` (stos towaru) obok | j.w. | j.w. |
| ATN (7) | `castle`@0 + `house` na każdym kafelku pierścienia | j.w. | j.w. |
| GAS | `well` | j.w. | j.w. |
| HE3S (3) | `mine`@0 + `well`@[1,2] | j.w. | j.w. |
| pozostałe (era ≥ 2, nieznane id) | `house`@0 (na kotwicy) | j.w. | j.w. |

- **Odstępstwa od propozycji z planu (§8.2), po stykówce `docs/img/structures/t7b-sheet-medieval.png`:**
  - HQ L3+ dostaje maszty `lights`, a L5 `landingpad_large`, jak w Space Base Bits: lądowisko i tak zostaje sci-fi (T-24), a poziomy portu mają się różnić.
  - SKL: `archeryrange` zamiast `well` + `farm_plot`. Para studnia + pole wyglądała jak FARM; szopa z ogrodzonym placem i okrągłym towarem czyta się jako skład. To jedyny powód kopiowania `archeryrange`.
  - TNK, MLT, GAS, HE3S nie miały propozycji: zbiornik to studnia, topielnik studnia i młyn wodny, separator kopalnia i studnia.
  - SIR: `watermill` na dwóch kafelkach i `well` na kotwicy. Sam młyn rozciągnięty na 3 kafelki był wielką stodołą.
  - LST: `watchtower` i stos „towaru” (`farm_plot` w małej skali), żeby nie był identyczny z CON (sama `watchtower`).
  - WND L3+: ten sam `mill`, większy; FARM L5 bez zmian względem L3 (trzeci model na kafelku robi tłok).
  - Zastępstwo: `house` tylko na kotwicy. Rozciągnięty na 3 kafelki wyglądał jak stodoła wielkości zamku.
- **Ruiny a budowle gracza (T-23):** `TerrainDecor` rysuje budynki osady (każdy model dekoru poza `detail_*`, `mountain` i `kenney:*`, czyli `!isNatureDecor` z domeny) tonem `ruinTone(objectTone(mat))`: 30 % drogi do szarości o tej samej luminancji (`RUIN_GREY = 0.3`), potem × `RUIN_FADE = 0.8`. Stałe są w `terrain-tones.ts`. Drzewa, skały i góry mają pełne tony, budowle gracza też. Na zrzucie `docs/img/structures/t7b-tau-ceti-c.png` zamek ruin jest wyraźnie ciemniejszy od zamku portu, a pola ruin oliwkowe obok żółtych pól gracza.
- **Koszt:** kolonia z zrzutu (port, 2 place, 10 budowli L1–L5) i cały teren Tau Ceti c: 38 draw calls, 138 tys. trójkątów (ANGLE D3D11, 1440×900). Modele hex mają po 900–2 300 trójkątów (Space Base Bits: 30–1 800).

## Teren z kafelków hex

Ciała ze stylem terenu (`surfaceGrid.terrain` w ciele zapisu; dziś Tau Ceti b–f, Planeta Matka i Księżyc) rysują się z kafelków KayKit Medieval Hexagon (`apps/game/public/assets/kaykit-hex/`). Dane liczy czysta domena (`packages/domain/src/sim/terrain/`): klasy pól i drogi (`classifyTerrain`, rozgrywka, port do Rust) oraz kafelek i obrót na heks, osada, drzewa, skały, kratery (`dressTerrain`, tylko render, tylko TS). Render: `hex-kit.ts` (ładowanie GLB przez `fetchBytes`; `flattenKitScene` i `kitGeometry` wspólne z `ModelLibrary`), `terrain-view.ts` (jedna siatka, warp kafelków na pola Goldberga, pięciokąty jako płyty), `terrain-decor.ts` (instancje; budynki osady przygaszone jako ruiny; `setHidden` chowa dekor pod budowlami i przywraca po rozbiórce), `terrain-tones.ts` (kolor z nazwy materiału, `ruinTone`).

`PlanetGridView` zostaje: jej siatka wachlarzy to **raycast proxy** (ukryta w pobliżu, ale dalej pickowalna) i daleki LOD; kafelki i dekor rysują się od `EDGES_MIN_PX`. Do czasu załadowania plików planeta wygląda jak dotąd. Plan i wnioski: `docs/planet-terrain-poc-wnioski-i-plan.md`.

### Biomy: dekor, modele Kenney i tony (T5 etap 3)

Biom ciała (`TerrainPlan.biome`, podłoże `plan.ground`) wybiera zestaw dekoru w `dressTerrain` (`BiomeDress.decor`) i tony obiektów w `TerrainDecor`. Plany `mixed` i `medieval` są bit w bit takie jak przed etapem 3 (golden w `terrain-golden.spec.ts`).

| Zestaw | Ciała | Dekor |
|---|---|---|
| `temperate` | `mixed` (tc-e, Planeta Matka), `medieval` (tc-c) | 2–3 drzewa na polu lasu, góra albo kupa skał na skale; w `medieval` ruiny osady. Tylko modele KayKit |
| `winter` | tc-f | jak `temperate`, do tego drobne skały na śniegu; na płaskim polu skały czasem kryształy (`h < 0,15`) albo głaz Kenney |
| `dry` | tc-b (piasek), tc-d i Księżyc (regolit) | góry i kupy skał na skale, rzadko kryształy Kenney zamiast małej kupy (`h < 0,1`); na podłożu drobne skały, pojedyncze krzewy (drzewo × 0,7) oraz na płaskim polu kratery Kenney (regolit 25 %, piasek 10 % pól) i samotne głazy (4 % / 6 %) |

- **Modele Kenney Space Kit** (CC0, decyzja T-31; `apps/game/public/assets/kenney/` z `LICENSE-Kenney.txt`, tekst `License.txt` z paczki): `crater`, `craterLarge`, `rock_largeA/B` (głazy), `rock_crystals`, `rock_crystalsLargeA`. 6 plików, 88,9 KB surowo, ok. 28,9 KB po gzip; 60–384 trójkątów na model.
  - Id dekoru ma przedrostek `kenney:` (`KENNEY` w domenie). `hexKitUrl` zamienia `kenney:<plik>` na `${assetsBase}kenney/<plik>.glb`; reszta ścieżki ładowania (`HexKit.loadAll` z identyfikatorów planów w `SystemScene.attachTerrain`) się nie zmienia.
  - Modele Kenney są przesunięte w pliku (węzeł w x = 2, z = 1,5), więc `HexKit` centruje je na x/z (`centreXZ`).
  - Krater zajmuje do 0,78 szerokości pola, a jego podstawa jest płaska. Na zakrzywionym polu brzeg by wisiał (na Księżycu 0,18 j. przy wysokości krateru 0,63 j.), więc `TerrainDecor` wygina każdy model Kenney na sferę ciała (`bendToSphere`: wierzchołek opada o ugięcie sfery w swojej odległości od osi) i podnosi o `KENNEY_LIFT` = 0,004 szerokości pola, żeby dno krateru nie migotało z wierzchem kafelka. Jedna wygięta geometria na model i ciało wystarcza, bo każdy model Kenney ma na ciele jeden `fill` (sprawdza `terrain-properties.spec.ts`).
  - Stoją tylko na płaskim `hex_forest` (bez zatoki i podniesionej połowy), nigdy na złożu, drodze ani pod budynkiem.
- **Budżet:** kratery i głazy na podłożu mają własny limit `MAX_GROUND_DECOR` = 60 (≤ 11 tys. trójkątów), żeby nie przerzedzały skał i gór; kryształy i głazy na skale liczą się do `MAX_ROCKS` (zastępują kupę skał 1 : 1). Pełny dekor ciał suchych: tc-b 53 tys., tc-d 46 tys., Księżyc 16 tys. trójkątów (przed etapem 3: 52, 44 i 16 tys.).
- **Tony (`objectTone(mat, body?)`, `body` = `{ biome, ground }` planu):**
  - `winter`: korony drzew (`GreenDark`, `Green`) w tonie `ice`, pnie (`BrownDark`, `WoodDark`) ciemniejsze (`stoneDark` zamiast `soil`);
  - `dry`: korony krzewów `olive` (nowy ton #7f8763: #8f9a4a stonowany jak reszta), pnie bez zmian;
  - `mixed`, `medieval` i wywołanie bez ciała (skórka medieval budowli gracza): tabela bez zmian;
  - materiały Kenney (jeden ciepły odcień w trzech stopniach i zieleń kryształu) → paleta: `rockTrack` (bryła głazu) `stone`, jak skały KayKit; `rock` (podstawa głazu, wał krateru, wierzchy kryształów) ton podłoża ciała (piasek, regolit, śnieg), więc model siedzi w gruncie, a wierzchy wyglądają jak przysypane; `rockDark` (dno krateru) o stopień ciemniej (piasek → `dune`, regolit → `stoneDark`, śnieg → `stone`); `crystal` → `ice`. `KENNEY_MATERIALS` to lista nazw z plików (test).
- **Design system (T-7, propozycja):** tabela `TONE` jest grupą `terrain` w `design-system/src/tokens/design-tokens.ts` (`--hud-terrain-*`). Render ma DS tylko w `devDependencies` (jak `palette.ts` dla `color`), więc zostaje liczbowa kopia, a `terrain-tones.spec.ts` sprawdza, że obie tabele mają te same klucze i wartości, i że żaden ton nie zbliża się do `signal` ani `alert`.
- **Zrzuty:** `docs/img/planet-terrain/biome-<ciało>-{orbit,close}.png` (tc-b, tc-c, tc-d, tc-e, tc-f, `poc-planet`, `poc-moon`), `shot-biomes.mjs` niżej.
- **Trójkąty ciała w fokusie** (domyślny widok planety 3,4 R, GPU ANGLE D3D11, 1440×900; teren + dekor + budowle samego ciała, po odcięciu półkuli): tc-b 51 tys., tc-c 81 tys., tc-d 50 tys., tc-e 113 tys., tc-f 49 tys., Planeta Matka 129 tys., Księżyc 19 tys. Cała klatka (z innymi ciałami w tle) najwyżej 134 tys. (tc-c z orbity, tc-e w tle): wszystko poniżej 200 tys. (T-13).

## Odcinanie półkuli i LOD dekoru (T4)

- **`hemisphere-culler.ts`:** `HemisphereCuller` na ciało z siatką (wspólny dla `StructureLayer` i `TerrainDecor`) trzyma kierunek kamery w układzie ciała i kąt horyzontu `acos(R/d)` sfery zasłaniającej (`OCCLUDER` = 0,995 R: cięciwy siatki i woda terenu leżą niżej). Przelicza się, gdy kamera obróci się o ponad 2° (`CULL_TURN`) albo kąt horyzontu zmieni o ponad 1° (`CULL_ZOOM`); test zostawia ten zapas, więc między przeliczeniami nic nie wyskakuje na horyzoncie.
- **Test instancji (zachowawczy):** pudełko geometrii przez macierz instancji daje najdalszy wierzchołek (`top`) i największy kąt od kierunku kotwicy; instancja odpada, gdy kotwica leży dalej od kierunku kamery niż `acos(R/d) + acos(R/top) + kąt + zapas`. Żaden punkt odciętej instancji nie jest widoczny (test właściwości promieniami w `hemisphere-culler.spec.ts`). Wysokie modele na małych ciałach widać daleko za horyzontem, więc zysk jest mniejszy niż połowa (`docs/PERF-REPORT.md`).
- **`CulledInstances`:** instancje w swojej kolejności („źródłowej”), w buforze `InstancedMesh` tylko widoczne, nieukryte i przepuszczone przez filtr, upakowane od początku; `mesh.count` = ile; pusty batch jest ukryty (bez draw calla). `slotOf` / `sourceOf` mapują kolejności. `InstancedBatch` z cullerem przyjmuje indeksy źródłowe (`setMatrixAt`), `recull()` co klatkę jest tani, gdy culler się nie przeliczył. Picking, `partsOf`, `tileOwner`, obrysy placów i wzrost budowy pracują na `parts`, nie na buforze; `StructureLayer.slotOfPart` i `instancesOf` są dla testów.
- **Dekor:** `TerrainDecor.setHidden` nie zeruje już macierzy, tylko wyjmuje instancje z bufora. W paśmie LOD (`DECOR_LOD_PX` = 200 px pozornego promienia w dół, powrót powyżej `DECOR_FULL_PX` = 220 px, od dołu teren zaczyna się od `EDGES_MIN_PX` = 80 px) wszystkie drzewa rysuje jedna siatka `Decor_lod_trees` modelem `detail_treeA` (najtańszy), połowa według `hash3` (`LOD_TREE_KEEP`); ruiny, skały i góry bez zmian.
- **Wyłączenie:** `SystemViewOptions.cullDetail = false` (w aplikacji `?detail=full` w adresie) rysuje wszystko w pełnym szczególe, bez T4 i bez T4b: to „przed” w `PERF_DETAIL=full npm run perf`.
- **Liczniki:** `SystemScene.frameStats` ma trójkąty terenu, dekoru, budowli i jednostek oraz instancje dekoru i budowli narysowane w klatce; `SystemView.stats().detail` przekazuje je do nakładki wydajności (`[data-perf="terrain|decor|structures|units|instances"]`).

### Bryły zastępcze budowli i jednostek (T4b)

- **Dalekie ciało:** `BodyView.far` z histerezą: wejście poniżej `STRUCTURE_LOD_PX` = 80 px pozornego promienia (tam teren przechodzi w siatkę wachlarzy), wyjście powyżej `STRUCTURE_FULL_PX` = 88 px; liczone dla każdego ciała, tylko z `cullDetail`.
- **Budowle:** `StructureLayer.setProxy(true)` parkuje partie modeli i skał złóż (`InstancedBatch.park`: instancje zostają zapisane, nic się nie rysuje) i pokazuje jedną `InstancedMesh` `<ciało>_Proxies` na ciało: wspólne pudełko `ModelKit.proxyBox()` (bok 1, 12 trójkątów, białe kolory wierzchołków) pod macierzą części razy `boxMatrix(kit.box(model))`, czyli dokładnie to pudełko, które testuje picking (z daleka picking zostaje bez zmian); wzrost budowy skaluje je w Y jak model. Kolor instancji (`instanceColor`, `InstancedBatch(..., colored)`) to średni kolor wierzchołków modelu ważony polem (`ModelKit.tone`, `meanColor`), więc kolonia z daleka nadal wygląda jak kolonia. Bryły mają ten sam culler co modele (`CulledInstances.setColor` upakowuje kolory razem z macierzami). Partia brył powstaje razem z warstwą (ukryta), więc przełączanie nie tworzy ani nie zwalnia geometrii; obrysy placów się nie zmieniają. `proxySlotOfPart`, `proxyInstances`, `proxyMesh` są dla testów.
- **Jednostki (`units-layer.ts`):** z `UnitContext.detail` statek albo łazik krótszy na ekranie niż `UNIT_LOD_PX` = 8 px (powrót od `UNIT_FULL_PX` = 10 px, stan na jednostkę), a także zadokowany przy dalekim ciele albo jeżdżący po nim, idzie do partii `ShipProxies` (grot `shipProxyGeometry`, 8 trójkątów) albo `RoverProxies` (pudełko, 12 trójkątów); obie w jednostkowym pudełku, dopasowane macierzą `boxMatrix(kit.box(model))` i pomalowane `kit.tone(model)` (po wczytaniu modelu na miejscu). Jednostka poza ostrosłupem widzenia (sfera o promieniu jej długości) i łazik za horyzontem swojego ciała (ten sam test co `HemisphereCuller`, dla jednego punktu) nie są rysowane. `shipPos` / `roverPos` zostają, więc picking po odległości na ekranie (`nearestUnit`) działa jak dotąd. Scena aktualizuje jednostki po kamerze i `updateDetail`, więc LOD widzi bieżący kadr.
- **Skutek** (`docs/PERF-REPORT.md`, przed = `?detail=full`): M planet 438 tys. → 162 tys. trójkątów, teren-M planet 453 tys. → 194 tys., L planet 1,24 mln → 277 tys. (UWAGA: pełne modele na ciele w fokusie), L system 321 tys. → 28 tys.; draw calli w widokach planety 15–45 % mniej.

## Skala prezentacji: układ rozsunięty (M-1)

Scena nie jest rysowana w jednostkach świata. Te same liczby (promienie orbit, promienie ciał, punkty dokowania, krzywe lotu) liczą w domenie czas lotu (150 j./min), paliwo (0,02/j.) i przejazdy łazików, więc zostają; rozsuwa je dopiero render (`view-scale.ts`, decyzja M-1 w `docs/DECISIONS.md`).

- **`VIEW_SCALE`** = `{ orbit: 15, body: 2, star: 5 }` (jednostki sceny na jednostkę świata): przesunięcia dzieci gwiazdy (orbity planet, pas) ×15, ciało ze wszystkim na nim i wokół niego (powierzchnia, teren, budowle, punkt dokowania, orbita postojowa, orbity jego księżyców, łaziki) ×2, gwiazda ×5. Statki ×2 (długość, odstęp przy dokowaniu). Tau Ceti: orbity 448–1185 → 6,7–17,8 tys., promienie planet 31–50 → 62–100, gwiazda 50 → 250. Sąsiednie orbity dzieli 6,9–19 średnic planety zamiast 1–2,5. `WORLD_SCALE` (w aplikacji `?scale=world`) rysuje jednostki świata.
- **Graf sceny:** `BodyView.frame` (pozycja w układzie rodzica, bez skali: dzieci, ich orbity i pas) trzyma `BodyView.group` ze skalą `size` (siatka, teren, dekor, budowle, obrysy, duch). Wszystko w `group` zostaje w jednostkach świata, więc `HemisphereCuller`, `StructureLayer`, picking promieniem w układzie ciała (odległość × `size`) i `screenOfLocal` działają bez zmian. Promień ciała w scenie: `radiusOf` (kamera, progi px, nawiasy, etykiety, picking małych ciał).
- **Loty (`FlightMap`):** domena leci stałą krzywą `BezierPath.arc` w jednostkach świata. Render bierze każdy punkt w układzie najbliższego ciała, które trzyma oba końce (gwiazda dla lotu między planetami, planeta dla lotu na jej księżyc), w chwili tego punktu (`t0 + u·czas lotu`), i liniowo w `u` dokłada różnicę na końcach. Statek startuje dokładnie z miejsca dokowania i dociera dokładnie do punktu dokowania przy przylocie (`view-scale.spec.ts`, `system-view.spec.ts`); lot na księżyc nie potrzebuje poprawki.
- **Pas:** pierścień w skali orbit, skały `beltRockScale` = max(body, orbit / 3) = ×5, żeby pas było widać w przeglądzie.
- **Kamera:** płaszczyzna daleka 2e6 (`FAR`), bliska 0,2 % odległości od celu, nie mniej niż 0,5 (`NEAR_MIN`), więc bufor głębi trzyma dokładność i przy powierzchni, i w przeglądzie; gwiazdy tła na sferze 5e5.
- **Znaczniki:** ciało mniejsze niż `BODY_RING_BELOW_PX` = 3 px dostaje w nakładce pikselowej kółko 4 px w swoim kolorze (nieodkryte w szarym), kreski lotu są ×7,5 dłuższe.
- **Skutek dla LOD** (sąsiad widziany z domyślnej kamery planety 3,4 R, najgorszy przypadek: kamera na linii do sąsiada, 1080p, 20 tys. min ruchu orbit): w jednostkach świata sąsiad miał ≥ 24 px (budowle) przez 100 % czasu, ≥ 80 px (teren z kafelków) przez 17–33 %, a kamera potrafiła wejść w sąsiednią planetę; w `VIEW_SCALE` ≥ 24 px przez 2–9 % czasu, ≥ 80 px przez 0–0,7 % (najwięcej tc-e widziana z tc-d: do ~103 px przy największym zbliżeniu). W przeglądzie układu teren, dekor i budowle mają 0 trójkątów. Klatka planety w fokusie bez zmian (te same progi px).

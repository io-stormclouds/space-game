# Edytor wnętrz statków i stacji — analiza i decyzje

Dokument do PoC `poc/space-interior-poc`. Opisuje materiał wejściowy (zestaw Molten Maps), przegląd analogicznych rozwiązań, decyzje projektowe z uzasadnieniem i drogę do `web-game`. Kod jest zgodny z tym dokumentem; jeśli się rozjadą, wygrywa kod, a dokument trzeba poprawić.

## 1. Cel

Edytor projektowania wnętrz statków i stacji na siatce. Gracz (albo projektant poziomów) stawia:

- podłogi,
- ściany, drzwi i szkło,
- elementy wyposażenia.

Edytor sam rozpoznaje pomieszczenia i ich funkcję, sprawdza szczelność kadłuba i liczy bilans statku. W PoC to samodzielna aplikacja. Docelowo te same warstwy (domena, render, UI) mają wejść do `web-game`, np. jako „widok wnętrza” budynku albo statku.

## 2. Materiał: Molten Maps SciFi Asset Pack

Licencja: CC0 (`resources/Molten Maps SciFi Asset Pack/License.txt`). Paczka zawiera 136 modeli w formatach FBX, OBJ i glTF; używamy glTF (`.glb`). Wymiary zmierzył skrypt `tools/build-kit.mjs` (bounding box spłaszczonej sceny); tabela trafia do `src/app/domain/catalog/kit-models.generated.ts`.

| Rodzina | Modele | Wymiar | Wniosek dla edytora |
|---|---|---|---|
| Podłogi | `Floor_*`, `Hazard_Floor_*`, `Floor_Tile_Carpet_*` | 4 × 4 m, wierzch na y ≈ 0 | **moduł siatki = 4 m** |
| Duże podłogi | `Floor_Command_Large`, `Floor_Medbay_Large` | 8 × 8 m | element 2×2 pola |
| Ściany | `Wall_<kolor>`, `Wall_Blue_Greeblies` | X ∈ [−2, 2], wys. 4 m, grubość 0,72–0,74 m (z detalami 1,61 m) wycentrowana na Z = 0 | **ściany leżą na krawędziach pól**, wysokość pokładu = 4 m |
| Drzwi, szkło | `Wall_With_Door_*`, `Wall_Glass_*` | jak ściana | drzwi i okno to **warianty elementu krawędzi**, a nie otwory w ścianie |
| Ściana 8 m | `Command_Wall` | 8 × 4 m | element na 2 krawędziach |
| Antresola | `Wall_*_2nd_Floor` (cienkie), `Deck_Height_Metal` (blok 4×4×4), `Ramp_*`, `Ramp_Wall_*_L/R`, `Catwalk_1`, `Railing_Flat` | — | pokłady i wejście na wyższy poziom |
| Na ścianę | `Wall_Display_*`, `Wall_Light_*`, `Wall_Light_Slope`, `Air_Con`, `Wall_Pipe` | panel ma wysokość wbudowaną w model, lampy trzeba zawiesić | warstwa „ściana”, wysokość montażu w katalogu |
| Sufit | `Ceiling_Tile_Grey_Metal` (y 3,86–4,01), `Ceiling_Light` | — | warstwa „sufit” |
| Meble i urządzenia | koje, stoły, konsola, reaktor, kriokomory, grządki… | od 0,26 m (lampa lava) do 6,3 m (konsola) | **siatka obiektów 0,5 m** (4 m to za grubo) |
| Drobiazgi | keczup, majonez, szachy, lampki, roślina | < 0,7 m | stają na blacie stołu |

**Materiały.** Każdy plik GLB ma 1–3 z pięciu materiałów: `Atlas`, `Atlas Metallic`, `Atlas Emissive`, `Atlas Glass`, `Atlas Holo`. Wszystkie czytają jeden atlas gradientowy 1024² (~181 kB), osadzony w **każdym** z 136 plików. Razem to 25,7 MB, z czego 24,6 MB to kopie tego samego PNG. Pipeline (sekcja 4, D13) zmniejsza paczkę do 2,2 MB plus jeden atlas.

**Co mówią obrazki z `Examples/`:**

- **Widok.** Rzut izometryczny z obniżonymi ścianami od strony kamery („przekrój”). Tylne ściany zostają pełne.
- **Kolor ściany.** Odpowiada funkcji pomieszczenia: czerwona maszynownia, zielona hydroponika, niebieskie kwatery.
- **Wersja „Dark”.** Prawie zero światła otoczenia, a pomieszczenia oświetla emisja lamp i ekranów z poświatą.
- **Generator Room i Storage Room.** Antresola zbudowana z bloków wysokości pokładu, z barierkami, rampą i pomostem nad kanałem.
- **Kinkiety.** Wiszą na łączeniach paneli ścian.

## 3. Przegląd analogicznych rozwiązań

**Źródła.** Na stronach źródłowych sprawdzono dwie pozycje:

- wykrywanie pomieszczeń w RimWorld (https://rimworldwiki.com/wiki/Room),
- strukturę repozytorium Blueprint3D (https://github.com/furnishup/blueprint3d).

Pozostałe opisy pochodzą z ogólnej znajomości tych gier i narzędzi, bez sprawdzania źródeł w tej sesji. Traktujemy je jako inspirację, a nie specyfikację.

| Rozwiązanie | Siatka i ściany | Pomieszczenia | Walidacja | Co bierzemy |
|---|---|---|---|---|
| **The Sims 4 — tryb budowy** | Ściany na krawędziach pól. Narzędzie ściany (linia) i narzędzie pokoju (prostokąt). Drzwi i okna wpinają się w ścianę. | Wykrywane jako zamknięte obszary | Obiekty nie wchodzą w ściany ani w przejścia | Ściany na krawędziach, narzędzie „Pomieszczenie”, przekrój ścian (w górze / przekrój / w dole), obrót R, pipeta, siatka drobniejsza od pola |
| **RimWorld** | Ściany i drzwi zajmują **całe komórki** | Flood fill ograniczony ścianami i drzwiami. Funkcja to rola z najwyższym wynikiem z mebli; remis rozstrzyga kolejność. | Czerwony plan przy zakazanym miejscu | Pokój = flood fill; funkcja z głosów wyposażenia, remis wg stałej kolejności. Ściany w komórkach odrzucamy, bo nie pasują do kitu. |
| **Prison Architect** | Fundament tworzy ściany wokół obrysu | Strefy z wymaganiami (cela: łóżko + toaleta) | Nakładki i komunikaty „brakuje …” | Uwagi projektowe nie blokują edycji, tylko są wylistowane z lokalizacją; wymagania funkcji pomieszczenia |
| **Space Haven** | Malujesz podłogę, a kadłub dobudowuje się wokół niej | Pomieszczenia zamknięte, tlen | Ostrzeżenie o nieszczelności | Kontrola szczelności kadłuba (w PoC jako uwaga, nie automat) |
| **FTL** | Pokoje z prostokątów pól, drzwi na granicach | Tlen per pokój, graf drzwi | Wyłomy | Graf pomieszczeń przez drzwi (osiągalność) |
| **Cosmoteer** | Części z obrysem, obrotem i regułami | Korytarze, drzwi | Edytor wymaga kluczowych modułów | Katalog części jako dane (obrys, warstwa, reguły); bilans statku |
| **ONI / Space Engineers / Stationeers** | Komórki albo bloki z flagą szczelności | Flood fill objętości szczelnych | Ciśnienie / wyłomy | Szczelność to **właściwość elementu krawędzi** |
| **Barotrauma (edytor łodzi)** | Swobodne kadłuby i ręcznie autorskie objętości | — | — | Przeciwprzykład: objętości liczymy, nie rysujemy ich |
| **Starfield, Fallout 4** | Punkty zaczepu (snap) zamiast siatki | — | Pasuje albo nie | Do kitu 4 m prostsza i lepsza jest siatka; zaczepy zostawiamy na kadłuby zewnętrzne |
| **Townscaper** | Podwójna siatka, kształt z maski sąsiadów | — | — | Elementy narożne wyprowadzać z maski krawędzi w wierzchołku zamiast je przechowywać (na później) |
| **Modułowe kity (Bethesda, GDC „Skyrim's Modular Level Design”)** | Jedna siatka bazowa, pivot na siatce, stała grubość ściany, elementy narożne i zaślepki | — | — | Konwencja pivotów i metadane kitu w katalogu, nie w kodzie |
| **Blueprint3D (three.js), Sweet Home 3D** | Ściany jako polilinie, drzwi wpięte w ścianę | Wykrywane z grafu ścian | — | Model danych oddzielony od widoku (`src/model` w Blueprint3D). Ich format zapisu jest słabym punktem, więc **od początku wersjonujemy plik**. |

## 4. Decyzje projektowe

| # | Decyzja | Dlaczego / skąd |
|---|---|---|
| D1 | **Podłogi w komórkach 4 m, ściany na krawędziach.** Krawędź `x` (x, z) biegnie od wierzchołka (x, z) do (x+1, z), krawędź `z` analogicznie. Model ściany jest wycentrowany na krawędzi, a jego przód to lokalne +Z. | Tak zbudowany jest kit (Sims, Sweet Home). Ściany w komórkach (RimWorld) wymagałyby innych modeli. |
| D2 | **Dokument = płaska lista elementów (`Piece`).** Każdy element ma pola `{id, item, level, x, z, rot}`. Znaczenie (co zajmuje, jak się przyciąga) daje katalog. | Jeden rodzaj rekordu upraszcza historię, zapis, diff i serwer. Katalog jako dane wzorowany jest na częściach Cosmoteer i metadanych kitów. |
| D3 | **Warstwy obiektów: podłoga, blat, ściana, sufit.** Obiekty kolidują tylko w swojej warstwie. Obiekt podłogowy potrzebuje podłogi pod całym obrysem i nie wchodzi w **pas 0,5 m przy elementach krawędzi**, więc nie wnika w ścianę ani nie blokuje drzwi. Obrys zaokrąglany jest do 0,5 m, a przyciągany jest narożnik obrysu, nie środek. | Sims. Pas zastępuje dokładne bryły kolizji i jest liczony z grubości modelu ściany. |
| D4 | **Jeden element na krawędzi.** Rodzaje: ściana, drzwi, szkło, barierka. Każdy ma reguły: szczelny, dzieli pokoje, przechodni, można na nim wieszać. Drzwi postawione na ścianie zastępują ją. | Sims, Sweet Home. Szczelność jako cecha elementu wzięta z Space Engineers. |
| D5 | **Pomieszczenie = flood fill pól** do elementów dzielących (ściana, drzwi, szkło; barierka nie dzieli). Funkcja pomieszczenia wynika z głosów wyposażenia: koja +3 do „kwater”, reaktor +5 do „maszynowni”. Próg to 2,5. Wąski pas bez funkcji to korytarz. | RimWorld (rola z najwyższym wynikiem), Prison Architect |
| D6 | **Szczelność kadłuba jako uwaga.** Krawędź podłogi bez szczelnego elementu i bez sąsiedniej podłogi to wyłom. Nad niższym pokładem taka krawędź oznacza brak barierki. | Space Haven, FTL, ONI |
| D7 | **Dwa poziomy reguł.** Twarde reguły stawiania (kolizja, brak podłogi, brak ściany pod panelem) blokują i pokazują czerwonego ducha z powodem. Uwagi projektowe (wyłom, pokój bez drzwi, drzwi w próżnię, zastawione drzwi) tylko trafiają na listę z lokalizacją. | Prison Architect: projekt może być w trakcie, ale ma być widać, co jest nie tak |
| D8 | **Przekrój ścian w shaderze.** Każda instancja ma atrybut `aCutY`; fragmenty powyżej odrzuca `discard`. Tryb „przekrój” obcina ścianę, gdy za nią (w kierunku patrzenia) jest wnętrze. To daje wygląd z obrazków przykładowych. | Sims 4 i obrazki z paczki |
| D9 | **Plan → podgląd → polecenie.** Każdy gest tworzy plan (`Change` z kandydatami odrzuconymi). Ten sam plan rysuje duch (zielony, czerwony, usuwane) i ten sam trafia do historii. Prostokąt i linia zatwierdzają poprawną część. | Sims, RimWorld (podgląd planu) |
| D10 | **Historia.** Polecenie trzyma pełne kopie elementów (dodane i usunięte), więc cofanie to po prostu odwrócenie zmiany. Kaskada (meble na usuniętej podłodze, panel na ścianie zamienionej na drzwi) wchodzi do tego samego polecenia. | Wzorzec Command; jedno Ctrl+Z przywraca wszystko |
| D11 | **Czysta domena.** `domain/` nie importuje Angulara ani Three.js. Pokoje, uwagi i bilans to `computed` z dokumentu, nigdy osobny stan. | Kierunek zależności jak w `web-game` (`domain ← render`, `app → api, render, ui`). Ten sam kod może walidować plan na serwerze (port do Rust jak B0–B2). |
| D12 | **Format pliku wersjonowany od v1** (`space-interior-layout`, `version: 1`, siatka). Zapisywane są tylko elementy. Nieznane elementy katalogu są zachowywane i zgłaszane, a nie gubione. | Lekcja z Blueprint3D |
| D13 | **Pipeline assetów:** bez osadzonego atlasu, 5 wspólnych materiałów wiązanych po nazwie, każdy model spłaszczony do jednej geometrii z grupami materiałów, jedna `InstancedMesh` na model. Przykładowa korweta (143 elementy) to ok. 83 wywołania rysowania i 9 programów shaderów. | Rozmiar (25,7 → 2,2 MB), pamięć GPU (jedna tekstura), liczba wywołań |
| D14 | **Pokłady.** Każdy element ma `level`. `Deck_Height_Metal` na pokładzie L to bryła, a jej wierzch staje się podłogą pokładu L+1 (antresola z przykładów). Pokłady powyżej aktywnego są ukryte. | Generator Room i Storage Room z paczki; poziomy w Sims |
| D15 | **Bilans statku z katalogu** (koje, moc, żywność, opieka, magazyn energii). Każda pozycja katalogu ma `stats`, a wariant może je nadpisać (np. ekran wyłączony nie pobiera mocy). | Haczyk do ekonomii `web-game` (katalog kosztów i mocy jako dane) |
| D16 | **Noc dopasowana do `Layout Example Dark.png`.** Światło dają oprawy i ekrany opisane w katalogu (`light`: kolor lub kolor wariantu, siła, wysokość, wysunięcie, zasięg). Silnik przypisuje do nich pulę 20 świateł punktowych najbliższych widokowi. Rozproszone dopełnienie jest prawie zerowe, w chłodnym turkusie. Bloom obejmuje tylko emisję HDR (próg 1,05, mały promień). Tło jest skompensowane o tone mapping. Zgodność zmierzona na zrzutach (bez tła), wynik / referencja: średnia jasność 48 / 47, mediana 33 / 30, p90 108 / 111, średni kolor (39, 51, 52) / (41, 48, 52), tło (11, 21, 23) / (10, 21, 22). | Obrazy referencyjne paczki: w nocy pomieszczenia oświetlają ich własne urządzenia |
| D17 | **Schody i windy jako złącza pokładów.** Pole podłogi może mieć `connector`. Schody (`stairs`, a także rampy z paczki) mają wejście z pola przed sobą i wyjście pokład wyżej na pole za sobą, bo rampy z paczki wznoszą się ku lokalnemu −Z. Planer schodów stawia stopnie, robi otwór w pokładzie wyżej (usuwa podłogę i sufit pod nią) i stawia barierki wokół otworu, z wyjątkiem strony wyjścia. Winda to przystanek na polu: platforma, drzwi od frontu i szkło po wolnych bokach, więc każdy przystanek jest małym pomieszczeniem. Przystanki w tym samym polu na sąsiednich pokładach tworzą szyb. Graf pomieszczeń ma krawędzie drzwi, schodów i windy, więc osiągalność obejmuje cały statek. Uwagi: schody bez wyjścia lub z zakrytym otworem, winda z jednym przystankiem. | Schody i windy w Sims (pole + pokład wyżej); śluzy i szyby w Space Engineers |
| D18 | **Modele spoza paczki budowane w kodzie.** Paczka nie ma windy, a jej „schody” to gładkie rampy. Brakujące modele (winda, schody 16 × 0,25 m z poręczami i świecącymi krawędziami stopni) powstają z prostopadłościanów, które próbkują ten sam atlas gradientów. Używają tych samych 5 materiałów, więc przekrój, nocna poświata i instancjonowanie działają bez zmian. Wymiary i liczba trójkątów są w domenie (`models.ts`), a test sprawdza ich zgodność z geometrią. | Uzupełnianie kitu bez nowych assetów i bez łamania jednego atlasu |
| D19 | **Strojenie nocy w edytorze.** Panel (przycisk przy Dzień/Noc, klawisz `N`) zmienia na żywo parametry presetu nocy: siłę, zasięg i liczbę świateł opraw, emisję ekranów i hologramów, wypełnienie, odbicia, ekspozycję, barwę wypełnienia, tło i poświatę. Ma też ustawienia wyjściowe (Referencja, Robocza, Kontrast, Alarm). Zapisuje się tylko różnica względem referencji, w przeglądarce, bo to preferencja widza, a nie część projektu. „Kopiuj ustawienia” daje gotowy preset do wpisania w `LIGHTING_PRESETS`. | Referencja D16 zostaje punktem zerowym; strojenie nie zmienia pliku statku |
| D20 | **Obrót widoku bez środkowego przycisku.** Oprócz ŚPM i `Q` / `E` (co 45°) widok obraca kompas w rogu: tarczę się przeciąga (dowolny kąt), klik ustawia północ (−Z) u góry, a przyciski dają kroki 45°, widok z góry i wyśrodkowanie. `Alt`+LPM i `Shift`+PPM też obracają. LPM bez modyfikatora zostaje dla narzędzi. Środek tarczy pokazuje kierunek patrzenia (zachód = 270°, tam jest dziób przykładowej korwety). | Touchpady i myszy bez kółka; Alt+LPM jak w Maya i Unity; kompas jak w Sims i edytorach map |

## 5. Model danych i format pliku

```json
{
  "format": "space-interior-layout",
  "version": 1,
  "name": "Korweta badawcza KB-7",
  "grid": { "cell": 4, "levelHeight": 4 },
  "pieces": [
    { "id": "p1", "item": "floor-metal/plain", "level": 0, "x": 2, "z": 6, "rot": 0 },
    { "id": "p5", "item": "wall/grey", "level": 0, "x": 2, "z": 4, "rot": 0 },
    { "id": "p40", "item": "door/grey", "level": 0, "x": 8, "z": 10, "rot": 1 },
    { "id": "p90", "item": "bunk-double/blue", "level": 0, "x": 9.5, "z": 1.75, "rot": 0 }
  ]
}
```

`(x, z)` to punkt zaczepienia w metrach. Dla podłogi i sufitu jest to środek pól. Dla elementu krawędzi to środek krawędzi; `rot` mówi, w którą stronę patrzy przód. Dla obiektu to środek obrysu. Dla elementu ściennego to punkt na osi ściany, a `rot` wskazuje stronę montażu. `item` to identyfikator wariantu katalogu (`pozycja/wariant`). Z elementów wyprowadzane są:

- indeks zajętości (`LayoutIndex`),
- pomieszczenia,
- uwagi,
- bilans.

## 6. Ograniczenia PoC i ryzyka

- **Wydajność.** Indeks, pomieszczenia i uwagi przeliczają się w całości po każdej edycji (O(n)). Wystarcza to dla setek elementów. Przy dziesiątkach tysięcy (stacja) trzeba przejść na indeks przyrostowy i przestrzenny.
- **Łączenia ścian.** Kit nie ma elementów narożnych. Łączenia opierają się na ramach paneli i wyglądają dobrze, ale przy cienkich ścianach antresoli mogą być szczeliny. Do rozważenia: słupki generowane z maski krawędzi w wierzchołku (Townscaper).
- **Wielopoziomowość jest uproszczona.**
  - Schody i winda łączą pomieszczenia w grafie osiągalności, ale klatka schodowa na dwóch pokładach to dwa pomieszczenia.
  - Otwór nad schodami nie należy do żadnego pomieszczenia, więc jego boki nie są sprawdzane pod kątem szczelności. Ściany wokół otworu nie są zgłaszane jako „bez podłogi”.
  - Winda nie ma kabiny jeżdżącej między przystankami. Przystanek to platforma z ramą szybu.
  - Obrót przystanku narzędziem wyboru obraca platformę, ale nie przenosi drzwi.
  - Edytor ma pokłady 0–3.
- **Światło nocne.**
  - Stała pula świateł punktowych (domyślnie 20, w strojeniu 4–32), żeby edycja nie przekompilowywała shaderów. Przekompilowuje je tylko zmiana liczby świateł.
  - Przy większej liczbie emiterów świecą najważniejsze dla widoku. Światła niższego pokładu przykryte podłogą wyższego są pomijane, bo bez cieni świeciłyby przez strop.
  - Brak cieni to świadoma decyzja dla wydajności. Pomieszczenie bez oprawy jest w nocy ciemne, co też jest informacją dla gracza.
- **Nieużyte modele.** `Corridor_Boundary_4x4/4x8` i `Railing_Ramp` (3 ze 136) nie trafiły do katalogu. Wymagają osobnych reguł (rama korytarza na polu, barierka wzdłuż rampy).
- **Testy.** 31 testów jednostkowych:
  - domena, w tym pełny przykładowy statek na trzech pokładach;
  - zgodność modeli budowanych w kodzie z tabelą w domenie.

  UI sprawdzano skryptem Playwright i zrzutami ekranu, bez testów e2e w repo.

## 7. Droga do web-game

| PoC | web-game | Uwagi |
|---|---|---|
| `src/app/domain/` | `packages/domain/src/interior/` | Bez zmian. Katalog może czerpać koszty i moc z katalogu ekonomii zamiast `stats`. |
| `tools/build-kit.mjs`, `public/assets/molten/` | `tools/`, zasoby `apps/game` | Docelowo jeden plik paczki (wszystkie modele w jednym GLB) albo leniwe wczytywanie per kategoria |
| `src/app/engine/` | `packages/render/src/interior/` | Scena jak pozostałe (Three.js), sterowana z zewnątrz, bez stanu projektu |
| `src/app/state/`, `src/app/ui/` | `apps/game` (widok budynku), `packages/ui` | Panel wzorowany na „Maszynie” Atanora: narzędzia, katalog, plik projektu |
| `serialization.ts` | kontrakt API / serwer Rust | Serwer waliduje plan tymi samymi regułami (port `rules.ts`, `rooms.ts`), test zgodności jak w `server/conformance` |

## 8. Następne kroki

1. **Szablony pomieszczeń.** Zapis i wstawianie gotowych pokoi (Sims), kopiuj/wklej zaznaczenia, symetria (Cosmoteer).
2. **Wymagania funkcji.** Na przykład kwatery wymagają koi i drzwi, a mostek konsoli. Status spełnienia pokazany w inspektorze (Prison Architect).
3. **Ruch załogi.** Pathfinding po polach i drzwiach (graf już istnieje), czas dojścia między stanowiskami jako ocena układu.
4. **Wnętrze budynku w grze.** Habitat lub Fabryka z planety ma układ jako dane. Bilans wnętrza zasila ekonomię kolonii.
5. **Paczka assetów** w jednym pliku z kompresją meshopt; słupki narożne; reguły dla pozostałych 3 modeli.
6. **Pokłady dalej.**
   - Kabina windy jeżdżąca w szybie.
   - Pomieszczenia wielopoziomowe (klatka schodowa jako jedna przestrzeń).
   - Przenoszenie i obrót całych schodów i przystanków razem z otworem, barierkami i drzwiami.

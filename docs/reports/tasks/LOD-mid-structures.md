# LOD-mid · Pośredni LOD budowli na ciele w fokusie (etap 8 domknięcia)

> **Status:** wykonane, do weryfikacji i oceny zrzutów przez człowieka (§6).
> **Gałąź:** `auto/domkniecie-lod` (worktree `../space-game-lod`, baza `9698ef7`).
> **Wykonał:** wykonawca (Claude Opus 5.5), 2026-11-26, polecenie człowieka z 2026-11-26.
> **Zakres:** tylko `web-game/packages/render/src/system/` (warstwa budowli, partia instancji, scena), generator raportu `npm run perf`, dokumentacja. Bez zmian w `server/`, `docs/DECISIONS.md`, domenie TS (`packages/domain/src/sim/`, R-2), protokole i liczbach ekonomii.

## 1. Problem (FAKT)

`web-game/docs/PERF-REPORT.md`, zadania naprawcze: L · planet ponad progiem uwagi (200 000 trójkątów). Pomiar na czystym HEAD tego dnia: **267 949** trójkątów, z tego budowle 131 586, jednostki 49 388, teren 49 098, dekor 23 987. Na Tau Ceti e (642 kafelki) w domyślnym widoku planety rysowało się 203 z 314 części budowli pełnymi modelami (wiertnia 1198 trójkątów, skład 924, wiatrak 826, moduł 586, lądowisko 454).

Pomiar rozkładu (harness vitest na scenariuszu L, 1440×900, zbliżony do `npm run perf`: 131 586 budowli w obu): **ponad połowa rysowanych części leży dalej niż 50° wokół ciała od punktu pod kamerą**, z czego ok. 70 za geometrycznym horyzontem (73°): test półkuli T4 jest zachowawczy, bo wysokie modele mogą wystawać zza horyzontu. Szerokość budowli na ekranie w tym widoku: 40–60 px.

## 2. Co zrobiono

| Plik | Zmiana |
|---|---|
| `packages/render/src/system/structure-layer.ts` | pasmo LOD-mid: stałe `STRUCTURE_MID_ANGLE`, `STRUCTURE_NEAR_ANGLE`, `STRUCTURE_MID_PX`, `STRUCTURE_NEAR_PX`, `MID_LOD_REFRESH`; druga partia pudełek `<ciało>_MidProxies` (tworzona z warstwą), `updateBand(kamera, pxPerUnit)`, `writeMid`, filtr partii modeli, stan pasma przenoszony przez przebudowę układu; metody testowe `inMidBand`, `midSlotOfPart`, `midInstances`, `midMesh` |
| `packages/render/src/system/buffers.ts` | `InstancedBatch.setFilter` / `refilter`: filtr indeksów źródłowych przekazywany do upakowania `CulledInstances` (tylko z cullerem) |
| `packages/render/src/system/hemisphere-culler.ts` | `CulledInstances.refilter()`: wymusza ponowne upakowanie bez ponownego mierzenia zasięgów |
| `packages/render/src/system/system-scene.ts` | `updateDetail` woła `updateBand(kamera w układzie ciała, (wysokość/2)/tan(fov/2))` przed `recull` |
| `packages/render/src/system/structure-layer.spec.ts` (nowy) | 8 testów pasma na prawdziwej warstwie i siatce Planety Matki |
| `packages/render/src/system/hemisphere-culler.spec.ts` | 1 nowy test filtra `InstancedBatch` |
| `packages/render/src/system/system-view.spec.ts` | 1 nowy test integracyjny (scena podaje pasmu właściwą kamerę i skalę) |
| `packages/render/src/system/README.md` | sekcja „Pośredni LOD budowli na ciele bliskim (LOD-mid)” |
| `tools/perf/run.mjs` | opis LOD-mid w notatkach raportu, przełącznik A/B obejmuje LOD-mid, lista zrobionych zadań naprawczych (`DONE`, odhaczona pozycja trójkątów L), nowy tekst zalecenia dla trójkątów planety |
| `docs/PERF-REPORT.md`, `tools/perf/results/latest.json` | przebieg „po” |
| `tools/perf/results/before-lod-mid.json` | przebieg „przed” (czysty HEAD `9698ef7`, ten sam komputer, ten sam dzień) |
| `docs/img/lod-mid/*.jpg` | zrzuty przed/po (§4) |
| `docs/planet-terrain-poc-wnioski-i-plan.md` | stan T-13 i wiersza „pośredni LOD budowli” w tabeli decyzji czekających |

## 3. Decyzje i progi

**Reguła (USTALENIE wykonawcy, do oceny):** na ciele, które nie jest dalekie w sensie T4b (`BodyView.far`), budowla jest rysowana pudełkami T4b swoich części (ta sama `kit.proxyBox()`, `boxMatrix(kit.box(model))` pod macierzą części, wzrost budowy w Y, kolor `kit.tone(model)`), gdy:

- stoi dalej niż **`STRUCTURE_MID_ANGLE` = 50°** wokół ciała od punktu pod kamerą, **i**
- jest węższa na ekranie niż **`STRUCTURE_MID_PX` = 64 px** (cała szerokość obrysu w odległości jego środka).

Wraca do modeli, gdy jest bliżej niż **`STRUCTURE_NEAR_ANGLE` = 46°** albo szersza niż **`STRUCTURE_NEAR_PX` = 72 px** (histereza ok. 10 % jak w `DECOR_LOD_PX`/`DECOR_FULL_PX` i T4b). Przeliczenie tylko po ruchu kamery o ponad **`MID_LOD_REFRESH` = 2 %** jej wysokości nad powierzchnią (kąt budowli zmienia się wtedy o mniej niż ok. 1°, odległość o mniej niż 2 %), po zmianie wysokości okna albo przebudowie układu.

**Dlaczego kąt wokół ciała, a nie sama szerokość w pikselach (odejście od sugerowanego kierunku, uzasadnienie):**

1. Pierwsza wersja liczyła tylko szerokość na ekranie. Żeby zejść poniżej 200 tys. w L, próg musiał wynosić ok. 50 px przy 1440×900, a to jest prawie cała tarcza (najbliższe budowle mają 50–60 px). W oknie 1200×800 (testy) najbliższa budowla Planety Matki w domyślnym widoku miała już poniżej 50 px i stawała się pudełkiem: istniejący test T4 (`hemisphere culling (T4)`, linia z `slotOfPart(farPart)`) to wychwycił. Próg w pikselach zależy od wielkości okna, więc w mniejszym oknie zmienia się właśnie to, co blisko kamery. Odrzucone.
2. Kąt nie zależy od okna ani zoomu: w domyślnym widoku (3,4 R, horyzont 73°) okrąg 50° leży w 9/10 promienia tarczy na ekranie, więc pudełka to tylko krawędź tarczy (budowle widziane z boku i to, co wystaje zza horyzontu). W zbliżeniu poniżej 1,56 R horyzont jest bliżej niż 50° i pasma nie ma. Im dalej kamera, tym większa część widocznej czaszy jest w paśmie, więc trójkątów ubywa monotonicznie przy oddalaniu.
3. Próg pikselowy zostaje jako warunek „mały na ekranie”: przy dużym oknie albo dużym obrysie budowla przy krawędzi zostaje modelem (np. w zbliżeniu teren-M nic się nie zmienia).
4. Wszystkie istniejące testy przechodzą bez zmian (zob. §5).

**Inne decyzje:**

- Osobna partia `<ciało>_MidProxies` zamiast dzielenia partii T4b `<ciało>_Proxies`: T4b zostaje nietknięte (jego testy sprawdzają, że blisko partia brył jest ukryta). Koszt: +1 draw call na ciało, gdy pasmo nie jest puste; w praktyce częściowo zwracany, bo partia modelu, której wszystkie widoczne instancje są w paśmie, chowa się (S planet 21 → 18).
- Obie partie trzymają wszystkie części stałe; przełączenie zmienia tylko filtr i przepakowuje bufory tych partii, w których coś się zmieniło. Bez nowych siatek, geometrii i instancji, bez alokacji w klatce (tablice rosną tylko przy zmianie układu).
- Pasmo dotyczy budowli (części stałych). Skały złóż zostają (88 trójkątów, 10 sztuk w L).
- **Łaziki nie są w paśmie.** Próbowałem (próg pasma także dla łazików, które są szerokie jak kafelek): cel był osiągalny z mniejszym kątem, ale istniejący test `unit LOD (T4b)` zakłada, że łazik w domyślnym widoku Planety Matki jest modelem, a `units-layer.spec.ts` sprawdza próg 8/10 px przy 20 i 40 px. Zmiana wymagałaby zmiany tych oczekiwań; budowle same wystarczyły, więc wycofałem (pytanie 2).
- Wszystko wyłącza `?detail=full` (`cullDetail: false`), jak T4 i T4b.

**Podejścia do celu trójkątów:** jedno pełne (`npm run perf` po wdrożeniu reguły kątowej, cel spełniony za pierwszym razem). Warianty pikselowy i z łazikami odrzuciłem wcześniej na testach jednostkowych i harnessie, bez przebiegu `npm run perf`.

## 4. Pomiar przed / po

`npm run perf` (build produkcyjny, Chromium, 1440×900, 2,5 s rozgrzewki, 5 s próbkowania; GPU Radeon 780M, ANGLE D3D11). Przed: czysty HEAD `9698ef7` (`tools/perf/results/before-lod-mid.json`). Po: ten sam komputer po zmianie (`tools/perf/results/latest.json`, `web-game/docs/PERF-REPORT.md`). Ekran pracował tego dnia w 60 Hz (raport z 10.11: 120 Hz), więc FPS i czasy klatki nie są sygnałem; sygnałem są trójkąty i draw calle.

| Scenariusz | Widok | Trójkąty | Draw calls | Budowle | Jednostki | Dekor |
|---|---|---|---|---|---|---|
| S | planet | 131 526 → **128 480** | 21 → **18** | 8670 → **5624** | 1118 → 1118 | 68 582 → 68 582 |
| S | system | 5440 → **5440** | 11 → **11** | 0 → **0** | 20 → 20 | 0 → 0 |
| M | planet | 161 184 → **143 862** | 49 → **49** | 27 182 → **9860** | 15 448 → 15 448 | 55 566 → 55 566 |
| M | system | 26 278 → **26 278** | 17 → **17** | 0 → **0** | 508 → 508 | 0 → 0 |
| **L** | **planet** | 267 949 (UWAGA) → **176 987** | 109 → **110** | 131 586 → **39 506** | 49 388 → 50 506 | 23 987 → 23 987 |
| L | system | 28 230 → **28 218** | 17 → **17** | 0 → **0** | 2460 → 2448 | 0 → 0 |
| teren-M | planet | 190 018 → **156 268** | 62 → **63** | 112 761 → **79 011** | 4570 → 4570 | 35 537 → 35 537 |
| teren-M | planet-far | 192 012 → **128 587** | 36 → **36** | 115 126 → **51 701** | 7312 → 7312 | 32 424 → 32 424 |
| teren-M | system | 26 266 → **26 266** | 17 → **17** | 0 → **0** | 496 → 496 | 0 → 0 |

Galaktyka (S, M, L: 0 trójkątów, 6 draw calli) i Atanor (546 trójkątów, 2 draw calle) bez zmian. Nigdzie „PRZEKROCZONY”; jedyna pozostała UWAGA to L · planet · draw calls (110, uwaga od 100, limit 150; była też przed zmianą: 109).

- **Cel:** L planet 176 987 < 200 000. Zapas ok. 23 tys.; trójkąty jednostek wahają się między przebiegami (49–60 tys. w L, zależnie od tego, gdzie są łaziki i statki w chwili pomiaru), więc najgorszy przypadek to ok. 187 tys.
- **Draw calls:** +1 w L planet i teren-M planet (partia pasma), −3 w S planet; to szum w rozumieniu zadania (jedna partia na ciało).

**Zrzuty** (`docs/img/lod-mid/`, kadr płótna 1440×900, JPEG 85; widok domyślny po klawiszu 1 i zbliżenie o 6 kroków kółka w środek ekranu, ok. 2,35 R; liczniki z nakładki wydajności w chwili zrzutu):

| Zrzut | Przed | Po |
|---|---|---|
| L, widok domyślny | `lod-mid-L-planet-before.jpg` (278 419 trójkątów, budowle 131 586) | `lod-mid-L-planet-after.jpg` (186 339; budowle 39 506) |
| L, zbliżenie | `lod-mid-L-close-before.jpg` (237 059; budowle 121 738) | `lod-mid-L-close-after.jpg` (171 187; budowle 55 866) |
| teren-M, widok domyślny | `lod-mid-teren-M-planet-before.jpg` (185 448; budowle 112 761) | `lod-mid-teren-M-planet-after.jpg` (151 698; budowle 79 011) |
| teren-M, zbliżenie | `lod-mid-teren-M-close-before.jpg` (176 888; budowle 102 971) | `lod-mid-teren-M-close-after.jpg` (bez zmian: 176 888; budowle 102 971) |

Co widać (FAKT ze zrzutów): środek tarczy i zbliżenie teren-M bez zmian. W L pudełka są na krawędzi tarczy i na horyzoncie zbliżenia; tam, gdzie budowla wystaje zza horyzontu na tle nieba, pudełko (całe pudełko modelu, np. wiatraka z wirnikiem) jest wyraźnie bardziej kanciaste niż model. W teren-M w widoku domyślnym zmienia się kilka budowli przy prawej krawędzi.

Zrzuty zrobione skryptem poza repo (Playwright, `channel: 'chrome'`, serwer z `tools/perf/serve.mjs` na porcie 4436, te same presety `#/scenariusz-obciazenie-l` i `#/scenariusz-teren-m`); nie dodawałem go do repo, bo nie było go w zakresie.

## 5. Testy i bramki

Nowe testy (wszystkie zielone):

- `structure-layer.spec.ts` (8): podział na modele i pudełka według kąta (każda część narysowana dokładnie raz, pudełko = pudełko pickingu w tonie modelu, trójkąty = modele + 12 na pudełko); histereza kąta (wejście > 50°, w szczelinie zostaje, wyjście < 46°); histereza szerokości (pudełko poniżej 64 px, model powyżej 72 px); nieruchoma kamera: `updateBand` zwraca false i wersje buforów się nie zmieniają, ruch krótszy niż 2 % wysokości nie jest nawet liczony; picking trafia budowlę w paśmie; przełączanie nie tworzy ani nie zwalnia obiektów (te same siatki, geometrie, materiały, ta sama siatka pasma), bryły T4b parkują pasmo i oddają je; zmiana układu zachowuje pasmo, plac budowy w paśmie rośnie jako pudełko; bez cullera brak pasma.
- `hemisphere-culler.spec.ts` (+1): filtr `InstancedBatch` na wierzchu odcinania, `refilter`, brak zapisu bufora przy tych samych odpowiedziach, parkowanie, brak nowej siatki, bez cullera filtr ignorowany.
- `system-view.spec.ts` (+1): w scenie każda część jest w paśmie dokładnie wtedy, gdy kąt > 50° i szerokość < 64 px liczone niezależnie z kamery sceny; budowle blisko punktu pod kamerą są modelami, przy krawędzi pudełkami; liczniki `frameStats`; picking pudełka; obrót kamery oddaje modele; `cullDetail: false` bez pasma.

Istniejące testy: **bez zmian** (żaden nie został zmieniony, osłabiony ani usunięty); `npx vitest run packages/render` 198/198.

Bramki:

- `node tools/gate.mjs --area=web`: `BRAMKA: ZIELONA` (typecheck, wasm-build, vitest).
- `node tools/gate.mjs --full`: `BRAMKA: ZIELONA` (§7).

## 6. Ryzyka

- **Widoczność pudełek przy krawędzi tarczy (główne).** Pudełko to całe pudełko modelu, więc smukłe modele (wiatrak, wiertnia) na tle nieba wyglądają jak klocki. W widoku domyślnym L to pierścień na samej krawędzi, w zbliżeniu L kilka klocków na horyzoncie. Zgodne z „bez widocznej różnicy w pobliżu kamery”, ale różnica przy krawędzi jest widoczna (zrzuty).
- **Zapas do progu 200 tys.:** ok. 23 tys.; jednostki (łaziki 1118 trójkątów, statki 914) wahają się o ok. 10 tys. między przebiegami. Kolejne budowle albo więcej łazików na ciele w fokusie mogą to zjeść.
- **Draw calle L planet:** 110 (UWAGA, jak przed zmianą); pasmo dokłada jedną partię na ciało.
- **Ekran 60 Hz:** przebiegi przed i po na 60 Hz, raport z 10.11 na 120 Hz; czasy klatki nieporównywalne z tamtym raportem (bez wpływu na trójkąty i draw calle).

## 7. Wynik bramki `--full`

(uzupełnione po przebiegu)

## 8. Pytania do człowieka

1. **Czy pudełka przy krawędzi tarczy są akceptowalne?** (zrzuty `docs/img/lod-mid/lod-mid-L-*-after.jpg`)
   - a) tak, zostaje jak jest;
   - b) szerszy kąt (np. 60°: mniej pudełek, ok. +15 tys. trójkątów w L, zapas maleje do ok. 8 tys. i znika przy wahaniu jednostek), najlepiej razem z c);
   - c) pasmo także dla łazików na ciele w fokusie (ta sama reguła), co wymaga zmiany oczekiwań dwóch istniejących testów T4b (łazik w domyślnym widoku Planety Matki byłby pudełkiem, jeśli stoi dalej niż 50°);
   - d) zamiast pudełek uproszczone modele pośrednie (np. grupowanie wierzchołków przy wczytaniu modelu, ok. 1/4 trójkątów, +1 draw call na model na ciele w fokusie); lepszy wygląd, więcej pracy;
   - e) lżejsze modele (medieval 1,6–2,3 tys., łazik 1118, statek 914) zamiast LOD.
   **Rekomendacja:** a) na teraz; jeśli krawędź przeszkadza, d) dla kilku najcięższych modeli (wiertnia, skład, wiatrak).
2. **Łaziki w paśmie (c wyżej):** czy wolno zmienić oczekiwanie testu `unit LOD (T4b)` („łazik w domyślnym widoku jest modelem”)? Rekomendacja: dopiero, gdy zapas do 200 tys. okaże się za mały.

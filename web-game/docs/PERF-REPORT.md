# Raport wydajności web-game (F5)

Wygenerowany przez `tools/perf/run.mjs` (2026-11-26). Surowe dane: `tools/perf/results/latest.json`, ślad Chromium scenariusza M w widoku układu: `tools/perf/results/trace-M-system.json` (do otwarcia w DevTools → Performance).

## Sprzęt (P6: ten komputer)

| CPU | Rdzenie | RAM | System | Przeglądarka | GPU (WebGL) | Okno |
|---|---|---|---|---|---|---|
| AMD Ryzen 7 PRO 8840HS w/ Radeon 780M Graphics | 16 | 60 GB | win32 10.0.26200 | Chromium 153.0.8010.12 | ANGLE (AMD, AMD Radeon 780M Graphics (0x00001900) Direct3D11 vs_5_0 ps_5_0, D3D11) | 1440×900 |

Pomiar: build produkcyjny, 2.5 s rozgrzewki i 5 s próbkowania klatek na widok, tempo ×60. Scenariusze (`packages/mock-server/src/load.ts`): S — świat PoC, 20 budowli, 1 statek, 1 łazik; M — Tau Ceti, 300 budowli, 40 statków w locie, 20 łazików, 12 graczy; L — Tau Ceti, 1400 budowli (83 % kafelków do zabudowy), 200 statków, 100 łazików, 60 graczy; teren-M (T4, `#/scenariusz-teren-m`) — świat M i kolonia gracza (port + 23 budowle L1/L3/L5, skórka medieval) obok ruin osady na Tau Ceti c, kamera na kolonii; widok `planet-far` to ten sam fokus oddalony o 11 kroków kółka (pasmo LOD dekoru).

## Wyniki: scenariusz × metryka × budżet

| Scenariusz | Widok | FPS | Klatka p50 / p95 / p99 [ms] | Draw calls | Trójkąty | Geometrie / tekstury | Konteksty | Krok sym. śr. / maks. [ms] | Sterta JS [MB] | Start [ms] | Ocena |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S | planet | 60 | 16,7 / 16,8 / 16,8 | 18 | 128 480 | 26 / 0 | 1 | 0,1 / 0,3 | 40,5 | 691 | OK |
| S | system | 60 | 16,7 / 16,8 / 16,9 | 11 | 5440 | 27 / 0 | 1 | 0,1 / 0,7 | 35,2 | 691 | OK |
| S | galaxy | 60 | 16,7 / 16,8 / 16,8 | 6 | 0 | 5 / 0 | 1 | 0,1 / 0,2 | 30,3 | 691 | OK |
| M | planet | 60 | 16,7 / 16,8 / 16,9 | 49 | 143 862 | 64 / 0 | 1 | 0,3 / 1,7 | 57,9 | 553 | OK |
| M | system | 58,6 | 16,7 / 16,8 / 16,8 | 17 | 26 278 | 39 / 0 | 1 | 0,2 / 1,8 | 71,5 | 553 | OK |
| M | galaxy | 60 | 16,7 / 16,8 / 16,8 | 6 | 0 | 5 / 0 | 1 | 0,2 / 2,3 | 71,2 | 553 | OK |
| L | planet | 60 | 16,7 / 16,8 / 16,8 | 110 | 176 987 | 124 / 0 | 1 | 0,8 / 3,8 | 65,7 | 602 | UWAGA |
| L | system | 60 | 16,7 / 16,8 / 16,8 | 17 | 28 218 | 39 / 0 | 1 | 0,5 / 3,2 | 65,6 | 602 | OK |
| L | galaxy | 60 | 16,7 / 16,8 / 16,8 | 6 | 0 | 5 / 0 | 1 | 0,6 / 5,5 | 36,5 | 602 | OK |
| teren-M | planet | 60 | 16,7 / 16,8 / 16,8 | 63 | 156 268 | 76 / 0 | 1 | 0,3 / 3,6 | 68,5 | 544 | OK |
| teren-M | planet-far | 60 | 16,7 / 16,8 / 16,8 | 36 | 128 587 | 52 / 0 | 1 | 0,2 / 1,3 | 59,8 | 544 | OK |
| teren-M | system | 60 | 16,7 / 16,8 / 16,8 | 17 | 26 266 | 52 / 0 | 1 | 0,2 / 1,8 | 61,8 | 544 | OK |
| Atanor | atanor | 60 | 16,7 / 16,8 / 16,8 | 2 | 546 | 0 / 10 | 1 | 0 / 0,2 | 114,5 | 997 | OK |

## Szczegół planety: trójkąty po kategoriach (T4, T4b)

Liczniki z nakładki `[data-perf]` (`terrain`, `decor`, `structures`, `units`, `instances`): co teren z kafelków, dekor (drzewa, skały, ruiny), budowle graczy (ze skałami złóż; z daleka pudełka zastępcze) i jednostki (statki, łaziki; z daleka bryły zastępcze) włożyły do klatki. Udziały w progu uwagi (teren ≤ 50 000, dekor ≤ 60 000, budowle ≤ 90 000) to wskazówka, nie bramka: bramką są sumy wyżej.

| Scenariusz | Widok | Teren | Dekor | Budowle | Jednostki | Instancje | Pozostałe (sfery, orbity, nakładki) |
|---|---|---|---|---|---|---|---|
| S | planet | 53 156 (UWAGA) | 68 582 (UWAGA) | 5624 | 1118 | 216 | 0 |
| S | system | 0 | 0 | 0 | 20 | 0 | 5420 |
| M | planet | 49 098 | 55 566 | 9860 | 15 448 | 175 | 13 890 |
| M | system | 0 | 0 | 0 | 508 | 0 | 25 770 |
| L | planet | 49 098 | 23 987 | 39 506 | 50 506 | 267 | 13 890 |
| L | system | 0 | 0 | 0 | 2448 | 0 | 25 770 |
| teren-M | planet | 23 260 | 35 537 | 79 011 | 4570 | 133 | 13 890 |
| teren-M | planet-far | 23 260 | 32 424 | 51 701 | 7312 | 130 | 13 890 |
| teren-M | system | 0 | 0 | 0 | 496 | 0 | 25 770 |

## Przed / po T4 i T4b

Bazowy pomiar: 2026-11-10 09:08 (`tools/perf/results/baseline-T4.json`, ten sam build otwarty z `?detail=full`: bez odcinania półkuli, LOD dekoru i brył zastępczych budowli i jednostek). Po: ten przebieg. Komórki: przed → **po** (zmiana).

| Scenariusz | Widok | Draw calls | Trójkąty | Klatka p50 / p95 [ms] | Teren | Dekor | Budowle | Jednostki | Instancje |
|---|---|---|---|---|---|---|---|---|---|
| S | planet | 28 → **18** (-36 %) | 179 847 → **128 480** (-29 %) | 8,3 / 8,4 → **16,7 / 16,8** | 53 156 → **53 156** (0 %) | 103 509 → **68 582** (-34 %) | 21 150 → **5624** (-73 %) | 2032 → **1118** (-45 %) | 345 → **216** (-37 %) |
| S | system | 10 → **11** (+10 %) | 7132 → **5440** (-24 %) | 8,3 / 8,5 → **16,7 / 16,8** | 0 → **0** | 0 → **0** | 0 → **0** | 2032 → **20** (-99 %) | 0 → **0** |
| M | planet | 74 → **49** (-34 %) | 438 532 → **143 862** (-67 %) | 8,3 / 8,4 → **16,7 / 16,8** | 49 098 → **49 098** (0 %) | 93 407 → **55 566** (-41 %) | 222 303 → **9860** (-96 %) | 59 834 → **15 448** (-74 %) | 579 → **175** (-70 %) |
| M | system | 17 → **17** (0 %) | 85 604 → **26 278** (-69 %) | 8,3 / 8,5 → **16,7 / 16,8** | 0 → **0** | 0 → **0** | 0 → **0** | 59 834 → **508** (-99 %) | 0 → **0** |
| L | planet | 132 → **110** (-17 %) | 1 236 706 → **176 987** (-86 %) | 8,3 / 8,4 → **16,7 / 16,8** | 49 098 → **49 098** (0 %) | 37 918 → **23 987** (-37 %) | 840 286 → **39 506** (-95 %) | 295 514 → **50 506** (-83 %) | 1174 → **267** (-77 %) |
| L | system | 17 → **17** (0 %) | 321 284 → **28 218** (-91 %) | 8,3 / 8,4 → **16,7 / 16,8** | 0 → **0** | 0 → **0** | 0 → **0** | 295 514 → **2448** (-99 %) | 0 → **0** |
| teren-M | planet | 98 → **63** (-36 %) | 453 252 → **156 268** (-66 %) | 8,3 / 8,4 → **16,7 / 16,8** | 23 260 → **23 260** (0 %) | 48 752 → **35 537** (-27 %) | 307 516 → **79 011** (-74 %) | 59 834 → **4570** (-92 %) | 585 → **133** (-77 %) |
| teren-M | planet-far | 74 → **36** (-51 %) | 453 252 → **128 587** (-72 %) | 8,3 / 8,4 → **16,7 / 16,8** | 23 260 → **23 260** (0 %) | 48 752 → **32 424** (-33 %) | 307 516 → **51 701** (-83 %) | 59 834 → **7312** (-88 %) | 585 → **130** (-78 %) |
| teren-M | system | 17 → **17** (0 %) | 85 604 → **26 266** (-69 %) | 8,3 / 8,4 → **16,7 / 16,8** | 0 → **0** | 0 → **0** | 0 → **0** | 59 834 → **496** (-99 %) | 0 → **0** |

Co zrobiono i co z tego wynika:

- **Odcinanie półkuli** (`HemisphereCuller`, `CulledInstances`): budowle, skały złóż i dekor rysują tylko instancje, które mogą wystawać nad horyzont (test zachowawczy: wierzchołki pudełka modelu, `acos(R/d) + acos(R/r_szczytu)` i zapas 3° na ruch kamery między przeliczeniami co 2° obrotu lub 1° zoomu). Wysokie modele na małych ciałach z dużymi kafelkami widać daleko za horyzontem (dom medieval na Tau Ceti c ma ok. 10 % R wysokości, więc wystaje zza horyzontu jeszcze ok. 25° dalej), dlatego w widokach planety ubywa 27–41 % trójkątów dekoru (tylko T4), nie połowa.
- **LOD dekoru** w paśmie 80–200 px promienia (wejście < 200 px, wyjście > 220 px): wszystkie drzewa jako `detail_treeA`, połowa według `hash3`, jedna instancja zamiast trzech modeli; ruiny, skały i góry bez zmian (rysowane tylko z widocznej czaszy). Na Tau Ceti c dekor to głównie ruiny, więc pasmo ujmuje niewiele ponad samo odcinanie (`planet-far`).
- **Bryły zastępcze budowli (T4b)**: ciało poniżej 80 px promienia (powrót powyżej 88 px; tam teren przechodzi w siatkę wachlarzy) rysuje każdą część budowli i skałę złoża jako pudełko 12 trójkątów (`kit.proxyBox` pod macierzą części razy `boxMatrix(kit.box(model))`, to samo pudełko co picking; wzrost budowy skaluje je w Y), w średnim kolorze wierzchołków modelu (`kit.tone`), wszystko w jednej InstancedMesh na ciało z odcinaniem półkuli. W widokach planety trójkątów budowli ubywa razem 73–96 % (T4 + T4b + LOD-mid niżej), draw calli 17–51 %.
- **Pośredni LOD budowli (LOD-mid)**: na ciele bliskim (nie dalekim w sensie T4b) budowla dalej niż 50° wokół ciała od punktu pod kamerą (powrót poniżej 46°) i węższa na ekranie niż 64 px (powrót powyżej 72 px) jest rysowana tymi samymi pudełkami co T4b, w osobnej partii `<ciało>_MidProxies` (+1 draw call na ciało, gdy pasmo nie jest puste); partie modeli pomijają ją filtrem. W domyślnym widoku planety (3,4 R) pasmo zaczyna się w ostatniej dziesiątej promienia tarczy (krawędź i to, co wystaje zza horyzontu), w zbliżeniu poniżej 1,56 R horyzont jest bliżej niż 50°, więc środek widoku zostaje bez zmian. Pomiar przed i po oraz zrzuty: `docs/reports/tasks/LOD-mid-structures.md`.
- **Bryły zastępcze jednostek (T4b)**: statek krótszy niż 8 px na ekranie (powrót od 10 px) albo zadokowany przy dalekim ciele to grot 8 trójkątów, łazik krótszy niż 8 px albo na dalekim ciele to pudełko 12 trójkątów (oba w pudełku modelu i jego średnim kolorze); jednostka poza kadrem (sfera o promieniu jej długości poza ostrosłupem widzenia) i łazik za horyzontem swojego ciała nie są rysowane. Picking jednostek bez zmian (po pozycji na ekranie). Trójkątów jednostek ubywa 45–92 % w widokach planety i 99 % w widoku układu.
- **Przełącznik A/B**: `?detail=full` (`cullDetail: false`, `PERF_DETAIL=full`) wyłącza T4, T4b i LOD-mid razem; to kolumna „przed”.
- **BatchedMesh budowli**: niepotrzebny do limitu, największa liczba draw calli w widoku planety to 110 (L · planet), limit 150; przy uwadze (> 100) zostaje w zadaniach.
- **Siatka terenu**: tylko pomiar, najwięcej 53 156 trójkątów (S · planet) w 1 draw callu na ciało; podział na kawałki z odcinaniem nie jest potrzebny.
- **Nic nie przekracza progu uwagi** (200 000 trójkątów) w widokach planety i układu.

## Rozmiar pobrania

| Część | Bez kompresji | gzip |
|---|---|---|
| Paczka startowa (strona główna, logowanie) | 0,3 MB | 0,1 MB |
| Cały kod (z leniwymi częściami: gra, Three.js, PixiJS, worker) | 2,4 MB | 0,7 MB |
| Fonty pobierane przy polskim tekście (latin + latin-ext, 3 grubości) | 0,1 MB | 0,1 MB |
| Modele KayKit | 2,7 MB | 1,1 MB |
| **Pierwsza sesja razem** (kod + fonty + modele) | **5,2 MB** | 1,9 MB |
| Wszystkie pliki buildu (189) | 5,4 MB | 2,1 MB |

Budżet (`init.md`): pierwsze pobranie poniżej 15–25 MB → **OK**.

## Budżety

| Metryka | Budżet | Źródło |
|---|---|---|
| Pierwsze pobranie | uwaga > 15 MB, przekroczenie > 25 MB | init.md |
| Draw calls na klatkę | uwaga > 100, przekroczenie > 150 | init.md |
| Trójkąty na klatkę | uwaga > 200 tys., przekroczenie > 400 tys. | init.md |
| FPS | S ≥ 58, M i teren-M ≥ 30, L tylko pomiar | W18 B (60 w S, 30 w M; 58 = tolerancja vsync) |
| Trójkąty po kategoriach (planeta w fokusie) | teren ≤ 50 000, dekor ≤ 60 000, budowle ≤ 90 000; tylko raport | T4 (§10 planu terenu): suma = próg uwagi 200 tys. |
| Krok symulacji, pamięć, start | bez budżetu (W18 B ustala tylko FPS); wartości do decyzji | — |

## Zadania naprawcze

- [ ] **L · planet · draw calls** (UWAGA: 110, uwaga od 100, limit 150) → BatchedMesh budowli na ciało (dziś jedna InstancedMesh na parę ciało × model); T4: poniżej limitu 150, odłożony
- [x] **L · planet · trójkąty** (UWAGA: 267 949 na czystym HEAD 2026-11-26, uwaga od 200 000) → pośredni LOD budowli na ciele w fokusie (LOD-mid, `docs/reports/tasks/LOD-mid-structures.md`)

Błędy konsoli w przebiegu: brak.

# Raport wydajności web-game (F5)

Wygenerowany przez `tools/perf/run.mjs` (2026-11-10). Surowe dane: `tools/perf/results/latest.json`, ślad Chromium scenariusza M w widoku układu: `tools/perf/results/trace-M-system.json` (do otwarcia w DevTools → Performance).

## Sprzęt (P6: ten komputer)

| CPU | Rdzenie | RAM | System | Przeglądarka | GPU (WebGL) | Okno |
|---|---|---|---|---|---|---|
| AMD Ryzen 7 PRO 8840HS w/ Radeon 780M Graphics | 16 | 60 GB | win32 10.0.26200 | Chromium 153.0.8010.12 | ANGLE (AMD, AMD Radeon 780M Graphics (0x00001900) Direct3D11 vs_5_0 ps_5_0, D3D11) | 1440×900 |

Pomiar: build produkcyjny, 2.5 s rozgrzewki i 5 s próbkowania klatek na widok, tempo ×60. Scenariusze (`packages/mock-server/src/load.ts`): S — świat PoC, 20 budowli, 1 statek, 1 łazik; M — Tau Ceti, 300 budowli, 40 statków w locie, 20 łazików, 12 graczy; L — Tau Ceti, 1400 budowli (83 % kafelków do zabudowy), 200 statków, 100 łazików, 60 graczy; teren-M (T4, `#/scenariusz-teren-m`) — świat M i kolonia gracza (port + 23 budowle L1/L3/L5, skórka medieval) obok ruin osady na Tau Ceti c, kamera na kolonii; widok `planet-far` to ten sam fokus oddalony o 11 kroków kółka (pasmo LOD dekoru).

**Uwaga do pomiaru:** laptop z Radeonem 780M (iGPU), ekran 120 Hz: wszędzie do 120 FPS i klatka 8,3 ms (vsync), więc o budżecie mówią trójkąty i draw calls. Przed (`PERF_DETAIL=full`, 2026-11-10 09:08) i po (09:21) z tego samego świata po T5 etap 1 (048d426: teren na wszystkich planetach Tau Ceti i PoC, L = 1400 budowli), bez cargo/rustc w tle (sprawdzone przed i po przebiegu; inne procesy node mogły pracować); „po” z buildu z T4b, „przed” z buildu bez T4b, ale ścieżka `?detail=full` wyłącza T4 i T4b, więc liczy to samo.

## Wyniki: scenariusz × metryka × budżet

| Scenariusz | Widok | FPS | Klatka p50 / p95 / p99 [ms] | Draw calls | Trójkąty | Geometrie / tekstury | Konteksty | Krok sym. śr. / maks. [ms] | Sterta JS [MB] | Start [ms] | Ocena |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S | planet | 120 | 8,3 / 8,4 / 8,5 | 21 | 130 947 | 30 / 0 | 1 | 0,1 / 0,3 | 30,8 | 517 | OK |
| S | system | 120 | 8,3 / 8,5 / 8,5 | 10 | 5120 | 30 / 0 | 1 | 0,1 / 0,3 | 29,7 | 517 | OK |
| S | galaxy | 120 | 8,3 / 8,5 / 8,6 | 6 | 0 | 5 / 0 | 1 | 0 / 0,2 | 16,4 | 517 | OK |
| M | planet | 120 | 8,3 / 8,4 / 8,5 | 53 | 161 882 | 79 / 0 | 1 | 0,2 / 1,9 | 57,9 | 537 | OK |
| M | system | 116,9 | 8,3 / 8,4 / 8,5 | 17 | 26 278 | 54 / 0 | 1 | 0,2 / 1,2 | 74,6 | 537 | OK |
| M | galaxy | 120 | 8,3 / 8,5 / 8,6 | 6 | 0 | 5 / 0 | 1 | 0,2 / 1,4 | 34,6 | 537 | OK |
| L | planet | 120 | 8,3 / 8,4 / 8,5 | 112 | 276 708 | 124 / 0 | 1 | 0,9 / 5,7 | 69,3 | 576 | UWAGA |
| L | system | 120 | 8,3 / 8,5 / 8,6 | 17 | 28 230 | 39 / 0 | 1 | 0,6 / 4,6 | 53,7 | 576 | OK |
| L | galaxy | 120 | 8,3 / 8,5 / 8,7 | 6 | 0 | 5 / 0 | 1 | 0,6 / 5 | 27,5 | 576 | OK |
| teren-M | planet | 120 | 8,3 / 8,4 / 8,5 | 67 | 193 510 | 76 / 0 | 1 | 0,2 / 1,7 | 69,6 | 540 | OK |
| teren-M | planet-far | 120 | 8,3 / 8,5 / 8,5 | 41 | 195 253 | 52 / 0 | 1 | 0,2 / 2 | 66,4 | 540 | OK |
| teren-M | system | 120 | 8,3 / 8,5 / 8,6 | 17 | 26 266 | 52 / 0 | 1 | 0,2 / 1,6 | 79,3 | 540 | OK |
| Atanor | atanor | 120 | 8,3 / 8,7 / 9 | 2 | 546 | 0 / 10 | 1 | 0 / 0,1 | 56,6 | 993 | OK |

## Szczegół planety: trójkąty po kategoriach (T4, T4b)

Liczniki z nakładki `[data-perf]` (`terrain`, `decor`, `structures`, `units`, `instances`): co teren z kafelków, dekor (drzewa, skały, ruiny), budowle graczy (ze skałami złóż; z daleka pudełka zastępcze) i jednostki (statki, łaziki; z daleka bryły zastępcze) włożyły do klatki. Udziały w progu uwagi (teren ≤ 50 000, dekor ≤ 60 000, budowle ≤ 90 000) to wskazówka, nie bramka: bramką są sumy wyżej.

| Scenariusz | Widok | Teren | Dekor | Budowle | Jednostki | Instancje | Pozostałe (sfery, orbity, nakładki) |
|---|---|---|---|---|---|---|---|
| S | planet | 53 156 (UWAGA) | 68 003 (UWAGA) | 8670 | 1118 | 215 | 0 |
| S | system | 0 | 0 | 0 | 20 | 0 | 5100 |
| M | planet | 49 098 | 54 942 | 28 504 | 15 448 | 382 | 13 890 |
| M | system | 0 | 0 | 0 | 508 | 0 | 25 770 |
| L | planet | 49 098 | 24 752 | 139 580 (UWAGA) | 49 388 | 843 | 13 890 |
| L | system | 0 | 0 | 0 | 2460 | 0 | 25 770 |
| teren-M | planet | 23 260 | 35 537 | 116 253 (UWAGA) | 4570 | 424 | 13 890 |
| teren-M | planet-far | 23 260 | 32 137 | 118 654 (UWAGA) | 7312 | 423 | 13 890 |
| teren-M | system | 0 | 0 | 0 | 496 | 0 | 25 770 |

## Przed / po T4 i T4b

Bazowy pomiar: 2026-11-10 09:08 (`tools/perf/results/baseline-T4.json`, ten sam build otwarty z `?detail=full`: bez odcinania półkuli, LOD dekoru i brył zastępczych budowli i jednostek). Po: ten przebieg. Komórki: przed → **po** (zmiana).

| Scenariusz | Widok | Draw calls | Trójkąty | Klatka p50 / p95 [ms] | Teren | Dekor | Budowle | Jednostki | Instancje |
|---|---|---|---|---|---|---|---|---|---|
| S | planet | 28 → **21** (-25 %) | 179 847 → **130 947** (-27 %) | 8,3 / 8,4 → **8,3 / 8,4** | 53 156 → **53 156** (0 %) | 103 509 → **68 003** (-34 %) | 21 150 → **8670** (-59 %) | 2032 → **1118** (-45 %) | 345 → **215** (-38 %) |
| S | system | 10 → **10** (0 %) | 7132 → **5120** (-28 %) | 8,3 / 8,5 → **8,3 / 8,5** | 0 → **0** | 0 → **0** | 0 → **0** | 2032 → **20** (-99 %) | 0 → **0** |
| M | planet | 74 → **53** (-28 %) | 438 532 → **161 882** (-63 %) | 8,3 / 8,4 → **8,3 / 8,4** | 49 098 → **49 098** (0 %) | 93 407 → **54 942** (-41 %) | 222 303 → **28 504** (-87 %) | 59 834 → **15 448** (-74 %) | 579 → **382** (-34 %) |
| M | system | 17 → **17** (0 %) | 85 604 → **26 278** (-69 %) | 8,3 / 8,5 → **8,3 / 8,4** | 0 → **0** | 0 → **0** | 0 → **0** | 59 834 → **508** (-99 %) | 0 → **0** |
| L | planet | 132 → **112** (-15 %) | 1 236 706 → **276 708** (-78 %) | 8,3 / 8,4 → **8,3 / 8,4** | 49 098 → **49 098** (0 %) | 37 918 → **24 752** (-35 %) | 840 286 → **139 580** (-83 %) | 295 514 → **49 388** (-83 %) | 1174 → **843** (-28 %) |
| L | system | 17 → **17** (0 %) | 321 284 → **28 230** (-91 %) | 8,3 / 8,4 → **8,3 / 8,5** | 0 → **0** | 0 → **0** | 0 → **0** | 295 514 → **2460** (-99 %) | 0 → **0** |
| teren-M | planet | 98 → **67** (-32 %) | 453 252 → **193 510** (-57 %) | 8,3 / 8,4 → **8,3 / 8,4** | 23 260 → **23 260** (0 %) | 48 752 → **35 537** (-27 %) | 307 516 → **116 253** (-62 %) | 59 834 → **4570** (-92 %) | 585 → **424** (-28 %) |
| teren-M | planet-far | 74 → **41** (-45 %) | 453 252 → **195 253** (-57 %) | 8,3 / 8,4 → **8,3 / 8,5** | 23 260 → **23 260** (0 %) | 48 752 → **32 137** (-34 %) | 307 516 → **118 654** (-61 %) | 59 834 → **7312** (-88 %) | 585 → **423** (-28 %) |
| teren-M | system | 17 → **17** (0 %) | 85 604 → **26 266** (-69 %) | 8,3 / 8,4 → **8,3 / 8,5** | 0 → **0** | 0 → **0** | 0 → **0** | 59 834 → **496** (-99 %) | 0 → **0** |

Co zrobiono i co z tego wynika:

- **Odcinanie półkuli** (`HemisphereCuller`, `CulledInstances`): budowle, skały złóż i dekor rysują tylko instancje, które mogą wystawać nad horyzont (test zachowawczy: wierzchołki pudełka modelu, `acos(R/d) + acos(R/r_szczytu)` i zapas 3° na ruch kamery między przeliczeniami co 2° obrotu lub 1° zoomu). Wysokie modele na małych ciałach z dużymi kafelkami widać daleko za horyzontem (dom medieval na Tau Ceti c ma ok. 10 % R wysokości, więc wystaje zza horyzontu jeszcze ok. 25° dalej), dlatego w widokach planety ubywa 27–41 % trójkątów dekoru (tylko T4), nie połowa.
- **LOD dekoru** w paśmie 80–200 px promienia (wejście < 200 px, wyjście > 220 px): wszystkie drzewa jako `detail_treeA`, połowa według `hash3`, jedna instancja zamiast trzech modeli; ruiny, skały i góry bez zmian (rysowane tylko z widocznej czaszy). Na Tau Ceti c dekor to głównie ruiny, więc pasmo ujmuje niewiele ponad samo odcinanie (`planet-far`).
- **Bryły zastępcze budowli (T4b)**: ciało poniżej 80 px promienia (powrót powyżej 88 px; tam teren przechodzi w siatkę wachlarzy) rysuje każdą część budowli i skałę złoża jako pudełko 12 trójkątów (`kit.proxyBox` pod macierzą części razy `boxMatrix(kit.box(model))`, to samo pudełko co picking; wzrost budowy skaluje je w Y), w średnim kolorze wierzchołków modelu (`kit.tone`), wszystko w jednej InstancedMesh na ciało z odcinaniem półkuli. W widokach planety trójkątów budowli ubywa razem 59–87 % (T4 + T4b), draw calli 15–45 %.
- **Bryły zastępcze jednostek (T4b)**: statek krótszy niż 8 px na ekranie (powrót od 10 px) albo zadokowany przy dalekim ciele to grot 8 trójkątów, łazik krótszy niż 8 px albo na dalekim ciele to pudełko 12 trójkątów (oba w pudełku modelu i jego średnim kolorze); jednostka poza kadrem (sfera o promieniu jej długości poza ostrosłupem widzenia) i łazik za horyzontem swojego ciała nie są rysowane. Picking jednostek bez zmian (po pozycji na ekranie). Trójkątów jednostek ubywa 45–92 % w widokach planety i 99 % w widoku układu.
- **Przełącznik A/B**: `?detail=full` (`cullDetail: false`, `PERF_DETAIL=full`) wyłącza T4 i T4b razem; to kolumna „przed”.
- **BatchedMesh budowli**: niepotrzebny do limitu, największa liczba draw calli w widoku planety to 112 (L · planet), limit 150; przy uwadze (> 100) zostaje w zadaniach.
- **Siatka terenu**: tylko pomiar, najwięcej 53 156 trójkątów (S · planet) w 1 draw callu na ciało; podział na kawałki z odcinaniem nie jest potrzebny.
- **Co zostaje ponad progiem uwagi (200 000)**: L · planet 276 708 (budowle 139 580, jednostki 49 388). To pełne modele na ciele w fokusie (budowle w widocznej czaszy, statki zadokowane przy nim, łaziki na nim); propozycje w zadaniach naprawczych.

## Rozmiar pobrania

| Część | Bez kompresji | gzip |
|---|---|---|
| Paczka startowa (strona główna, logowanie) | 0,3 MB | 0,1 MB |
| Cały kod (z leniwymi częściami: gra, Three.js, PixiJS, worker) | 2,4 MB | 0,7 MB |
| Fonty pobierane przy polskim tekście (latin + latin-ext, 3 grubości) | 0,1 MB | 0,1 MB |
| Modele KayKit | 2,6 MB | 1,1 MB |
| **Pierwsza sesja razem** (kod + fonty + modele) | **5,1 MB** | 1,9 MB |
| Wszystkie pliki buildu (183) | 6,6 MB | 2,4 MB |

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

- [ ] **L · planet · draw calls** (UWAGA: 112, uwaga od 100, limit 150) → BatchedMesh budowli na ciało (dziś jedna InstancedMesh na parę ciało × model); T4: poniżej limitu 150, odłożony
- [ ] **L · planet · trójkąty** (UWAGA: 276 708, uwaga od 200 000, limit 400 000) → zostają pełne modele na ciele w fokusie (budowle w widocznej czaszy, statki zadokowane przy nim, łaziki na nim): pośredni LOD budowli w fokusie albo lżejsze modele (medieval 1,6–2,3 tys. trójkątów na część, łazik 1118, statek 914); odcinanie półkuli, LOD dekoru i bryły zastępcze daleko już są (T4, T4b)

Błędy konsoli w przebiegu: brak.

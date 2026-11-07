# Raport wydajności web-game (F5)

Wygenerowany przez `tools/perf/run.mjs` (2026-11-07). Surowe dane: `tools/perf/results/latest.json`, ślad Chromium scenariusza M w widoku układu: `tools/perf/results/trace-M-system.json` (do otwarcia w DevTools → Performance).

## Sprzęt (P6: ten komputer)

| CPU | Rdzenie | RAM | System | Przeglądarka | GPU (WebGL) | Okno |
|---|---|---|---|---|---|---|
| 12th Gen Intel(R) Core(TM) i9-12900K | 24 | 64 GB | win32 10.0.26100 | Chromium 156.0.8078.4 | ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti (0x00002805) Direct3D11 vs_5_0 ps_5_0, D3D11) | 1440×900 |

Pomiar: build produkcyjny, 2.5 s rozgrzewki i 5 s próbkowania klatek na widok, tempo ×60. Scenariusze (`packages/mock-server/src/load.ts`): S — świat PoC, 20 budowli, 1 statek, 1 łazik; M — Tau Ceti, 300 budowli, 40 statków w locie, 20 łazików, 12 graczy; L — Tau Ceti, 1500 budowli (80% kafelków), 200 statków, 100 łazików, 60 graczy.

## Wyniki: scenariusz × metryka × budżet

| Scenariusz | Widok | FPS | Klatka p50 / p95 / p99 [ms] | Draw calls | Trójkąty | Geometrie / tekstury | Konteksty | Krok sym. śr. / maks. [ms] | Sterta JS [MB] | Start [ms] | Ocena |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S | planet | 60 | 16,7 / 16,7 / 16,8 | 20 | 27 204 | 23 / 0 | 1 | 0 / 0,1 | 13,3 | 384 | OK |
| S | system | 60 | 16,7 / 16,8 / 16,8 | 10 | 7132 | 24 / 0 | 1 | 0 / 0,2 | 15,1 | 384 | OK |
| S | galaxy | 60 | 16,7 / 16,7 / 16,8 | 6 | 0 | 5 / 0 | 1 | 0 / 0,2 | 13,8 | 384 | OK |
| M | planet | 60 | 16,7 / 16,7 / 16,8 | 69 | 256 312 | 58 / 0 | 1 | 0,1 / 0,6 | 20,5 | 230 | UWAGA |
| M | system | 59,2 | 16,7 / 16,7 / 16,8 | 17 | 85 604 | 32 / 0 | 1 | 0,1 / 0,8 | 17,1 | 230 | OK |
| M | galaxy | 60 | 16,7 / 16,7 / 16,8 | 6 | 0 | 5 / 0 | 1 | 0,1 / 0,8 | 21,8 | 230 | OK |
| L | planet | 60 | 16,7 / 16,7 / 16,8 | 136 | 1 116 488 | 130 / 0 | 1 | 0,6 / 3,1 | 24,3 | 233 | PRZEKROCZONY |
| L | system | 60 | 16,7 / 16,7 / 16,8 | 17 | 321 284 | 32 / 0 | 1 | 0,4 / 3,5 | 43,1 | 233 | UWAGA |
| L | galaxy | 60 | 16,7 / 16,7 / 16,8 | 6 | 0 | 5 / 0 | 1 | 0,4 / 3 | 30,9 | 233 | OK |
| Atanor | atanor | 60 | 16,7 / 16,8 / 16,8 | 2 | 530 | 0 / 14 | 1 | 0 / 0,1 | 35 | 231 | OK |

## Rozmiar pobrania

| Część | Bez kompresji | gzip |
|---|---|---|
| Paczka startowa (strona główna, logowanie) | 0,3 MB | 0,1 MB |
| Cały kod (z leniwymi częściami: gra, Three.js, PixiJS, worker) | 2,2 MB | 0,6 MB |
| Fonty pobierane przy polskim tekście (latin + latin-ext, 3 grubości) | 0,1 MB | 0,1 MB |
| Modele KayKit | 0,5 MB | 0,2 MB |
| **Pierwsza sesja razem** (kod + fonty + modele) | **2,7 MB** | 0,9 MB |
| Wszystkie pliki buildu (96) | 2,9 MB | 1,1 MB |

Budżet (`init.md`): pierwsze pobranie poniżej 15–25 MB → **OK**.

## Budżety

| Metryka | Budżet | Źródło |
|---|---|---|
| Pierwsze pobranie | uwaga > 15 MB, przekroczenie > 25 MB | init.md |
| Draw calls na klatkę | uwaga > 100, przekroczenie > 150 | init.md |
| Trójkąty na klatkę | uwaga > 200 tys., przekroczenie > 400 tys. | init.md |
| FPS | S ≥ 58, M ≥ 30, L tylko pomiar | W18 B (60 w S, 30 w M; 58 = tolerancja vsync) |
| Krok symulacji, pamięć, start | bez budżetu (W18 B ustala tylko FPS); wartości do decyzji | — |

## Zadania naprawcze

- [ ] **M · planet · trójkąty** (UWAGA: 256 312, uwaga od 200 000, limit 400 000) → pomijać budynki z niewidocznej półkuli (dziś InstancedMesh rysuje wszystkie) i dodać LOD modeli KayKit przy oddaleniu
- [ ] **L · planet · draw calls** (UWAGA: 136, uwaga od 100, limit 150) → scalić rodzaje budynków ciała w jeden BatchedMesh (dziś jedna InstancedMesh na parę ciało × model)
- [ ] **L · planet · trójkąty** (PRZEKROCZONY: 1 116 488, uwaga od 200 000, limit 400 000) → pomijać budynki z niewidocznej półkuli (dziś InstancedMesh rysuje wszystkie) i dodać LOD modeli KayKit przy oddaleniu
- [ ] **L · system · trójkąty** (UWAGA: 321 284, uwaga od 200 000, limit 400 000) → w widoku układu rysować budynki jako uproszczone bryły (LOD) albo tylko na ciałach bliżej kamery

Błędy konsoli w przebiegu: brak.

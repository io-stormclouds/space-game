# Atanor — silnik układanki (domena)

Silnik bez frameworka i w pełni deterministyczny: bez Angulara, PixiJS, DOM i `Math.random`.

## Skąd

Przeniesiony z `poc/space-atanor/src/core/` (PoC tylko do odczytu). Podział jak w PoC:

| Tutaj | W PoC |
|---|---|
| `grid/hex.ts` | `core/grid/hex.ts` (zmieniony tylko komentarz kierunków) |
| `graph/molecule.ts`, `graph/atom-types.ts` | `core/graph/molecule.ts` |
| `engine/arm.ts`, `glyph.ts`, `types.ts`, `pipeline.ts`, `simulation.ts`, `levels.ts` | `core/engine/*` |
| `tests/` 7 plików z PoC | `src/tests/*.spec.ts` (zmienione tylko ścieżki importów) |

Nowe moduły: `engine/recipes.ts` (receptury), `engine/throughput.ts` (metryki), `engine/building.ts` (limity poziomów budynku, koszt maszyny), `api.ts` (API dla gry), `index.ts`.

Testy: `cd web-game; npx vitest run packages/domain/src/atanor` — 54 testy: 16 przeniesionych bez zmian i 38 nowych. PoC liczył 18 testów, ale 2 z nich to test komponentu Angulara (`app.spec.ts`), który tu nie pasuje.

## Poprawki błędów (W09 A)

| # | Objaw | Przyczyna | Poprawka | Test |
|---|---|---|---|---|
| a | Domyślne rozwiązanie poziomu 2 kończy się JAM po 9 tickach, 0/6 produktów | Błędny program, nie silnik. Konwencja obrotu (CW = kierunek +1) jest spójna i działa w L1, L3 i L4. W L2 ramię 1 obraca WATER dwa razy CW na (0,0) zamiast na drugie pole glifu (−1,0). Ramię 2 obraca SALT CCW, od glifu, na (1,−2). Nikt nie sięga ujścia (0,−1). W drugiej pętli nowa SALT trafia na porzuconą SALT w (1,−2) | Nowy program przy niezmienionym układzie: 7 ticków na produkt, 6/6 po 39 tickach. Stary program zostaje jako `LEVEL_2_POC_BROKEN_PROGRAM` | `level2-fix.spec.ts` |
| b | „CYKLE” pokazuje pozycję głowicy osi czasu (L1 po 50 tickach pokazuje 5) | `control-bar.component.ts:72` wyświetla `currentCycle` z serwisu (`game-state.service.ts:197`), a silnik zeruje go przy REPEAT (`simulation.ts:119-121`). `getStats().cycles` zwracał to samo (`:195`) | Licznik `ticksExecuted` (nie zawija się), `getStats().cycles`, `snapshot.ticks`, `completedAtTick`, `tick` w każdym wyniku kroku. Głowica jest osobno: `timelinePosition` | `cycle-counter.spec.ts` |
| c | Cząsteczka trzymana przez dwa ramiona obraca się dwa razy | Ochrona w fazie 2 działała po ID trzymanego atomu, a nie cząsteczki (`pipeline.ts:63-75`). **Potwierdzone** na wiernej kopii: para (0,1)–(0,2) trzymana przez ramiona z (0,0) i (0,3) po ROTATE_CW obu ląduje na (2,0) i (1,0), bez JAM. Chwytak ramienia „stojącego” odjeżdżał od swojego atomu | Ruchy liczone ze stanu sprzed ticka. Wszystkie ramiona trzymające cząsteczkę muszą dać to samo położenie końcowe (ramię bez ruchu = „zostaje”). Zgodne → jeden ruch. Niezgodne → JAM `MOLECULE_CONFLICT`, a cząsteczka stoi. DROP w tym samym ticku jest dozwolony | `molecule-motion.spec.ts` |
| d | Obszar nie liczy pól, na które dostarczono produkt | Próbkowanie na końcu ticka (`simulation.ts:155-163`) następuje po tym, jak ujście zabrało cząsteczkę | Pozycje atomów rejestrowane także zaraz po fazie ruchu | `area.spec.ts` |

## Zmiany względem PoC

- **Wyniki oczekiwane** (do wpisania w `docs/UNIFICATION.md` §4):

  | Test lub obszar | W PoC | Tutaj | Powód |
  |---|---|---|---|
  | L2, domyślne rozwiązanie | JAM po 9 tickach, 0/6 | 6/6 po 39 tickach | (a) |
  | `getStats().cycles` | pozycja głowicy (L1: 5) | liczba ticków (L1: 50) | (b) |
  | Obszar L1 | 11 | 12 | (d) |
  | Dwa ramiona na jednej cząsteczce | podwójny ruch, bez błędu | jeden ruch albo JAM `MOLECULE_CONFLICT` | (c) |

  Przeniesione testy nie wymagały zmian.
- **Typy:** `AtomType` obejmuje kody materiałów i formy aktywne `PLA*` i `KWA*`. Poziom ma `kind` (`poc` / `recipe`) i `recipe`. Wejście ma `portion` (jednostki materiału na atom). Ujście ma `product` (np. 1 NAD). Wynik kroku ma `tick`, `jamReason` i `starved`.
- **Skończone zasoby wejść** (§8.5 p. 1, opcja `supply`): bufory są liczone w jednostkach materiału i wspólne dla portów tego samego materiału. Tick wykonuje się tylko wtedy, gdy każdy port wejściowy ma atom. W przeciwnym razie `step()` zwraca `starved: true`, a licznik ticków stoi. Bez `supply` wejścia są nieograniczone, jak w PoC.
- **Silnik:** `getSnapshot()`, `getConsumed()`, `getProduced()`, `getDeliveryTicks()` i `getVisitedHexes()`. `ALL_LEVELS` nazywa się teraz `POC_LEVELS`.
- **Metryki** (§8.4, §8.5 p. 3): `measureThroughput()` szuka powtórzenia pełnego stanu maszyny i zwraca cykle na sztukę w stanie ustalonym, rozbieg, pierwszą dostawę, zużycie wejść na sztukę, obszar, ramiona i koszt. `toAtanorSpec()` daje kształt `{ level, cycles, area, arms }` jak `AtanorSpec` w `economy/catalog-data.ts`, z którego model ekonomii liczy czas i moc.
- **Budynek** (§8.1, §8.2): `ATANOR_BUILDING_LEVELS`, `validateMachine()` (receptura, liczba i długość ramion, glify, szyny, plansza) i `machineMaterials()` (Stal, Silnik, Stop, Przewód, Układ, Nadprzewodnik; szyna = 1 STA na heks).

## Receptury (W08 A, Z2)

Atomy nazywają się kodami materiałów. Układ portów i rozwiązania referencyjne zaprojektowałem tutaj i są **tymczasowe** (→ `EXP-6`).

| Receptura | Wejścia → wyjście | Cząsteczka | Poziom | Zmierzone: cykle / obszar / ramiona | Dokument §8.3 |
|---|---|---|---|---|---|
| `A_NAD` (`LEVEL_A_NAD`) | MIE 2 + PLA 1 + H2 10 (porcja 10 u na atom) → NAD 1 | PLA w środku, MIE, MIE, H2 co drugi sąsiad („Y”), 3 wiązania | L1 | 12 / 12 / 2 | 12 / 9 / 2 |
| `A_KAT` (`LEVEL_A_KAT`) | PLA 1 + KRZ 1 → KAT 1 | PLA*–KRZ; PLA → PLA* na glifie transmutacji | L2 | 6 / 8 / 2 | 10 / 8 / 2 |

Testy sprawdzają, że zużycie wejść na sztukę równa się recepturze i że rozwiązania mieszczą się w limitach swojego poziomu budynku.

## API (`index.ts`)

`listRecipeLevels()`, `listAtanorLevels(kind?)`, `getAtanorLevel(id)`, `findRecipeLevel('A_NAD')`, `getLevelPorts()`, `getReferenceSolution()`, `emptySolution()`, `createAtanorSimulation(level, { solution?, supply? })`, a potem `sim.step()`, `sim.getSnapshot()` i `sim.getStats()`. Dalej `runAtanorSimulation()`, `measureAtanorSolution()`, `toAtanorSpec()`, `validateMachine()` i `machineMaterials()`. Eksportowane są też klasa `SimulationEngine`, poziomy PoC, typy i matematyka heksów.

## Czego nie zrobiono z §8.5

Kolizji trajektorii i ramion (`POC-6`), obszaru z przebytej drogi (łuki obrotu, `POC-5`), edytora (UI), ramion wieloramiennych (L4) ani drugiej planszy (L5). Koszt szyn jest tylko w `machineMaterials()`; punkty kosztu z PoC nadal ich nie liczą.

## Otwarte pytania

1. Bufor wejścia: jeden na materiał (tak jest teraz) czy osobny na każdy port („bufor portu” w §8.5)?
2. Reguła „cała maszyna czeka, gdy dowolny port jest pusty” sprawia, że atomy czekające na portach są zapasem w toku. Partia N sztuk wymaga więcej niż N × receptura (6 × NAD: MIE 13 i H2 70 zamiast 12 i 60). Czy ten zapas liczyć jako magazyn budynku i zwracać przy zatrzymaniu? Alternatywa, czyli czekanie tylko na GRAB z pustego portu, psuje determinizm względem wejść nieograniczonych, gdy atom jest używany w miejscu (PLA w `A_NAD`).
3. Liczby z §8.3 a pomiar: obszar 9 dla `A_NAD` wydaje się nieosiągalny przy 4 atomach, 3 portach i 2 ramionach w definicji obszaru z PoC. `A_KAT` wychodzi na 6 cykli zamiast 10, więc KAT byłby tańszy. Który zestaw liczb przyjmuje model ekonomii? Czy rozwiązanie referencyjne ma być celowo „przeciętne”?
4. Cząsteczka NAD: §8.3 mówi „łańcuch Cu–Pt–Cu z H przy Pt”. Przyjąłem kształt „Y” (Cu–Pt–Cu pod kątem 120°). Czy łańcuch ma być prosty?
5. Nazwy atomów: czy formy aktywne mają być zapisane jako `PLA*` i `KWA*`, czy jako osobne kody? Czy UI ma pokazywać symbole z §8.3 (Cu, Pt, H), czy kody materiałów?
6. Czy porty wejścia i wyjścia są ustalone przez recepturę (tak jest teraz), czy gracz je stawia (jak w Opus Magnum)? Czy poziom startuje z rozwiązaniem referencyjnym, z podpowiedzią, czy pusty (`POC-4`)? API obsługuje każdy wariant.
7. Co znaczy „ukończenie” receptury w budynku produkcyjnym? `targetRequired` = 6 przyjąłem jak w PoC, jako przebieg weryfikacyjny, np. do rankingu `SOC-4`.
8. Plansza: `validateMachine()` sprawdza tylko ustawienie elementów. Czy chwytaki i atomy mogą wyjeżdżać poza planszę (nowy powód JAM)? Czy „maks. obszar planszy 19 heksów” w §8.1 to promień planszy, czy limit metryki obszaru?
9. Tłok na L1: §8.1 dopuszcza tłok, ale ramiona tylko L1–L2, a silnik pozwala tłokowi wysunąć się do długości 3. Ograniczyć to?
10. Reguła z poprawki (c): ramię, które trzyma cząsteczkę w miejscu, podczas gdy inne ją przesuwa, daje JAM (jak w Opus Magnum). Czy zamiast tego ma ją puszczać automatycznie?
11. Definicja obszaru (`POC-5`): czy liczyć pola mijane po łuku, np. przez ramię długości 2?
12. Czy szyny mają kosztować także w punktach, a nie tylko w materiałach?
13. Cykle na sztukę mogą być ułamkowe, gdy pętla daje kilka sztuk (np. 13/2). Czy model ekonomii to akceptuje?
14. Dane receptur (wejścia, wyjścia, liczby z §8.3) są powtórzone w `recipes.ts`. Czy po ustabilizowaniu `economy/catalog-data.ts` atanor ma importować katalog, czy ekonomia ma brać zmierzone `AtanorSpec` z atanora?

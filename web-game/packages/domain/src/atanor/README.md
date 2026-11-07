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

Nowe moduły: `engine/recipes.ts` (receptury), `engine/throughput.ts` (metryki), `engine/building.ts` (limity poziomów budynku, koszt maszyny), `engine/trajectory.ts` (ruch wewnątrz ticka, AT5), `api.ts` (API dla gry), `index.ts`. Katalog `editor/` (edytor maszyny, AT2) prowadzi kto inny; tu go nie opisuję.

Testy: `cd web-game; npx vitest run packages/domain/src/atanor/tests` — 98 testów w 19 plikach: 16 przeniesionych z PoC i 82 nowe (przed AT5: 56). PoC liczył 18 testów, ale 2 z nich to test komponentu Angulara (`app.spec.ts`), który tu nie pasuje.

## Poprawki błędów (W09 A)

| # | Objaw | Przyczyna | Poprawka | Test |
|---|---|---|---|---|
| a | Domyślne rozwiązanie poziomu 2 kończy się JAM po 9 tickach, 0/6 produktów | Błędny program, nie silnik. Konwencja obrotu (CW = kierunek +1) jest spójna i działa w L1, L3 i L4. W L2 ramię 1 obraca WATER dwa razy CW na (0,0) zamiast na drugie pole glifu (−1,0). Ramię 2 obraca SALT CCW, od glifu, na (1,−2). Nikt nie sięga ujścia (0,−1). W drugiej pętli nowa SALT trafia na porzuconą SALT w (1,−2) | Nowy program przy niezmienionym układzie: 7 ticków na produkt, 6/6 po 39 tickach. Stary program zostaje jako `LEVEL_2_POC_BROKEN_PROGRAM` | `level2-fix.spec.ts` |
| b | „CYKLE” pokazuje pozycję głowicy osi czasu (L1 po 50 tickach pokazuje 5) | `control-bar.component.ts:72` wyświetla `currentCycle` z serwisu (`game-state.service.ts:197`), a silnik zeruje go przy REPEAT (`simulation.ts:119-121`). `getStats().cycles` zwracał to samo (`:195`) | Licznik `ticksExecuted` (nie zawija się), `getStats().cycles`, `snapshot.ticks`, `completedAtTick`, `tick` w każdym wyniku kroku. Głowica jest osobno: `timelinePosition` | `cycle-counter.spec.ts` |
| c | Cząsteczka trzymana przez dwa ramiona obraca się dwa razy | Ochrona w fazie 2 działała po ID trzymanego atomu, a nie cząsteczki (`pipeline.ts:63-75`). **Potwierdzone** na wiernej kopii: para (0,1)–(0,2) trzymana przez ramiona z (0,0) i (0,3) po ROTATE_CW obu ląduje na (2,0) i (1,0), bez JAM. Chwytak ramienia „stojącego” odjeżdżał od swojego atomu | Ruchy liczone ze stanu sprzed ticka. Wszystkie ramiona trzymające cząsteczkę muszą dać to samo położenie końcowe (ramię bez ruchu = „zostaje”). Zgodne → jeden ruch. Niezgodne → JAM `MOLECULE_CONFLICT`, a cząsteczka stoi. DROP w tym samym ticku jest dozwolony | `molecule-motion.spec.ts` |
| d | Obszar nie liczy pól, na które dostarczono produkt | Próbkowanie na końcu ticka (`simulation.ts:155-163`) następuje po tym, jak ujście zabrało cząsteczkę | Pozycje atomów rejestrowane także zaraz po fazie ruchu | `area.spec.ts` |
| e | Koszt w punktach zmienia się, gdy tłok się wysuwa | `getStats()` sumował koszt bieżących ramion, a koszt zależy od długości | Koszt liczony z ramion maszyny w stanie zbudowanym (`level.initialArms`). Żaden dotychczasowy poziom nie ma tłoka, więc liczby się nie zmieniły | `recipes.spec.ts` („cost stays the cost of the built machine”) |

## Zmiany względem PoC

- **Wyniki oczekiwane** (do wpisania w `docs/UNIFICATION.md` §4):

  | Test lub obszar | W PoC | Tutaj | Powód |
  |---|---|---|---|
  | L2, domyślne rozwiązanie | JAM po 9 tickach, 0/6 | 6/6 po 39 tickach | (a) |
  | `getStats().cycles` | pozycja głowicy (L1: 5) | liczba ticków (L1: 50) | (b) |
  | Obszar L1 | 11 | 13 (12 po (d), +1 z drogi w AT5) | (d), AT5 |
  | Obszar L2 | 9 | 10 | AT5 |
  | Dwa ramiona na jednej cząsteczce | podwójny ruch, bez błędu | jeden ruch albo JAM `MOLECULE_CONFLICT` | (c) |
  | Atomy lub chwytaki mijające się w ruchu | bez błędu | JAM `TRAJECTORY_COLLISION` / `ARM_COLLISION` | AT5 |

  Przeniesione testy nie wymagały zmian. Zmieniły się oczekiwania w testach nowych: obszar L1 i A_NAD (`area.spec.ts`, `recipes.spec.ts`).
- **Typy:** `AtomType` obejmuje kody materiałów i formy aktywne `PLA*` i `KWA*`. Poziom ma `kind` (`poc` / `recipe`), `recipe` i opcjonalnie `boardRadius`. Wejście ma `portion` (jednostki materiału na atom). Ujście ma `product` (np. 1 NAD). Ramię ma opcjonalnie `grippers` i `heldAtomIds`. Wynik kroku ma `tick`, `jamReason`, `jamDetail` i `starved`.
- **Skończone zasoby wejść** (§8.5 p. 1, opcja `supply`): bufory są liczone w jednostkach materiału i wspólne dla portów tego samego materiału. Tick wykonuje się tylko wtedy, gdy każdy port wejściowy ma atom. W przeciwnym razie `step()` zwraca `starved: true`, a licznik ticków stoi. Bez `supply` wejścia są nieograniczone, jak w PoC.
- **Silnik:** `getSnapshot()`, `getConsumed()`, `getProduced()`, `getDeliveryTicks()` i `getVisitedHexes()`. `ALL_LEVELS` nazywa się teraz `POC_LEVELS`.
- **Metryki** (§8.4, §8.5 p. 3): `measureThroughput()` szuka powtórzenia pełnego stanu maszyny i zwraca cykle na sztukę w stanie ustalonym, rozbieg, pierwszą dostawę, zużycie wejść na sztukę, obszar, ramiona i koszt. `toAtanorSpec()` daje kształt `{ level, cycles, area, arms }` jak `AtanorSpec` w `economy/catalog-data.ts`, z którego model ekonomii liczy czas i moc.
- **Budynek** (§8.1, §8.2): `ATANOR_BUILDING_LEVELS`, `validateMachine()` (receptura, liczba i długość ramion, chwytaki, glify, szyny, plansza) i `machineMaterials()` (Stal, Silnik, Stop, Przewód, Układ, Nadprzewodnik; szyna = 1 STA na heks).

## AT5: ruch wewnątrz ticka, plansza, ramiona wielochwytakowe

### Fakty (jak działa silnik)

- **Ruch w ticku** (`engine/trajectory.ts`). Każdy rozkaz ruchu to sztywny ruch: ROTATE to łuk 60° wokół podstawy ramienia, PIVOT to łuk wokół chwytaka, EXTEND / RETRACT i TRACK_* to odcinki. Silnik próbkuje ruch w `TRAJECTORY_SUBSTEPS` = 12 stałych krokach (co 5° łuku) we współrzędnych kartezjańskich, w których sąsiednie heksy są 1 od siebie. Tablica sinusów jest liczona raz, nie ma losowości.
- **Kolejność kontroli w fazie 3:**
  1. Dwa atomy na jednym heksie po ruchu → `ATOM_COLLISION` (reguła PoC; ma pierwszeństwo, więc dotychczasowe JAM-y mają ten sam powód).
  2. Potem kolejne próbki k = 1…12, a w każdej:
     - ruchomy atom albo chwytak poza planszą → `OFF_BOARD`;
     - dwa atomy, z których co najmniej jeden się rusza, bliżej niż `TRAJECTORY_CLEARANCE` = 0,5 → `TRAJECTORY_COLLISION` (próbki 1…11);
     - dwa chwytaki różnych ramion, z których co najmniej jeden się rusza, bliżej niż 0,5 → `ARM_COLLISION`. Pary, które już przed tickiem były na jednym polu (np. dwa chwytaki na jednym atomie), są pomijane.
  
  Pierwsze naruszenie kończy przebieg. Ruch jest już wykonany (jak przy `ATOM_COLLISION`), a `jamDetail` podaje atomy, ramiona, heks i ułamek ticka `t`. `MOLECULE_CONFLICT` też ma `jamDetail` (`hex: null`, `t: 0`).
- **Czego nie sprawdzam:** pusty chwytak przechodzi nad atomem, korpusy ramion (odcinek podstawa–chwytak) z niczym nie kolidują, atom może leżeć na polu podstawy ramienia (jak dotąd).
- **Obszar z drogi** (POC-5 B, zastępuje „później” z A11): do dotychczasowego obszaru (podstawy, chwytaki i atomy na końcu ticka, atomy po ruchu, czyli poprawka d) dochodzą heksy, przez które przechodzi ruchomy atom albo chwytak w próbkach 1…11 (zaokrąglone do heksu). Łuk ramienia długości 1 nie dokłada pól. Łuk długości 2 dokłada pole między początkiem a końcem. Cząsteczka obracana wokół odległego punktu dokłada pola zewnętrzne. `sweptHexes()` pokazuje to dla jednego ruchu.
- **Plansza** (A8): `boardRadius` w opcjach silnika (`SimulationOptions`, `createAtanorSimulation`, czwarty argument `measureAtanorSolution`) albo w `LevelConfig`. Opcja ma pierwszeństwo. Domyślnie plansza jest nieograniczona, jak w PoC. Promień planszy budynku to `ATANOR_BUILDING_LEVELS[i].boardRadius` (L1: 2 … L5: 6). Poziomy receptur go nie ustawiają, bo ta sama receptura działa w budynkach różnych poziomów. Wołający podaje promień swojego budynku. `validateMachine()` zgłasza teraz także chwytak, który już na starcie jest poza planszą (`OFF_BOARD`).
- **Ramiona wielochwytakowe** (§8.1 L4): `ArmState.grippers` = 2, 3 albo 6 (co 180°, 120°, 60° od `rotation`); brak = 1. `createArm({ grippers })` odrzuca inne liczby.
  - GRAB zamyka każdy chwytak na atomie pod nim (chwytak nad pustym polem zostaje pusty). DROP otwiera wszystkie.
  - Każdy chwytak niesie swoją cząsteczkę. PIVOT obraca każdą wokół jej chwytaka. EXTEND / RETRACT przesuwa każdy chwytak wzdłuż jego kierunku.
  - Reguła (c) działa na chwytaki: cząsteczka na dwóch chwytakach jednego ramienia przy ROTATE porusza się raz, a przy PIVOT daje `MOLECULE_CONFLICT`.
  - Ujście zwalnia tylko chwytaki trzymające dostarczoną cząsteczkę.
  - `heldAtomIds` trzyma atom każdego chwytaka. `isHolding` = któryś trzyma, `heldAtomId` = pierwszy trzymany w kolejności chwytaków (zgodność wstecz). Chwytaki jednego ramienia nie kolidują ze sobą.
  - `validateMachine()`: `MULTI_GRIPPER_LOCKED` poniżej poziomu z `multiArms` (L4), `GRIPPER_COUNT_INVALID` dla liczby spoza 1, 2, 3, 6.
- **Testy:** `trajectory.spec.ts`, `board.spec.ts`, `multi-gripper.spec.ts`, `area.spec.ts`, `recipes.spec.ts`.

### Propozycje (moje założenia, do przeglądu)

- **Odstęp 0,5 i 12 kroków.** Przy 0,5 atom na ramieniu długości 1 nigdy nie zahacza o atom stojący na innym polu (najbliżej 0,73). Ramię długości 2 zahacza o pole „w środku” łuku (0,27), ale nie o pola zewnętrzne (0,65). Widok rysuje atom o promieniu ok. 0,21 odstępu, więc JAM nigdy nie wygląda jak „minęły się”.
- **Koszt dodatkowego chwytaka:** +10 punktów PoC (`EXTRA_GRIPPER_COST`) i +2 STA (`EXTRA_GRIPPER_MATERIALS`) za każdy chwytak ponad pierwszy. Ramię trójchwytakowe kosztuje więc 40 pkt i 8 STA + 1 SLN, a sześciochwytakowe 70 pkt. Skala jak w §8.2 (1 STA ≈ 5 pkt). W *Opus Magnum* dopłata jest stała.
- **Tłok wielochwytakowy** jest dozwolony: wysuwa wszystkie chwytaki naraz. `validateMachine()` go nie blokuje.

## Receptury (W08 A, Z2, AT5)

Atomy nazywają się kodami materiałów. Układ portów i rozwiązania referencyjne zaprojektowałem tutaj i są **tymczasowe** (→ `EXP-6`). Wejścia i wyjścia są zgodne z katalogiem (`catalog-link.spec.ts`).

| Receptura | Wejścia → wyjście | Cząsteczka | Poziom | Zmierzone: cykle / obszar / ramiona / koszt pkt | Dokument §8.3 |
|---|---|---|---|---|---|
| `A_NAD` (`LEVEL_A_NAD`) | MIE 2 + PLA 1 + H2 10 (porcja 10 u na atom) → NAD 1 | PLA w środku, MIE, MIE, H2 co drugi sąsiad („Y”), 3 wiązania | L1 | 12 / 13 / 2 / 70 | 12 / 9 / 2 |
| `A_KAT` (`LEVEL_A_KAT`) | PLA 1 + KRZ 1 → KAT 1 | PLA*–KRZ; PLA → PLA* na glifie transmutacji | L2 | 6 / 8 / 2 / 70 | 10 / 8 / 2 |
| `A_MET` (`LEVEL_A_MET`) | STP 1 + KOM 1 + BET 2 → MET 1 | romb STP–BET–KOM–BET, 4 wiązania; dwa BET stykają się bez wiązania | L2 | 7 / 9 / 3 / 90 | 16 / 14 / 3 |
| `A_KAP` (`LEVEL_A_KAP`) | HE3 5 + DEU 10 + NAD 1 (porcje: HE3 5 u, DEU 5 u na atom) → KAP 1 | NAD w środku, HE3, DEU, DEU co drugi sąsiad, 3 wiązania | L3 | 7 / 11 / 3 / 80 | 18 / 16 / 3 |
| `A_PRO` (`LEVEL_A_PRO`) | KWA 1 + UKL 2 + NAD 1 → PRO 1 | KWA* w środku, UKL, UKL, NAD co drugi sąsiad, 3 wiązania; KWA → KWA* na glifie transmutacji | L4 | 6 / 9 / 2 (w tym 1 trójchwytakowe) / 130 | 24 / 20 / 4 |

Rozwiązania nowych receptur (szczegóły w komentarzach `engine/recipes.ts`):

- **A_MET:** piasta. Port STP leży na (0,0), a ramię 1 trzyma STP i obraca (PIVOT) parę STP–BET o 60°, żeby pole (1,0) znów było wolne. Ramię 2 przynosi BET dwa razy. Ramię 3 kładzie KOM na ujściu (1,1) w tym samym ticku co drugi BET: cztery wiązania zamykają pierścień i ujście go zabiera. Bez glifu na krótkiej przekątnej BET–BET.
- **A_KAP:** piasta. Port NAD leży na (0,0), a ramię 1 (długość 2) trzyma NAD i po każdym atomie obraca cząsteczkę o 120° (2 × PIVOT). Ramiona 2 i 3 przynoszą HE3 i dwa razy DEU na jedno stanowisko (1,0), które jest też ujściem. W pierwszej pętli ramię 3 wykonuje jeden pusty ruch na stanowisko.
- **A_PRO:** ramię trójchwytakowe stoi w środku (0,0). Jednym obrotem nakłada chwytaki na trzy porty na nieparzystych sąsiadach (UKL, UKL, NAD), chwyta trzy atomy jednym GRAB, a drugim obrotem kładzie je na trzech łącznikach wokół KWA*. Tłok na (2,0) przeprowadza KWA przez glif transmutacji (1,0) i wsuwa KWA* do środka. Bez ramienia wielochwytakowego trzy atomy wymagałyby trzech osobnych przejazdów (albo trzech ramion). Pełny stan powtarza się co 3 sztuki (18 ticków), bo ramię obraca się o 120° na sztukę. UKL ma dwa porty ze wspólnym buforem (A1).
- **A_KAT (zmiana programu):** ramię 2 dostarczało parę obrotem wokół podstawy. Jego chwytak wjeżdżał wtedy na (0,0), gdzie stał chwytak ramienia 1, które właśnie puściło PLA* (`ARM_COLLISION` w 4. ticku; test w `trajectory.spec.ts`). Teraz ramię 2 obraca PLA* wokół swojego chwytaka (PIVOT_CCW) na ujście przeniesione z (0,−1) na (0,1). Liczby się nie zmieniły (6 / 8 / 2).

Pozostałe rozwiązania (A_NAD, PoC L1–L4 z poprawionym L2) działają bez zmian w nowych regułach. Zmienił się tylko obszar: L1 12 → 13, L2 9 → 10, A_NAD 12 → 13.

Testy sprawdzają, że każde rozwiązanie dostarcza 6 sztuk bez JAM (także na planszy swojego poziomu budynku), że zużycie wejść na sztukę równa się recepturze, że rozwiązanie mieści się w limitach swojego poziomu budynku oraz kształt cząsteczki docelowej.

## API (`index.ts`)

`listRecipeLevels()`, `listAtanorLevels(kind?)`, `getAtanorLevel(id)`, `findRecipeLevel('A_NAD')`, `getLevelPorts()`, `getReferenceSolution()`, `emptySolution()`, `createAtanorSimulation(level, { solution?, supply?, boardRadius? })`, a potem `sim.step()`, `sim.getSnapshot()` i `sim.getStats()`. Dalej `runAtanorSimulation()`, `measureAtanorSolution(level, solution?, maxTicks?, { boardRadius? })`, `toAtanorSpec()`, `validateMachine()` i `machineMaterials()`. Eksportowane są też klasa `SimulationEngine`, poziomy PoC i receptur, typy (w tym `JamDetail`), matematyka heksów, ruch w ticku (`motionPoint`, `motionEnd`, `sweptHexes`, `hexToPoint`, `pointToHex`, `TRAJECTORY_SUBSTEPS`, `TRAJECTORY_CLEARANCE`) i pomocnicze funkcje chwytaków (`gripperCount`, `gripperRotations`, `getGripperPositions`, `getHeldAtomIds`, `setHeldAtomIds`). Zmiany w API są tylko dodatkami.

**Dla widoku:** `motion.ts` w `packages/render` obraca atomy wokół chwytaka 0 i szuka JAM-u po atomach na jednym heksie. Ramiona wielochwytakowe wymagają rysowania wszystkich chwytaków (`getGripperPositions`) i niesienia cząsteczki każdego z nich (`heldAtomIds`). Nowe JAM-y lepiej oznaczać z `jamDetail` (atomy, ramiona, heks, `t`). Ścieżka w widoku powinna używać `motionPoint`, żeby pokazywać to samo co silnik.

## Czego nie zrobiono z §8.5

Edytora (UI; `editor/` prowadzi kto inny) i drugiej planszy (L5). Kolizji korpusów ramion i atomów z podstawami ramion (patrz pytania). Koszt szyn jest tylko w `machineMaterials()`; punkty kosztu z PoC nadal ich nie liczą (A12).

## Otwarte pytania

Decyzje A1–A14 są w `docs/UNIFICATION.md`. Pytania 8 i 11 rozstrzygnęło AT5 (plansza jako JAM `OFF_BOARD`, obszar z drogi).

1. Bufor wejścia: jeden na materiał (tak jest teraz) czy osobny na każdy port („bufor portu” w §8.5)?
2. Reguła „cała maszyna czeka, gdy dowolny port jest pusty” sprawia, że atomy czekające na portach są zapasem w toku. Partia N sztuk wymaga więcej niż N × receptura (6 × NAD: MIE 13 i H2 70 zamiast 12 i 60). Czy ten zapas liczyć jako magazyn budynku i zwracać przy zatrzymaniu? Alternatywa, czyli czekanie tylko na GRAB z pustego portu, psuje determinizm względem wejść nieograniczonych, gdy atom jest używany w miejscu (PLA w `A_NAD`).
3. Liczby z §8.3 a pomiar: obszar 9 dla `A_NAD` wydaje się nieosiągalny przy 4 atomach, 3 portach i 2 ramionach (teraz zmierzone 13). `A_KAT` wychodzi na 6 cykli zamiast 10. Nowe receptury wychodzą znacznie szybciej niż w dokumencie: MET 7 zamiast 16, KAP 7 zamiast 18, PRO 6 zamiast 24. Który zestaw liczb przyjmuje model ekonomii (A3: na razie dokument)? Czy rozwiązania referencyjne mają być celowo „przeciętne”?
4. Cząsteczka NAD: §8.3 mówi „łańcuch Cu–Pt–Cu z H przy Pt”. Przyjąłem kształt „Y” (Cu–Pt–Cu pod kątem 120°). Czy łańcuch ma być prosty?
5. Nazwy atomów: czy formy aktywne mają być zapisane jako `PLA*` i `KWA*`, czy jako osobne kody? Czy UI ma pokazywać symbole z §8.3 (Cu, Pt, H), czy kody materiałów?
6. Czy porty wejścia i wyjścia są ustalone przez recepturę (tak jest teraz), czy gracz je stawia (jak w Opus Magnum)? Czy poziom startuje z rozwiązaniem referencyjnym, z podpowiedzią, czy pusty (`POC-4`)? API obsługuje każdy wariant.
7. Co znaczy „ukończenie” receptury w budynku produkcyjnym? `targetRequired` = 6 przyjąłem jak w PoC, jako przebieg weryfikacyjny, np. do rankingu `SOC-4`.
8. ~~Plansza~~ — rozstrzygnięte (A8, AT5).
9. Tłok na L1: §8.1 dopuszcza tłok, ale ramiona tylko L1–L2, a silnik pozwala tłokowi wysunąć się do długości 3. Ograniczyć to?
10. Reguła z poprawki (c): ramię, które trzyma cząsteczkę w miejscu, podczas gdy inne ją przesuwa, daje JAM (jak w Opus Magnum). Czy zamiast tego ma ją puszczać automatycznie?
11. ~~Definicja obszaru~~ — rozstrzygnięte (POC-5 B, AT5).
12. Czy szyny mają kosztować także w punktach, a nie tylko w materiałach?
13. Cykle na sztukę mogą być ułamkowe, gdy pętla daje kilka sztuk (np. 13/2). Czy model ekonomii to akceptuje?
14. Dane receptur (wejścia, wyjścia, liczby z §8.3) są powtórzone w `recipes.ts`. Czy po ustabilizowaniu `economy/catalog-data.ts` atanor ma importować katalog, czy ekonomia ma brać zmierzone `AtanorSpec` z atanora?
15. Odstęp kolizji 0,5 (i 12 kroków): przy 0,7 ramię długości 2 zahaczałoby także o pola zewnętrzne (0,65), więc długie ramiona byłyby dużo trudniejsze. Czy 0,5 jest właściwe?
16. Czy pusty chwytak ma kolidować z atomem, a korpus ramienia z atomami i innymi ramionami? Teraz nie (jak w *Opus Magnum*, gdzie ramiona są „nad” atomami).
17. Czy atom może leżeć na polu podstawy ramienia (A_PRO kładzie KWA* na podstawie ramienia trójchwytakowego) i czy korpus ramienia może przechodzić nad portem (A_KAP)? Teraz tak.
18. Koszt chwytaka: +10 pkt i +2 STA za każdy dodatkowy chwytak (ramię sześciochwytakowe +50 pkt), czy stała dopłata jak w *Opus Magnum* (+10 pkt dla 2, 3 i 6 chwytaków)?
19. Czy receptura może mieć kilka portów tego samego materiału? A_PRO ma dwa porty UKL (wspólny bufor), żeby ramię trójchwytakowe brało oba UKL naraz.
20. Plansza w budynku: wołający podaje `boardRadius` swojego poziomu budynku. Czy `createAtanorSimulation` ma przyjmować wprost poziom budynku i sam brać promień z `ATANOR_BUILDING_LEVELS`?
21. `OFF_BOARD` dotyczy tylko atomów i chwytaków w ruchu. Chwytak stojący poza planszą od startu zgłasza tylko `validateMachine()`. Czy silnik ma go zatrzymywać od razu?

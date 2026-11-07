# Rejestr ujednolicenia web-game

Rejestr rozbieżności między PoC, dokumentami i kanwą oraz decyzje, które je rozstrzygają.

- **Źródło:** plan prac v1 (https://claude.ai/artifact/4993s4ULShQuGzAUYAT57U).
- **Decyzje:** odczytane 2026-11-07 z bazy planu (kolekcja `decisions`, 31 wpisów, bez uwag). Plan zaakceptowany w całości, fazy F0–F6 również.

Oznaczenia: **FAKT** wynika z kodu lub dokumentów, **DECYZJA** pochodzi z planu, **PYTANIE** czeka na odpowiedź.

## 1. Decyzje

| ID | Pytanie | Wybór | Co to oznacza |
|---|---|---|---|
| W01 | Framework interfejsu | A · Angular 22 | Komponenty DS przepisane na Angulara na tym samym CSS; serwisy i pętla gry z 3D PoC przechodzą prawie wprost. |
| W02 | Design system w web-game | A · Wspólny pakiet | web-game importuje tokeny i CSS z `design-system/` jako pakiet; DS zostaje placem zabaw i dokumentacją. |
| W03 | Kształt warstwy mock | A · Kontrakt i Web Worker | Kontrakt `GameApi` (rozkazy, zapytania, zdarzenia), mock w Web Workerze, symulacja poza wątkiem UI. |
| W04 | Repozytorium | A · Git w całym projekcie | Jedno repo: docs, design-system, web-game i poc (kod PoC bez zmian). |
| W05 | Założenia Z1–Z6 | wszystkie: Potwierdzam | Zob. tabela niżej. |
| W06 | Scenariusz startowy | A · Kanwa jako główny przepływ | Przylot do Tau Ceti domyślny; układ z 3D PoC zostaje presetem testowym dla przeniesionych testów. |
| W07 | Zakres ekonomii w mocku | B · E0–E1 grywalne, reszta jako dane | Grywalne surowce i budynki z kanwy (E0–E1 i ładownia Arki); pełny katalog wczytany jako dane. |
| W08 | Atanor w web-game | A · Widok budynku | Edytor z budynku „Fabryka atanorowa”, 1–2 receptury T3, atomy nazwane materiałami. Wymaga planszy Atanora w stylu DS. |
| W09 | Błędy PoC | A · Naprawiać przy przenoszeniu | Każda poprawka z testem i wpisem w sekcji 4. |
| W10 | Dane gwiazd | A · Ujednolicić wewnętrznie | Kierunek ze współrzędnych, długość wektora równa polu `distance`. |
| W11 | Social i multiplayer | B · Symulowani gracze i rynek | Mock generuje innych graczy, ich kolonie i notowania hubów. |
| W12 | Widoki świata | A · Jedna scena, przełącznik ustawia kamerę | Planeta i Układ to ujęcia tej samej sceny; Galaktyka i Atanor osobno. |
| W13 | Renderery | A · Three.js + PixiJS | PixiJS tylko w Atanorze, ładowany leniwie; jeden kontekst WebGL naraz. |
| W14 | Styl scen | C · Hybryda | Modele KayKit w ograniczonej palecie, płaskie cieniowanie, wektorowe nakładki, bez poświat. |
| W15 | Ekrany wejścia | C · Oba | Strona główna i Logowanie z kanwy oraz wejście do scenariusza adresem, np. `#scenariusz-kolonia`. |
| W16 | Język interfejsu | B · Polski ze słownikiem | Teksty w słowniku kluczy od początku. |
| W17 | Urządzenia docelowe | A · Desktop | Chrome, Edge, Firefox; laptop ze zintegrowanym GPU jako dolna granica. |
| W18 | Cele wydajności | B · 30 FPS w M, 60 FPS w S | Niższy próg dla dużej kolonii. |

| Założenie | Treść | Status |
|---|---|---|
| Z1 | Cel gry w układzie: gwiazdolot i wybór kolejnej gwiazdy na mapie galaktyki. | potwierdzone |
| Z2 | Materiały T3 i T4 powstają wyłącznie w Fabryce atanorowej; T1 i T2 w zwykłych fabrykach. | potwierdzone |
| Z3 | Magazyny są lokalne (na ciele), a materiały przemieszczają się fizycznie: taśmami, rurami i pojazdami. | potwierdzone |
| Z4 | Energia ogranicza produkcję w czasie: pobór jest ciągły, a deficyt obniża wydajność. | potwierdzone |
| Z5 | W obrębie układu gra jest jednoosobowa; handel odbywa się przez rynek. | potwierdzone |
| Z6 | Jednostka czasu modelu to 1 minuta; PoC działa według tych samych reguł 60 razy szybciej. | potwierdzone |

## 2. Rejestr rozbieżności

Kolumny od „3D PoC” do „Kanwa i DS” to **FAKT** (stan z planu, 2026-11-07). Kolumna „Ustalenie” to **DECYZJA**.

| Obszar | 3D PoC | Atanor | Galaktyka | Dokumenty | Kanwa i DS | Ustalenie | Źródło | Faza |
|---|---|---|---|---|---|---|---|---|
| Framework | Angular 22 | Angular 22 | Angular 22 | TECH-4: rekomendacja Angular | DS: React 18 + Vite; kanwa: statyczne plansze | Angular 22; DS w Angularze na wspólnym CSS | W01, W02 | F0 ✓ |
| Renderer | Three.js | PixiJS | Three.js | TECH-5: Three.js + PixiJS | rysunki SVG | Three.js + PixiJS tylko w Atanorze, leniwie, jeden kontekst WebGL naraz | W13 | F4 |
| Start gry | Planeta Matka z lądowiskiem i panelem; Księżyc, asteroida | — | Tau Ceti: G8.5V, 11,91 ly, 5 planet | era E0 „Lądowanie” na Planecie Matce; nowe ciała Pyros, Gigas, Glacja, Kerys | Arka-1 przylatuje do Tau Ceti, skan planet b–f, wybór Tau Ceti e, port | przylot do Tau Ceti domyślny; świat z PoC jako preset testowy; świat jako dane | W06 | F1, F2 |
| Czas | ciągły, w sekundach; tempo ×1, ×3, ×10 | ticki 600 ms przy 1× | — | Z6: jednostka modelu = 1 min (PoC ×60) | zegar „Dzień 1 · 00:04”, przełącznik tempa | jeden zegar gry, jednostka 1 min, mnożnik do testów | Z6 | F1, F2 |
| Surowce | Ferryt, Kriol, Silicyt | 9 typów atomów (A, B, SALT, WATER, LEAD, GOLD…) | — | 37 pozycji T0–T4 z kodami | FER, SIL, KRI, KAR, STA, BET, ZYW, UKL, PAL; ENE i POP jako obciążenia | jeden katalog z kodami z dokumentu ekonomii; E0–E1 grywalne, reszta jako dane; atomy Atanora jako materiały | W07, W08 | F1 |
| Magazyn | globalny, bez limitu | źródła nieograniczone | — | Z3: lokalny na ciele, transport fizyczny | jeden pasek surowców kolonii | lokalny na ciele, transport fizyczny | Z3 | F1 |
| Energia | sprawdzana tylko przy budowie | — | — | Z4: pobór ciągły, deficyt obniża wydajność | ENE jako obciążenie z limitem w MW | pobór ciągły, deficyt obniża wydajność | Z4 | F1 |
| Budowa | natychmiastowa; 8 budowli bez poziomów | koszt sumowany, bez budżetu | — | poziomy L1–L5, czas budowy, mnożniki kosztu | katalog budowli, duch na polu, koszt STA / BET / UKL | poziomy i czasy z dokumentu ekonomii w zakresie E0–E1 | W07 | F1 |
| Powierzchnia | siatka Goldberga GP(8,0): 642 kafelki | płaska siatka heksów | — | budynki na 1, 3 i 7 kafelkach | tarcza z heksami (rysunek 2D) | siatka Goldberga z PoC (TECH-8, rekomendacja A); przyjęte z fazą F4 | F4 | F4 |
| Widoki | jedna ciągła scena układu z kafelkami | osobny ekran | osobny ekran | wizja: 3 tryby; TECH-6: ciągła scena | przełącznik Planeta / Układ / Galaktyka (F1–F3) | Planeta i Układ jako ujęcia jednej sceny; Galaktyka i Atanor osobno | W12 | F4 |
| Loty | krzywa Béziera korygowana w każdej klatce; paliwo przy starcie; rezerwa powrotu | — | — | TECH-1: czas przylotu ustalany przy rozkazie | wykres okien transferowych | czas przylotu i koszt ustalane przy rozkazie; czas lotu niezależny od klatek | W03, W09 | F1, F2 |
| Sterowanie | LPM zaznacza, PPM rozkaz, Spacja pauza, 1/2/3 tempo, Esc | skróty rozkazów programu | przeciąganie, zoom | — | karta rozkazów 4×2 ze skrótami; F1–F3 przełączają widoki | jedna mapa klawiszy; **klawisze widoków do ustalenia** (P1) | F3 | F3 |
| Odmowy | 13 kodów (NO_POWER, TILE_OCCUPIED, NO_RESOURCES…) | JAM (kolizja) | — | — | powód w inspektorze, komunikaty z kodami | jeden słownik kodów domeny; teksty w słowniku UI | F1, W16 | F1, F3 |
| Stan | reducer i 12 typów zdarzeń domenowych | mutowalny silnik i serwis z Signals | jeden sygnał | TECH-9: log zdarzeń | dane wpisane w plansze | zdarzenia domenowe z 3D PoC dla całej gry, za `GameApi` w Web Workerze | W03 | F1, F2 |
| Atanor | — | 4 poziomy alchemiczne | — | Z2: T3/T4 tylko z Atanora; porty budynku = INPUT/OUTPUT | brak planszy Atanora | widok budynku „Fabryka atanorowa”, 1–2 receptury T3; **plansza do zaprojektowania** (P2) | W08, Z2 | F1, F4 |
| Gwiazdy | — | — | 41 gwiazd; część dystansów niezgodna ze współrzędnymi | 21 gwiazd w zasięgu gwiazdolotu | pierścienie zasięgu Mk I / Mk II, hub rynku | wektor ze współrzędnych przeskalowany do `distance`; Deneb w zasięgu kamery | W10, W09 | F1 |
| Social | — | — | — | analiza: rynek w hubach, korporacje, rankingi projektów | warstwa „Kolonie innych graczy”, hub rynku Syriusz | symulowani gracze, kolonie i notowania hubów | W11 | F2 |
| Modele 3D | 14 modeli KayKit, każdy spłaszczony do jednej geometrii | — | kule i sprite'y poświaty | 70 modeli KayKit, bez animacji | sceny jako płaskie wektory | hybryda: KayKit w ograniczonej palecie, płaskie cieniowanie, wektorowe nakładki, bez poświat | W14 | F4 |

## 3. Wykonane w F0 (FAKT)

- **Repozytorium:** git w `C:\projects\space-game`.
  - Pierwszy commit zawiera stan wyjściowy, bez zmian w treści.
  - `.gitattributes` wymusza LF: pliki generowane (tokeny CSS, tabele ekonomii) są porównywane bajt w bajt, a systemowe `core.autocrlf=true` dałoby CRLF przy klonie.
- **Design system:**
  - Nowe wejście `core` bez Reacta: tokeny, formatowanie liczb, reguły stanu odczytów, typy kosztów i przycisków, ścieżki ikon. Komponenty Reacta korzystają z niego, a `npm run build` w DS przechodzi.
  - `package.json` DS ma mapę `exports` (`./core`, `./css/*`).
- **web-game:**
  - Workspace npm, TypeScript strict, Angular 22.2 (zoneless), vitest 4.1, Playwright 1.64.
  - `packages/ui` to port komponentów DS na Angulara: `HudFrame`, `RtsButton`, `ResourcePanel`, `CommandCard`, `HudIcon` oraz słownik `HUD_TEXT`.
  - Powłoka aplikacji pokazuje statyczne dane z planszy „Kolonia”.
- **Przeniesione do repo:** archiwum kanwy (`docs/canvas/`) i model ekonomii (`tools/economy-model/`). `npm run econ:check` potwierdza, że dokument ekonomii zgadza się z modelem.

## 3a. Wykonane w F1 (FAKT)

Wspólna domena w `packages/domain` jest w czystym TypeScripcie, bez Angulara, Three.js i DOM. Testy: 151 w zwykłym vitest.

- **Logika 3D PoC** (`sim/`):
  - `game/` przeniesione najpierw 1:1 (commit `6b41a74`, 64 testy bez zmian), potem ujednolicone.
  - Pozostałe 17 z 81 testów PoC dotyczy silnika 3D (przejdą do `render` w F4) i serwisu stanu (zastąpionego przez mock w F2).
- **Atanor** (`atanor/`): silnik z PoC, 16 przeniesionych testów bez zmian i 38 nowych. Szczegóły: `packages/domain/src/atanor/README.md`.
- **Gwiazdy** (`galaxy/`): 41 gwiazd z PoC galaktyki z pozycjami zgodnymi z dystansem (W10).
- **Katalog ekonomii** (`economy/`):
  - Dane i obliczenia modelu przeniesione z `tools/economy-model`. Generator dokumentu tylko formatuje.
  - Dokument wychodzi bajt w bajt taki sam (`econ:check`), więc gra, dokument i panel projektanta z F6 mają jedno źródło.
  - `computeEconomy(params)` liczy wszystko od nowa z parametrów (Załącznik A).
- **Symulacja** (`sim/simulation.ts`):
  - Odpowiednik `SimulationService` + `CommandService` z PoC: jeden scenariusz, reguły, systemy, migawka klatki, `step(dt)` i `dispatch(command)`.
  - Cały stan gry jest w `WorldState` (zwykłe dane), także postęp budów i partii produkcji, więc zapis do JSON i powtórka działają (test).
- **Scenariusze:**
  - `tau-ceti` (domyślny, W06 A): przepływ z kanwy.
  - `planeta-matka`: preset PoC, na nim działają przeniesione testy.
- **Testy przepływu z kanwy** bez UI:
  - przylot → skan (15 min) → wybór Tau Ceti e → przelot Arki → port z ładowni (12 min, 2 łaziki) → prom → wiatrak, habitat, kopalnia, ekstraktor Kriolu, wieża Silicytu → wydobycie FER, SIL, KRI;
  - ten sam skrypt daje identyczny JSON stanu i dziennik zdarzeń;
  - wczytanie zapisu w trakcie budowy daje ten sam wynik co gra bez przerwy.

## 3b. Wykonane w F2–F4 (FAKT)

- **F2: warstwa mock.**
  - `packages/api`: kontrakt `GameApi` (rozkazy, migawki ~10 Hz, zdarzenia, dane klatki, tempo, pauza, krok, zapis, wczytanie, powtórka, katalog, dostępność, podgląd budowy, propozycja pola) i klient protokołu Web Workera.
  - `packages/mock-server`:
    - symulacja stałym krokiem (1/60 s × tempo / 60 min modelu);
    - dziennik rozkazów z numerem kroku; powtórka z pliku daje identyczny świat (test);
    - zapis i wczytanie JSON;
    - symulowani gracze i rynek w hubach Syriusz i Słońce (W11 B, ceny według dok. 4.6);
    - statystyki czasu kroku.
  - Aplikacja ładuje mocka w Web Workerze (`game.worker.ts`). Interfejs importuje tylko `@space-game/api` i `@space-game/render`, nie logikę domeny.
- **F3: interfejs z kanwy.**
  - Trasy: strona główna, logowanie (mock przyjmuje dowolne dane), gra, wejście adresem `#/scenariusz-przybycie | skan | port | kolonia | planeta-matka` (W15 C). Presety grają przepływ tymi samymi rozkazami co gracz.
  - HUD z kanwy:
    - pasek górny 48 px: zegar, ładownia Arki albo magazyn kolonii z ENE i POP, tempo, widoki;
    - panele: rozkaz misji, status, wyniki skanu, dziennik;
    - dok 240 px: mapa (schemat układu), zaznaczenie, karta rozkazów 4×2;
    - katalog budowy, nakładka wydajności.
  - Teksty w słowniku `apps/game/src/app/i18n/pl.ts` (W16 B).
  - Przepływ Play przechodzi w e2e od strony głównej do kolonii z wydobyciem FER, SIL, KRI.
- **F4: widoki świata** (`packages/render`):
  - `RenderHost` z zasadą jednego kontekstu WebGL (W13 A);
  - jeden widok układu i planety, w którym przełącznik przesuwa tylko kamerę (W12 A, port silnika 3D PoC);
  - galaktyka jako jedno `THREE.Points` (6 draw calls zamiast ok. 185 w PoC, Deneb w zasięgu kamery);
  - Atanor w PixiJS ładowanym leniwie (W08 A: receptury A_NAD i A_KAT, sterowanie z HUD).
  - Styl W14 C: modele KayKit w palecie DS, płaskie cieniowanie, wektorowe nakładki, bez tekstur i poświat.
  - e2e: każdy widok dostępny z HUD; liczniki w nakładce (planeta 19 wywołań / 31 tys. trójkątów, układ 17 / 29 tys., galaktyka 6, Atanor 2); po 20 przełączeniach geometrie i tekstury wracają do stanu wyjściowego; zawsze 1 kontekst WebGL.
- **Paczka startowa:** 279 kB (75 kB w transferze). Three.js i PixiJS ładują się dopiero z ekranem gry.

## 3c. Wykonane w F5 (FAKT)

- **Scenariusze obciążenia** (`packages/mock-server/src/load.ts`, adresy `#/scenariusz-obciazenie-s | -m | -l`). Generowane z ziarna, więc każdy przebieg mierzy ten sam świat:

  | Poziom | Świat | Budowle | Statki w locie | Łaziki | Gracze |
  |---|---|---|---|---|---|
  | S | PoC | 20 | 1 | 1 | 6 |
  | M | Tau Ceti | 300 | 40 | 20 | 12 |
  | L | Tau Ceti | 1500 | 200 | 100 | 60 |
- **Pomiar:** `npm run perf` buduje wersję produkcyjną i mierzy w Chromium (Playwright) każdy widok każdego scenariusza. Zbiera FPS, percentyle klatki, draw calls, trójkąty, liczniki GPU, konteksty, krok symulacji, stertę JS i czas startu, oraz ślad Chromium dla M w widoku układu. Liczy też rozmiar pobrania.
- **Raport:** [PERF-REPORT.md](PERF-REPORT.md), tabela scenariusz × metryka × budżet z zadaniami naprawczymi.
- **Wynik na tym komputerze** (P6: i9-12900K, RTX 4060 Ti, Chromium 156):
  - 60 FPS we wszystkich scenariuszach i widokach, więc W18 B jest spełnione z zapasem;
  - krok symulacji L: średnio 0,5 ms, maksymalnie 3,3 ms;
  - pierwsza sesja pobiera 2,7 MB (budżet 15–25 MB);
  - przekroczenia dotyczą tylko trójkątów w widoku planety: M 256 tys. (uwaga), L 1,1 mln (przekroczenie). Powód: budynki wszystkich ciał są rysowane bez odcinania (`frustumCulled = false`) i bez LOD. Zadania są w raporcie.

## 3d. Wykonane w F6 (FAKT)

Panel projektanta (`apps/game/src/app/designer/`) otwiera się klawiszem F2 albo przyciskiem „Projektant” w pasku górnym. To szuflada po prawej stronie ekranu gry, nad światem. Zakładki:

| Zakładka | Co robi | Skąd dane |
|---|---|---|
| Parametry | Formularz Załącznika A: wycena, wzrosty na poziom, docelowe zwroty E1–E4, takty i moc Atanora. Przy zmienionym polu widać wartość dokumentu. „Zastosuj: nowa gra” uruchamia scenariusz od początku z nowymi parametrami. „Zastosuj: odtwórz tę grę” powtarza te same rozkazy w tych samych krokach i podaje, ile z nich odrzucono. | `GameApi.start(scenario, economy)`, `replay(file)` |
| Tabele | Ery (mnożnik k), materiały (wartość V), budynki L1 (koszt w kr, czas, zwrot): dokument obok szkicu, z różnicą, filtr „tylko zmienione”. | nowe zapytanie `GameApi.economyReport(params)` (`economyTables` w domenie) |
| Przepływy | Wykresy mocy (produkcja i pobór), załogi i magazynu kolonii w czasie gry. Tabela tempa: dokument (stawka katalogu × poziom, przy pełnej mocy) obok pomiaru ze zdarzeń z ostatnich 30 min gry. | zdarzenia i migawki (`Telemetry`), nowe zapytanie `GameApi.nominalFlows(body)` |
| Dziennik | Wszystkie zdarzenia domeny (bufor: 1000 zdarzeń i 300 taktów), filtr typu, eksport CSV. | strumień zdarzeń workera |
| Atanor | A3: receptury według dokumentu §8.3 obok liczb zmierzonych w widoku budynku; „Wstaw zmierzone do szkicu”. | odczyt widoku Atanor, `EconomyParams.atanor` |
| Plik | Eksport zapisu (JSON z całym światem, dziennikiem rozkazów i parametrami), wczytanie, odtworzenie z rozkazów; sprawdzenie, czy plik to zapis web-game. | `save`, `load`, `replay` |

- **Domena:**
  - `economyTables(eco)`: wiersze tabel dokumentu;
  - `nominalFlows(world, rules, grids, body)`;
  - opcjonalne `EconomyParams.atanor`: zmierzone cykle, obszar i ramiona zastępują liczby z §8.3 w czasie i mocy receptury.
- **Kontrakt:**
  - nowe zapytania `economyReport` i `nominalFlows`;
  - `replay` zwraca też `replayStats` (rozkazy, odrzucone).
- **Pierwszy pomiar A3 w panelu** (A_NAD, przy parametrach dokumentu):
  - dokument: cykle 12, obszar 9, ramiona 2, moc 12,5 MW;
  - zmierzone: cykle 12, obszar 12, ramiona 2, moc 14 MW;
  - skutek: wartość NAD rośnie z 45,33 do 47,13 kr (+4%).
- **Testy:**
  - mock: 5 testów zapytań projektanta;
  - aplikacja: 6 testów funkcji panelu;
  - e2e: 5 scenariuszy panelu (parametr → tabele → nowa gra; odtworzenie z odrzuconymi rozkazami; wykres z odczytem pod kursorem i tabelą temp; Atanor; eksport i import zapisu, obcy plik odrzucony).
- **Wydajność po F6:** bez zmian (raport F5 wygenerowany ponownie: L krok 0,6 / 3,1 ms, 60 FPS).

### Różnice względem plansz kanwy (zrzuty 1440×900, F3)

| Plansza | Różnica | Powód |
|---|---|---|
| wszystkie | tempo ×1 / ×60 / ×600 zamiast ×1 / ×3 / ×10 | Z6: ×1 to czas rzeczywisty, ×60 tempo PoC, ×600 testy (D12) |
| wszystkie | czwarta zakładka widoku „Atanor” | W08 A, W13 A; kanwa nie ma planszy Atanora (P2) |
| 1 Strona główna | inny rzut mapy gwiazd; część nazw z danych po angielsku (np. WISE 0855-0714) | dane `stars.data.ts`; polskie nazwy tylko w słowniku `starNames` |
| 3 Przybycie | panel Arki: paliwo w układzie 100 / 100 zamiast kapsuł 12 / 40; brak kolonistów i mocy pokładowej | kapsuły i koloniści nie mają mechaniki w E0–E1 (D14) |
| 4 Skanowanie | bez zmian merytorycznych; sonda, porównanie i „oznacz” zablokowane z powodem „Jeszcze nie w web-game” | D7 |
| 5 Port | zamiast kart katalogu: karta trybu stawiania (Postaw port · Obróć · Najbliższe pole · Anuluj); duch na planecie 3D | jeden wzorzec stawiania dla portu i budynków |
| 6 Kolonia | planeta jako glob 3D z siatką Goldberga zamiast płaskiej tarczy heksów | W12 A, W14 C |
| 6 Kolonia | panel „Cele · era E1” (Huta, moc, Karbonit) zastąpiony rozkazem misji z pierwszej sesji | cele er nie są jeszcze danymi |
| 6 Kolonia | rozkazy budynku: brak „Wstrzymaj”, „Priorytet mocy”, „Podłącz taśmę” | domena nie ma pauzy budynków, priorytetów na budynek ani taśm (D4) |
| 6 Kolonia | pasek mieści 5–6 odczytów przy 1440 px, reszta przewija się w pasku | długie etykiety i przełączniki po prawej |
| 7 Układ | brak wykresu okien transferowych | czas przylotu liczony przy rozkazie, wykres później |
| 8 Galaktyka | odległości od Tau Ceti inne niż na planszy (np. Epsilon Eridani 2,14 zamiast 3,05 ly) | W10: pozycje dopasowane do `distance` |
| mapa w doku | bez ramki widocznego obszaru | schemat układu, nie miniatura kamery |

### Zasady wspólnej domeny (DECYZJA według planu i rekomendacji)

| Obszar | Zasada | Źródło |
|---|---|---|
| Czas | Jednostka symulacji to minuta modelu. Liczby PoC zostają, zmienia się tylko jednostka. Zegar: `dt = min(klatka, 0,1 s) × tempo / 60`; tempo ×60 = szybkość PoC. | Z6 |
| Surowce | Kody z katalogu (37 materiałów). Grywalne budynki E0–E1, pozostałe jako dane (`PLAYABLE_ERA = 1`). | W07 B |
| Magazyn | Pula na każdym ciele. Pojemność per klasa składowania z budynków magazynowych i portu. Pełna klasa zatrzymuje wydobycie i produkcję. Statek rozładowuje do puli bazy, ile się zmieści. | Z3, dok. 4.4 |
| Energia | Sieć per ciało. Panel × nasłonecznienie, turbina tylko z gęstą atmosferą. Przy deficycie P1 (habitaty, kriogenika, pułapki) chronione, P2 i P3 dzielą resztę proporcjonalnie. Budowa sprawdza moc z rezerwacją. | Z4, dok. 4.3 |
| Załoga | Druga moc: pojemność z portu i habitatów (×1,7 na poziom), zapotrzebowanie budynków (×1,3). Budowa sprawdza ją z rezerwacją. | dok. 4.5 |
| Budowa | Rozkaz tworzy plac opłacony z puli ciała. Wolny łazik dojeżdża (BFS) i buduje przez czas budowy; kilka łazików sumuje tempo. Rozbudowa w miejscu z 50% wydajności. Anulowanie zwraca 75%, rozbiórka 50%. Żaden poziom nie przekracza portu. Budynki na 1, 3 i 7 kafelkach. | dok. 5.1 |
| Produkcja | Partie receptur: wejścia z puli przy starcie, wyjścia na końcu. Tempo = poziom × wydajność energii. Partia rusza tylko, jeśli wyjście się zmieści. | dok. 4.4, 5.1 |
| Loty | Czas przylotu i punkt przechwycenia ustalane przy rozkazie; pozycja w locie jest funkcją planu i czasu. | TECH-1, W09 |
| Odmowy | Jeden słownik: 13 kodów PoC + 17 nowych (`REJECT_CODES`). Usterki symulacji osobno (`FAULT_CODES`: JAM). Teksty są w słowniku UI (W16). | rejestr: Odmowy |
| Kolonizacja | Skan systemu, wybór ciała z siatką, port z ładowni Arki przy Arce na orbicie, prom z ładowni do puli kolonii, łazik z portu (FER 20 · SIL 5 · 3 min). | kanwa |

## 4. Zmiany wyników względem PoC

| Test lub obszar | W PoC | W web-game | Powód | Decyzja |
|---|---|---|---|---|
| Kody surowców | FERRITE, CRYOL, SILICITE | FER, KRI, SIL | jeden katalog | W07 |
| Rodzaje budowli | MINE, ICE_EXTRACTOR, SILICITE_EXTRACTOR, SOLAR, WIND, HABITAT, DEPOT, LANDING_PAD | MIN, ICE, SIT, SOL, WND, HAB, DEP, LAND (+ cały katalog) | katalog dokumentu | W07 |
| Jednostka czasu | sekunda | minuta modelu; wartości liczbowe bez zmian | Z6 | Z6 |
| Magazyn | globalny `stockpile` | `storage` per ciało z pojemnością; budowa na Księżycu wymaga materiałów na Księżycu | Z3 | Z3 |
| Świat startowy presetu | lądowisko + panel; 5 MW wytwarzane, 2 pobierane | + port L1 (3 pola): 10 MW / 2 MW, miejsca dla 5 osób, magazyn 2000 j. | dokument: E0 startuje z HQ L1 | Z1–Z6, dok. 3.1 |
| `build-system.spec`: budowa kopalni | natychmiast `STRUCTURE_BUILT` | `CONSTRUCTION_ORDERED`, plac; łazik buduje 2 min | dok. 5.1 | F1 |
| `build-system.spec`: brak mocy | druga kopalnia `NO_POWER` | moc 8 MW: habitat + 2 kopalnie, trzecia `NO_POWER`; planowane źródła się liczą | rezerwacja przy rozkazie | F1 |
| Tekst braku surowców | „brakuje 10 Ferrytu + 10 Silicytu” | „brakuje FER 10 · SIL 10” | styl kanwy („BRAK: FER 2088 · …”) | W16 |
| Tekst braku mocy | „brakuje 3 mocy” | „brakuje 3 MW” | jednostka z DS | W16 |
| `full-loop.spec`: ekonomia | druga kopalnia `NO_POWER`, wiatrak odblokowuje | `NO_CREW` → habitat → `NO_POWER` → wiatrak; jeden łazik buduje 5 placów po kolei | dok. 4.5, 5.1 | F1 |
| `full-loop.spec`: ograniczenie klatki | `advance(5, 1)` = 0,1 s | `advance(5, 60)` = 0,1 min (tempo PoC) | Z6 | Z6 |
| Wydobycie i górnictwo statku | najwyżej 1 tick na wywołanie: przy kroku > 1 jednostki ticki ginęły | każda pełna minuta kroku | **błąd znaleziony przy przenoszeniu** | W09 |
| Loty | krzywa korygowana co klatkę, postęp speed·dt/długość: czas zależny od klatek | czas ustalony przy rozkazie; ten sam przy kroku 1/60 i 0,5 min | błąd z planu | W09, TECH-1 |
| Wydobycie przy deficycie | nie występował (budowa blokowana) | wydajność = moc dostępna / zapotrzebowanie | Z4 | Z4 |
| Dokowanie | `LANDING_PAD` | `LAND`; port nie jest punktem dokowania, bo Arka zostaje na orbicie, a towar zjeżdża promem | propozycja | F1 |
| Atanor: rozwiązanie poziomu 2 | JAM po 9 tickach, 0/6 | 6/6 po 39 tickach (błędny program, nie silnik) | błąd z planu | W09 |
| Atanor: `getStats().cycles` | pozycja głowicy (L1: 5) | liczba ticków (L1: 50) | błąd „CYKLE” z planu | W09 |
| Atanor: obszar L1 | 11 | 12 (pole dostarczenia było pomijane) | błąd znaleziony przy przenoszeniu | W09 |
| Atanor: dwa ramiona na jednej cząsteczce | podwójny ruch bez błędu | jeden ruch albo JAM `MOLECULE_CONFLICT` | błąd z planu (potwierdzony) | W09 |
| Gwiazdy | 31 z 41 gwiazd z dystansem ze współrzędnych różnym od pola `distance` o ponad 5% (np. Tau Ceti 14,35 wobec 11,91 ly, Vega 41,27 wobec 25,04 ly, Deneb 1650 wobec 2615 ly) | kierunek ze współrzędnych, długość = `distance` | W10 A | W10 |
| Dokument ekonomii | dwie linie poprawione ręcznie po wygenerowaniu | poprawki w generatorze; dokument bez zmian | jedno źródło | F0 |

## 5. Rozstrzygnięcia według rekomendacji (2026-11-07)

Na prośbę „decyzje wg rekomendacji” rozstrzygam pytania P1–P6 i kwestie z F1 według moich rekomendacji. Każde można zmienić, a wtedy zmiana trafi do tej tabeli.

| ID | Kwestia | Rozstrzygnięcie |
|---|---|---|
| P1 | Klawisze widoków (F1 i F3 są zajęte przez przeglądarkę) | 1 Planeta, 2 Układ, 3 Galaktyka, 4 Atanor. Tempo: Spacja pauza, `+` / `−` zmiana tempa (PoC: 1/2/3), Esc anuluje. |
| P2 | Plansza Atanora | Projektuję ją od razu w web-game (F4), z komponentów DS. Zrzut trafi do `docs/`. Kanwa zostaje archiwum. |
| P3 | Ikony z kanwy spoza DS | Dodać do `design-system/src/icons/icon-paths.ts` (F3). |
| P4 | Zdalne repozytorium | Na razie tylko lokalnie. Adres podaje użytkownik. |
| P5 | Decyzje w dokumentach | Tak: pola „Decyzja” w `docs/game-design-questions.md` dla pytań rozstrzygniętych planem i status Z1–Z6 w dokumencie ekonomii (przez `template.md`). |
| P6 | Sprzęt referencyjny | Ten komputer. Raport F5 zapisze CPU, GPU i przeglądarkę. |
| D1 | Port L1 w Tau Ceti | Koszt i czas z kanwy: STA 120 · BET 80 · UKL 10, 12 min. Magazyn portu 2000 j. dla klas sypkie i sztukowe (kanwa: 3600 na L2 = 2000 × 1,8). |
| D2 | Limit łazików | Poziom portu + 1 (kanwa: 2 / 3 przy L2). |
| D3 | Prom | 250 j. na kurs, 6 min w jedną stronę (kanwa liczb nie podaje). |
| D4 | Taśmy i rury (rozdz. 7) | Jeszcze nie: produkcja bierze z puli ciała. Logistyka fizyczna między ciałami (statki, prom) działa. |
| D5 | Potrzeby załogi, przyrost (4.5) | Jeszcze nie; załoga działa jako pojemność. |
| D6 | Bufory budynków (2 / 5 partii) | Jeszcze nie; partia rusza tylko, jeśli wyjście się zmieści. |
| D7 | Sonda („Wyślij sondę”) | Jeszcze nie: jest na pokładzie, rozkazu brak. |
| D8 | Przylot | Arka startuje na orbicie postojowej przy gwieździe (przylot = stan początkowy). |
| D9 | Ładownia Arki | 9 pozycji = 2000 j.: 7 z paska kanwy oraz Pręty paliwowe 20 i Silniki 40 z listy „na pokładzie”. Zgadza się z „2000 / 2000 j.” z kanwy. |
| D10 | Orbity Tau Ceti | Promienie z nasłonecznienia z kanwy (r = 900·√(0,52 / ins)), okresy ∝ r^1,5 jak u planety PoC. |
| D11 | Rezerwacja | Planowane źródła i odbiorcy liczą się przy sprawdzaniu mocy i załogi rozkazu; wydajność liczą tylko działające budynki. |
| A1 | Atanor: bufory wejścia | Jeden na materiał (jak zbudowano). |
| A2 | Atanor: atomy na portach | Akceptuję jako produkcję w toku; zużycie na produkt liczone w stanie ustalonym. |
| A3 | Atanor: liczby w modelu ekonomii | Zostają z dokumentu. Zmierzone (A_NAD: 12 / 12 / 2, A_KAT: 6 / 8 / 2) pokaże panel projektanta w F6 do porównania. |
| A4 | Kształt NAD | „Y” na razie zostaje; dokument nie ustala kątów. |
| A5 | Nazwy atomów | Kody materiałów, w tym `PLA*` i `KWA*`; UI pokazuje kody jak DS. |
| A6 | Porty i start poziomu | Porty ustala receptura. Poziom startuje z rozwiązaniem wzorcowym, które gracz może edytować. |
| A7 | `targetRequired` | Dotyczy trybu układanki; w budynku produkcja idzie bez końca. |
| A8 | Wyjście poza planszę | Później jako JAM; plansza 19 heksów = promień 2. |
| A9 | Zasięg tłoka | Ograniczony maks. długością ramienia poziomu budynku: walidacja w edytorze (F4). |
| A10 | Ramię trzyma, a inne rusza | JAM, jak teraz. |
| A11 | Obszar po łuku obrotu | Później (POC-5). |
| A12 | Tory w punktach kosztu PoC | Nie; tylko w materiałach maszyny. |
| A13 | Ułamkowe cykle na produkt | Tak, jako średnia z okresu powtarzania. |
| A14 | Kierunek zależności receptur | Źródłem jest katalog ekonomii. Poziomy trzymają układ portów, a test `catalog-link.spec.ts` pilnuje zgodności wejść i wyjść. |
| D12 | Tempo | ×1 (czas rzeczywisty), ×60 (tempo PoC, domyślne), ×600 (testy); Spacja pauza, `+` / `−` zmiana. |
| D13 | Atanor w przełączniku widoków | Czwarta zakładka, dostępna od razu: Fabryka atanorowa to budynek E3, poza grywalnym E0–E1, a widok ma być testowalny. |
| D14 | Kapsuły, koloniści, moc pokładowa Arki | Tylko w danych opisu; bez mechaniki w E0–E1. |
| D15 | Autoustawienie budowy | „Najbliższe pole” szuka od portu; wydobywarka najpierw złoża materiału brakującego do celu misji. |
| D16 | Cel „Uruchom wydobycie” | Liczy materiał złoża pod wydobywarką, nie listę możliwości budynku; wyczerpane złoże nadal się liczy (to kamień milowy). |
| S1 | `STRUCTURE.tileIndex` w wyniku wskazania | Pole pod kursorem (duch podąża za kursorem po budynkach). |
| S2 | Kamera układu | Środek w gwieździe, kadr wszystkich orbit; `focusBodyId` dotyczy kamery planety (poprawiony komentarz w `view.ts`). |
| S3 | Modele dla rodzajów bez odpowiednika KayKit | Na razie `structure_tall`; FARM → `basemodule_A`, GAR → `cargodepot_A`, MLT → `water_storage` przyjęte. |
| S4 | Postój Arki | Jak każdy statek: 1,25 R nad ciałem (port nie jest punktem dokowania). Osobna orbita postojowa później. |
| S5 | Krzywa lotu przechodząca przez gwiazdę (np. e → f) | Znany problem domeny; poprawka w domenie później (K1). |
| S6 | Obrót ducha budynku | Kolejność `tiles` (kotwica pierwsza) wyznacza orientację; bez osobnego pola obrotu. |
| S7 | Etykiety ciał | DOM w pakiecie `render`, usuwany przy zamknięciu widoku. |
| G1 | Warstwy mapy galaktyki | Później, przez nowe pole `ViewInput`. |
| G2 | Polskie nazwy gwiazd | Ze słownika UI (`starNames`), przekazywane do widoku. |
| G3 | Kamera po zaznaczeniu gwiazdy | Bez przesunięcia (później). |
| G4 | Pierścień Mk III, zasięgi napędów jako liczby w domenie | Później; dziś Mk I 5 ly i Mk II 9 ly. |
| G5 | Nazwy gwiazd graczy w mocku | Zostają nazwy systemów z kanwy („Alpha Centauri”); widok rozpoznaje gwiazdę główną. |
| G6 | Kto liczy maszynę Atanora | Widok (podgląd budynku). Produkcja T3 w ekonomii zostaje na liczbach dokumentu (A3). Przeniesienie do mocka po F6. |
| G7 | Tempo maszyny i wejścia z magazynu kolonii | Później; dziś własne takty na sekundę i nieograniczone wejścia. |
| G8 | Kolory materiałów | Propozycja w `packages/render/src/atanor/style.ts`; do DS później. |
| D17 | Poziom L | 1500 budowli zamiast „np. 2000”. Wszystkie ciała Tau Ceti z siatką mają 1870 kafelków, a 80% zostawia łazikom przejazd. 200 statków, 100 łazików. |
| D18 | Budżety F5 | FPS według W18 B: S ≥ 58 (tolerancja vsync), M ≥ 30, L tylko pomiar. Draw calls (uwaga od 100, limit 150), trójkąty (od 200 tys., limit 400 tys.) i pobranie (15 / 25 MB) z `init.md` obowiązują we wszystkich scenariuszach, także L, bo pokazują, gdzie zabraknie zapasu. |
| D19 | Zadania naprawcze F5 | Tylko zapisane w raporcie, bez naprawy w F5: FPS mieści się w budżecie, a odcinanie i LOD to praca nad widokiem po decyzji o docelowej liczbie budowli na ciało. |
| D20 | Ślad Chromium | Zapisywany lokalnie (ok. 16 MB), poza gitem; w repozytorium są raport i `latest.json`. |
| D21 | Miejsce panelu projektanta | Szuflada na ekranie gry (F2), nie osobna trasa: działa na bieżącej grze, a świat zostaje widoczny. |
| D22 | Co znaczy „dokument” w porównaniach | Tabele `computeEconomy()` przy parametrach domyślnych. Dokument ekonomii jest z nich generowany, a `econ:check` pilnuje zgodności. |
| D23 | Zastosowanie parametrów | Dwa tryby: nowa gra (scenariusz od początku) i odtworzenie tej gry (te same rozkazy w tych samych krokach, z liczbą odrzuconych). Bez zmiany parametrów w trakcie gry: ekonomia jest stała w obrębie jednego świata, więc zapis i powtórka pozostają dokładne. |
| D24 | Tempo nominalne a zmierzone | Nominalne: stawka katalogu × współczynnik poziomu przy pełnej mocy i wolnym magazynie, bez wyczerpanych złóż. Zmierzone: zdarzenia `EXTRACTION_TICK` i `BATCH_*` z ostatnich 30 min gry. |
| D25 | Porównanie Atanora (A3) | Oba wiersze przy parametrach dokumentu, żeby różnica była tylko pomiarem. Zmierzone liczby mogą trafić do gry przez szkic (`EconomyParams.atanor`) i „Zastosuj”. Model w dokumencie zostaje na §8.3 do decyzji projektowej. |
| D26 | Kolory wykresów | `--wg-chart-1` #C08400, `--wg-chart-2` #3F86D4: sprawdzone walidatorem palety na tle `--hud-color-hull` (jasność, nasycenie, rozróżnialność przy zaburzeniach widzenia barw, kontrast). Bursztyn sygnałowy DS #FFB000 jest za jasny na znacznik danych. Do DS później, jak G8. |
| D27 | Telemetria | Zbiera od startu każdej gry, także przy zamkniętym panelu (wykres ma historię). Sygnały aktualizowane z migawkami (~10 Hz), nie przy każdym zdarzeniu. |
| D28 | Równoległość e2e | 6 przeglądarek naraz (CI: 2). Przy 12 WebGL programowy (SwiftShader) przeciążał procesor i testy widoków przekraczały czas. |
| D29 | Zwrot E0 | Nie jest parametrem w panelu: k ery E0 = 1 z definicji modelu. |

## 5a. Znane problemy

| ID | Problem | Gdzie |
|---|---|---|
| K1 | Łuk Béziera między ciałami może przejść przez gwiazdę | domena: `TransferSystem` / `BezierPath.arc` |
| K2 | Nakładka 2D w widoku układu to drugi przebieg renderowania; `renderer.info` widzi tylko ostatni, więc liczniki pochodzą ze `stats()` widoku | `packages/render/src/system` |
| K3 | Przy wczytaniu zapisu łazik w drodze zaczyna bieżący odcinek od nowa | domena: `RoverSystem` |

## 6. Pytania otwarte

| ID | Pytanie | Blokuje |
|---|---|---|
| P4 | Adres zdalnego repozytorium | — |
| P7 | Czy przyjąć zmierzone liczby Atanora (A_NAD: obszar 12 zamiast 9) do dokumentu ekonomii (§8.3)? Skutek: moc +1,5 MW, wartość NAD +4% (45,33 → 47,13 kr). | aktualizację dokumentu ekonomii |
| P8 | Docelowa liczba budowli na ciało (od niej zależy, czy odcinanie i LOD z zadań F5 są potrzebne przed betą) | zadania naprawcze F5 |
| P9 | Czy kolory wykresów (D26) i materiałów (G8) dołączyć do design systemu? | — |

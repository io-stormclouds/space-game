# Kolejka pytań do człowieka (krok 1 autonomii)

> **Status:** PYTANIA z audytu z 2026-11-11 (`docs/plan/07-AUTONOMIA.md` §4, zadanie D). Zawiera tylko to, czego nie da się rozstrzygnąć z `docs/DECISIONS.md`, planów, dziennika pomysłów ani kodu.
> **Powiązane:** mapa drogowa `docs/plan/08-MAPA-DROGOWA.md` (zadania E1…E11), propozycje wpisów `docs/analysis/propozycje-decyzji.md`.
> **Konwencja:** ID `P-10…P-52` kontynuują numerację pytań otwartych (P1–P9 są w `web-game/docs/UNIFICATION.md` §5–6). Każda rekomendacja to PROPOZYCJA koordynatora, nie decyzja. FAKT ma odnośnik do pliku.
> **Jak odpowiadać:** wystarczy `P-24: a` albo własna treść. Odpowiedzi trafiają do `DECISIONS.md` poleceniem człowieka.

## Podsumowanie

| Grupa | Pytania | Co blokują |
|---|---|---|
| Start pilotażu (E1) | P-10, P-11, P-12, P-13 | całe E1 |
| Jedno kryterium pilotażu | P-16 | E1-09 (determinizm na `wasm32`) |
| Parametry z wartością domyślną w konfiguracji | P-17, P-18, P-19 | nie blokują E1; blokują wartości produkcyjne w E3 |
| Fundament (E2) | P-20, P-21 | E2-02, E2-03, E2-04 i każdą zmianę reguł w E4+ |
| Galaktyka na serwerze (E3) | P-22, P-23 | E3-05, E4-07 |
| Nowy start (E4) | P-24 … P-30, P-33 | E4-01 … E4-10 |
| Prezentacja (E5) | P-42, P-44, P-45 (częściowo P-43) | E5-04 … E5-10 |
| Treść układów (E6) | P-46, P-47 | E6-02 … E6-04 |
| Dalsze etapy (E7–E11) | P-31, P-32, P-34 … P-41, P-43, P-48, P-49 | zakres i liczby E7–E11 |
| Nieblokujące | P-14, P-15, P-50, P-51, P-52 | porządek pracy i dokumentów |

Razem 43 pytania: 38 blokuje co najmniej jedno zadanie, z tego 5 dotyczy pilotażu (4 start, 1 jedno kryterium).

---

## A. Proces i pilotaż

### P-10 · Budżet kosztu i czasu pilotażu · blokuje: start E1
- **PYTANIE:** jaki jest twardy limit kosztu i czasu zegarowego na pilotaż (07 §6)?
- **FAKT:** 07 §3 wymaga budżetu ustalonego przez człowieka przed startem. Bramka szybka trwa ok. 40 s, `--full` ok. 4–5 min (`docs/reports/gate-last.json`, 2026-11-11).
- **Opcje:** (a) limit czasu na zespół (np. 1 dzień roboczy) i limit kosztu w walucie; (b) limit liczby iteracji i zadań bez limitu kosztu; (c) bez limitu, tylko pomiar.
- **Rekomendacja:** (a) plus twarde stopy z 07 §3 (3 iteracje na zadanie, 2 zablokowane zadania z rzędu). Kwotę podaje człowiek; koordynator zapisuje zużycie w `docs/reports/E1.md`.

### P-11 · Dwa modele: równolegle czy kolejno · blokuje: start E1
- **PYTANIE:** czy porównanie z modelem odniesienia biegnie równolegle, czy jedno po drugim (07 §6)?
- **FAKT:** na tej maszynie nie wolno łączyć `cargo build/test` z e2e i `ng test` (`CLAUDE.md`, „Środowisko”); dwa zespoły naraz dzielą CPU i wspólny `server/target`, więc pomiar czasu byłby zniekształcony.
- **Opcje:** (a) kolejno, z tego samego commita bazowego, w osobnych worktree; (b) równolegle, z osobnym `CARGO_TARGET_DIR` i bez e2e do końca; (c) równolegle na dwóch maszynach.
- **Rekomendacja:** (a). Drugi zespół nie widzi gałęzi pierwszego (osobny worktree, gałęzie `auto/E1` i `auto/E1-ref`).

### P-12 · Gałąź bazowa i porządek gałęzi · blokuje: start E1
- **PYTANIE:** z jakiej gałęzi wychodzi `auto/E1` i co z gałęziami historycznymi (07 §6)?
- **FAKT:** 2026-11-11 `main` = `server-b6` = `1659aa1`, zgodne z `origin/main`; `git branch --no-merged main` jest puste (scalone: `galaxy-b6`, `server-b3-b4`, `server-b4`, `server-b6`, `terrain`, `poc-interior-editor`). Worktree `C:/my-projects/space-game-b6` stoi na `galaxy-b6` (`1c0e604`).
- **Opcje:** (a) baza `main`@`1659aa1`, gałęzie historyczne zostają; (b) baza `main`, gałęzie historyczne i worktree `space-game-b6` usuwa człowiek; (c) inna baza.
- **Rekomendacja:** (a) teraz, (b) po pilotażu (usuwanie gałęzi to decyzja człowieka).

### P-13 · Kto pisze testy akceptacyjne pilotażu · blokuje: start E1 (zadanie E1-01)
- **PYTANIE:** kto przed startem pisze plik testów akceptacyjnych generatora i szkielet API, na którym testy się kompilują?
- **FAKT:** 07 §5 mówi „napisane przez człowieka lub koordynatora przed startem”; `CLAUDE.md` mówi „koordynator planuje i nie koduje”. W kroku 1 koordynator nie mógł dodać plików poza trzema dokumentami.
- **Opcje:** (a) koordynator pisze tylko pliki testów i szkielet sygnatur (wyjątek od „nie koduje”), człowiek je zatwierdza; (b) pisze człowiek; (c) osobny agent-tester, który potem nie jest wykonawcą.
- **Rekomendacja:** (a). Testy startują z atrybutem `#[ignore]`, każde zadanie zdejmuje go ze swoich testów, a weryfikator sprawdza, że treść testów się nie zmieniła.

### P-14 · Zdalne repozytorium i wypychanie gałęzi `auto/*` · nie blokuje
- **PYTANIE:** czy agenci wypychają gałęzie zadań i etapów, i czy przegląd idzie przez pull requesty?
- **FAKT:** `origin` to `https://github.com/io-stormclouds/space-game.git`; plan 01 zakłada GitLab, skille `/gl-*` i `.gitlab-ci.yml` (pliku nie ma). CI nie istnieje: jedyną bramką jest lokalne `tools/gate.mjs`.
- **Opcje:** (a) praca lokalna, wypchnięcie robi człowiek po akceptacji etapu; (b) agent wypycha `auto/*` i otwiera PR na GitHubie; (c) najpierw CI (GitHub Actions) jako osobny etap.
- **Rekomendacja:** (a) w pilotażu; (c) rozważyć po E2. Plan 01 (GitLab) wymaga wtedy aktualizacji przez człowieka.

### P-15 · Numeracja etapów `E<n>` · nie blokuje
- **PYTANIE:** czy etapy mapy 08 zostają jako E1…E11, mimo że `docs/plan/README.md` ma etapy E0–E5 o innym znaczeniu, a dokument ekonomii ery E0–E5?
- **FAKT:** prompt startowy (07 §4) każe numerować etapy „E1…”. W `README.md` E1 = „Zgodność i Rust-core” (wykonane), w ekonomii E1 = era „Kolonia”.
- **Opcje:** (a) zostaje E1…E11, a tabela w `plan/README.md` dostaje dopisek „historyczna, zastąpiona przez 08”; (b) inny prefiks etapów autonomii; (c) numeracja od E6.
- **Rekomendacja:** (a); w tekstach pisać „etap E3” i „era E3”.

### P-16 · Test determinizmu na `wasm32` · blokuje: E1-09
- **PYTANIE:** jak sprawdzić, że generator daje te same bajty w WebAssembly co natywnie (07 §5, kryterium 1)?
- **FAKT:** `cargo test` nie uruchamia celu `wasm32-unknown-unknown` (brak środowiska uruchomieniowego, obcych binariów nie wolno pobierać). Moduł `game_wasm.wasm` ładuje vitest w `web-game/packages/wasm-host`. `game-wasm` ma ręczne ABI (R-13); zmiana `GameApi` wymaga osobnej zgody.
- **Opcje:** (a) eksport tylko do testów w `game-wasm` (np. `sg_galaxy`), poza `GameApi`, plus test vitest porównujący z plikiem wzorcowym nagranym natywnie; (b) nowe żądanie `GameApi` (zmiana kontraktu); (c) pilotaż bez sprawdzenia na `wasm32` (kryterium 1 częściowe).
- **Rekomendacja:** (a).

## B. Generator galaktyki

### P-17 · Model przestrzeni, gęstość i 41 gwiazd rzeczywistych · wartości domyślne w E1, blokuje wartości produkcyjne E3
- **PYTANIE:** jak generowane gwiazdy mają się do 41 gwiazd rzeczywistych i jak gęsta jest galaktyka (W112, #33)?
- **FAKT:** dziś katalog to 41 gwiazd z pliku (`server/crates/game-core/src/galaxy/stars.rs`), huby stoją w czterech z nich (`game-session/src/exchange.rs:41-46`), a pozycje są w parsekach od Słońca. Ustalenie mówi tylko: funkcja (ziarno, współrzędne), leniwie.
- **Opcje:** (a) hybryda: 41 gwiazd zostaje bez zmian, generator wypełnia komórki przestrzeni, z minimalnym odstępem od gwiazd rzeczywistych; (b) tylko gwiazdy generowane, rzeczywiste zostają wyłącznie hubami; (c) gwiazdy rzeczywiste znikają.
- **Rekomendacja:** (a). Gęstość jako parametr; wartość domyślna do testów ok. 0,003 gwiazdy na ly³ (okolica Słońca: około 100 układów w 20 ly, zgodnie z dziennikiem #11), do potwierdzenia.

### P-18 · „Kilka gwiazd” między graczami · wartości domyślne w E1, blokuje E3-04 w produkcji
- **PYTANIE:** ile gwiazd lub lat świetlnych ma dzielić sąsiadów i gdzie trafia nowe konto (W109, W110, W33)?
- **FAKT:** ustalenie #11 (i11): gracze mają się spotkać, ale dzieli ich „kilka gwiazd”. Zasięg startowy to 3–5 gwiazd (Q4′).
- **Opcje:** (a) nowe konto przy istniejącym skupisku, tak by najbliższy gracz był w przedziale od `min_ly` do `max_ly`; (b) nowe skupiska co N kont; (c) losowo w rosnącej kuli wokół hubów.
- **Rekomendacja:** (a) z parametrami w konfiguracji (domyślnie najbliższy sąsiad dalej niż 2 gwiazdy i bliżej niż 6 gwiazd, licząc po najbliższych gwiazdach); wartości do potwierdzenia przed E3.

### P-19 · Zakres treści układu w generatorze · zakres E1-05
- **PYTANIE:** czy w pilotażu generator opisuje też gazowe olbrzymy, księżyce, pasy i flagę cywilizacji tubylczej, skoro symulacja ich jeszcze nie obsługuje?
- **FAKT:** `BodyKind` = Star, Planet, Moon, Asteroid, Belt (`game-core/src/models/body.rs:12-18`). Ustalenia: olbrzymy tylko w niektórych typach układów (Q23 c), cywilizacja w ok. 1% układów jako tło (Q36 a). 07 §5 wymaga zgodności z `Body` i `insolation`.
- **Opcje:** (a) `SystemSpec` opisuje wszystko jako dane, a konwersja do `CelestialBody` pomija typy bez obsługi do etapu E6; (b) pilotaż generuje tylko gwiazdę, planety skaliste i pas.
- **Rekomendacja:** (a); reguły występowania (które typy układów mają olbrzymy, ile księżyców) jako parametry z wartościami domyślnymi, do potwierdzenia w P-47.
- **Do rozstrzygnięcia przy okazji:** które rzadkie materiały są „kluczowe” i w jakiej części układów występują (ustalenie Q29 c, kolejka W51). Do czasu odpowiedzi generator rozdaje złoża wagami z parametrów, bez gwarancji zależności między układami.

## C. Reguły i technika

### P-20 · Nowe reguły przy zamrożonym TS · blokuje: E2-02, E2-03, E4-04, E6-01 i każdą zmianę istniejącej reguły
- **PYTANIE:** jak wprowadzać i testować reguły, które zmieniają istniejące zachowanie (np. koniec darmowego tankowania), skoro wzorce parytetu są nagrane z zamrożonego TS?
- **FAKT:** `CLAUDE.md` nakazuje „nowe reguły tylko w Rust, z parytetem i złotymi powtórkami”. 9 złotych powtórek i wektory pochodzą z TS (`server/conformance/tests/golden.rs`); zmiana reguły w Rust je łamie. Zamrożenie TS nie jest zapisane w `DECISIONS.md` (R-2 mówi tylko, że TS jest „źródłem wzorców do parytetu”); plan terenu zapisuje je pod kolidującym ID „R-20”.
- **Opcje:** (a) reguły wersjonowane na poziomie scenariusza: stare scenariusze i ich powtórki z TS zostają nietknięte, nowe zachowania dostają powtórki nagrane z Rust (regresja) i testy własności; (b) odmrozić TS i utrzymywać dwie implementacje; (c) usunąć TS `sim/` i mock, klient tylko na WASM.
- **Rekomendacja:** (a) teraz, (c) jako cel po dwóch etapach bez rozjazdu (plan 02 §5.2). Dotyczy też typów danych w `packages/domain/src/sim/models` (np. nowy rodzaj ciała): dopuścić rozszerzanie typów bez zmiany reguł TS.

### P-21 · Domyślny tryb klienta · blokuje: E2-04 i zadania klienckie E4
- **PYTANIE:** czy klient ma domyślnie działać na WASM zamiast na mocku TS?
- **FAKT:** domyślny tryb to `mock-ts` (`web-game/apps/game/src/app/game/game-api.ts:28`); `npm run e2e` (jedyny e2e w bramce `--full`) uruchamia projekt `chromium`, czyli mock. Mechaniki pisane tylko w Rust są tam niewidoczne (handel odpowiada `NO_TRADE`).
- **Opcje:** (a) domyślnie `wasm`, mock zostaje dla starych testów i porównań; (b) mock zostaje domyślny, nowe funkcje tylko w trybie `remote`; (c) usunąć mock.
- **Rekomendacja:** (a) razem z rozszerzeniem bramki `--full` o e2e na `wasm` i `remote` (E2-01). Koszt: build klienta wymaga `npm run wasm:build`, moduł ok. 1,4 MB (370 kB gzip).

## D. Galaktyka i nowy start

### P-22 · Rejestr zajętości planet: semantyka · blokuje: E3-05, E4-07
- **PYTANIE:** jak działa wyłączność planety przy instancjonowanych światach (K2)?
- **FAKT:** dziś każde konto ma własną instancję całego układu Tau Ceti (`game-server/src/world.rs:246`, scenariusz domyślny), a usługa galaktyki zna tylko nazwę gwiazdy konta (`GalaxyMsg::Home`). Rejestru nie ma. Włączenie wyłączności na obecnych światach zablokowałoby wszystkich poza pierwszym graczem na Tau Ceti e.
- **Do rozstrzygnięcia:** (1) kiedy powstaje rezerwacja: wybór miejsca kolonii czy postawienie portu; (2) czy dotyczy każdego ciała z siatką (księżyce) i pasów; (3) co gracz widzi o cudzych planetach w swojej instancji; (4) kiedy rezerwacja wygasa (porzucenie, nieaktywność, sezon).
- **Opcje:** (a) rezerwacja przy postawieniu portu, tylko ciała z siatką, cudza planeta widoczna jako zajęta ze znakiem wywoławczym, wygasa przy resecie sezonu; (b) rezerwacja całego układu na czas ochrony nowego gracza, potem jak (a); (c) inaczej.
- **Rekomendacja:** (a). Serwer sprawdza rejestr, zanim wpisze rozkaz portu do dziennika świata (wzorzec `HUB_DELIVERY`).

### P-23 · Sezony a galaktyka · blokuje: regułę resetu w E3-05
- **PYTANIE:** co zamknięcie sezonu robi z odkrytymi układami, rejestrem zajętości i miejscem startu (W30)?
- **FAKT:** R-27: zamknięcie sezonu zeruje rynek, a każdy świat zaczyna od nowa od scenariusza domyślnego; korporacje i sojusze zostają.
- **Opcje:** (a) rejestr zajętości się zeruje, gracz ponownie wybiera start, odkryte układy zostają; (b) gracz wraca do tej samej gwiazdy; (c) nowe ziarno galaktyki co sezon.
- **Rekomendacja:** (a).

### P-24 · Statek startowy: klasa i parametry · blokuje: E4-03
- **PYTANIE:** która z czterech klas jest „najniższą klasą” na start i jakie ma parametry (ładownia lub powierzchnia, bak, załoga, zasięg)?
- **FAKT:** ustalenie Q5: jeden statek międzygwiezdny najniższej klasy, zatankowany na 75% „wg standardowego planu”. Klasy (Q7): frachtowiec, tankowiec, okręt kolonizacyjny, sonda. W kodzie statek ma tylko rolę `Ship` albo `Mothership`, bez klasy i poziomu (`game-core/src/models/ship.rs:20-23`).
- **Opcje:** (a) okręt kolonizacyjny Mk I; (b) frachtowiec Mk I; (c) osobny, piąty typ „statek pionierski”.
- **Rekomendacja:** (a), bo niesie ludzi i zestaw kolonii. Liczby wyznacza model ekonomii i zatwierdza człowiek (P-33).

### P-25 · Zestaw startowy · blokuje: E4-01, E4-03
- **PYTANIE:** co dokładnie leci statkiem startowym (materiały, łaziki, prom, sonda) i ilu ludzi?
- **FAKT:** dziś Arka-1 ma 2000 j. ładunku, 2 łaziki, prom i sondę (`scenarios/tau_ceti.rs:251-276`); port L1 kosztuje STA 120 · BET 80 · UKL 10 (`sim/scenario.rs:46-55`). Ustalenie: „materiały na start kolonii”, załoga z morale 75%; Arka odpada.
- **Opcje:** (a) równowartość dzisiejszej ładowni Arki (tempo ery Lądowania bez zmian); (b) minimum wyliczone z katalogu: port L1, 2 łaziki i materiały na około 10 pierwszych budowli; (c) lista podana przez człowieka.
- **Rekomendacja:** (b), wyliczone w modelu ekonomii jako osobne zadanie z liczbami do zatwierdzenia; test „brak miękkiej blokady” na 500 układach startowych.

### P-26 · Paliwo: jedna pula, koszt skoku, koniec darmowego tankowania · blokuje: E4-04, E4-05
- **PYTANIE:** (1) jakim paliwem lata statek startowy, skoro skok płaci „ta sama pula co loty lokalne” (Q4′ a), a paliwo międzygwiezdne to egzotyczna materia z Atanora (#5); (2) jaki jest wzór kosztu skoku; (3) kiedy kończy się darmowe tankowanie (#3)?
- **FAKT:** statek ma jedno pole `fuel` (`ship.rs:39-40`); lot kosztuje dystans × 0,02 (`sim/constants.rs:28`); po przylocie do bazy bak wraca do pełna za darmo (`sim/systems/docking.rs:19-21`). Paliwo jako materiał powstaje w budowlach ery E2, które nie są grywalne (`PLAYABLE_ERA = 1`, `sim/rules.rs:14`).
- **Opcje:** (a) statek startowy ma jedną pulę zwykłego paliwa; koszt skoku = odległość × stawka klasy, dobrana tak, by 75% baku obejmowało 3–5 gwiazd i zostawiało rezerwę na dolot do każdej planety; darmowe tankowanie zostaje do czasu, aż era E2 będzie grywalna; (b) to samo, ale tankowanie od razu z magazynu, z zapasem paliwa w zestawie startowym; (c) dwa baki: lokalny i skokowy.
- **Rekomendacja:** (a); zmiana tankowania razem z erą E2 (E7), inaczej grozi miękka blokada.

### P-27 · Obrzeża układu i skan potwierdzający · blokuje: E4-06, E4-09
- **PYTANIE:** czym są „obrzeża” w modelu i co ujawnia skan potwierdzający (W100–W104)?
- **FAKT:** dziś statek startuje zadokowany przy gwieździe (`tau_ceti.rs:271`), a skan (`SCAN_SYSTEM`, 15 min) odsłania ciała (`revealed`).
- **Opcje:** (a) obrzeża to pozycja postojowa statku poza najdalszą orbitą, bez nowego rodzaju ciała; skan jak dziś jest obowiązkowy przed wyborem miejsca i odsłania wszystkie ciała z pełnym profilem; (b) nowe ciało „rubież” w `BodyKind`; (c) dwa poziomy skanu (podstawowy i szczegółowy).
- **Rekomendacja:** (a). Dotyczy pierwszego wejścia do układu; przyloty późniejszych statków rozstrzyga P-40.

### P-28 · Pierwszy skan: lista kandydatów startu · blokuje: E4-05, E4-08
- **PYTANIE:** skąd bierze się „kilka możliwości” przy pierwszym skanie i co gracz o nich wie (Q18 a)?
- **Opcje:** (a) serwer od razu podaje 3–5 wolnych gwiazd w zasięgu, spełniających kryteria startu, z danymi szacunkowymi (klasa gwiazdy, szacowana liczba planet); wskazać można tylko gwiazdę w zasięgu paliwa; (b) lista po krótkim skanie w czasie; (c) wszystkie gwiazdy w promieniu, w tym nienadające się na start.
- **Rekomendacja:** (a), bez czekania na starcie.

### P-29 · Kryteria „dobrego startu” · blokuje: E4-02 (i wartości E3-04)
- **PYTANIE:** jakie warunki musi spełnić układ startowy (W31, #12, W4)?
- **Opcje:** (a) co najmniej jedna planeta z siatką, wodą lub lodem (KRI) oraz FER i SIL; nasłonecznienie wystarczające na około 10 MW z paneli w erze Lądowania; co najmniej jedno dodatkowe ciało do ekspansji; czerwone karły wykluczone ze startu; (b) jak (a), ale z czerwonymi karłami jako trybem trudnym; (c) lista od człowieka.
- **Rekomendacja:** (a) jako dane testu własności.

### P-30 · Los Tau Ceti i Arki-1 · blokuje: E4-07, E4-10
- **PYTANIE:** czy scenariusz `tau-ceti` z Arką-1 zostaje jako preset testowy po zmianie startu?
- **FAKT:** W06 A („przylot do Tau Ceti domyślny”) jest w `UNIFICATION.md`; na tym scenariuszu stoją złote powtórki (`kanwa-pierwsza-sesja`), e2e `flow.spec.ts` i adresy `#/scenariusz-*`.
- **Opcje:** (a) zostaje jako preset testowy i demo bez serwera; serwer startuje nowe konta w układzie wygenerowanym; (b) usuwamy po przejściu testów na nowy start.
- **Rekomendacja:** (a).

## E. Ekonomia i zakres

### P-31 · Zakres grywalnych er · blokuje: E7, E8, E9
- **PYTANIE:** w jakiej kolejności ery E2–E4 stają się grywalne i czy wchodzą z nimi odłożone systemy (taśmy i rury D4, potrzeby życiowe i przyrost D5, bufory D6)?
- **FAKT:** `PLAYABLE_ERA = 1` w Rust i TS (`sim/rules.rs:14`, `domain/src/sim/rules.ts:15`). Stocznia, Stacja orbitalna, Terminal handlowy, produkcja paliwa i Fabryka atanorowa należą do er E2–E4, więc ustalenia o flocie, stacjach i handlu nie mają dziś podłoża w symulacji.
- **Opcje:** (a) najpierw nowy start i galaktyka na erach E0–E1 (E3–E4), potem era E2, potem E3; (b) najpierw ery, potem galaktyka; (c) punktowo: tylko budowle potrzebne flocie (Stacja, Stocznia).
- **Rekomendacja:** (a); D4–D6 rozstrzygnąć w analizie E7-01.

### P-32 · „Trzy typy magazynów” a 7 klas składowania · blokuje: E8-01, E8-02, E9
- **PYTANIE:** czy trzy typy z ustalenia Q17 (stałe i kompozyty, gazowe i ciekłe, metamateriały) zastępują 7 klas katalogu?
- **FAKT:** katalog ma klasy: sypkie, sztukowe, płynne, gazowe, kriogeniczne, radioaktywne, egzotyczne (`game-core/data/catalog.json`, `storageClasses`).
- **Opcje:** (a) trzy typy to grupy dla ładowni statków i magazynów stacji (mapowanie 7 → 3), kolonie zostają przy 7 klasach; (b) trzy typy zastępują 7 klas wszędzie (zmiana katalogu i dokumentu ekonomii); (c) inaczej.
- **Rekomendacja:** (a).

### P-33 · Liczby nowych bytów · blokuje: E4-03, E8-01, E8-05, E9-01, E10-02, E11-01
- **PYTANIE:** kto wyznacza liczby (klasy statków i poziomy Mk, poziomy warp, stacja handlowa, laboratorium, teleskop, zestaw startowy)?
- **FAKT:** liczby ekonomii zmienia się tylko przez model (`CLAUDE.md`); dziennik zapowiada tabelę poziomów warp jako propozycję, ale jej nie zawiera (A6).
- **Opcje:** (a) agent przygotowuje wariant w modelu ekonomii jako osobne zadanie „liczby do akceptacji”, człowiek zatwierdza przed zadaniami z regułami; (b) liczby podaje człowiek; (c) liczby tymczasowe, strojone po playteście.
- **Rekomendacja:** (a).

### P-34 · Morale a wydajność i kalibracja ekonomii (K3) · blokuje: E10-03, E10-04
- **PYTANIE:** jak morale przekłada się na wydajność, przy jakim morale liczona jest kolonia referencyjna i jakie technologie odblokowuje 95–100%?
- **FAKT:** skala z ustalenia: poniżej 50% słabo, 70% ok, 85% super, 95–100% odblokowuje technologie wydobycia i przetwarzania. Kalibracja §3.1 dokumentu ekonomii zakłada pełną wydajność (60% mocy na produkcję).
- **Opcje:** (a) wydajność = 0,5 + 0,5 × morale (dno 50% jak w §4.5), kolonia referencyjna przy morale 70%; (b) wydajność = morale; (c) progi skokowe.
- **Rekomendacja:** (a); lista technologii razem z P-36.

### P-35 · Morale bez wnętrz · blokuje: E10-03
- **PYTANIE:** z czego liczyć „powierzchnię zagospodarowaną funkcjami na osobę” (Q33 c), skoro wnętrz w grze nie ma?
- **FAKT:** edytor wnętrz istnieje tylko jako PoC (`poc/space-interior-poc`, katalog tylko do odczytu), z globalnym limitem 3 pokładów i bez pola komfortu.
- **Opcje:** (a) najpierw przenieść edytor wnętrz do gry (duży etap); (b) wskaźnik tymczasowy z poziomów i wyposażenia habitatów jako dane katalogu, z układem domyślnym (założenie A10), wnętrza później; (c) morale odłożone do czasu wnętrz.
- **Rekomendacja:** (b).

### P-36 · System badań: treść · blokuje: E10-02
- **PYTANIE:** jakie badania istnieją, co odblokowują i ile kosztują; czym jest laboratorium?
- **FAKT:** ustalenia Q24 a i K4 a: badania liczy ogólna pula ludzi i laboratoria. W katalogu (45 budowli) laboratorium nie ma, systemu badań nie ma w kodzie ani w dokumentach.
- **Opcje:** (a) krótka lista (do 12 badań: klasy statków, poziomy warp, teleskopy, technologie z progu morale) przygotowana jako dane do akceptacji; (b) pełne drzewko projektuje człowiek; (c) badania po flocie.
- **Rekomendacja:** (a).

## F. Flota i handel

### P-37 · Plan statku w pierwszej wersji floty · blokuje: E8-03, E8-04
- **PYTANIE:** czy flota może ruszyć z planami domyślnymi, zanim powstanie biblioteka planów z wymianą i sprzedażą oraz edytor wnętrz w grze (Q8 b, Q34 c)?
- **Opcje:** (a) na start jeden plan domyślny na klasę i poziom (dane katalogu), biblioteka i edytor w późniejszym etapie; (b) flota dopiero po edytorze wnętrz i bibliotece.
- **Rekomendacja:** (a).

### P-38 · Wielka stacja handlowa: definicja i okres przejściowy · blokuje: E9
- **PYTANIE:** czym jest stacja w modelu (nowa budowla, Terminal handlowy z katalogu, megaprojekt), gdzie stoi („obrzeża układu”), ile kosztuje i co z handlem przed jej zbudowaniem?
- **FAKT:** dziś `SHIP_TO_HUB` wymaga tylko działającego portu (`sim/systems/hub.rs:24`, R-21, R-22); na tym stoją S0–S3 i e2e `hub.spec.ts`, `corp.spec.ts`, `social.spec.ts`. Założenie korporacji wymaga STA w hubie (R-24). Terminal handlowy (TRD) jest w erze E3, niegrywalnej.
- **Opcje:** (a) od razu: bez stacji nie ma dostępu do hubów; (b) okres przejściowy: obecne przesyłki działają, dopóki era stacji nie jest grywalna, potem wymóg stacji w nowym zestawie reguł; (c) inaczej.
- **Rekomendacja:** (b). Wariant (a) odcina dziś cały handel i korporacje.

### P-39 · Wędrowni handlowcy i cumowanie graczy · blokuje: E9-03, E9-04
- **PYTANIE:** czy handlowcy NPC to nowa mechanika lotów między stacjami, czy fabularny obraz dzisiejszych przesyłek (czas 0,5 h + 2 h/ly)?
- **Opcje:** (a) w pierwszej wersji przewoźnik NPC to obecne przesyłki, pokazane jako statek NPC; cumowanie graczy po flocie (E8); (b) pełna symulacja handlowców od razu.
- **Rekomendacja:** (a).

### P-40 · Statek w locie międzygwiezdnym · blokuje: E8-06
- **PYTANIE:** gdzie żyje statek w locie i dokąd przylatuje (W23, W101)?
- **FAKT:** limit offline świata to 12 h (R-5), a loty mają trwać od godzin do dni (#16).
- **Opcje:** (a) w usłudze galaktyki na zegarze serwera; odlot i przylot to rozkazy systemowe w dzienniku świata (wzorzec `HUB_DELIVERY`); przylot zawsze na obrzeża; (b) w świecie gracza.
- **Rekomendacja:** (a).

### P-41 · Model stacji kosmicznej · blokuje: E7-04, E9-01, E10-01
- **PYTANIE:** kto i kiedy projektuje model stacji, pozostawiony jako otwarty (Q31 c)?
- **FAKT:** w kodzie budowle orbitalne to wpisy katalogu bez kafelka, ze wspólną pulą ciała; stacji jako bytu nie ma. Ustalenie Q32 c: budowa na orbicie planety z puli planety, stację można przenieść.
- **Opcje:** (a) osobna sesja projektowa człowieka z agentem przed E7, wynik jako decyzja; (b) na razie Stacja orbitalna jako budowla z poziomami (jak w dokumencie ekonomii), byt z modułami później; (c) stacje poza tą mapą.
- **Rekomendacja:** (b) dla E7, (a) przed E9.

## G. Interfejs, treść i assety

### P-42 · Ikony pixel-art: wykonawca i akceptacja · blokuje: E5-08
- **PYTANIE:** kto rysuje ikony 12×12 i kto je zatwierdza (W42)?
- **FAKT:** styl „A hybrydowy” wybrany na próbkach (Q25/K5); próbki są w artefakcie poza repozytorium. DS ma 10 ikon obrysowych; surowce w HUD to kody trzyliterowe.
- **Opcje:** (a) agent tworzy ikony jako dane (siatka 12×12 w ograniczonej palecie), człowiek zatwierdza stykówkę każdego zestawu; (b) rysuje człowiek lub grafik, agent buduje tylko pipeline; (c) generowanie z modeli 3D.
- **Rekomendacja:** (a), zaczynając od 37 materiałów; paleta sprawdzana testem.

### P-43 · Komunikaty z wyborami: treść i postacie · blokuje: E10-06 (E5-01 tylko w części treści)
- **PYTANIE:** kto pisze dialogi i konsekwencje wyborów, kim jest „AI” (W91) i czy nadawcy to postacie z imionami, czy kategorie (W92)?
- **Opcje:** (a) najpierw warstwa informacyjna (dziennik, powiadomienia, okno z nadawcą-kategorią), potem silnik zdarzeń z wyborami w Rust i 5–10 zdarzeń jako propozycja do akceptacji; (b) całość od razu; (c) treść pisze człowiek.
- **Rekomendacja:** (a).

### P-44 · Plan 06 (U-1…U-8) według rekomendacji? · blokuje: E5-04, E5-05, E5-06
- **PYTANIE:** czy rozstrzygnięcia planu 06 obowiązują wg rekomendacji (awatar generowany, callsign unikalny, 12 kolorów, trasa `#/dowodca`), z U-3 zmienionym przez Q37 c?
- **FAKT:** plan 06 ma status „propozycja”; w `DECISIONS.md` są tylko konta (R-25).
- **Opcje:** (a) tak, wg rekomendacji, U-3 = wariant c; (b) wskazane punkty inaczej.
- **Rekomendacja:** (a).

### P-45 · Encyklopedia etap 1: miejsce · blokuje: E5-10
- **PYTANIE:** gdzie żyje wersja dla zespołu (W19)?
- **Opcje:** (a) pliki Markdown generowane do `docs/encyklopedia/` i sprawdzane w bramce; (b) trasa `#/katalog` w grze (plan 04 D-1); (c) strona Pages.
- **Rekomendacja:** (a) teraz, (b) razem z przeglądarką assetów.

### P-46 · Cywilizacja tubylcza: losowanie · blokuje: E6-04
- **PYTANIE:** czy 1% liczymy na układ, czy dotyczy gwiazd rzeczywistych, czy taki układ może być startowy i co ze skórką `medieval` budowli gracza (W77, W78)?
- **Opcje:** (a) na układ, tylko układy generowane, wykluczone ze startu, skórka bez zmian; (b) inaczej.
- **Rekomendacja:** (a).

### P-47 · Gazowe olbrzymy: reguły i assety · blokuje: E6-02, E6-03
- **PYTANIE:** w których typach układów występują olbrzymy, ile mają księżyców (W41) i czy przed produkcją potrzebny jest PoC wyglądu (nota użytkownika przy Q23)?
- **Opcje:** (a) olbrzymy poza linią śniegu w układach gwiazd F, G, K; 1–4 księżyce; render jako kula z pasami w palecie, bez PoC; (b) najpierw PoC i akceptacja wyglądu; (c) reguły od człowieka.
- **Rekomendacja:** (a) dla danych, (b) dla wyglądu (zrzuty do akceptacji w raporcie zadania).

### P-48 · Wiadomości między graczami: zasady · blokuje: E11-04
- **PYTANIE:** limit pierwszej wiadomości, opóźnienie zależne od odległości (W28), wolny tekst czy szablony, moderacja.
- **FAKT:** ustalenie Q20 c: wystarczy jednostronne odkrycie, odbiorca może wyciszyć, zablokować i odpowiedzieć. Plan 05 §7: filtr słów, zgłoszenia, retencja 30 dni.
- **Opcje:** (a) wolny tekst, jedna wiadomość do czasu odpowiedzi, bez opóźnienia, zasady moderacji z planu 05; (b) opóźnienie jak przesyłki; (c) tylko szablony.
- **Rekomendacja:** (a).

### P-49 · Odkrywanie: parametry teleskopów i skanu · blokuje: E11-01, E11-02, E11-03
- **PYTANIE:** kolejka celów, czasy obserwacji, forma niepewności wyniku, co ogranicza analizę (W72–W76, W25–W27).
- **Opcje:** (a) agent przygotowuje propozycję danych (poziomy teleskopu, czasy, klasy niepewności) do akceptacji, razem z liczbami z P-33; (b) projektuje człowiek.
- **Rekomendacja:** (a), po E4.

### P-50 · Audio · nie blokuje
- **PYTANIE:** czy silnik audio i dźwięki zastępcze (założenie A12) wchodzą do tej mapy?
- **Rekomendacja:** poza E1–E11; osobny etap po E5. Licencje paczek CC0 potwierdza człowiek.

## H. Dokumenty i identyfikatory

### P-51 · Kolizje ID i brak prefiksu dla mechaniki rozgrywki · nie blokuje
- **FAKT:** „R-20” oznacza w `DECISIONS.md` usługę galaktyki, a w planie terenu (`docs/planet-terrain-poc-wnioski-i-plan.md:130`) zamrożenie TS; „M-1” oznacza w `DECISIONS.md` skalę widoku, a w planie 03 serwer MCP Blendera. Legenda `DECISIONS.md` nie ma prefiksu dla statków, ludzi, morale i magazynów.
- **Opcje:** (a) zamrożenie TS zapisać jako R-28, w legendzie dodać prefiks C (kolonia i flota), kolizję M-1 opisać dopiskiem; (b) inne prefiksy; (c) przenumerować stare wpisy.
- **Rekomendacja:** (a).

### P-52 · Założenie Z1 po zmianie startu · nie blokuje E1–E6
- **PYTANIE:** czy cel „zbuduj gwiazdolot i wybierz kolejną gwiazdę” (Z1, potwierdzone) zostaje celem gry w układzie, skoro gracz zaczyna statkiem międzygwiezdnym, a statki międzygwiezdne tworzą rodzinę klas?
- **Opcje:** (a) Z1 zostaje, a gwiazdolot to najwyższa klasa okrętu kolonizacyjnego; (b) nowy cel układu do zaprojektowania; (c) bez celu końcowego (piaskownica i sezony).
- **Rekomendacja:** (a); potwierdzić przed E8.

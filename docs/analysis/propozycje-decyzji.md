# Propozycje wpisów do `docs/DECISIONS.md`

> **Status:** PROPOZYCJA (krok 1 autonomii, zadanie B). Ten plik niczego nie rozstrzyga i nie zmienia `docs/DECISIONS.md`; przeniesienie wierszy wymaga polecenia człowieka (07 §4).
> **Data:** 2026-11-11
> **Źródła:** `docs/analysis/2026-11-11-ustalenia-sesji.md`, rejestr pytań w `docs/analysis/2026-11-11-dziennik-pomyslow.md` (sekcje B i C), `docs/DECISIONS.md`, `web-game/docs/UNIFICATION.md`.
> **Powiązane:** audyt i mapa `docs/plan/08-MAPA-DROGOWA.md`, pytania `docs/analysis/kolejka-pytan.md` (P-10…P-52).

Wiersze w §1 mają układ kolumn rejestru (ID · Data · Pytanie · Opcje · Wybór · Źródło · Status), więc można je przenieść bez przeróbek. „Status” to status proponowany po przeniesieniu. Treść kolumny „Wybór” to USTALENIE użytkownika zapisane w dzienniku; dopiski „szczegóły: P-nn” wskazują, czego ustalenie nie rozstrzyga.

## 0. Konwencja ID (PROPOZYCJA)

| Prefiks | Obszar | Numeracja w tym pliku | Uzasadnienie |
|---|---|---|---|
| G- | galaktyka, układy, start, odkrywanie | G-9 … G-23 | G1–G8 są zajęte w `UNIFICATION.md` §5 |
| C- | **nowy prefiks**: kolonia i flota (statki, ludzie, morale, magazyny, stocznie) | C-1 … C-12 | legenda rejestru nie ma prefiksu dla mechaniki rozgrywki; litera C nie koliduje z istniejącymi oznaczeniami (pytanie P-51) |
| A- | Atanor | A-30 | A1–A29 są w `UNIFICATION.md` |
| S- | social: handel, frakcje, konflikt, wiadomości | S-8 (odpowiedź na pytanie S-8 planu 05), S-12 … S-14 | S-1…S-11 to pytania planu 05 |
| U- | użytkownik i interfejs | U-3 (odpowiedź na pytanie U-3 planu 06), U-9, U-10 | U-1…U-8 to pytania planu 06 |
| D- | dokumentacja | D-6 | D-1…D-5 to pytania planu 04 |
| R-, W- | Rust i workflow | R-28 … R-32, W-5, W-6 (tylko §4) | następne wolne numery |

FAKT: w repozytorium istnieją kolizje ID niezależne od tego pliku („R-20”, „M-1”; zob. P-51).

## 1. Ustalenia użytkownika: propozycje wierszy

### 1.1 Galaktyka, start i odkrywanie

| ID | Data | Pytanie | Opcje | Wybór | Źródło | Status |
|---|---|---|---|---|---|---|
| G-9 | 2026-11-10 | Jak gracz wybiera układ startowy (#4) | A gwiazda na mapie galaktyki i jednorazowy skok / B planeta w jednym układzie | **A**: wybór gwiazdy na mapie galaktyki, paliwo wyznacza zasięg wyboru. **Zmienia W06 A** (`UNIFICATION.md`: domyślny przylot do Tau Ceti) | dziennik, Q1 → „1 a” | obowiązuje |
| G-10 | 2026-11-11 | Zestaw startowy (#4) | a Arka-1 zostaje / b tylko mały statek / c wersja użytkownika | **c**: jeden statek międzygwiezdny najniższej klasy, zatankowany na 75% „wg standardowego planu”, materiały na start kolonii, standardowa załoga, morale 75%. Arka-1 (2000 j., 2 łaziki, prom, sonda) przestaje być startem. Szczegóły: P-24, P-25 | dziennik, Q5 i uwaga #4 (i4) | obowiązuje |
| G-11 | 2026-11-11 | Czym płacony jest skok startowy i jaki jest zasięg | a ta sama pula paliwa co loty lokalne / b osobny ładunek skoku; 3–5 albo kilkanaście gwiazd | **a**, zasięg startowy **3–5 gwiazd** (wbrew rekomendacji agenta: b, 8–12). Wzór kosztu: P-26 | artefakt „Rozstrzygnięcia”, Q4′ | obowiązuje |
| G-12 | 2026-11-11 | Model generatora galaktyki (#33) | a deterministyczna funkcja / b losowo na żądanie / c pula z góry | **a**: układ jest funkcją (ziarno galaktyki, współrzędne); generowany leniwie przy skanie teleskopem i przy zakładaniu konta; zapisywany po odkryciu. Relacja z 41 gwiazdami rzeczywistymi: P-17 | dziennik, Q40 → „A”, #33 | obowiązuje |
| G-13 | 2026-11-11 | Jedna galaktyka i sąsiedztwo graczy (#11, #33) | — | wszyscy gracze grają w jednej galaktyce; generator rozmieszcza gwiazdy tak, by gracze mogli się spotkać, ale dzieliło ich „kilka gwiazd”. Parametry: P-18 | dziennik, #11 (i11), #33 | obowiązuje |
| G-14 | 2026-11-11 | Wyłączność układu (#14) | a jeden gracz na układ / b kilku graczy w układzie | **b**: wyłączność **planety**, nie układu; kolonie tylko na pustych planetach; rejestr zajętości planet w usłudze galaktyki; światy kolonii nadal instancjonowane (WIZ-1 = C bez zmian). Odpowiada na MP-2. Semantyka: P-22 | dziennik, Q19 → b, K2 → a | obowiązuje |
| G-15 | 2026-11-11 | Wybór startu a odkrywanie (#4, #13) | a podstawowy teleskop na statku / b start przydzielany / c lista od gry | **a**; pierwszy skan musi pokazać kilka możliwości i pozwolić wskazać tylko tę w zasięgu. Szczegóły: P-28 | dziennik, Q18 | obowiązuje |
| G-16 | 2026-11-10 | Wynik skanu tranzytowego (#25) | a zawsze prawdziwy, niepełny / b szacunek z niepewnością / c może się mylić | **b**: szacunek z niepewnością, może pominąć planety; księżyców i pasów nie pokazuje (założenie A11). Forma niepewności: P-49 | dziennik, Q35 → „35 b” | obowiązuje |
| G-17 | 2026-11-10 | Przylot do układu (#31) | — | statek dociera na obrzeża układu, gracz dostaje odprawę ze znanymi danymi i potwierdza je skanem, który pokazuje dokładną liczbę planet, ich skład i parametry. Model obrzeży: P-27 | dziennik, #31; ustalenia sesji | obowiązuje |
| G-18 | 2026-11-11 | Teleskopy (#13) | — | teleskopy na statkach i jako osobne satelity; większy i bardziej zaawansowany teleskop = większy promień odkrytych gwiazd; analiza sygnałów wymaga czasu. Parametry: P-49 | dziennik, #13 (i13) | obowiązuje |
| G-19 | 2026-11-11 | Gazowe olbrzymy (#18) | a w każdym układzie startowym / b losowo / c tylko w niektórych typach układów | **c**; nie można na nich lądować, mają księżyce; potrzebne PoC i assety (nota użytkownika). Reguły: P-47 | dziennik, Q23 | obowiązuje |
| G-20 | 2026-11-11 | Co premiuje wymianę i jak silna jest zależność układów (#21) | Q28: a geografia / b bonusy / c oba; Q29: a wymóg / b premia / c kombinacja | Q28 **c** (ekonomia ma nagradzać handel, kontakt i frakcję, a w przyszłości także PvP); Q29 **c**: kilka kluczowych rzadkich materiałów wymaga wymiany, NPC jako zabezpieczenie, reszta to premia | dziennik, Q28, Q29 | obowiązuje |
| G-21 | 2026-11-11 | Cywilizacja tubylcza (#26) | a tło / b partner NPC / c przeszkoda / d zależnie od gracza | **a**: ok. 1% układów ma planetę z nierozwiniętą cywilizacją i bogatymi złożami; na razie bez eksploracji i integracji. Losowanie: P-46 | dziennik, Q36 | obowiązuje |
| G-22 | 2026-11-11 | Parametry gwiazd i strefa życia (#30, #32) | a opis i wygląd / b energia i klimat / c także skład | **a**: na razie tylko opis i wygląd (karta gwiazdy, etykieta strefy życia) | dziennik, Q39 | obowiązuje |
| G-23 | 2026-11-11 | Lot ku gwieździe (#7) | a możliwy ze skutkami / b tylko uzasadnienie / c dotyczy lotów międzygwiezdnych / d inaczej | **d**: na razie niemożliwy, załoga odmawia lotu; bez zniszczeń. Zgodne z D30 (`UNIFICATION.md`); zostaje tylko zmiana komunikatu | dziennik, Q10, Q11 | obowiązuje (odroczone) |

### 1.2 Kolonia i flota (nowy prefiks C)

| ID | Data | Pytanie | Opcje | Wybór | Źródło | Status |
|---|---|---|---|---|---|---|
| C-1 | 2026-11-11 | Statki międzygwiezdne (#1, #2) | tylko gwiazdolot i sonda / rodzina klas | cała rodzina klas z ładownością; **cztery klasy**: frachtowiec, tankowiec, okręt kolonizacyjny, sonda (zwiadowca); większa klasa = więcej pokładów i powierzchni. Poziomy Mk I–III to założenie A1, A2. Liczby: P-33 | dziennik, Q2, Q7 → a | obowiązuje |
| C-2 | 2026-11-11 | Prędkość nadświetlna (#16) | a stała cecha napędu / b wybór przy locie / c oba | **c**: napęd daje maksymalny warp, gracz wybiera warp nie wyższy od maksimum przy każdym locie; prędkość wynika z mocy silnika i paliwa; lot trwa od kilku godzin do kilku dni (założenie A6). Tabela poziomów: P-33 | dziennik, Q21, Q7 | obowiązuje |
| C-3 | 2026-11-11 | Czym jest „plan” statku (#6, #24) | Q8: a badanie lub zakup / b schemat w bibliotece / c poziom stoczni; Q34: a projekt z edytora / b osobny przedmiot / c oba | Q8 **b**: schemat w bibliotece gracza (stworzyć, wymienić, sprzedać); Q34 **c**: do tego projekt wnętrza z edytora jako plan wykonawczy; ładunek = powierzchnia przeznaczona na ładunek w planie. Do opracowania: lista klas modeli planów i definicja powierzchni do zabudowy. Pierwsza wersja: P-37 | dziennik, Q8, Q34, #2 (i2), #6 (i6) | obowiązuje |
| C-4 | 2026-11-11 | Która budowla to „kosmiczna stocznia” (#10) | a Stocznia orbitalna / b Dok gwiezdny / c nowa budowla | **a**: Stocznia orbitalna; wyższe poziomy odblokowują klasy międzygwiezdne, Dok gwiezdny zostaje dla okrętu kolonizacyjnego | dziennik, Q16 | obowiązuje |
| C-5 | 2026-11-11 | Skąd materiały budowy na orbicie (#10, #23) | Q17: a magazyn stacji / b pula ciała / c mieszane; Q32: a wynoszenie / b statek konstrukcyjny / c prefabrykaty | Q17 **b**: z puli planety; Q32 **c** z opisem: budujemy z puli planety, na orbicie planety; stację można przenieść na inną orbitę (drogie). **Zmienia** dok. ekonomii §5.1 (moduły orbitalne z magazynu stacji) | dziennik, Q17, Q32 | obowiązuje |
| C-6 | 2026-11-11 | Pule materiałów i magazyny (#10) | — | pule materiałów mają planety, statki i stacje (magazynujące, handlowe); magazyny trzeba budować (limity); w statkach pojemność wynika z zagospodarowanej przestrzeni w projekcie; trzy typy magazynów: stałe i kompozyty, gazowe i ciekłe, metamateriały. Relacja z 7 klasami katalogu: P-32 | dziennik, Q17 (opis) | obowiązuje |
| C-7 | 2026-11-11 | Ludzie (#8) | Q9: a pojemność / b znikają na czas lotu / c osobny zasób; Q12: a typy kosmetyczne / b trzy pule / c pule i funkcje; Q13: a przyrost i szkolenie / b / c najem | Q9 **a**, Q12 **a**, Q13 **a** z notą „szkolenia nie wymagane”: jedna pula ludzi (per planeta, statek, stacja) rozbudowywana habitatami; typy tylko kosmetyczne; załoga = pojemność. Odpowiada na EXP-3 | dziennik, Q9, Q12, Q13, #8 (i8) | obowiązuje |
| C-8 | 2026-11-11 | Rozwój nauki (#19, #8) | Q24: a system badań / b brak; K4: a ogólna pula i laboratoria | Q24 **a**: system badań; K4 **a**: badania liczy ogólna pula ludzi i laboratoria, bez osobnych naukowców. Treść badań: P-36 | dziennik, Q24, K4 | obowiązuje |
| C-9 | 2026-11-11 | Morale (#22, #24) | Q30: a 100% to norma / b 100% to trudny cel; Q33: a na osobę / b całkowita / c zagospodarowana na osobę | Q30 **b**: poniżej 50% słabo, 70% ok, 85% super, 95–100% odblokowuje nowe technologie (wydobycie i przetwarzanie); Q33 **c** oraz wyposażenie, oświetlenie i kompletność załogi; K3 **a**: przeliczyć kalibrację ekonomii (§3.1). Wzory: P-34, P-35 | dziennik, Q30, Q33, K3 | obowiązuje |
| C-10 | 2026-11-11 | Paliwo statków (#3) | — | każdy statek potrzebuje paliwa (potwierdzone: „tak”). Szczegóły (zwykłe Paliwo z kolonii, koniec darmowego tankowania) to założenie A3: P-26 | dziennik, #3 (i3), A3 | obowiązuje; szczegóły wg rekomendacji |
| C-11 | 2026-11-11 | Model stacji kosmicznej (#23) | a budowla orbitalna / b osobny byt z modułami / c rdzeń i moduły | **bez wyboru: pytanie zostaje otwarte** (w artefakcie „Rozstrzygnięcia” wybrano pozycję „model stacji zostaje otwarty”; to nie jest opcja c pytania Q31). Model, statystyki, klasy, plany i sposób budowy do wypracowania. Zob. P-41 | dziennik, Q31 i „Rozstrzygnięcia” | otwarte |
| C-12 | 2026-11-11 | PoC wydobycia z pasa asteroid (#17) | a–e zakres PoC / b tylko zapisać | **b**: zadanie zapisane na później; nota: struktury w pasie, mechanizm wydobycia, przetworzenia i transportu (wahadłowce, małe statki) | dziennik, Q22 | obowiązuje (odroczone) |
| A-30 | 2026-11-10 | Paliwo międzygwiezdne (#5) | — | bardzo droga egzotyczna materia z Fabryki atanorowej wyższego poziomu; wielkość wytwarzania zależy od budowy procesu w Atanorze (wiele sposobów o różnej efektywności). Zgodne z Z2 i A17 | dziennik, Q3, #5 (i5) | obowiązuje |

### 1.3 Social

| ID | Data | Pytanie | Opcje | Wybór | Źródło | Status |
|---|---|---|---|---|---|---|
| S-8 | 2026-11-11 | PvP (WIZ-6) | brak / ograniczone / pełne | **MVP bez PvP**; PvP projektowane w następnym etapie, frakcje prowadzą wtedy ekspansję (Q27 → c z notą, doprecyzowane w K1 → a). SOC-3 C bez zmian na teraz | dziennik, Q27, K1 | obowiązuje |
| S-12 | 2026-11-11 | Co znaczą „frakcje” graczy (#20) | a frakcje NPC / b stronnictwa sezonowe / c synonim korporacji i sojuszy | **c**: frakcje graczy = korporacje i sojusze (jedna struktura w dwóch rozmiarach); frakcje NPC z R-7 zostają bez zmian | dziennik, Q26 | obowiązuje |
| S-13 | 2026-11-11 | Handel, zanim gracz ma własną flotę (#1) | a tylko własne statki / b przewoźnik NPC / c przesyłki abstrakcyjne | **b z doprecyzowaniem**: przewoźnik NPC dopiero po zbudowaniu wielkiej handlowej stacji kosmicznej (droga budowla; oferty sprzedaży i kupna; wędrowni handlowcy NPC realizują zamówienia między stacjami; stacje na obrzeżach układów; inni gracze mogą cumować i handlować). **Zmieni** R-21 i R-22 (wymóg przesyłek) oraz plan 05 §3.2. Definicja i okres przejściowy: P-38, P-39 | dziennik, Q6 | obowiązuje |
| S-14 | 2026-11-11 | Kontakt z odkrytymi graczami (#14, #15) | a jednostronne / b wzajemne / c jednostronne z blokadą | **c** oraz odbiorca może odpowiedzieć. Odpowiada na SOC-6 w części wiadomości prywatnych. Zasady: P-48 | dziennik, Q20 | obowiązuje |

### 1.4 Interfejs i dokumentacja

| ID | Data | Pytanie | Opcje | Wybór | Źródło | Status |
|---|---|---|---|---|---|---|
| U-3 | 2026-11-11 | Kolor cywilizacji a interfejs (#27) | a tylko świat i mapa / b akcent całego HUD / c domyślnie a i opcjonalny motyw | **c**: domyślnie świat i mapa, do tego opcjonalny motyw interfejsu w ustawieniach; kolory ostrzeżeń, błędów i sukcesu bez zmian. **Zmienia** rekomendację U-3 planu 06 | dziennik, Q37 | obowiązuje |
| U-9 | 2026-11-11 | Styl ikon (#19) | a hybryda / b pixel-art monochromatyczny / c obrys DS | **A hybrydowy**: treści gry (surowce, budynki, statki, planety, awatary NPC) w pixel-art 12×12 z ograniczoną paletą na obrysowym kafelku; chrom UI zostaje obrysowy w DS; paleta bez tonów bliskich #FFB000 i #FF5A4A. Wykonanie: P-42 | dziennik, Q25/K5, artefakt „Style ikon” | obowiązuje |
| U-10 | 2026-11-11 | Komunikaty od załogi, naukowców, komputera i AI (#29) | a tylko informacja / b okno z portretem / c dialogi z wyborami | **c**: dialogi z wyborami i konsekwencjami (styl RPG). Treść i etapy: P-43 | dziennik, Q38 | obowiązuje |
| D-6 | 2026-11-10 | Dla kogo jest encyklopedia (#9) | a zespół / b gracz / c oba | etap 1: **a** (dokumentacja z ID, generowana z danych); etap 2, później: **c** (dwa widoki z jednego źródła). Rozszerza D-1 planu 04. Miejsce: P-45 | dziennik, Q14 | obowiązuje |

## 2. Wpisy i dokumenty, których status się zmienia

| Wpis | Gdzie | Proponowana adnotacja | Uwaga |
|---|---|---|---|
| W06 A (domyślny start: Tau Ceti, Arka-1) | `UNIFICATION.md` §1 | „zmieniona przez G-9, G-10” | los presetu: P-30 |
| D8, D9, D33 (Arka przy gwieździe, ładownia Arki, statek-matka) | `UNIFICATION.md` §5 | „dotyczy presetu Tau Ceti; nowy start: G-10, G-17” | — |
| R-21, R-22 (przesyłki: wymagany działający port) | `DECISIONS.md` | „zmieniona przez S-13” dopiero po odpowiedzi na P-38 | dziś zmiana odcięłaby handel i korporacje |
| S-8, SOC-3 C | plan 05 §11 | S-8 potwierdzone dla MVP | — |
| U-3 | plan 06 §9 | wybór c zamiast rekomendacji | pozostałe U-1…U-8: P-44 |
| §5.1 (moduły orbitalne z magazynu stacji) | dokument ekonomii, wiersze 407 i 458 | zgodnie z C-5: pula planety | dokument generowany: zmiana w `web-game/tools/economy-model/template.md` |
| §3.1, §4.5 (kalibracja przy pełnej wydajności) | dokument ekonomii | przeliczyć wg C-9 (K3) | liczby tylko przez model: P-34 |
| §9 (gwiazdolot z modułów Doku, napędy 12 → 4 h/ly, habitat hibernacyjny) | dokument ekonomii | do przeglądu po C-1, C-2 | P-33, P-52 |
| Z1 (cel układu: gwiazdolot) | `UNIFICATION.md` §1 | bez zmian do odpowiedzi na P-52 | — |
| EXP-3, WIZ-6, MP-2, SOC-6 | `docs/game-design-questions.md` (pole „Decyzja”) | odsyłacze do C-7, S-8, G-14, S-14 | plan 04 §2 zasada 3 |

## 3. Założenia przyjęte bez sprzeciwu (nie są ustaleniami)

FAKT: rejestr dziennika, sekcja B, zawiera założenia A1–A13 zakomunikowane użytkownikowi bez odpowiedzi. PROPOZYCJA: nie przenosić ich jako „obowiązuje”; jeśli mają trafić do rejestru, to ze statusem „wg rekomendacji”.

| Założenie | Treść | Gdzie potrzebne |
|---|---|---|
| A1, A2 | klasa = typ statku, poziom rozbudowy = Mk I–III, także dla klas międzygwiezdnych | C-1, E8 |
| A3 | paliwo międzyplanetarne = zwykłe Paliwo z kolonii; koniec darmowego tankowania | C-10, P-26 |
| A5 | „egzotyczna materia” = Kapsuła fuzyjna i Antymateria | A-30 |
| A6 | loty międzygwiezdne: od kilku godzin do kilku dni; tabela poziomów warp jeszcze nie istnieje | C-2, P-33 |
| A7 | lądowanie na olbrzymie odrzucane jak lot do gwiazdy, bez dalszych skutków | G-19, E6-01 |
| A8 | morale: jedna wartość na lokalizację, mnożnik wydajności z dnem 50% | C-9, P-34 (część o grupach nieaktualna po Q12 a) |
| A9 | na starcie jedna stacja na ciało | C-11, P-41 |
| A10 | pojemność załogi z koi we wnętrzu; układ domyślny daje wartości z tabeli Habitatu | C-9, P-35 |
| A11 | skan tranzytowy: typ planety, okres, temperatura; kolejka celów; ukryta orientacja z ziarna | G-16 |
| A12 | audio: silnik i dźwięki zastępcze z paczek CC0 | P-50 |
| A13 | nazwa cywilizacji jako osobne pole obok znaku wywoławczego | E5-04 |

## 4. Propozycje techniczne koordynatora (nie pochodzą od użytkownika)

Wynikają z audytu kodu; każda wymaga decyzji człowieka (wskazane pytanie).

| ID | Pytanie | Wybór proponowany | Źródło (FAKT) | Pytanie |
|---|---|---|---|---|
| R-28 | Jak wprowadzać reguły po zamrożeniu TS `sim/` | zamrożenie zapisane w rejestrze; reguły wersjonowane na poziomie scenariusza; stare złote powtórki z TS bez zmian; nowe zachowania mają powtórki nagrane z Rust i testy własności | `CLAUDE.md` (zasada R-2), `server/conformance/tests/golden.rs`, plan terenu wiersz 130 | P-20 |
| R-29 | Domyślny tryb klienta i zakres bramki | domyślnie `wasm`; `--full` uruchamia e2e na `wasm` i `remote` | `apps/game/src/app/game/game-api.ts:28`, `tools/gate.mjs` | P-21 |
| R-30 | Tożsamość gwiazd w usłudze galaktyki | stabilny identyfikator gwiazdy i pozycja zamiast nazwy; katalog odkrytych układów jako część stanu galaktyki; brak cichego zastępowania nieznanej gwiazdy przez Tau Ceti | `game-session/src/exchange.rs:115-125` | P-17 |
| R-31 | Kto pilnuje wyłączności planet | usługa galaktyki; serwer sprawdza rejestr przed wpisaniem rozkazu portu do dziennika świata (wzorzec `HUB_DELIVERY`) | `game-server/src/world.rs`, R-21 | P-22 |
| R-32 | Protokół po zmianach galaktyki | wersja 4: mapa gwiazd konta, wybór startu, rejestr zajętości; kontrakt opisany przed implementacją, typy w `packages/api/src/galaxy.ts` | `game-server/src/lib.rs:39`, `packages/api/src/remote.ts:15` | — (zadanie E3-07) |
| W-5 | Tryb pracy | autonomia etapowa wg 07 i mapy 08: gałęzie `auto/<etap>/<zadanie>`, raporty w `docs/reports/` | `docs/plan/07-AUTONOMIA.md` | P-10 … P-13 |
| W-6 | Zdalne repozytorium (P4) | FAKT do odnotowania: `origin` = GitHub `io-stormclouds/space-game`; plan 01 zakłada GitLab | `git remote -v` | P-14 |

## 5. Czego ten plik nie proponuje

- Q15 (słownik pojęć jako osobny artefakt), K5 (próbki stylu ikon, wykonane), K6 (aktualizacja dokumentu w Claude Docs i pamięci): to czynności poza repozytorium, bez wpisu w rejestrze.
- Pytań z kolejki dziennika W1–W112 nie zamieniam w decyzje. Te, które blokują zadania mapy, są zebrane w `kolejka-pytan.md`.
- Otwarte decyzje planu terenu (T-15, T-22, T-23, T-7, T-8) i `UNIFICATION.md` (P7, P8, P9) pozostają otwarte i nie należą do ustaleń z listopada.

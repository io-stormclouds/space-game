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

## 4. Zmiany wyników względem PoC

Wpisy od F1: każdy zmieniony wynik oczekiwany w przeniesionych testach i każda poprawka błędu (W09).

| Test lub obszar | W PoC | W web-game | Powód | Decyzja |
|---|---|---|---|---|
| — | — | — | — | — |

## 5. Pytania otwarte

| ID | Pytanie | Blokuje |
|---|---|---|
| P1 | Kanwa przełącza widoki klawiszami F1–F3, ale w przeglądarce F1 otwiera pomoc, a F3 wyszukiwanie. Jakie klawisze zamiast nich? | F3 |
| P2 | W08 A wymaga planszy Atanora w stylu DS, a w kanwie jej nie ma. Projektuję ją w kanwie przed F4? | F4 |
| P3 | Kanwa używa ikon, których DS nie ma (prom, raport, ładownia, taśma, energia, łazik i inne). Dodać je do `design-system/src/icons/icon-paths.ts`? | F3 |
| P4 | Adres zdalnego repozytorium (np. GitLab). Bez niego nie działają zadania z `/gl-plan`. | — |
| P5 | Czy przenieść decyzje do dokumentów: pola „Decyzja” w `docs/game-design-questions.md` (np. TECH-4, TECH-5) i status Z1–Z6 w `docs/economy-expansion-design.md` (przez `template.md`)? | — |
| P6 | Sprzęt referencyjny dla celów W18 (W17: laptop ze zintegrowanym GPU). Jaki konkretnie model? | F5 |

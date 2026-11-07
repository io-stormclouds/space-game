# Fabryka atanorowa — propozycja rozbudowy

Stan: propozycja do decyzji (2026-11-07). Dotyczy Atanora w `poc/space-atanor` (tylko do odczytu), w `web-game` (domena, widok, HUD) i rozdziału 8 w `docs/economy-expansion-design.md`.

## Jak czytać

- **Fakt** wynika z kodu albo z dokumentu. Podaję plik i linię. Ścieżki web-game są względem `web-game/`, ścieżki PoC względem `poc/space-atanor/src/`.
- **[P]** oznacza moją propozycję lub założenie.
- **Pytanie** to rzecz do decyzji. Każde ma opcje i rekomendację (rozdz. 7).

## 1. Streszczenie

- **Dziś** Atanor w web-game odtwarza rozwiązania wzorcowe. Silnik jest pełny i poprawiony, ale widok nie ma edytora, osi czasu ani statystyk. Nie jest związany z żadnym budynkiem i nie wpływa na ekonomię. Fabryki atanorowej nie da się zbudować: to budynek ery 3, a grywalne są ery 0–1.
- **[P] Atanor staje się widokiem konkretnego budynku.** Gracz otwiera go z karty Fabryki atanorowej na planecie. Projektuje maszynę (edytor i oś czasu z PoC, uzupełnione o brakujące elementy), sprawdza ją w próbie i wdraża.
- **[P] Wdrożona maszyna produkuje w symulacji.** Bierze porcje z magazynu ciała, oddaje produkt do magazynu, pracuje w takcie zegara gry i pobiera moc wyliczoną z projektu. Projekt gracza decyduje o przepustowości, mocy i koszcie, czego dziś nie ma.
- **[P] Statystyki łączą projekt z produkcją surowców.** Cykle na sztukę dają przepustowość, obszar i ramiona dają moc, elementy dają koszt w materiałach. Bilans wejść pokazuje, czy wąskim gardłem jest maszyna, czy dostawy (w przykładzie z rozdz. 4 jest nim Platynit).
- **[P] Plan w web-game ma 6 kroków (AT1–AT6).** Pierwsze trzy dają grywalny edytor i nie zmieniają ekonomii.

## 2. Stan obecny (fakty)

### 2.1 Atanor w PoC

| Element | Co jest | Źródło |
|---|---|---|
| Oś czasu | Stała siatka 16 kolumn × ramiona. Kliknięcie wstawia wybrany rozkaz, prawy przycisk czyści, głowica podświetla kolumnę | `app/components/timeline/timeline.component.ts:238`, `:251-263` |
| Paleta rozkazów | 12 pozycji z klawiszami: GRAB `Q`, DROP `W`, obroty `E` `R`, pivot `T` `Y`, tłok `U` `I`, szyna `O` `P`, REPEAT `X`, czyszczenie `Del` | `app/components/command-palette/command-palette.component.ts:102-115` |
| Pasek budowy | Zaznacz, Ramię L1, Ramię L2, Tłok, Bonder, Unbonder, Usuń, obrót podglądu. **Brak** glifu transmutacji, szyn i ramienia L3 | `app/components/build-toolbar/build-toolbar.component.ts:152-160` |
| Edycja | Każda zmiana sprzętu resetuje przebieg. Nowe ramię dostaje GRAB w kolumnie 0. Portów nie można usunąć | `app/services/game-state.service.ts:366-374`, `:295`, `:354-356` |
| Sterowanie | Play/Pauza, Krok, Reset, tempo 0,5 / 1 / 2 / 4×, wybór poziomu | `app/components/control-bar/control-bar.component.ts:14-53`, `:82-93`, `:266` |
| Liczniki | PRODUKTY n/N, KOSZT, CYKLE, OBSZAR. CYKLE pokazuje pozycję głowicy, a nie liczbę ticków (błąd naprawiony w web-game) | `control-bar.component.ts:57-79`, `:72` |
| Panel dydaktyczny | Opis poziomu, 4 fazy ticka, lista atomów i wiązań | `app/components/educational-panel/educational-panel.component.ts:20-79` |
| Histogramy, ranking, zapis projektu, eksport GIF | **Nie ma ich w kodzie.** Opisuje je tylko `mechanics.md:31-41` jako cechę *Opus Magnum* | przeszukanie `src/` |

### 2.2 Atanor w web-game

- **Silnik (domena):**
  - port PoC z czterema poprawkami;
  - skończone zasoby wejść (`supply`, `starved`);
  - pomiar przepustowości w stanie ustalonym;
  - limity poziomów budynku (`validateMachine`) i koszt maszyny w materiałach (`machineMaterials`).

  Źródła: `packages/domain/src/atanor/README.md:20-45`, `engine/building.ts:27-33`, `:62-112`, `:123-147`.
- **Receptury:** 2 z 5 mają poziom i rozwiązanie wzorcowe (A_NAD, A_KAT). A_MET, A_KAP i A_PRO istnieją tylko w katalogu ekonomii (`atanor/README.md:51-54`, `economy/catalog-data.ts:185-189`).
- **Widok:**
  - odtwarza rozwiązanie wzorcowe wybranej receptury;
  - karta ma rozkazy Uruchom/Wstrzymaj `P`, Krok `K`, Od nowa `R`, Następna receptura `L` i Szybciej `F` (`apps/game/src/app/game/commands.ts:120-145`);
  - panel pokazuje 4 liczby (ticki, dostarczone wobec celu, cykle na produkt, obszar) i ewentualny JAM (`hud/selection-panel.ts:21-36`);
  - `readout()` zwraca więcej, bo także koszt, zużycie wejść na sztukę i liczby z §8.3, ale HUD tego nie pokazuje (`packages/render/src/atanor/README.md:23-29`).
- **Braki opisane w README widoku:** brak edytora i edycji osi czasu, brak przesuwania planszy, wejścia nieograniczone, produkt nie trafia do gry, silnik żyje w widoku (`packages/render/src/atanor/README.md:72-79`). Ostatni punkt łamie zasadę „sceny nie trzymają stanu gry” (`packages/render/src/view.ts:5`).
- **Dostęp:**
  - widok jest czwartą zakładką, zawsze dostępną (D13, `docs/UNIFICATION.md:278`);
  - karta budynku ma „Otwórz Atanor” tylko dla `ATN` (`commands.ts:342`), ale gracz nie zbuduje ATN, bo to era 3, a katalog pokazuje budynki do ery 1 (`economy/catalog-data.ts:240`, `sim/rules.ts:13`, `:130`);
  - żaden scenariusz nie stawia ATN (przeszukanie repozytorium).
- **Ekonomia:**
  - ATN w symulacji to zwykły budynek wsadowy z recepturą `A_NAD`;
  - czas i moc biorą się z liczb dokumentu §8.3 (albo ze zmierzonych liczb wstawionych w panelu projektanta, A3 i D25), a nie z maszyny gracza (`sim/systems/production-system.ts:31-66`, `economy/economy-model.ts:121-131`);
  - wejścia pochodzą z puli magazynu ciała, bez taśm (`production-system.ts:19`).
- **Zegar:**
  - 1 minuta modelu trwa 60 s przy ×1, 1 s przy ×60 i 0,1 s przy ×600 (`sim/systems/game-clock.ts:2-5`, `:20`);
  - takt Atanora L1 to 1,0 min na cykl (`economy/economy-model.ts:64`);
  - maszyna L1 wykonywałaby więc w grze 1 tick na minutę przy ×1, 1 tick/s przy ×60 i 10 ticków/s przy ×600 (wyliczone). PoC przy 1× wykonuje 1,67 ticka/s.

### 2.3 Luka

| Element | PoC | web-game | [P] Potrzebne |
|---|---|---|---|
| Edytor sprzętu | 7 narzędzi, bez transmutacji i szyn | brak | wszystkie elementy dozwolone poziomem budynku, cofnij/ponów |
| Oś czasu | 16 kolumn, kliknięcie / prawy przycisk | brak | długość programu, kopiowanie, wstawianie kolumn, JAM i głód na osi |
| Statystyki | 4 liczniki | 4 liczby w panelu | metryki, ekonomia sztuki, bilans wejść, porównanie wariantów, historia produkcji |
| Wejście do widoku | cały ekran gry | zakładka globalna | z karty budynku na planecie |
| Wpływ na grę | — | brak (liczby dokumentu) | produkcja z projektu gracza |

## 3. Propozycja: Atanor jako widok budynku

### 3.1 Wejście z planety [P]

- **Wejście:** Fabryka atanorowa stoi na planecie jak inne budynki (7 pól, `catalog-data.ts:240`). Budowa w web-game już obsługuje 7 pól: pole i jego sześciu sąsiadów, poza pięciokątami (`packages/domain/src/sim/math/footprint.ts:19`). Po jej zaznaczeniu karta ma rozkaz „Maszyna” (`A`), który otwiera widok Atanor **tego** budynku. `Esc` wraca na planetę i zachowuje zaznaczenie.
- **Nagłówek widoku:** ciało, budynek i jego poziom, receptura oraz stan maszyny: Projekt, Próba, Wdrażanie, Produkcja, Czeka na wejścia albo Pełny magazyn.
- **Czwarta zakładka znika** z przełącznika widoków. Lekcje PoC L1–L4 i receptury bez budynku przechodzą do „Piaskownicy” w panelu projektanta (`F2`), żeby dalej dało się je testować.
- **Scenariusz testowy:** żeby dało się to sprawdzić mimo limitu ery, dochodzi `#/scenariusz-fabryka`: kolonia z ery 3, HQ L3, Fabryka atanorowa L1, magazyn z MIE, PLA, H2 i KRZ oraz zapas energii. ATN zostaje poza katalogiem ery 0–1 (W07 B), bo stawia go scenariusz.

### 3.2 Cykl życia maszyny [P]

```
Projekt (szkic) ──► Próba ──► Wdrożenie ──► Produkcja
      ▲                                        │
      └──────────── Przebudowa (nowy szkic) ◄──┘
```

- **Projekt.** Edycja planszy i osi czasu nic nie kosztuje. Szkic należy do budynku i jest częścią stanu gry, więc przeżywa zapis i powtórkę.
- **Próba.** Szkic działa na nieograniczonych wejściach, w tempie widoku (0,5–4× jak w PoC), bez wpływu na zegar gry. Próba jest udana, gdy pomiar znajdzie okres maszyny (powtórzenie pełnego stanu, `measureThroughput`) bez JAM. Wtedy odblokowuje się „Wdróż”.
- **Wdrożenie.** Szkic staje się programem budynku. Z magazynu schodzą materiały maszyny (`machineMaterials`), czyli tylko różnica względem poprzedniej maszyny. Zwrot i czas wdrożenia to pytania 4 i 5.
- **Produkcja.** Symulacja wykonuje ticki programu w takcie zegara gry. Silnik i program są te same co w próbie.

  **Wniosek z kodu (do potwierdzenia testem):** gdy wejść brakuje, cały tick się nie wykonuje (`packages/domain/src/atanor/engine/simulation.ts:179-182`). Ciąg wykonanych ticków jest więc taki sam jak w próbie, a maszyna z udaną próbą w produkcji może tylko czekać na wejścia, ale nie zablokuje się.
- **Przebudowa.** Edycja wdrożonej maszyny tworzy nowy szkic. Stara maszyna pracuje do chwili wdrożenia nowej, więc projektowanie nie powoduje przestoju.

### 3.3 Produkcja w ekonomii [P]

| Wielkość | Dziś | Propozycja |
|---|---|---|
| Czas na sztukę | cykle z §8.3 × takt | cykle na sztukę **wdrożonego programu** × takt poziomu × sprawność energii (Z4), jak w `production-system.ts:36` |
| Moc | §8.3: obszar i ramiona z dokumentu | wzór §8.1 (moc bazowa + 0,5 MW na heks obszaru + 1 MW na ramię) na **wdrożonej maszynie** (`economy-model.ts:126-131`) |
| Wejścia | cała partia z puli przy starcie | porcja na atom, pobierana, gdy port jest pusty (`portion`). Atomy czekające na portach to produkcja w toku (A2) i przy zatrzymaniu wracają do magazynu |
| Wyjście | partia na końcu | 1 produkt na każdą dostarczoną cząsteczkę. Gdy produkt się nie mieści (Z3), maszyna staje jak przy pełnym magazynie |
| Koszt budynku | katalog | katalog plus materiały maszyny |

**Wykonanie w mocku (pytanie 3):**

- **(a) Silnik w workerze.** Mock trzyma silnik każdej wdrożonej maszyny i wykonuje jej ticki według zegara. Przy ×600 i takcie 1 min to 10 ticków/s na budynek, więc tanio. Widok rysuje migawkę maszyny z mocka, wysyłaną tylko dla otwartego budynku, z interpolacją jak dziś. Warunek: stan silnika (atomy, wiązania, ramiona, bufory, głowica) musi być danymi w `WorldState`, żeby zapis i powtórka zostały dokładne.
- **(b) Model okresowy.** Mock liczy produkcję z okresu zmierzonego w próbie, a silnik działa tylko w widoku.

Rekomenduję **(a)**. Tylko wtedy widok pokazuje prawdziwą maszynę, a zasada „sceny nie trzymają stanu gry” (`view.ts:5`) jest spełniona. Skutek dla A3, D25 i P7: liczby z §8.3 zostają wzorcem do wyceny NPC (wartość bazowa), a produkcja gracza idzie z jego maszyny.

## 4. Atanor w łańcuchu produkcji surowców [P]

Panel „Wejścia” w widoku budynku podaje dla każdego materiału na porcie:

- zużycie na godzinę przy obecnym projekcie;
- dostawy na godzinę od producentów na tym ciele (z `nominalFlows`);
- zapas w magazynie i czas do jego wyczerpania;
- oznaczenie wąskiego gardła.

Obowiązuje zasada §8.5 p. 1: przepustowość = min(projekt, dostawy).

**Przykład z liczb dokumentu** (§4.2 i §8.3; przeliczenia moje):

| Wejście NAD | Zużycie przy rozwiązaniu wzorcowym (12 min/szt. = 5 szt./h) | Dostawy jednego budynku L1 | Źródło dostaw |
|---|---|---|---|
| Miedź (MIE) | 2 / szt. → 10 /h | Huta: 4 Kupryt → 2 Miedź w 4 min → 30 /h | `economy-expansion-design.md:215` |
| Platynit (PLA) | 1 / szt. → 5 /h | Górnik asteroidowy: 5 PLA na wyprawę 75 min → **4 /h** | `:210` |
| Wodór (H2) | 10 / szt. → 50 /h | Elektrolizer: 20 H2 w 4 min → 300 /h | `:219` |

Jeden górnik pozwala więc na 4 NAD/h, czyli mniej niż daje maszyna wzorcowa. Maszyna 2× szybsza z §8.4 (6 cykli, 10 NAD/h) potrzebuje 10 PLA/h, czyli 2,5 górnika. Gracz widzi, że lepsza maszyna opłaca się dopiero z lepszym zaopatrzeniem w surowce. To jest właściwa pętla: projektowanie i logistyka surowców napędzają się nawzajem.

**[P] Ten sam panel „Produkcja”** (szt./h, wejścia, wąskie gardło) dostają zwykłe budynki przetwórcze: Huta, Topielnik i inne. Edytora nie dostają (Z2).

## 5. Edytor, oś czasu i statystyki [P]

### 5.1 Edytor (rozbudowa PoC)

- **Narzędzia na karcie rozkazów 4×2:** Ramię (długość 1–3 kolejnym naciśnięciem), Tłok, Łącznik, Rozłącznik, Transmutacja, Szyna, Usuń, Próba/Wdróż. Wymaga naprawy K4, bo drugi rząd karty jest dziś ucięty.
- **Limity poziomu budynku:** narzędzie niedostępne na tym poziomie jest zablokowane i podaje powód. Transmutacja wchodzi od L2, szyny i ramię L3 od L3, ramiona wieloramienne od L4 (`building.ts:27-33`). Kody błędów ustawienia daje `validateMachine` (OFF_BOARD, TOO_MANY_ARMS…).
- **Podgląd:** duch elementu na planszy, obrót `R` i zielone albo czerwone pole, jak przy budowie na planecie.
- **Elementy:** kliknięcie zaznacza element i otwiera panel parametrów (długość, obrót, tłok). Przeciągnięcie przesuwa element.
- **Cofnij i ponów:** `Ctrl+Z` / `Ctrl+Y` (PoC tego nie ma).
- **Na żywo:** koszt w materiałach, moc, liczba ramion wobec limitu, obszar.
- **Start projektu (POC-4, rekomendacja C):** pierwsza receptura dostaje podpowiedź (rozstawione ramiona bez programu), kolejne startują z pustą planszą. Rozwiązanie wzorcowe można obejrzeć w Piaskownicy.

### 5.2 Oś czasu (rozbudowa PoC)

- **Układ:** wiersz na ramię (numer i znacznik jak na planszy), kolumna na cykl. Długość osi to długość programu do REPEAT plus zapas, a nie stałe 16 kolumn.
- **Paleta:** klawisze PoC (`Q W E R T Y U I O P X Del`), aktywne, gdy oś ma fokus. Bez fokusu działają klawisze karty.
- **Edycja:**
  - kliknięcie wstawia rozkaz, prawy przycisk czyści (jak w PoC);
  - przeciągnięcie przenosi rozkaz;
  - zaznaczony zakres można kopiować i wklejać;
  - można wstawić i usunąć kolumnę we wszystkich ramionach naraz.
- **Głowica i licznik ticków osobno** (poprawka b z `atanor/README.md:25`).
- **Znaczniki:**
  - JAM w kolumnie i w wierszu ramienia, które go spowodowało;
  - w produkcji pasek nad osią pokazuje ticki czekania na wejścia;
  - rozkaz niewykonalny dla ramienia (EXTEND bez tłoka, TRACK bez szyny) jest oznaczony przed uruchomieniem.
- **Przewijanie w próbie:** kliknięcie nagłówka kolumny pokazuje stan w ticku t. Silnik jest deterministyczny, więc wystarczy przeliczyć od zera.

### 5.3 Statystyki

1. **Pasek metryk** (zawsze widoczny): Produkty n/N w próbie albo szt./h w produkcji, cykle na sztukę, obszar, ramiona wobec limitu, koszt (kr, po rozwinięciu materiały), moc w MW.
2. **Panel „Maszyna”** zastępuje dzisiejsze 4 liczby i pokazuje:
   - **ekonomię sztuki:** czas = cykle × takt i koszt jednostkowy według wzoru §4.1 przy tej maszynie, w porównaniu z wartością bazową. Przykład z dokumentu: maszyna z §8.4 obniża koszt NAD z 45,3 do 36,7 kr. Przykład z pomiaru: rozwiązanie wzorcowe zmierzone w web-game (obszar 12 zamiast 9) podnosi koszt do 47,1 kr (P7, `docs/UNIFICATION.md:333`);
   - zużycie wejść na sztukę i produkcję w toku;
   - wykorzystanie ramion (odsetek ticków z ruchem) i czekanie portów;
   - różnice względem wzorca w cyklach, obszarze, koszcie i mocy;
   - **warianty:** tabelę zapisanych szkiców tej receptury z tymi samymi metrykami i wyborem szkicu do wdrożenia.
3. **Historia produkcji budynku** w czasie gry: szt./h, odsetek czasu czekania, moc (z dziennika zdarzeń).
4. **Histogramy** cykli, kosztu i obszaru w stylu *Opus Magnum* (`mechanics.md:31-41`) mają sens dopiero przy populacji rozwiązań innych graczy (SOC-4). Do tego czasu wystarczy tabela wariantów (pytanie 10).

Wykresy według zasad dataviz z F6: jedna oś na wykres, legenda i widok tabeli. Kolory czekają na P9.

## 6. Bardziej zaawansowana mechanika [P]

Kolejność według wartości dla gry. Koszt pracy: S (mały), M (średni), L (duży).

| # | Mechanika | Po co | Podstawa | Koszt |
|---|---|---|---|---|
| 1 | Produkcja z projektu (3.2–3.3) | Projekt gracza wyznacza przepustowość, moc i koszt | §8.4, WIZ-2 (hybryda A/B) | L |
| 2 | Bilans wejść i bufory portów (rozdz. 4) | Łączy Atanor z produkcją surowców i pokazuje wąskie gardła | §8.5 p. 1, A1, A2 | M |
| 3 | Poziom budynku odblokowuje elementy i powiększa planszę | Rozbudowa ATN daje nowe narzędzia, czyli progresję w budynku | §8.1, `building.ts:27-33` (dane gotowe) | S |
| 4 | Kolizje trajektorii i ramion, obszar z przebytej drogi | Uczciwe metryki, bez przenikania ramion | §8.5 p. 3–4, POC-5, POC-6 | M |
| 5 | Receptury A_MET, A_KAP, A_PRO | Pełna drabina T3/T4 | §8.3, `catalog-data.ts:187-189`, EXP-6 | M (cząsteczki i rozwiązania wzorcowe do zaprojektowania) |
| 6 | Ramiona wieloramienne (L4) | Nowe strategie na dużej planszy | §8.1 | M |
| 7 | Druga plansza (L5) | Dwa programy naraz: dwie receptury albo dwie linie jednej | §8.1, `building.ts:23` | L |
| 8 | Produkty uboczne (opcja) | Drugi port wyjścia odbiera odzyskaną porcję (np. H2 po rozerwaniu wiązania), która wraca do magazynu i obniża koszt sztuki jak koprodukty | §4.1 (koprodukty); nowa mechanika | M |
| 9 | Biblioteka projektów, plik projektu, weryfikacja przez powtórkę | Dzielenie się projektami i ranking | §8.4, SOC-4 | M |
| 10 | Zlecenia NPC (opcja) | Cel optymalizacji przed rynkiem graczy, np. „wyprodukuj N MET do czasu T” z premią | WIZ-2, opcja C | M |

Celowo pomijam wiązania podwójne i potrójne, kalcynację i duplikację z `mechanics.md`, zgodnie z rekomendacją POC-6 (minimum w MVP, później zestaw własny).

## 7. Układ ekranu (szkic) [P]

Liczby są przykładowe. Moc 14,0 MW i koszt 47,1 kr dotyczą zmierzonego rozwiązania wzorcowego A_NAD. Dostawy są z przykładu w rozdz. 4.

```
┌ pasek górny: zasoby · czas · tempo · Planeta / Układ / Galaktyka ──────────────────────────┐
│ ← Tau Ceti e · Fabryka atanorowa L1 · A_NAD Nadprzewodnik · PRODUKCJA · 4,0 szt./h         │
├──────────────────────────────────────────────────────────────┬─────────────────────────────┤
│                                                              │ MASZYNA                     │
│                                                              │ cykle/szt. 12   obszar 12   │
│              plansza heksów (PixiJS)                         │ ramiona 2/3     moc 14,0 MW │
│     porty WEJ/WYJ, ramiona, glify, szyny, duch narzędzia     │ koszt sztuki 47,1 kr        │
│                                                              │   (wzorzec dok. 45,3 kr)    │
│                                                              │ WEJŚCIA  zużycie/h  dost./h │
│                                                              │ MIE        10        30     │
│                                                              │ PLA         5         4  ▲  │
│                                                              │ H2         50       300     │
├────────────────┬─────────────────────────────────────────────┴─────────────────────────────┤
│ KARTA 4×2      │ OŚ CZASU   0  1  2  3  4  5  6  7  8  9 10 11 ⮌    paleta Q…P X Del       │
│ Ramię   Tłok   │ Ramię 1    ●  ↻  ↻  ○  ↺  ↺  ·  ·  ●  …                                    │
│ Łącz.   Rozł.  │ Ramię 2    ·  ·  ●  ⤾  ○  …                                                │
│ Trans.  Szyna  │ czekanie   ▒           ▒▒                                                  │
│ Usuń    Próba  │                                                                            │
└────────────────┴────────────────────────────────────────────────────────────────────────────┘
```

Kanwa nie ma planszy Atanora (P2). Po akceptacji rozdziałów 3–5 ekran powstaje z komponentów DS w web-game, a zrzut trafi do `web-game/docs/`.

## 8. Plan w web-game [P]

| Krok | Zakres | Testy | Ekonomia |
|---|---|---|---|
| AT1 | Wejście z budynku: scenariusz `fabryka`, rozkaz „Maszyna” (`A`) na karcie ATN, widok związany z `structureId`, `Esc` wraca. Zakładka 4 przechodzi do Piaskownicy w `F2` | e2e: zaznacz ATN na planecie → widok budynku → `Esc` | bez zmian |
| AT2 | Edytor i oś czasu: szkic i próba w widoku, narzędzia z limitami poziomu, cofnij/ponów. Wymaga K4 | jednostkowe testy edycji (jak `src/tests/editing.spec.ts` w PoC); e2e: prosta maszyna L1 dostarcza 6 sztuk | bez zmian |
| AT3 | Statystyki: pasek metryk, panel „Maszyna”, warianty szkiców, panel „Produkcja” dla zwykłych budynków | liczby panelu zgodne z `measureAtanorSolution` i modelem ekonomii | bez zmian |
| AT4 | Produkcja w mocku: `GameApi.atanorDeploy(structureId, solution)`, silnik w workerze, wejścia z magazynu, produkt do magazynu, moc z maszyny, materiały maszyny, migawka dla otwartego budynku, stan silnika w zapisie | szt./h zgodne z pomiarem; czekanie przy braku PLA; powtórka daje ten sam stan | **zmienia** (A3, D25, P7) |
| AT5 | Silnik: kolizje trajektorii, obszar z drogi, ramiona wieloramienne, receptury A_MET / A_KAP / A_PRO z rozwiązaniami wzorcowymi; potem L5 | testy silnika jak w `packages/domain/src/atanor/tests` | nowe receptury |
| AT6 | Biblioteka projektów: zapis per receptura, plik projektu, weryfikacja przez powtórkę; histogramy, gdy będzie populacja (SOC-4) | import obcego pliku odrzucony; powtórka potwierdza metryki | — |

Pytania 8–14 z `packages/domain/src/atanor/README.md:75-81` (plansza, tłok na L1, automatyczne puszczanie, definicja obszaru, koszt szyn, ułamkowe cykle, źródło danych receptur) są rozstrzygnięte w `web-game/docs/UNIFICATION.md` jako A8–A14. Obszar z przebytej drogi (A11 „później”) wchodzi w AT5.

**Status (2026-11-07):** użytkownik przyjął rekomendacje pytań 1–11. W rejestrze web-game są zapisane jako A15–A25 oraz D37 (naprawa K4). Zrobione: AT1–AT4, AT5 bez drugiej planszy L5, AT6 w wersji minimalnej (plik projektu z weryfikacją pomiarem; ranking i histogramy po SOC-4). Szczegóły i testy: `web-game/docs/UNIFICATION.md` §3e.

## 9. Pytania do decyzji

| # | Pytanie | Opcje | Rekomendacja |
|---|---|---|---|
| 1 | Czy „fabryka” to Fabryka atanorowa? Czy zwykłe fabryki (Huta, Montownia) też mają mieć edytor? | A: edytor tylko w ATN, zwykłe fabryki dostają panel „Produkcja”. B: prostszy edytor także dla T1/T2 | **A**: zgodne z Z2 |
| 2 | Co z czwartą zakładką „Atanor”? | A: usunąć, a lekcje przenieść do Piaskownicy w `F2`. B: zostawić jako skrót do ostatnio otwartej fabryki | **A** |
| 3 | Kto liczy produkcję ATN? | (a) silnik w workerze, (b) model okresowy, (c) zostają liczby dokumentu | **(a)** (rozdz. 3.3) |
| 4 | Zwrot materiałów za usunięty element maszyny | 100 % / 50 % / 0 % | **100 %**: kosztem zmiany jest przestój wdrożenia, a eksperymentowanie zostaje tanie |
| 5 | Czas wdrożenia | natychmiast / proporcjonalny do kosztu maszyny / jak budowa z łazikiem | **proporcjonalny do kosztu**, jako parametr Załącznika A |
| 6 | Porty wejść i wyjść | ustala receptura / gracz stawia je na planszy jak w *Opus Magnum* | **receptura** w MVP (jak dziś) |
| 7 | Start projektu (POC-4) | wzorzec / podpowiedź / pusta plansza | **podpowiedź** dla A_NAD, **pusta** dla kolejnych, wzorzec w Piaskownicy |
| 8 | Tempo widoku w produkcji | tempo gry (×60 ≈ 1× z PoC) / tempo własne widoku | **tempo gry** w produkcji, **własne** w próbie |
| 9 | Atomy na portach przy zatrzymaniu (A2) | wracają do magazynu / przepadają | **wracają** |
| 10 | Histogramy bez innych graczy | tylko tabela wariantów / histogram własnych wariantów | **tabela teraz**, histogramy po SOC-4 |
| 11 | Produkty uboczne (6.8) i zlecenia NPC (6.10) | wchodzą teraz / później / wcale | **później**: najpierw sprawdzić podstawową pętlę (AT1–AT4) |

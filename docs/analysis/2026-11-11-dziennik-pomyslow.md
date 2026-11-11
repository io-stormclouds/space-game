# Dziennik pomysłów — sesja „note-and-analize"

> **Kopia w repo (2026-11-11).** Plik przeniesiony z katalogu roboczego sesji do repo jako źródło dla agentów; opis „poza repo” poniżej jest historyczny. Skrót ustaleń: `2026-11-11-ustalenia-sesji.md`.

Start: 2026-11-10. Użytkownik rzuca luźne myśli o grze i mechanice (sesja zdalna). Ja: katalogizuję tematycznie, analizuję konsekwencje, z całości składam plan dalszej pracy. **Zasada: nie zgaduję, dopytuję.**
Repo nie ruszam: równoległe sesje pracują na drzewie głównym `C:\my-projects\space-game` (nie przełączać gałęzi, nie commitować cudzych plików). Ten plik jest roboczy, poza repo. Do repo (`docs/`, `DECISIONS.md`) cokolwiek trafia dopiero na wyraźne polecenie użytkownika.

## Zasady prowadzenia
- Pomysły mają stałe numery #1, #2… (numer się nie zmienia, nawet po przeniesieniu do innego tematu).
- Status: nowy / doprecyzowany / przyjęty / zaparkowany / odrzucony. Zmienia go użytkownik („odrzuć #3"); ja proponuję.
- Wpis zawiera: słowa użytkownika dosłownie, moją interpretację (oznaczoną jako moja, do potwierdzenia), doprecyzowania z rozmowy, powiązania z istniejącymi ID, konsekwencje, konflikty z decyzjami, otwarte pytania, wielkość pracy i zależności.
- Odpowiedź w czacie jest krótka: co zapisano i pod jakim tematem, 1–3 pytania tam, gdzie coś niejasne albo konsekwencja wymusza decyzję, ewentualna flaga „koliduje z X". Niczego nie dopowiadam za użytkownika.
- Na hasło „artefakt": publikuję stronę (Artifact: quickstart, skill `artifact-design`) — pomysły wg tematów, wnioski, zależności, proponowana kolejność prac. **Zasada użytkownika (2026-11-10):** pytania, na które nie odpowiada, nie blokują rozmowy — zapisuję je w REJESTRZE PYTAŃ (koniec pliku), a w artefakcie mają osobną sekcję „Pytania bez odpowiedzi" (pełna treść, opcje, skutek braku decyzji, moja rekomendacja, co blokuje w planie); w czacie nie powtarzam tej listy przy każdej odpowiedzi. Przed publikacją odświeżam dziennik, sprawdzam REJESTR PYTAŃ i czy nic nie wisi w „Otwarte pytania".
- Duże dokumenty (`docs/economy-expansion-design.md` 106 KB, `atanor-expansion-design.md`, `game-mechanics-analysis.md`, `plan/05-SOCIAL.md`) czytam punktowo, gdy pomysł ich dotyka. Ciężkie sprawdzenia mogę zlecić podagentowi w tle.

## Kontekst projektu (skrót z docs i notatek, stan na 2026-11-10 rano)
- **Wizja** (`1-game-description.md`): kosmiczna strategia ekonomiczna w przeglądarce; energia jako główny regulator tempa; 3 poziomy infrastruktury (powierzchnia / orbita / deep space); 3 tryby widoku; asynchroniczny rynek galaktyczny; korporacje i megaprojekty; produkcja i loty w czasie rzeczywistym.
- **Decyzje fundamentalne** (`docs/game-design-questions.md`): WIZ-1 = C (instancjonowana kolonia gracza + wspólny rynek i galaktyka), WIZ-2 = hybryda A/B (materiały T3/T4 tylko z Fabryki atanorowej, T1/T2 zwykłe fabryki), WIZ-3 = A (wspólna mapa ekspansji i handlu, cel w układzie: gwiazdolot), EKO-1 (jednostka modelu = 1 min), EKO-2 = B (pobór ciągły, deficyt obniża wydajność), EKO-3 = B (magazyn na każdym ciele, materiały przemieszczają się fizycznie), POC-1 = B+C, POC-7 = C, TECH-4 = Angular 22, TECH-5 = Three.js + PixiJS (Pixi tylko w Atanorze), TECH-6 = Planeta i Układ jako ujęcia jednej sceny, TECH-8 = siatka Goldberga.
- **Rejestr** (`docs/DECISIONS.md`): R-0 Rust, R-1 modularny monolit, R-2 `game-core` + WASM, R-4 krok serwera 1 s, R-5 offline = magazyn + 12 h, R-7 NPC w produkcji z przełącznikiem `NPC_FACTIONS` (wybór użytkownika 2026-11-09), R-15 pliki za `WorldRepository` (PostgreSQL później), R-18 kopia świata w WASM prowadzona rozkazami (lockstep, hash co 5 s).
- **Social** (`docs/plan/05-SOCIAL.md`, stan z notatek): S1 (kontrakty frakcji, reputacja, obowiązki; R-23) i S2 (korporacje: role, zaproszenia, skarbiec, tablica; R-24) zrobione w worktree `galaxy-b6`. Dalej: specjalizacje frakcji, port L2, kontrakty wewnętrzne, czat, megaprojekty i sojusze (S3), PostgreSQL.
- **Teren** (`docs/planet-terrain-poc-wnioski-i-plan.md`): T0–T8 zrobione (heksy, biomy winter/dry/mixed, teren wpływa na koszt i czas budowy, zakaz budowy na wodzie — w TS i Rust bit w bit; culling i LOD). Otwarte decyzje użytkownika: T-15 (kary terenowe), T-22 (mapowanie modeli), T-23 (zanikanie ruin), T-7 (tokeny `terrain` w DS), T-8 (licencja KayKit Medieval), LOD struktur dla planety L.
- **Mapa drogowa** (`docs/plan/README.md`): E0 fundamenty → E1 zgodność i Rust-core → E2 serwer czasu rzeczywistego → E3 treść 3D → E4 social MVP → E5 beta zamknięta (50–200 graczy).
- **Gałęzie / worktree**: B4 na `server-b4`; B6 w worktree `space-game-b6` (`galaxy-b6`); teren na `server-b6` (merge do `galaxy-b6` zrobiony 2fa4194). Spodziewane konflikty przy scalaniu: `event.rs`, `simulation.rs`, `rules.rs`.
- **Ostrożnie:** `game-design-questions.md` nie zawsze odzwierciedla późniejsze decyzje (R-*, S-*, UNIFICATION.md W/Z/P/D/A/S/G); pozycje z „Decyzja: —" mogą być już rozstrzygnięte gdzie indziej. Zalecenie PvP w planie 05 to „brak PvP" (rekomendacja; status zatwierdzenia do potwierdzenia z użytkownikiem).

## Mapa istniejących pytań (do powiązań) — pozycje bez zapisanej decyzji w game-design-questions.md
- Wizja: WIZ-4 gwiazdy rzeczywiste?, WIZ-5 edukacja?, **WIZ-6 PvP (P0)**, WIZ-7 ton i fantazja gracza, WIZ-8 platforma.
- Ekonomia: EKO-4 surowce i poziomy, EKO-5 ujścia, EKO-6 paliwo, EKO-7 waluta (barter / kredyty), EKO-8 automatyzacja logistyki, EKO-9 okna transferowe, EKO-10 porażka.
- Social: SOC-1 model rynku, SOC-2 korporacje, SOC-3 frakcje NPC, SOC-4 projekty atanorów, SOC-5 rywalizacja, SOC-6 komunikacja.
- Multiplayer: MP-1…MP-6 (tryb, współdzielone vs instancjonowane, ilu na świat, sezonowość, offline, autorytatywność).
- Monetyzacja: MON-1…3. MVP: MVP-1…6. Tech: TECH-1, 2, 3, 7, 9. PoC: POC-2…6, 8…13.

## Tematy (startowy zestaw — zmieniam wraz z napływem pomysłów)
(Kody T1–T11 to etykiety tematów dziennika, nie mylić z T0–T8 i T-n z planu terenu; w czacie używam nazw.)
- T1 Wizja, ton, odbiorcy, monetyzacja (WIZ, MON, MVP)
- T2 Ekonomia i progresja (EKO, energia, ujścia, waluta)
- T3 Planeta, teren i budowa (TECH-8, plan terenu T0–T8)
- T4 Atanor i produkcja (WIZ-2, POC-4…8, AT)
- T5 Flota, logistyka, galaktyka (WIZ-3, EKO-8/9, POC-11, G)
- T6 Social: rynek, frakcje, korporacje, sojusze (SOC, S)
- T7 Konflikt, ryzyko, porażka (WIZ-6, EKO-10, SOC-5)
- T8 Czas, offline, sezony, retencja (EKO-1, MP-4/5, R-4/R-5)
- T9 UI/UX, kamery, platforma (TECH-6, WIZ-8, U)
- T10 Grafika 3D, audio, pipeline (M, TECH-5/7)
- T11 Architektura i operacje (R, B, TECH, MP-6)
- T12 Dokumentacja, katalog i encyklopedia (D, M, plan 04)
- T13 Galaktyka wspólna, odkrywanie i kontakt (WIZ-3/4, MP-2/3/4, SOC-6, G)
- T14 PoC i eksperymenty (poc/, PERF-REPORT, sim-cli)
- T15 Układy planetarne i ciała niebieskie (typy ciał, księżyce, generator układów)
- T16 Stacje kosmiczne, wnętrza i morale (stacje, moduły, edytor wnętrz `poc/space-interior-poc`, morale ludzi)

## Szablon wpisu
### #N — tytuł · temat: T? · status: nowy · data
- **Słowa użytkownika:** „…"
- **Interpretacja (moja, do potwierdzenia):** …
- **Doprecyzowania (Q&A):** …
- **Powiązania:** WIZ-?, EKO-?, R-?, S-?, T-?, pliki …
- **Konsekwencje:** mechanika / ekonomia / serwer i determinizm (parytet TS↔Rust, replika) / 3D i wydajność / treść i praca / ryzyka
- **Konflikty z decyzjami:** …
- **Otwarte pytania:** …
- **Wielkość pracy i zależności:** …

---

## Pomysły
### #1 — Dwa rodzaje statków: międzyplanetarne i międzygwiezdne · temat: T5 Flota, logistyka, galaktyka · status: doprecyzowany (Q2: cała rodzina klas międzygwiezdnych z ładownością; dalej Q6, Q7) · 2026-11-10
- **Słowa użytkownika:** „Statki kosmiczne dzielimy na międzyplanetarne i międzygwiezdne."
- **Interpretacja (moja, do potwierdzenia):** dwie kategorie statków o różnym zasięgu i (prawdopodobnie) różnym paliwie; międzygwiezdne pokonują odległości między gwiazdami.
- **Stan w projekcie:** w kodzie jest tylko rola: `ShipRole::Ship` (transport PoC) i `ShipRole::Mothership` (Arka-1, nośnik kolonii; `models/ship.rs`). Dok. ekonomii §6.2: Prom, Astraeus, Frachtowiec, Tankowiec, Górnik, Sonda — wszystkie wewnątrzukładowe. Jedyne międzygwiezdne: gwiazdolot (§9: Dok gwiezdny, napędy Mk I–IV = 5 / 9 / 12,5 / 17 ly, 12 / 9 / 7 / 4 h/ly, paliwo 40 Kapsuł fuzyjnych na ly, lot jednorazowy, 200 kolonistów + 2000 j. ładowni) i Sonda Mk III (17 ly, 2 h/ly). Plan 05-SOCIAL (tabela stanu): „brak transportu między układami poza gwiazdolotem". Handel to abstrakcyjne przesyłki: `SHIP_TO_HUB` (worktree galaxy-b6, `sim/systems/hub.rs`) zdejmuje towar z magazynu od razu, czas = obsługa portu + d_ly × 2 h/ly, bez statku, paliwa i limitu ładowni.
- **Konsekwencje:**
  - Jeśli „międzygwiezdne" = rodzina klas wielokrotnego użytku (np. frachtowce): handel z hubami zmienia się z abstrakcyjnej przesyłki w loty floty (paliwo, ładowność, czas, ewentualnie ryzyko); plan 05 do przepisania (S0–S2 już zrobione w galaxy-b6); większa złożoność symulacji, bo flota międzygwiezdna żyje na styku świata gracza (per-world) i serwisu galaktyki.
  - Jeśli „międzygwiezdne" = tylko gwiazdolot + sonda (jak w projekcie): #1 formalizuje stan obecny, prawie nic nie zmienia.
  - Obie wersje wymagają reguły: kto i gdzie je buduje (Stocznia orbitalna vs Dok gwiezdny) i na jakim etapie progresji (E3 vs E5).
- **Konflikty z decyzjami:** pozorna sprzeczność z #4 (statek międzyplanetarny ma „wybrać układ"); ewentualna zmiana założenia „brak transportu między układami poza gwiazdolotem".
- **Doprecyzowanie (Q2 → odpowiedź „Cała rodzina klas z ładownością", 2026-11-10):** statki międzygwiezdne to cała rodzina klas z ładownością, nie tylko gwiazdolot i sonda. Zakładam poziomy (Mk I–III) jak przy reszcie statków (#2) — do potwierdzenia.
- **Konsekwencje po Q2 (analiza 2026-11-10):**
  1. *Handel przestaje być abstrakcją.* Dziś `SHIP_TO_HUB` zdejmuje towar z magazynu od razu, a serwis galaktyki niesie przesyłkę (`exchange.rs`: czas = handling + d_ly × 7200 s/ly, `Shipment.arrives_at`); świat nie zna hubów, cen ani kredytów (`hub.rs`). Z flotą: lot statku (ładownia ogranicza partię, paliwo = koszt za ly, czas lotu zależy od napędu, statek zajęty w podróży). Flota staje się przepustowością handlu i głównym ujściem paliwa (domyka EKO-5/EKO-6).
  2. *Gdzie żyje statek.* W porcie świata (zapas, załadunek z magazynu) — stan świata; w locie — w serwisie galaktyki (loty trwają godziny–dni i muszą biec, gdy gracz jest offline; limit offline R-5 = 12 h dotyczy świata). Odlot i przylot to rozkazy systemowe wpisywane do dziennika świata (jak `HUB_DELIVERY`) → rozszerzenie wzorca B6, nie przebudowa. Nowy moduł „flota" w `galaxy.rs` / `exchange.rs`: encja statku (id, właściciel, klasa, poziom, paliwo, ładunek, stan: w porcie świata / w locie / w porcie huba, `arrives_at`). Replika WASM nie liczy lotów, dostaje zdarzenia przylotu.
  3. *Zasięg bramką handlu.* Napędy 5 / 9 / 12,5 / 17 ly (§9.2); odległość liczona między gwiazdą kolonii a gwiazdą huba (`home_star`), nie od Słońca. Huby NPC: rekomendacja Epsilon Eridani (10,5 ly) i Procyon (11,5 ly), w testach hub-sirius (8,6 ly) → dolot wymaga napędu Mk II–III w zależności od układu startowego. Handel = nagroda za rozwój floty.
  4. *Luka w progresji.* Terminal handlowy (moduł stacji, rynek NPC i galaktyczny; Stacja orbitalna L2) odblokowuje się w erze „Orbita i asteroidy" (dni 5–10, dok. ekonomii §3.1, §5), a pierwszy statek międzygwiezdny dopiero po kilkunastu dniach (Sonda w Stoczni L4, Dok gwiezdny L1 w „Układzie zewnętrznym", gwiazdolot w dniach 21–28+). Do rozstrzygnięcia, co z handlem w międzyczasie (Q6).
  5. *Paliwo międzygwiezdne.* W projekcie 40 Kapsuł fuzyjnych na ly (6818 kr wartości na ly) dla gwiazdolotu z rdzeniem 180 021 kr. Frachtowiec musi mieć zużycie proporcjonalne do ładowni i wartości towaru, inaczej handel się nie opłaca: parametr o największej dźwigni w balansie (symulacja headless). Kapsuły wymagają Hel-3 i Deuteru z gazowego olbrzyma (Platforma czerpalna, „Układ zewnętrzny") → układ bez olbrzyma musi paliwo importować (naturalny towar handlowy; generator układów decyduje o obecności olbrzymów — kolejny suwak trudności startu razem z #4).
  6. *Łańcuch transportowy trzypoziomowy* (wizja: powierzchnia / orbita / deep space): magazyn ciała → prom orbitalny → frachtowiec międzyplanetarny → dok/terminal → frachtowiec międzygwiezdny → hub. Najsłabsze ogniwo ogranicza całość → ładownie klas trzeba skalibrować względem siebie i pojemności magazynów (port L1: magazyn 2000 j.; Frachtowiec 400/800/1600 j.). Potrzebne reguły załadunku (czas, kolejka) i budynek-terminal.
  7. *Klasy — propozycja do potwierdzenia (Q7):* frachtowiec (towary suche); tankowiec (płyny, gazy, paliwo — dostawy kapsuł do układów bez olbrzyma); okręt kolonizacyjny (dzisiejsza Arka / gwiazdolot z §9: koloniści + ładownia); sonda/zwiadowca (zasięg i profil układów; dziś Sonda Mk III); opcjonalnie kurier (mały, szybki, mała ładownia). Każda klasa z poziomami: ładownia, bak, zasięg (ly), prędkość (h/ly), załoga, koszt budowy, stocznia.
  8. *Progresja.* „Zbuduj gwiazdolot" przestaje być jedynym wejściem w międzygwiezdność; pierwsza klasa międzygwiezdna (mały frachtowiec lub sonda) może być wcześniej niż okręt kolonizacyjny. Gwiazdolot z §9 (Dok L5, rdzeń 180 tys. kr) staje się najdroższą klasą rodziny. Zmienia to tabelę er i kamienie milowe w dok. ekonomii (§3.1) — do przebudowy.
  9. *Wiele układów gracza (EXP-8).* Flota daje naturalną odpowiedź na „układ macierzysty z automatyzacją tras": dostawy między własnymi układami. Wymaga tras cyklicznych i automatyzacji (EKO-8) — loty trwają godziny–dni, mikrozarządzanie odpada.
  10. *Ryzyko / PvP.* Statki w drodze godzinami są naturalnym celem (piractwo, przechwycenie); rekomendacja planu 05 to brak PvP (WIZ-6 bez zapisanej decyzji). Zakładam brak ataków na statki; zdarzenia losowe/NPC do osobnej decyzji.
  11. *Zakres prac:* katalog klas jako dane (nowe reguły tylko w Rust wg R-20), moduł floty w galaktyce, rozkazy (budowa, załadunek, odlot, trasa cykliczna), UI (lista floty, karta statku, planista trasy, ekran stoczni/doku), modele 3D klas i dok, balans (symulacja headless), przepisanie przesyłek hubowych i planu 05 §3.2. Duży — porównywalny z S1/S2.
- **Otwarte pytania:** Q6, Q7 (Q2 zamknięte).

### #2 — Ładowność zależna od klasy i poziomu rozbudowy · temat: T5 Flota, logistyka, galaktyka · status: nowy (zgodne z projektem) · 2026-11-10
- **Słowa użytkownika:** „Każdy statek ma swoją ładowność w zależności od klasy i poziomu rozbudowy."
- **Interpretacja (moja, do potwierdzenia):** klasa = typ statku (Astraeus, Frachtowiec, Tankowiec…); poziom rozbudowy = Mk I–III (modernizacja).
- **Stan w projekcie:** już zaprojektowane (dok. ekonomii §6.2–6.3): wszystkie pojazdy mają Mk I–III, koszt modernizacji rośnie wykładniczo. Ładownia / bak: Astraeus 50/80/120 / 100/150/200; Frachtowiec 400/800/1600 / 250/300/400; Górnik 100/200/400; Prom 30/50/80; Tankowiec 2000/4000/8000 u. Kod: `max_cargo` i `max_fuel` są polami `Spacecraft`; brak klas i poziomów (dziś jeden transport PoC 50 / 100 oraz Arka-1 2000 / 100).
- **Konsekwencje:** zgodne z EKO-3 (magazyn na ciało, materiały fizyczne) — ładownia realnie ogranicza przepływ między ciałami. Do zrobienia: katalog klas i poziomów jako dane (parytet TS↔Rust), stan statku z `class` + `level`, rozkaz modernizacji (czas, koszt, niedostępność statku w trakcie), karta statku w UI. Balans: ładownia × prędkość × paliwo decyduje o opłacalności tras → symulacja headless (plan 04 §4.4).
- **Otwarte pytania:** potwierdzić, że „poziom rozbudowy" = Mk I–III, a nie np. moduły do wyboru.

### #3 — Każdy statek potrzebuje paliwa · temat: T2 Ekonomia i T5 Flota · status: nowy · 2026-11-10
- **Słowa użytkownika:** „Każdy statek potrzebuje paliwa."
- **Stan w projekcie:** dziś paliwo to licznik na statku: koszt lotu = dystans × 0,02 (`fuel_rate`), odrzucenie rozkazu przy braku paliwa lub rezerwy na powrót do bazy (`NoFuel`); **tankowanie jest darmowe i automatyczne** po przybyciu do bazy (`docking.rs`: `Refueled` ustawia bak na maksimum), czyli zero ujścia w ekonomii (analiza §1.4: „ekonomia ma tylko źródła, bez ujść"). W dok. ekonomii paliwo jest towarem: „Paliwo" (Elektrolizer + Skraplacz paliwa, era E2, dni 2–4) i Kapsuła fuzyjna (Hel-3 + Deuter z Gigasa; 40 na ly); EXP-7: rezerwa do najbliższej stacji z paliwem. W katalogu jest już `fuel_per_ly`.
- **Konsekwencje:**
  - Zamyka lukę „brak ujść" (EKO-5, EKO-6): paliwo = stały koszt logistyki → sens ma Tankowiec i produkcja paliwa.
  - Zmiana semantyki `Refueled` / `on_arrival` (koniec darmowego tankowania) → nowy rozkaz lub zdarzenie tankowania z magazynu bazy; dotyka zapisu świata, protokołu repliki WASM (hash), nagrań wzorcowych (conformance trzeba nagrać ponownie) i parytetu TS↔Rust (stała `fuel_rate`, liczby niecałkowite).
  - Ryzyko miękkiej blokady: brak paliwa i brak produkcji paliwa = nie da się polecieć po surowce (zob. #4).
  - UX: czytelne komunikaty „brak paliwa", automatyczne tankowanie z magazynu bazy.
- **Konflikty z decyzjami:** dotychczasowe założenie „tankowanie darmowe na bazie" (PoC → `docking.rs`); EKO-6 nierozstrzygnięte.
- **Doprecyzowanie (Q3, 2026-11-10, częściowe):** użytkownik odpowiedział o paliwie międzygwiezdnym (zob. #5: droga egzotyczna materia z Atanora); część o paliwie międzyplanetarnym przyjęta jako założenie: zwykłe Paliwo (Elektrolizer + Skraplacz paliwa, era Industrializacji), produkowane w kolonii, koniec darmowego tankowania. Użytkownik ma poprawić, jeśli nie.
- **Otwarte pytania:** brak (założenie zakomunikowane).

### #4 — Start: statek międzyplanetarny z małą ilością paliwa, wystarczającą na wybór układu startowego · temat: T8 Czas, start, progresja (+ T5) · status: doprecyzowany (wariant A potwierdzony 2026-11-10; dalej Q4, Q5) · 2026-11-10
- **Słowa użytkownika:** „Grę zaczynamy statkiem międzyplanetarnym z małą ilością paliwa. Mamy go na tyle by wybrać startowy układ planetarny."
- **Doprecyzowanie (Q1 → odpowiedź „1 a", 2026-11-10): wariant A potwierdzony** — wybór startowego układu = wybór gwiazdy na mapie galaktyki; statek „międzyplanetarny" robi jednorazowy skok między gwiazdami (wyjątek startowy przyjęty; po skoku statek już nie opuszcza układu); paliwo startowe wyznacza zasięg wyboru. Wariant B (planeta w jednym układzie) odrzucony.
- **Pierwotna interpretacja (przed odpowiedzią, warianty):** (A) wybór gwiazdy na mapie galaktyki, a paliwo startowe wyznacza zasięg (które układy są osiągalne); (B) wybór planety/ciała w jednym układzie (jak dziś po Skanowaniu na Tau Ceti), a paliwo to budżet na zwiad. Dodatkowo: statek międzyplanetarny nie przekracza odległości między gwiazdami, więc w wariancie A potrzebny jest wyjątek (jednorazowy skok) albo inna definicja.
- **Stan w projekcie:** domyślny start (W06 A, `scenarios/tau_ceti.rs`, UNIFICATION): Arka-1 (`Mothership`, ładownia 2000, bak 100/100, 2 łaziki, 1 prom, 1 sonda) przylatuje do Tau Ceti → skan planet b–f (15 min) → wybór Tau Ceti e → port kosmiczny → kolonia. Układ z 3D PoC (Planeta Matka) to preset testowy. Dok. ekonomii: era E0 „Lądowanie", produkcja paliwa dopiero w E2 (dni 2–4), nowe ciała: Księżyc w E2, pas asteroid w E3. Dla kolejnych układów: „Ciała układu docelowego generuje gra (hybryda z WIZ-4 = C)"; ładownia startowa 2000 j. wybierana przez gracza.
- **Konsekwencje (wstępne, zależne od Q1):**
  - Wariant A (gwiazda): wymaga generatora układów dla dowolnej gwiazdy z katalogu (planowany już dla gwiazdolotu), ekranu mapy galaktyki na starcie i punktu wyjścia (zasięg liczony od niego). Wybór układu = wybór trudności: czerwone karły ×0,05 energii słonecznej, gorące A/F ×7–8, G/K umiarkowanie; dystans do hubów (2 h/ly) rządzi opłacalnością handlu (S0–S2). Trzeba zdecydować, czy układ jest wyłączny dla gracza, czy wielu graczy może go wybrać w swoich instancjach (MP-2; WIZ-1 = C). Balans układów startowych to osobna praca (symulacja headless na układ).
  - Wariant B (planeta): mała zmiana na istniejącym „Przybycie → Skanowanie → Port"; paliwo = budżet zwiadu (ile ciał zbadać lub odwiedzić przed osiedleniem); profile planet mają już `shuttle_launch_fuel` i `revealed`.
  - Oba: „mała ilość paliwa" + produkcja paliwa dopiero w E2 = pierwsze dni bez lotów (zgodne z projektem, bo nowe ciała odblokowują się w E2/E3), ale trzeba zagwarantować ścieżkę do pierwszej produkcji paliwa (woda lub lód na planecie startowej, ewentualnie startowa mini-produkcja). Część planet Tau Ceti nie ma lodu („woda i paliwo musiałyby przylatywać z innych ciał") → generator i wybór startu muszą tego pilnować.
  - Narracja: Arka-1 (międzygwiezdna, matka kolonii) w nowym starcie albo znika (start innym, mniejszym statkiem), albo zostaje jako późniejszy statek międzygwiezdny — do ustalenia po Q1.
- **Konflikty z decyzjami:** W06 A (domyślny start = Tau Ceti, przylot Arki-1), Z1 (cel w układzie: gwiazdolot), plan 05 („brak transportu między układami poza gwiazdolotem"); ewentualnie MP-2.
- **Konsekwencje po wyborze wariantu A (analiza 2026-11-10):**
  1. *Przebieg startu:* mapa galaktyki → wybór gwiazdy (podgląd zasięgu i zużycia paliwa) → skok → Przybycie → Skanowanie → Port → Kolonia. Mapa galaktyki i karta gwiazdy istnieją w kliencie (z PoC); trzeba trybu „wybór celu startowego": pierścień zasięgu, koszt paliwa, profil (klasa, jasność, znane planety).
  2. *Zasięg = funkcja punktu wyjścia i paliwa.* Katalog liczy odległości od Układu Słonecznego (dok. ekonomii §9.3; 21 gwiazd do 17 ly z 41 na mapie). Liczba gwiazd do wyboru: ≤ 5 ly: 3 (Proxima, α Cen A, α Cen B); ≤ 9 ly: 11; ≤ 12 ly: 18; ≤ 13 ly: 20. Mała ilość paliwa = mały wybór; przy ~5 ly zostaje Proxima (czerwony karzeł, ×0,05) i α Cen A/B (0 znanych planet).
  3. *Planeta do lądowania.* Tylko 7 z 21 gwiazd ma znane planety (Proxima 2, Barnard 1, ε Eri 1, Tau Ceti 5, GJ 1061 3, YZ Ceti 3, Kapteyn 2); pozostałe wg §9.3 dostają „pasy asteroid i małe ciała". Start wymaga ≥ 1 planety → generator dodaje planetę każdej gwieździe dostępnej na starcie albo wybór ograniczamy do gwiazd z planetami. Dane `stars.data.ts` częściowo niespójne (POC-3, EXP-10) — zweryfikować przed użyciem jako zasięgu.
  4. *Kompromis zasięg ↔ paliwo po lądowaniu* (jeśli zużycie zależy od odległości; Q4): dalsza, zwykle jaśniejsza lub bogatsza gwiazda zostawia mniej paliwa na pierwsze loty lokalne → decyzja strategiczna „blisko i ubogo vs daleko i bogato, ale bez paliwa". Jedna jednostka paliwa służy i skokowi, i późniejszym lotom lokalnym.
  5. *Wybór układu = wybór trudności.* Mnożnik paneli: M ×0,05; K ×0,09–0,5; G ×0,5–1,5; A/F ×7–8 (te wymagają osłon z Metamateriału). Na lekkim starcie (bez prętów paliwowych z ładowni) czerwony karzeł jest praktycznie niegrywalny: era Lądowania zakłada ok. 10 MW z paneli. Opcje: wykluczyć M ze startu, dać alternatywne źródło energii w zestawie startowym albo oznaczyć jako tryb trudny.
  6. *Zestaw startowy (Q5).* Dziś Arka-1: ładownia 2000 j. (STA 600, FER 400, SIL 300, KRI 200, BET 200, ZYW 180, UKL 60, PRE 20, SLN 40), 2 łaziki, prom, sonda; port L1 „lądowany z ładowni" (STA 120 · BET 80 · UKL 10 · 12 min). Statek międzyplanetarny (Astraeus Mk I: ładownia 50) tego nie uniesie → start dużo uboższy (przebudowa ery Lądowania: pierwsze budowle, tempo pierwszej godziny) albo kolonia przylatuje inną drogą.
  7. *Droga do pierwszej produkcji paliwa* (zob. #3): planeta startowa musi mieć wodę/lód lub inne źródło; część planet Tau Ceti jej nie ma („woda i paliwo musiałyby przylatywać z innych ciał") → walidacja generatora i/lub zestaw startowy.
  8. *Handel i huby.* Odległość gwiazdy startowej od hubów NPC (rekomendacja: Epsilon Eridani, Procyon; w testach hub-sirius) wyznacza czas przesyłek (2 h/ly) → kolejny „suwak" trudności startu.
  9. *Informacja przed wyborem.* Przed skokiem są tylko dane katalogowe (klasa, jasność, odległość, znane planety), bez sondy; skan planet po przybyciu (15 min). Ryzyko decyzji „na ślepo" — zgodne z §9.4 (sonda daje wiedzę), ale na starcie gracz sondy nie ma.
  10. *Nieodwracalność.* Zły wybór (ubogi układ, pusty bak, brak napędu międzygwiezdnego) to pułapka. Do rozstrzygnięcia później: wybór nieodwracalny / jedno darmowe „przeskoczenie" w pierwszej godzinie / restart kolonii.
  11. *Serwer i świat.* Nowy rodzaj scenariusza: układ generowany deterministycznie z danych gwiazdy i ziarna (Mulberry32 jak R-11) w `game-core/sim/scenarios`, dostępny w WASM (klient liczy repliką), zapis świata z id gwiazdy i ziarnem. R-20 (rekomendacja, `docs/planet-terrain-poc-wnioski-i-plan.md`): zamrożenie TS `sim/` po T8 → generator i reguły paliwa tylko w Rust; konformancja pilnuje starych zachowań (darmowe tankowanie, Tau Ceti) → zmiany wymagają ponownego nagrania wzorców lub wersjonowania reguł. Tau Ceti zostaje scenariuszem ręcznym (kanwa, e2e).
  12. *Wspólna galaktyka (WIZ-1 = C).* Kolonie są instancjonowane, więc wielu graczy może wybrać tę samą gwiazdę we własnych światach; mapa (G1: kolonie korporacji i sojuszy) i huby widzą wiele kolonii w jednym układzie — do przemyślenia (wyłączność układu, popularność startów, rozproszenie graczy). Pytanie na później.
- **Aktualizacja po #5 (2026-11-10):** paliwo międzygwiezdne jest egzotyczne i drogie, więc skok startowy statku „międzyplanetarnego" wymaga albo osobnego, jednorazowego ładunku skoku, albo jednej puli paliwa dla skoku i lotów lokalnych (punkt 4 wyżej to tylko druga opcja → Q4′). Skala: skok o 5 ly po stawce gwiazdolotu (40 kapsuł/ly) = 200 kapsuł ≈ 34 tys. kr; na 11,9 ly (Tau Ceti) 477 kapsuł ≈ 81 tys. kr → stawka dla statku startowego musi być przeskalowana (ładunek skoku to „bilet w jedną stronę", warty więcej niż reszta zestawu startowego). Pozostałość egzotycznego paliwa po skoku może być kapitałem startowym (do sprzedaży lub pierwszych lotów międzygwiezdnych) — wariant do rozważenia.
- **Aktualizacja po #11–#15 (2026-11-10):** wybór gwiazdy startowej musi zostać uzgodniony z mgłą wojny (teleskopy, analiza sygnałów), zajętością układów (jedna galaktyka, układy zajęte przez graczy) i wymogiem startu w układzie z potencjałem ekspansji (#12) — Q18. W1 (wyłączność układu) przeszło do Q19.
- **Otwarte pytania:** Q4′, Q5, Q18 (Q1 zamknięte).

### #5 — Paliwo międzygwiezdne: bardzo droga egzotyczna materia z Atanora (wyższy poziom) · temat: T2 Ekonomia, T4 Atanor, T5 Flota · status: nowy · 2026-11-10
- **Słowa użytkownika (odpowiedź na Q3):** „Paliwo dla statków międzygwiezdnych to bardzo droga egzotyczna materia wytwarzana w fabrykach na wyższym poziomie poskładana według schematów antratora" („antratora" czytam jako Atanor — błąd pisowni).
- **Interpretacja (moja, do potwierdzenia):** paliwo wszystkich klas międzygwiezdnych = materiał T3/T4 produkowany wyłącznie w Fabryce atanorowej wyższego poziomu (zgodne z WIZ-2: T3/T4 tylko z Atanora). W projekcie to Kapsuła fuzyjna (Atanor L3) i Antymateria (Akcelerator cząstek, napęd Mk IV, składowanie „egzotyczne"). Nie wiem, czy „egzotyczna materia" = te dwa, czy nowy materiał (niski priorytet).
- **Stan w projekcie:** Kapsuła fuzyjna T4: Atanor L3, 5 Hel-3 + 10 Deuter + 1 Nadprzewodnik → 1 szt., 14,4 min, 23,6 MW, ok. 170 kr/szt.; gwiazdolot zużywa 40 szt./ly (6818 kr/ly). Antymateria T4: Akcelerator cząstek, 50 Wodór + 1 Kwantyt, 60 min, 200 MW, ok. 1302 kr/szt.; w Pułapce magnetycznej parytet składowania 41 h, anihilacja niszczy budynek. Kwantyt: T0X „egzotyczny" z komety Kerys. Receptury Atanora: L1 Nadprzewodnik, L2 Katalizator i Metamateriał, L3 Kapsuła fuzyjna, L4 Procesor kwantowy (§8.1, §8.3).
- **Konsekwencje:**
  1. *Koszt lotu = wartość.* 1 ly gwiazdolotu = 40 kapsuł = 9,6 h pracy jednej Fabryki L3 (Proxima 170 szt. = 40,8 h; Tau Ceti 477 szt. = 114,5 h ≈ 4,8 doby). Flota międzygwiezdna rywalizuje o moce Atanora z innymi produktami (Nadprzewodnik, Procesory).
  2. *Frachtowiec musi spalać o rząd wielkości mniej na ly niż gwiazdolot* (rzędu 1–5 kapsuł/ly zamiast 40), inaczej żaden towar nie pokryje paliwa. Handel między gwiazdami dotyczy towarów o wysokiej wartości jednostkowej (T3/T4, egzotyki); masowe T0/T1 się nie opłaca wozić → silna specjalizacja układów. Benchmark marży: Terminal handlowy NPC kupuje po 0,8×V i sprzedaje po 1,25×V (spread ≈ 56% w obie strony); koszt przewozu musi być wyraźnie niższy. Parametr o największej dźwigni w balansie (symulacja headless).
  3. *Jakość inżynierii gracza obniża koszt paliwa* (§8.4: maszyna 2× szybsza i ciaśniejsza = ok. −19% kosztu, 2× przepustowość) → projekty maszyn paliwowych mają wartość rynkową (SOC-4: prywatne / publiczne / na sprzedaż; rankingi receptur; serwer weryfikuje powtórką).
  4. *Bramka progresji:* Atanor L3 + Hel-3 i Deuter z gazowego olbrzyma (Platforma czerpalna, „Układ zewnętrzny", dni 11–20) → flota międzygwiezdna nie powstanie wcześniej; układ bez gazowego olbrzyma uzależnia się od importu paliwa.
  5. *Dwa rodzaje paliwa w grze:* lokalne (zwykłe) i międzygwiezdne (egzotyczne). Statek międzygwiezdny prawdopodobnie potrzebuje obu (bak lokalny do manewrów w układzie, bak skokowy do lotu między gwiazdami) — do ustalenia przy klasach (Q7).
  6. *Składowanie i transport:* Kapsuła w klasie kriogenicznej, Antymateria w „egzotycznej" (Pułapka magnetyczna, ryzyko anihilacji) → ładownie i tankowce międzygwiezdne wymagają odpowiednich zbiorników.
  7. *Zakres prac:* klasa paliwa i zużycie na ly jako parametry klasy i poziomu w katalogu, rozkaz tankowania z magazynu, walidacja wystarczalności przed odlotem, podgląd kosztu lotu w UI, rozwiązania referencyjne Atanora (EXP-6) — bez nich liczby kapsuł są tymczasowe.
- **Powiązania:** WIZ-2, EKO-5, EKO-6, SOC-4, POC-5, EXP-6, AT4–AT6, dok. ekonomii §3, §4 (składowanie), §8, §9.2; #1, #3, #4.
- **Konflikty z decyzjami:** brak; zgodne z §9 i WIZ-2, poszerza zakres z gwiazdolotu na całą rodzinę klas.
- **Otwarte pytania:** brak ważnych (niski priorytet: czy „egzotyczna materia" = Kapsuła i Antymateria).

### #6 — Statki międzygwiezdne bardzo drogie; budowa wymaga planu, załogi i kompozytów · temat: T5 Flota, T2 Ekonomia · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika (ta sama wiadomość co Q3):** „Statki międzygwiezdne są także bardzo drogie. Ich wytworzenie wymaga planu Załogi oraz kompozytów." Czytam jako „planu, załogi oraz kompozytów" (zakładam brak przecinka); zwłaszcza „plan" do potwierdzenia.
- **Interpretacja (moja):** trzy wymagania budowy: (1) plan = schemat/projekt statku (rodzaj nieznany), (2) załoga (obsada), (3) kompozyty (materiał).
- **Stan w projekcie:** (1) *plan:* brak takiej koncepcji; statki odblokowują poziomy budynków (Stocznia orbitalna L1–L4, Dok gwiezdny L1–L5, HQ), a „biblioteka projektów" (AT6) i SOC-4 dotyczą maszyn Atanora, nie statków. (2) *załoga* = pojemność jak moc (§4.5): obsada budynków (Stocznia 15, Dok gwiezdny 30, ×1,3 na poziom → Dok L5 ≈ 86), pojazdów (Frachtowiec 5, Astraeus 3…); Habitat mieści 10 → 17 → 29 → 49 → 84; gwiazdolot zabiera 200 osób i trwale zmniejsza załogę układu; potrzeby życiowe na 10 osób/h: 20 Wody, 10 Tlenu, 1 Żywność. (3) *kompozyty:* Kompozyt węglowy (T2, Zakład chemiczny L2, 3 Karbonit + 2 Polimer → 1, 8 min, 10 MW, ok. 18 kr) jest w kosztach promu, Astraeusa Mk II+, Tankowca, drona, Konwoju, Sondy; kadłub gwiazdolotu 800 szt.; Metamateriał osłonowy (T3, Atanor L2) też go zużywa.
- **Skala „bardzo drogie" w tym projekcie:** gwiazdolot: rdzeń 180 021 kr + Dok L1→L5 421 383 kr (≈ 32 h produkcji kolonii referencyjnej); HQ L4 26 556 kr; Frachtowiec międzyplanetarny L1 1230 kr. Klasy międzygwiezdne powinny leżeć rzędu 10–100 tys. kr, czyli kilka–kilkanaście godzin pełnej produkcji kolonii referencyjnej w erze „Układ zewnętrzny" (≈ 6,6 tys. kr/h) — liczby do ustalenia symulacją. Wniosek: flota to pojedyncze jednostki, nie dziesiątki; każdy statek ma znaczenie (nazwa, historia, ryzyko), lista floty jest krótka.
- **Konsekwencje:**
  1. *Plan* (zależnie od Q8): (a) badanie/odblokowanie za koszt albo zakup u frakcji NPC → średni zakres (system badań lub sklep planów); (b) plan jako przedmiot w bibliotece gracza (jak projekty Atanora): tworzenie, wymiana, sprzedaż, ranking → duży zakres (konstruktor, walidacja serwerowa, rynek planów, ochrona przed duplikacją); (c) plan = poziom stoczni/doku (stan dzisiejszy) → brak nowej pracy.
  2. *Załoga* (Q9): tylko pojemność → limit floty wynika z Habitatów i potrzeb życiowych; załoga „zablokowana" w statku nie pracuje w kolonii. Załoga lecąca i znikająca na czas lotu → lot kosztuje produkcję. Osobny zasób → nowa mechanika rekrutacji. Obsada Doku L5 ≈ 86 osób (jeden Habitat L5 mieści 84) → załoga to realny koszt budowy (kolejne Habitaty, żywność, woda, tlen).
  3. *Kompozyty:* zapotrzebowanie na Karbonit i Polimer rośnie skokowo (800 Kompozytów kadłuba gwiazdolotu = 2400 Karbonitu + 1600 Polimeru; Karbonit to największy surowiec rdzenia: 18 320 j.); układ bez węgla/lodu musi importować → kolejny suwak trudności układu startowego (#4).
  4. *Gdzie budować:* Stocznia orbitalna L4 buduje sondę międzygwiezdną, Dok gwiezdny montuje gwiazdolot; pozostałe klasy → Dok jako stocznia klas międzygwiezdnych (poziom = odblokowana klasa)? Do ustalenia przy Q7.
  5. *Wysoki próg wejścia w handel międzygwiezdny:* pierwszy statek to kamień milowy jak HQ L4; naturalnie wspólne budowy korporacji (skarbiec S2, megaprojekty S3). Wzmacnia znaczenie Q6 (handel zanim jest flota).
  6. *Ryzyko utraty:* statek bardzo drogi → brak PvP i losowych strat; ewentualne ubezpieczenie/naprawy do osobnej decyzji.
- **Powiązania:** #1, #5, EXP-3 (załoga), WIZ-2, SOC-4, S2/S3, AT6, dok. ekonomii §4.5, §5, §6, §9.
- **Konflikty z decyzjami:** pojęcie „planu" nie istnieje w obecnej architekturze odblokowań (poziomy budynków; zasada „progresja = poziomy HQ i budynków", §3.1) — jeśli plan to osobny przedmiot lub badanie (Q8 a/b).
- **Uwaga po #24 (2026-11-10):** możliwe odczytanie „plan" = projekt wnętrza / statku z edytora wnętrz (szablon per klasa i poziom, spełniający wymagania funkcji, w kopercie klasy); wtedy „plan + załoga + kompozyty" = projekt + koje (berths) + materiały. Nie potwierdzone — Q34.
- **Otwarte pytania:** Q8 (plan), Q9 (załoga), Q34 (czy plan = projekt z edytora).

### #7 — Do gwiazd nie da się podlecieć, nie bez poważnych konsekwencji · temat: T7 Konflikt, ryzyko, porażka (+ T5 Flota) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Do gwiazd nie da się podlecieć. Nie bez poważnych konsekwencji."
- **Interpretacja (moja, NIEpotwierdzona — trzy możliwe odczytania):**
  (a) Słońce/gwiazda w układzie jest strefą, do której statek nie może podlecieć bez poważnych skutków (zniszczenie, uszkodzenia). Dziś jest to twarda blokada; nowa byłaby idea „możliwe, ale z poważnymi konsekwencjami".
  (b) Uzasadnienie obecnego zakazu (fabuła, komunikat), bez zmiany mechaniki.
  (c) Loty do innych gwiazd (międzygwiezdne): zasada ogólna, że każda taka podróż niesie poważne konsekwencje (jakie?) — pasowałoby do #5/#6 (drogie paliwo i statki, załoga) i do skoku startowego (#4).
  Językowo najbardziej naturalne jest (a)/(b) („podlecieć do gwiazdy" = zbliżyć się do niej), ale nie zgaduję.
- **Stan w projekcie:**
  * `order_transfer` (`sim/simulation.rs:260-265`): „a star is no destination: nothing to dock at or land on" → `RejectReason::NotLandable`; gwiazda nie może być celem lotu, ale może być punktem wyjścia: Arka-1 startuje „zadokowana" przy gwieździe (`tau_ceti.rs`: `current_body_id = TAU_CETI_ID`, `Docked`) i po skanie leci do planety.
  * Trasy: `BezierPath::arc(start, lead, arc_lift_factor)` (`sim/systems/transfer.rs`), brak sprawdzania zbliżenia do gwiazdy; promień gwiazdy 50 (Tau Ceti) / 60 (Słońce PoC), orbity od ok. 450 j. Pozycja statku = czysta funkcja (plan, t); czas przylotu stały od momentu rozkazu.
  * Dok. ekonomii: gwiazda = źródło energii (mnożnik paneli ×0,05–×8 wg jasności); Pyros (gorąca planeta, ×4,0 insolacji) z satelitami energetycznymi; gwiazdy A/F wymagają osłon z Metamateriału; Osłona radiacyjna to moduł gwiazdolotu; M-karły mają rozbłyski. Wizja: panele „efektywne blisko gwiazdy".
- **Konsekwencje (zależne od odczytania):**
  1. *(a) Mechanika zagrożenia:* nowy rodzaj zdarzenia (utrata/uszkodzenie statku, ładunku, załogi) i nowy rozkaz (świadomy „lot ku gwieździe" z ostrzeżeniem w UI) albo strefa fizyczna wokół gwiazdy (promień, natężenie, osłona). Strefa fizyczna dotyka planowania tras: łuki między planetami po przeciwnych stronach gwiazdy mogą przechodzić blisko niej → omijanie lub liczenie ryzyka; zmienia czas lotu i paliwo, więc wpływa na wzorce zgodności i testy (R-8) — do sprawdzenia, czy `arc_lift_factor` unosi łuk poza płaszczyznę orbit. Samo zdjęcie zakazu celu (rozkaz „lot ku gwieździe" bez strefy) jest tańsze.
  2. *(a) Progresja i osłony:* naturalne powiązanie z Metamateriałem osłonowym / Osłoną radiacyjną: lepsza osłona pozwala zbliżyć się do gwiazdy → strefa zysku (energia, ×4 na Pyros), ryzyka (rozbłyski) i ewentualnej nagrody. Trzeba rozstrzygnąć, czy gracz ma powód lecieć ku gwieździe (nagroda), czy to wyłącznie zakaz/pułapka.
  3. *(a) Ryzyko przypadkowej utraty:* statki są bardzo drogie (#6) → potwierdzenie w UI, ostrzeżenie, log zdarzeń; brak PvP (WIZ-6 rekomendacja), więc utrata powinna być świadoma.
  4. *(a) Start:* Arka-1 startuje przy gwieździe; skok startowy (#4) potrzebuje „punktu przylotu" poza strefą zagrożenia (obrzeże układu), nie przy gwieździe.
  5. *(c) Podróż międzygwiezdna zawsze z poważnymi konsekwencjami:* ekonomiczne (paliwo, koszt statku), ludzkie (załoga/koloniści opuszczają układ na stałe, §4.5), czasowe (godziny–dni), ryzyko utraty statku, nieodwracalność skoku startowego (W2). Wymaga listy konkretnych skutków (pewne vs losowe).
  6. *(b)* brak zmian mechaniki; UI: komunikat „strefa niebezpieczna" zamiast „nie do lądowania".
- **Powiązania:** #4, #5, #6, WIZ-6, EKO-10 (porażka), `simulation.rs` (`NotLandable`), `transfer.rs`, `tau_ceti.rs`, dok. ekonomii §3.2 (Pyros), §9.3 (profile gwiazd), osłony (Metamateriał, Osłona radiacyjna).
- **Konflikty z decyzjami:** obecna blokada `NotLandable` ↔ „możliwe z konsekwencjami" (a); start Arki-1 przy gwieździe ↔ strefa zagrożenia (a).
- **Otwarte pytania:** Q10 (które odczytanie), Q11 (jakie konsekwencje).

### #8 — Kolonie, statki i stacje kosmiczne potrzebują ludzi: inżynierów, naukowców, obsługi technicznej · temat: T2 Ekonomia i progresja (+ T5 Flota) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Kolonie, statki, stacje kosmiczne potrzebują ludzi (inżynierów naukowców obsługi technicznej)".
- **Interpretacja (moja, NIEpotwierdzona):** (1) ludzie są wymaganym zasobem dla trzech rodzajów obiektów: kolonii (budynki), statków i stacji; (2) ludzie dzielą się co najmniej na trzy specjalizacje: inżynierowie, naukowcy, obsługa techniczna. Nie wiem: czy typy to osobne pule z osobnymi limitami, co robi każdy typ, skąd się biorą, jak się nimi zarządza.
- **Stan w projekcie:**
  * Dok. ekonomii §4.5: „Załoga działa jak druga moc": budynek wymaga określonej liczby osób (Załoga L1, ×1,3 na poziom); HQ daje 5, Habitat 10 → 17 → 29 → 49 → 84; potrzeby życiowe na 10 osób/h: 20 Wody, 10 Tlenu, 1 Żywność; niedobór = wydajność 50% i wstrzymany przyrost; przyrost +1 osoba / 10 min przy wolnym miejscu i pokrytych potrzebach; gwiazdolot zabiera 200 kolonistów. Pojazdy i statki mają kolumnę „Załoga" (Astraeus 3, Frachtowiec 5, Tankowiec 5, Górnik 4, Prom 2, Konwój 2, łazik i ciężarówka 1; Sonda i Dron 0); stacje jako budowle: Stocznia orbitalna 15, Dok gwiezdny 30.
  * Kod (`sim/colony.rs`): `crew_balance` = pojemność (HQ + habitaty) − zapotrzebowanie budynków na ciele — jedna liczba, jak moc; budowa odrzucana z `NoCrew` przy braku (`systems/build.rs`). **Nie ma w symulacji:** populacji i jej przyrostu, potrzeb życiowych, spadku wydajności przy niedoborze, typów ludzi, załogi na statkach (`Spacecraft` nie ma pola załogi, rozkaz lotu nie sprawdza załogi), kolonistów w ładowni. Dziś = wariant „tylko pojemność" (Q9 a), bez dynamiki; dynamika z §4.5 jest tylko w dokumencie.
  * Brak w dokumentach: naukowców, laboratoriów i mechaniki badań (wizja wymienia „centra badawcze" oraz „stacje badawcze dające pasywne bonusy"; progresja = poziomy HQ i budynków, §3.1). Role korporacji „górnik, inżynier, kupiec" (05-SOCIAL) to etykiety graczy bez mechaniki — kolizja nazewnictwa z personelem.
- **Konsekwencje:**
  1. *Q9 się przesuwa:* #8 praktycznie wyklucza „tylko pojemność" jako jedną liczbę; pytanie, ile dynamiki (przyrost, szkolenie, niedobór) wchodzi.
  2. *Model danych:* bilans załogi z jednej liczby na wektor (3 typy) per ciało / statek / stacja; katalog budynków i pojazdów: z jednej kolumny „Załoga" na trzy (ok. 45 budowli × L1–L5, 10 pojazdów, klasy międzygwiezdne) — duża praca balansowa; reguły `NoCrew` per typ; stan świata (liczniki ludzi), zdarzenia (przyrost, szkolenie, przylot); nowe reguły tylko w Rust (R-20); koszt obliczeniowy znikomy, zmiana protokołu repliki i hasha stanu.
  3. *Naukowcy potrzebują pracy do wykonania:* w projekcie nie ma mechaniki badań. Jeśli naukowcy mają coś robić (badania → odblokowania, plany statków (Q8 a), receptury), wchodzi nowy system (laboratorium/instytut, punkty badań, lista lub drzewko badań) — duży zakres i zmiana zasady „progresja = poziomy HQ i budynków". Jeśli tylko obsadzają budowle, wystarczy etykieta i osobny limit.
  4. *Inżynierowie:* naturalni kandydaci na budowę i rozbudowę (stocznie, doki, Atanor L3+, reaktory), ewentualnie limit równoległych budów lub tempo budowy. Uwaga: projektowanie w Atanorze robi gracz, nie postacie.
  5. *Ludzie na statkach:* statek wymaga załogi (typ i liczba wg klasy) → rozkaz lotu sprawdza załogę; załoga zajęta w statku nie pracuje w kolonii (Q9: pojemność vs. znika na czas lotu); ludzie jako ładunek (pasażerowie, kolonizacja Księżyca / stacji / układów) wymagają modułów pasażerskich w klasach statków; koloniści w Arce lub okręcie kolonizacyjnym (200 osób) przestają być opisem fabularnym.
  6. *Stacje:* własna załoga stacji (moduł mieszkalny, tlen, woda, żywność) czy czerpanie z puli planety (dziś pula jest per ciało, orbita nie ma własnej) — do rozstrzygnięcia; wpływa na logistykę zaopatrzenia stacji.
  7. *Cena ryzyka:* utrata statku lub zbliżenie do gwiazdy (#7) = utrata ludzi (specjalistów) — realna kara; łączy się z Q11 (c).
  8. *Progresja i miękka blokada:* specjaliści jako bramka tempa (np. inżynierowie na stocznię i Dok, naukowcy na Akcelerator / Atanor L4) dodają głębi, ale grożą miękką blokadą na starcie (0 naukowców, a pierwsze laboratorium ich wymaga) → konieczny skład osobowy startu (W12) i droga awaryjna.
  9. *Koloniści i kolonizacja:* gwiazdolot zabierający 200 osób zabiera też specjalistów (drenaż układu macierzystego); skład kolonistów to decyzja gracza lub reguła.
  10. *UI:* panel ludzi (struktura wg typów, niedobory), wymagania na karcie budynku i statku, domyślnie automatyczny przydział (priorytety jak moc), ręczny tylko tam, gdzie wnosi decyzję; ostrzeżenia o niedoborze.
  11. *Social:* najem specjalistów u frakcji NPC / w hubach jest naturalnym ujściem kredytów (S1); wymiana specjalistów między graczami niepotrzebna w MVP.
  12. *Zakres:* od małego (typy i limity, bez dynamiki) do dużego (populacja z przyrostem i szkoleniem, ludzie jako ładunek, system badań). Rozmiar zależy od Q12 / Q13.
- **Powiązania:** Q9, #6, #4 (Q5 zestaw startowy), #7 (Q11 c), EXP-3 (załoga: pojemność czy populacja), WIZ-7 (fantazja gracza), SOC-2 (role w korporacji), S2/S3, dok. ekonomii §4.5, §5.4, §6, §9.5.
- **Konflikty z decyzjami:** EXP-3 (rekomendacja: pojemność + potrzeby życiowe, pełna symulacja populacji poza zakresem) ↔ typy specjalistów i ludzie na statkach; zasada „progresja = poziomy HQ i budynków" (§3.1) ↔ naukowcy i badania (jeśli wchodzą); nazewnictwo „inżynier / górnik / kupiec" (role korporacji) ↔ typy personelu.
- **Otwarte pytania:** Q12, Q13 (Q9 rozstrzyga się razem z nimi).

### #9 — Encyklopedia projektu: spis obiektów, mechanik, surowców i innych assetów · temat: T12 Dokumentacja, katalog i encyklopedia · status: doprecyzowany (etap 1 dla zespołu, etap 2 później oba widoki; Q14 zamknięte) · 2026-11-10
- **Słowa użytkownika:** „Projekt potrzebuje „encyklopedię" spis: obiektów, mechanik, surowców i innych assetów".
- **Interpretacja (moja, NIEpotwierdzona):** jedno miejsce z hasłami (ID, opis, parametry, powiązania) dla: obiektów (budynki, pojazdy, statki, stacje, ciała niebieskie), mechanik (energia, załoga, paliwo, handel, Atanor…), surowców (materiały, tier, receptury) i pozostałych assetów (modele 3D, ikony, tokeny, teksty). Nie wiem: dla kogo (zespół / gracz / oba), czy ma być generowana z danych, gdzie ma żyć.
- **Stan w projekcie:**
  * Plan 04 (PROPOZYCJA, niezaimplementowana — w trasach aplikacji brak `catalog`/`katalog`): trasa `#/katalog` w web-game (D-1) z sekcjami Modele (manifest.json, podgląd 3D, LOD, budżety, licencje), Mapowanie (rodzaj → części i poziomy), Materiały i budynki (katalog ekonomii, receptury jako graf przepływu), Gwiazdy (41), Ikony i tokeny, Słownik (teksty UI); publikacja GitLab Pages (D-2); generator strony dokumentacji (D-3: GitLab Markdown do E3, potem MkDocs?).
  * Docs-as-code: tabele generowane z modelu (`npm run econ:docs`, `{{GEN: …}}`, `econ:check`), „jedno źródło liczb"; rejestr modeli generowany z manifestu; `docs/DECISIONS.md` i `game-design-questions.md` z systemem ID (WIZ / EKO / SOC / MP / MON / MVP / TECH / POC; R / W / S / U / A / G / T / EXP); teksty UI w `apps/game/src/app/i18n/pl.ts`; dok. ekonomii z materiałami, budynkami, pojazdami, recepturami.
  * Czego brakuje: haseł o mechanikach (reguły żyją w kodzie i dokumentach, nie w danych), statków / stacji / ciał / klas jako haseł w planowanym katalogu, spisu „innych assetów" (np. dźwięki — audio w projekcie nie występuje), wersji dla gracza.
- **Konsekwencje:**
  1. *Jedno źródło prawdy:* encyklopedia generowana z katalogu danych, manifestu i słownika UI, nie pisana ręcznie (zasada planu 04). Zależy od kompletności katalogu: #1–#8 dodają klasy statków, paliwa, typy personelu, plany, badania → mają trafić do katalogu jako dane (G-A, G-E, G-H), a encyklopedia dostaje je automatycznie.
  2. *Mechaniki to nie dane:* reguły (energia, załoga, paliwo, handel) to ręczne hasła z ID (np. MECH-…), z parametrami podpiętymi z modelu (Załącznik A) i odsyłaczami do decyzji (DECISIONS, pytania). To praca redakcyjna (rzędu 20–40 haseł), nie programistyczna.
  3. *Wersja dla gracza (jeśli b / c):* teksty w i18n, ton, kontrola spoilerów — odblokowywanie haseł postępem (era, Skanowanie, sonda, badania naukowców #8) → nowy stan „odkryte" (świat lub konto), mała, ale trwała zmiana zapisu i protokołu; powiązanie z `revealed` ciał i sondą (§9.4). Podgląd 3D wymaga renderera: jeden kontekst WebGL naraz (W13).
  4. *Wersja dla zespołu:* rozszerzenie `#/katalog` + Pages; sprawdzanie pokrycia w CI (każdy element katalogu ma wpis i podgląd; linki działają, `docs:links`); definicja ukończenia: nowa klasa statku nie jest gotowa bez wpisu (opis, parametry, model, ikona).
  5. *Skala:* ok. 200–300 haseł (37 materiałów, ok. 45 budowli, 10 pojazdów + rodzina klas międzygwiezdnych, ciała i biomy, 41 gwiazd, 20–40 mechanik, modele i ikony). Generator układów (#4) tworzy ciała w czasie gry — hasła dotyczą typów (klasy gwiazd, biomy), nie instancji.
  6. *Zalążek:* słownik pojęć z tego dziennika (statek międzyplanetarny / międzygwiezdny, skok startowy, Kapsuła fuzyjna, Antymateria, Załoga, plan…) — propozycja dla artefaktu (Q15).
  7. *Kolejność:* treść po ustabilizowaniu modelu danych (klasy, paliwa, personel), inaczej duplikacja pracy; szablon wpisu i system ID można ustalić wcześnie.
- **Powiązania:** plan 04 (D-1, D-2, D-3), plan 03 (manifest, rejestr modeli), `game-design-questions.md`, `DECISIONS.md`, TECH-7 (pipeline assetów), W13 (jeden kontekst WebGL), W16 (i18n), #1–#8.
- **Konflikty z decyzjami:** brak; rozszerza D-1 (`#/katalog`) o mechaniki i obiekty spoza materiałów / budynków oraz ewentualnie o widok gracza.
- **Doprecyzowanie (Q14 → odpowiedź „Póki co (a) dla dev. Docelowo na dalszym etapie (c)", 2026-11-10):** etap 1 = encyklopedia dla zespołu (dokumentacja z ID, generowana z danych); etap 2 (później) = oba widoki z jednego źródła: pełny dla zespołu, odblokowywany postępem dla gracza.
- **Konsekwencje po Q14:**
  1. Etap 1 mieści się w planie 04 (D-1 `#/katalog`, D-2 Pages, docs-as-code); nie dotyka gry ani zapisu świata ani protokołu. Koszt: szablon wpisu, system ID, ok. 20–40 ręcznych haseł o mechanikach, generatory z katalogu i manifestu, sprawdzanie pokrycia w CI.
  2. Żeby nie przerabiać przy etapie 2: szablon wpisu od razu przewiduje pola dla gracza (warunek odblokowania, tekst fabularny / ton, klucze i18n), ale ich nie implementujemy; dane „dev" (budżety trójkątów, licencje, ścieżki plików, ID decyzji) rozdzielone od „gracza" (nazwa, opis, liczby jawne). Widoczność jako dane, nie kod.
  3. Etap 1 może ruszyć na istniejących danych (materiały, budynki, pojazdy, gwiazdy); nowe encje z #1–#8 dochodzą wraz z katalogiem (G-A, G-E, G-H).
  4. Plan 04 umieszcza przeglądarkę assetów w E3 (pełna trasa z podglądem 3D). Jeśli encyklopedia ma wcześniej służyć jako referencja zespołu (i agentów), wystarczy lekka wersja: Markdown generowany z katalogu, bez podglądu 3D (propozycja agenta, nie ustalenie).
- **Otwarte pytania:** Q15 (zalążek w artefakcie); W19 (gdzie żyje wersja dev) w kolejce.

### #10 — Statki międzygwiezdne budujemy na orbicie, w kosmicznej stoczni · temat: T5 Flota, logistyka, galaktyka (+ T2 Ekonomia) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Statki międzygwiezdne budujemy na orbicie - w kosmicznej stoczni."
- **Interpretacja (moja, do potwierdzenia):** wszystkie klasy międzygwiezdne (#1) powstają wyłącznie w budowli orbitalnej (stoczni), nie na powierzchni. Nie wiem: która to budowla (Stocznia orbitalna, Dok gwiezdny, czy nowy obiekt „Kosmiczna stocznia"), ani czy statki międzyplanetarne budujemy gdzie indziej (powierzchnia: Lądowisko / Garaż).
- **Stan w projekcie:**
  * Dok. ekonomii §5.2 H. Orbita: **Stacja orbitalna** (hub orbitalny ciała: docki 2 / 3 / 4 / 6 / 8, magazyn stacji 5000 j. ×1,8 na poziom, tankowanie od L2, przeładunek między statkami od L3, osłony i port dalekiego zasięgu od L4; wymaga Montowni i HQ L2); **Stocznia orbitalna** (wymaga Stacji L2 i HQ L3; L1: Frachtowiec, Górnik, Sonda; L2: Tankowiec i Mk II; L3: Mk III; L4: 2 sloty i sonda międzygwiezdna; tempo budowy ×1,5 na poziom; moc −20 → −61 MW; załoga 15); **Dok gwiezdny** (wymaga Stoczni L3 i HQ L4; poziom n = moduł n gwiazdolotu; moc −60 → −265 MW; załoga 30); Wyrzutnia masy (wystrzeliwuje ładunek na orbitę bez paliwa, tylko ciała o niskiej grawitacji: Księżyc, Glacja; 2 → 6,5 j./min, salwy po 20 j.). Astraeus i Prom powstają na Lądowisku L2+ (powierzchnia).
  * Kod: **nie ma produkcji statków** — jedyne wystąpienie „Stocznia" w `game-core` to wpis w `catalog.json`; budowle orbitalne mają 0 kafelków i wspólną pulę z ciałem (`rules.rs`); nie ma rozkazu budowy statku, slotów, zdarzeń ukończenia ani docków. Jedyne statki to startowe (transport PoC, Arka-1). Wynoszenie towarów na orbitę (Prom, Wyrzutnia masy) — w symulacji nie sprawdzano.
- **Konsekwencje:**
  1. *Brakujący system:* produkcja statków (rozkazy budowy / modernizacji, sloty, czas, zużycie materiałów, moc, załoga, wymaganie planu (Q8), zdarzenia ukończenia, docki) jest w całości nowa. Spina #1, #2, #6, #8 w jeden kawałek pracy (G-J).
  2. *Wyniesienie na orbitę:* jeśli stocznia pobiera materiały z magazynu stacji (nie z puli planety), trzeba je wynieść. Rdzeń gwiazdolotu to ok. 14,6 tys. j. półproduktów (kadłub 3600, osłona 3680, habitat 4800, napęd 2040, komputer 460; bez paliwa) = ok. 182 kursów Promu Mk III (80 j.) albo ok. 37 h pracy Wyrzutni masy L3 (6,5 j./min), ok. 5 dni na L1 (2 j./min). Magazyn Stacji (5000 j. na L1 → ok. 52 tys. na L5) staje się twardym limitem rozmiaru jednorazowego zlecenia. Logistyka orbitalna (Prom, Wyrzutnia masy, Frachtowiec, tankowanie) staje się rdzeniem późnej gry. Rozstrzygnięcie: budowa bierze z magazynu stacji (wynoszenie obowiązkowe) czy z puli ciała (jak budowa na powierzchni, EXP-4) — Q17.
  3. *Orbita bez własnego bytu:* w modelu orbita to budowle bez kafelka na ciele. Docki Stacji (2–8) wymagają nowego ograniczenia (ile statków przycumowanych jednocześnie na ciele); sloty stoczni (L4: 2) i docki to dwa osobne limity.
  4. *Wyrzutnia masy tylko na ciałach o niskiej grawitacji* → generator układów (#4) musi zapewniać Księżyc / Glację albo gracz zdany jest na Promy (start z powierzchni Planety macierzystej 10 u paliwa × ok. 182 kursy = ok. 1820 u paliwa na rdzeń gwiazdolotu — realny koszt przy paliwie jako towarze, #3). W24.
  5. *Bramka progresji:* orbita wymaga Stacji L2 (Montownia, HQ L2), Stoczni (HQ L3), Doku (HQ L4) → flota międzygwiezdna nie wcześniej; spójne z #5 (Atanor L3, Hel-3 / Deuter, dni 11–20).
  6. *Załoga stoczni (#8):* stocznia i dok to naturalne miejsce dla inżynierów (Q12); orbita wymaga podtrzymania życia (woda, tlen, żywność) — dziś pula ludzi jest per ciało, więc załoga stoczni to ludzie z planety (W15: własna pula stacji).
  7. *Moc:* stocznia −20 … −61 MW i dok −60 … −265 MW to duże obciążenia; energia orbitalna z Satelitów energetycznych / rektenny (moc per ciało).
  8. *Gdzie stać:* stacja jest hubem ciała — czy stocznia może powstać na orbicie dowolnego ciała (Księżyc: niska grawitacja i Wyrzutnia masy; Glacja; Gigas), czy tylko planety macierzystej / Księżyca? Strategia: stocznia przy Wyrzutni masy ułatwia wynoszenie (W22).
  9. *Start i przylot:* statek startuje z orbity (bez lądowania), więc po ukończeniu nie wymaga lądowisk ani promów; przylot do układu docelowego: dolatuje do orbity planety (musi mieć napęd i paliwo lokalne, por. #5) czy zostaje na obrzeżu, a ładunek przejmują statki międzyplanetarne? (W23).
  10. *Klasy i poziomy:* poziom stoczni bramkuje klasy i poziomy Mk (dziś: L1 Frachtowiec / Górnik / Sonda, L2 Tankowiec i Mk II, L3 Mk III); dla rodziny międzygwiezdnej trzeba przypisać klasy do poziomów stoczni / doku (Q16).
- **Powiązania:** #1, #2, #5, #6, #8, W8 (gdzie budować), W15, EXP-4, dok. ekonomii §5.2 H, §6.2–6.3, §9.1.
- **Konflikty z decyzjami:** brak; doprecyzowuje W8. Pozorne: dok. ekonomii mówi, że Astraeus i Prom powstają na Lądowisku (powierzchnia), a Stocznia orbitalna buduje resztę statków; #10 mówi o budowie międzygwiezdnych na orbicie — do uściślenia, czy międzyplanetarne budujemy gdzie indziej (Q16 d).
- **Otwarte pytania:** Q16 (która budowla), Q17 (skąd materiały).

> Wiadomość z 2026-11-10 zawierała pięć pomysłów naraz (#11–#15), spójny klaster: struktura galaktyki, start, odkrywanie, wykrywanie graczy, kontakt. Temat: T13 Galaktyka wspólna, odkrywanie i kontakt.

### #11 — Jedna galaktyka dla wszystkich graczy · temat: T13 · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Gra dla wszystkich graczy odbywa się w jednej galaktyce."
- **Interpretacja (moja, do potwierdzenia):** wszyscy gracze współdzielą jedną mapę gwiazd i jeden rejestr zajętości (nie osobne światy / serwery per grupa). Światy (kolonie) mogą pozostać prywatnymi instancjami (WIZ-1 = C).
- **Stan w projekcie:** WIZ-1 = C (instancjonowana kolonia + wspólne rynek i galaktyka; Z5 potwierdzone) już zakłada wspólną galaktykę; MP-2 bez zapisanej decyzji (rekomendacja: C w MVP, docelowo B = galaktyka i układy wspólne, powierzchnie prywatne); `GalaxySim` (mock i port w `game-session`) ma graczy z `homeStar` (plansza „Galaktyka": kolonie innych graczy przy Procyon A i Alpha Centauri); serwis galaktyki w galaxy-b6 (huby, kontrakty, korporacje); katalog 41 gwiazd (`stars.data.ts`). WIZ-4: w promieniu ~20 ly jest rzędu stu układów — „za mało na tysiące graczy we wspólnym świecie" (rekomendacja: C hybryda, bez zapisanej decyzji; dok. ekonomii odwołuje się do „WIZ-4 = C"). MP-3 (rekomendacja: cel 1–5 tys. aktywnych, pierwsze testy 50–200), MP-4 (rekomendacja: sezony) — bez decyzji.
- **Konsekwencje:**
  1. *Skala galaktyki:* jedna galaktyka dla wszystkich graczy musi mieć wystarczająco dużo układów (przy wyłączności #14: co najmniej tyle, ile graczy, plus zapas na odkrywanie) → proceduralna lub hybrydowa (WIZ-4 B / C): realne gwiazdy (41) jako rdzeń i huby, reszta generowana deterministycznie z ziarna; gęstość i rozmiar dobrane do liczby graczy i promieni teleskopów (#13).
  2. *Jeden serwis galaktyki* jako źródło prawdy o gwiazdach, zajętości i odkryciach; światy graczy pozostają prywatne — wzorzec B6 (rozkazy systemowe do dzienników światów, jak `HUB_DELIVERY`) rozszerza się o zajętość / odkrycia.
  3. *Wzrost i resety:* gdy przybywa graczy, rośnie zajętość → galaktyka rosnąca, sezony (MP-4) lub resety; decyzja o skończoności galaktyki (W30).
  4. *Mapa w kliencie:* dziś 41 gwiazd (R9: ok. 185 draw calls) → przy tysiącach gwiazd `Points` / instancing i mgła wojny (#13).
  5. *Single-node first:* kilka–kilkadziesiąt tysięcy rekordów gwiazd to mało danych; ograniczeniem nie jest pamięć, tylko generator i UI.
- **Powiązania:** WIZ-1, WIZ-4, MP-2, MP-3, MP-4, POC-3 (dane gwiazd), G1, #4, #12–#15.
- **Konflikty z decyzjami:** brak (zgodne z WIZ-1 = C); przyspiesza decyzję WIZ-4 (rekomendacja C) i MP-2 (docelowo B).
- **Otwarte pytania:** W30 (skończoność, sezony) w kolejce.

### #12 — Gracze startują z miejsca pozwalającego na ekspansję międzyplanetarną · temat: T13 (+ T8 start) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Gracze startują z miejsca pozwalającego na ekspansję międzyplanetarną."
- **Interpretacja (moja, NIEpotwierdzona):** układ startowy ma zawierać ciała i zasoby, które umożliwiają rozwój wewnątrz układu (kilka ciał: planeta, księżyc, pas asteroid, ewentualnie gazowy olbrzym), nie „martwe" starty; ekspansja międzygwiezdna jest późniejszym etapem. Nie wiem: kryteria, ani czy start jest wybierany (#4) czy przydzielany.
- **Stan w projekcie:** dok. ekonomii: układ macierzysty (Pyros, Planeta Matka, Księżyc, Pas asteroid, Gigas, Glacja, Kerys), nowe ciała odblokowują się erami (Księżyc w E2, pas w E3, Gigas w E4); Tau Ceti: 5 planet + pas (`tau_ceti.rs`), domyślny start (W06 A); tylko 7 z 21 gwiazd katalogu ma znane planety (pozostałe: „pasy asteroid i małe ciała", §9.3); mnożnik energii paneli ×0,05–×8.
- **Konsekwencje:**
  1. *Kryteria „dobrego startu"* jako wymagania generatora układów: min. liczba i typy ciał (planeta do lądowania, księżyc / ciało o niskiej grawitacji dla Wyrzutni masy, pas asteroid, ewentualnie olbrzym), zasoby (woda / lód, węgiel, metale — por. #3, #6), energia (czerwone karły ×0,05 odpadają). Odpowiada częściowo na W4 (czerwone karły na start) i W24 (ciało o niskiej grawitacji).
  2. *Układy bez tych cech* nie są startowe, ale mogą być celami późniejszej ekspansji (skok międzygwiezdny, #1).
  3. *Skończony zasób dobrych startów* przy wyłączności układów (#14) → alokacja / generowanie na żądanie, ochrona nowych graczy (W33).
  4. *Relacja z #4:* wybór gwiazdy startowej skokiem vs start przydzielany — Q18.
- **Powiązania:** #4, #10, #11, #13, #14, W4, W24, WIZ-4, dok. ekonomii §3.2, §9.3.
- **Konflikty z decyzjami:** W06 A (domyślny start Tau Ceti) ↔ start w wolnym układzie z potencjałem ekspansji; 14 z 21 gwiazd katalogu bez planet ↔ wymóg startu.
- **Otwarte pytania:** Q18; W31 (kryteria) w kolejce.

### #13 — Odkrywanie światów: teleskopy i czas analizy sygnałów; im większe i bardziej zaawansowane, tym większy promień odkrytych gwiazd · temat: T13 (+ T4/T8 naukowcy, rozwój) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Do odkrywania nowych światów potrzebne są teleskopy i czas analizowania sygnałów. Im większe i bardziej zaawansowane teleskopy tym większy promień odkrytych gwiazd."
- **Interpretacja (moja, NIEpotwierdzona):** mgła wojny na mapie galaktyki: gracz widzi tylko gwiazdy w promieniu zależnym od swoich teleskopów (budowle z poziomami: rozmiar × zaawansowanie); szczegóły układu (planety, zajętość) wymagają czasu analizy sygnałów (proces w czasie). Nie wiem: gdzie stoją teleskopy (powierzchnia / orbita / głęboka przestrzeń), co ogranicza analizę (czas, naukowcy, energia, moc obliczeniowa), czy promienie kolonii się sumują, jak wygląda stan początkowy.
- **Stan w projekcie:** w dokumentach i katalogu budowli **nie ma teleskopów ani analizy sygnałów** (wizja wymienia tylko „centra badawcze" i „stacje badawcze dające pasywne bonusy"). Odkrywanie dziś to Sonda (Mk I wewnętrzny, Mk II zewnętrzny układ, Mk III sonda międzygwiezdna 17 ly; odsłania profil układu docelowego, §9.4) i Skanowanie po przybyciu (15 min; `BodyProfile.revealed`). Mapa galaktyki w kliencie pokazuje wszystkie 41 gwiazd z kartą (dane astrofizyczne); `GameApi.catalog().stars` zwraca całość.
- **Konsekwencje:**
  1. *Nowa warstwa „odkrycie" w galaktyce:* stan per gracz — teleskopy (poziomy), postęp analizy, wyniki. Zbiór odkrytych gwiazd w dużej mierze *wyliczany* (pozycje kolonii × promień teleskopów), trwały stan tylko dla postępu i wyników; mało danych.
  2. *Teleskopy jako nowe budowle w katalogu:* poziomy (rozmiar) × zaawansowanie; miejsce (powierzchnia ograniczona atmosferą, orbita przy Stacji, głęboka przestrzeń) — W25; zużywają moc i załogę (naukowcy, #8); naturalny megaprojekt korporacji (S3: wspólny „Wielki teleskop" z bonusem dla wszystkich członków — wizja).
  3. *Czas analizy:* proces w czasie (godziny–dni) bramkowany naukowcami (#8), energią lub mocą obliczeniową (W27). Daje naukowcom konkretną rolę (Q12 c): analiza sygnałów zamiast abstrakcyjnych „badań".
  4. *Promień odkrycia a zasięg napędów:* odkrycie powinno przewyższać zasięg napędu (5 → 17 ly), aby tworzyć cele znane, lecz nieosiągalne; skala promienia od kilku ly do dziesiątek / setek ly; liczba gwiazd rośnie z R³ → tempo napływu informacji, filtry i priorytety w UI.
  5. *Zmienia #4:* wybór gwiazdy startowej ogranicza się do tego, co odkryte i przeanalizowane (podstawowy teleskop na statku?) — Q18.
  6. *Klient i serwer:* mgła wojny — warstwy mapy (nieznane / wykryte / przeanalizowane / zajęte); serwer wysyła tylko odkryte dane (autorytatywność, MP-6), nie pełny katalog; analiza kończy się zdarzeniem (rozkaz systemowy do dziennika świata, jak `HUB_DELIVERY`) albo żyje w serwisie galaktyki i jest sprawdzana przy rozkazie lotu.
  7. *Ekonomia i progresja:* teleskopy to ujście zasobów, energii i ludzi oraz drugi kierunek rozwoju („wiedza" obok produkcji); odkrywanie = źródło celów dla floty międzygwiezdnej (#1) i gwiazdolotu (Z1).
- **Powiązania:** #1, #4, #8 (naukowcy), #11, #14, #15, §9.4 (sonda), POC-3 (dane gwiazd), G1, S3 (megaprojekty), WIZ-3 (cel w układzie: gwiazdolot i wybór kolejnej gwiazdy), MP-6.
- **Konflikty z decyzjami:** mapa pokazująca wszystkie gwiazdy ↔ mgła wojny; §9.4 (sonda jako jedyny sposób poznania profilu układu) ↔ teleskopy jako drugi sposób — do rozdzielenia ról (teleskop: wykrycie i zajętość, sonda: szczegółowy profil?).
- **Otwarte pytania:** Q18; W25, W27, W32 w kolejce.

### #14 — Analiza sygnałów pozwala sprawdzić, czy układ jest zajęty przez gracza · temat: T13 (+ T6 Social) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Analiza sygnałów z układów gwiezdnych pozwala nam sprawdzić czy są zajęte przez gracza."
- **Interpretacja (moja, NIEpotwierdzona):** układ może być zajęty przez gracza (sugeruje wyłączność); po analizie sygnałów widać, czy i przez kogo — gracz zostaje „odkryty". Nie wiem: czy układ ma wyłączność (jeden gracz), czy wykrycie ujawnia tożsamość (callsign), czy jest wzajemne.
- **Stan w projekcie:** `GalaxySim` ma graczy z `homeStar`; WIZ-1 = C: kolonie instancjonowane (wielu graczy mogłoby technicznie wybrać tę samą gwiazdę we własnych światach); MP-2: C w MVP, docelowo B; plan 06: karta gracza (callsign, flaga, kolor, awatar, korporacja, motto), „widok obserwacji cudzej kolonii" (02 §6: `Subscribe` = Events + migawka 1 Hz) — koncepcja obserwacji istnieje.
- **Konsekwencje:**
  1. *Rejestr zajętości gwiazd* w serwisie galaktyki (gwiazda → właściciel). Przy wyłączności: wyścig o dobre układy, alokacja, ochrona nowych graczy; bez wyłączności „zajęte" to informacja, nic nie blokuje (Q19). Wyłączność jest zgodna z instancjonowanymi światami: zajętość to wpis w galaktyce, nie współdzielony świat.
  2. *Wykrywalność jako mechanika:* im bardziej rozwinięty układ (emisje mocy, flota), tym łatwiej go wykryć; możliwe ekranowanie / ukrywanie (W26).
  3. *Prywatność i bezpieczeństwo:* wykrycie ujawnia istnienie i położenie gracza; w połączeniu z #15 otwiera kanał komunikacji → ryzyko nękania, potrzebne wyciszanie i blokady (Q20).
  4. *Wyścig o układy startowe (#12)* przy wyłączności: nowy gracz startuje coraz dalej od centrum lub galaktyka rośnie (W30); minimalna odległość od innych graczy na starcie (W33).
  5. *Handel i kontakty:* odkryci gracze jako partnerzy zleceń gracz–gracz (S1 / S2) i kandydaci do korporacji (zaproszenia); huby NPC — odkryte domyślnie? (W32).
  6. *PvP:* bez PvP (WIZ-6 rekomendacja) wykrycie nie niesie zagrożenia; ze zmianą zasady wykrycie = rozpoznanie.
  7. *Serwer:* odpowiedź „zajęte przez X" zwracana dopiero po zakończeniu analizy (autorytatywnie); klient bez pełnej listy graczy i gwiazd.
- **Powiązania:** #11, #12, #13, #15, WIZ-1, MP-2, MP-3, WIZ-6, G1, plan 02 §6 (obserwacja kolonii), plan 06 (karta gracza).
- **Konflikty z decyzjami:** WIZ-1 = C / MP-2 (C w MVP): wyłączność układu wymaga rejestru zajętości, ale nie zmienia instancjonowania; wspólne układy z wieloma graczami = MP-2 B (docelowo).
- **Otwarte pytania:** Q19 (wyłączność), Q20 (wzajemność); W26, W33 w kolejce.

### #15 — Wiadomości do „odkrytych graczy" · temat: T13 (+ T6 Social) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Gracz może wysyłać wiadomości do „odkrytych graczy"."
- **Interpretacja (moja, NIEpotwierdzona):** prywatne wiadomości między graczami możliwe tylko wobec graczy, których układ został odkryty przez analizę sygnałów (#14). Nie wiem: czy odkrycie jest wzajemne, czy wiadomości mają opóźnienie (odległość / prędkość sygnału), czy to wolny tekst czy gotowe komunikaty, jaka moderacja.
- **Stan w projekcie:** SOC-6 bez zapisanej decyzji (rekomendacja B: czat korporacji i hubu, tablica kontraktów, powiadomienia asynchroniczne; A bez czatu; C czat globalny + prywatne); plan 05 §7: kanały korporacja / sojusz / hub, **bez czatu globalnego, wiadomości prywatne „później"**; filtr słów, zgłoszenia, wyciszanie, retencja 30 dni; RODO (eksport i usunięcie danych, plan 06); S2 (korporacje: zaproszenia, czat) zrobione w galaxy-b6.
- **Konsekwencje:**
  1. *Graf znajomości buduje się eksploracją:* ogranicza spam i nękanie (brak globalnego czatu), ale utrudnia grę ze znajomymi z prawdziwego życia — potrzebna droga: zaproszenie po callsign / kodzie, korporacja (członkowie znają się z definicji), start obok (W29).
  2. *Wolny tekst wymaga moderacji:* filtr, zgłoszenia, wyciszanie / blokady, retencja 30 dni, RODO; plan 05 zakłada „prywatne później", #15 przyspiesza je (albo ogranicza do gotowych komunikatów).
  3. *Opóźnienie sygnału:* opóźnienie proporcjonalne do odległości (np. jak przesyłki 2 h/ly) wzmacnia klimat i zmniejsza spam, ale utrudnia rozmowę; alternatywa: opóźnienie kosmetyczne (W28).
  4. *Wzajemność:* jednostronne odkrycie pozwala napisać do kogoś, kto o nas nie wie; wiadomość ujawnia nadawcę → potrzebne zasady odpowiedzi, wyciszania i limit pierwszej wiadomości (Q20).
  5. *Korporacje i sojusze:* zaproszenia do odkrytych graczy; czat korporacji niezależny od odkrycia.
  6. *Implementacja:* skrzynka (inbox), liczniki nieprzeczytanych, powiadomienia, protokół (`Galaxy::Message*`), persystencja (pliki / PostgreSQL), eksport RODO; callsign, flaga, kolor (plan 06) jako to, co widzi odkryty gracz.
- **Powiązania:** SOC-6, plan 05 §7, plan 06, S2, #14, WIZ-6, MP-6.
- **Konflikty z decyzjami:** SOC-6 rekomendacja B / plan 05 („wiadomości prywatne później") ↔ #15 przyspiesza wiadomości prywatne i bramkuje je odkryciem.
- **Otwarte pytania:** Q20; W28, W29 w kolejce.

### #16 — Podróż międzygwiezdna jest długa: poziomy prędkości nadświetlnej (warp); lot trwa od kilku godzin do kilku dni · temat: T5 Flota, logistyka, galaktyka (+ T8 Czas) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Podróż międzygwiezdna jest długa podróżą. Trzeba wprowadzić do gry poziomy prędkości nadświetlnej wrap. Podróż taka może trwać od kilku h do kilku dni !" („wrap" czytam jako warp.)
- **Interpretacja (moja, NIEpotwierdzona):** wprowadzamy skalę poziomów warp (Warp 1 … N) jako cechę napędów statków międzygwiezdnych; lot trwa od kilku godzin (najlepszy warp, bliska gwiazda) do kilku dni (słabszy warp, dalsza gwiazda). Nie wiem: czy poziom warp to stała cecha napędu (jak Mk I–IV), czy wybierany przy każdym locie (szybciej = więcej paliwa na ly) — Q21 — ani jakie są dokładne skrajne czasy.
- **Stan w projekcie:** dok. ekonomii §9.2: napędy Mk I–IV = zasięg 5 / 9 / 12,5 / 17 ly, czas 12 / 9 / 7 / 4 h na ly (Mk IV: antymateria); paliwo 40 Kapsuł fuzyjnych na ly; sonda międzygwiezdna 2 h/ly (Proxima ok. 8,5 h); przesyłki do hubów w kodzie: handling + d_ly × 7200 s/ly (2 h/ly), stała, bez napędu i statku (`exchange.rs`); tempo: 1 jednostka modelu = 1 min (EKO-1), krok serwera 1 s (R-4); limit offline 12 h (R-5) dotyczy świata, loty żyją w serwisie galaktyki (#1). Wizja: ekspedycja na pas 20 min, kolonizacja odległej planety 3 h.
- **Obliczone z obecnych parametrów (agent, do kalibracji):** Proxima (4,24 ly): Mk I 51 h (2,1 doby), Mk IV 17 h; Syriusz (8,6 ly): Mk II 77 h (3,2 doby), Mk IV 34 h; Tau Ceti (11,91 ly): Mk III 83 h (3,5 doby), Mk IV 48 h (2 doby); 17 ly na Mk IV: 68 h (2,8 doby). Obecne napędy dają więc ok. 17 h – 3,5 doby: górny koniec („dni") jest, „kilka godzin" nie osiąga żaden napęd; do kilku godzin dla bliskich gwiazd potrzebna prędkość rzędu ≤ 1 h/ly.
- **Konsekwencje:**
  1. *Mapowanie:* poziomy warp = rozszerzenie / przemianowanie napędów Mk I–IV: poziom → prędkość (h/ly), zasięg (ly), paliwo na ly, wymagania. #16 dokłada dolny zakres czasu (kilka godzin) i czyni poziomy cechą całej rodziny klas (#1), nie tylko gwiazdolotu.
  2. *Kalibracja czasu:* cel „kilka godzin – kilka dni" wymaga skali ok. 12 → ≤ 1 h/ly przy dystansach 4–17 ly; przy większym promieniu odkrycia (#13) i zasięgu rośnie czas dla odległych celów, więc górny koniec skali wyznacza użyteczny zasięg. Propozycja: tabela poziomów w artefakcie.
  3. *Wybór prędkości (Q21):* stała cecha napędu vs wybór przy każdym locie (szybciej = więcej paliwa na ly, nieliniowo) vs oba — dodatkowa decyzja gracza (czas ↔ koszt) i parametr paliwa (#5).
  4. *Czas i serwer:* loty godziny–dni są naturalne w modelu zdarzeniowym (znaczniki odlotu i przylotu); statek w locie żyje w serwisie galaktyki (loty biegną offline); przylot = zdarzenie / rozkaz systemowy do dziennika świata (wzorzec B6); trwałość lotu (rekord w repozytorium, timer po restarcie), powiadomienia o przylocie, ETA w UI; test czasu przy tempie DEV (galaktyka liczy dziś w sekundach ściany: 7200 s/ly).
  5. *Ekonomia:* czas lotu to koszt kapitału (statek bardzo drogi, #6, zajęty na dni) → mało kursów na tydzień; handel międzygwiezdny jest wolny i wysokomarżowy (spójne z #5 / #6); przepustowość = liczba statków × ładowność / czas cyklu.
  6. *Hibernacja:* lot trwający godziny–dni sprawia, że „habitat hibernacyjny" gwiazdolotu (4800 j. półproduktów, 41 050 kr; §9.1) jest zbędny lub zmienia rolę (zwykły habitat + zapas żywności na czas lotu); rdzeń gwiazdolotu tanieje o ten moduł albo moduł zostaje jako „staza" — W34.
  7. *Związek z #7:* #16 wzmacnia odczytanie (c) w Q10 („każda podróż międzygwiezdna niesie poważne konsekwencje"); możliwy wątek: warp nie działa w studni grawitacyjnej gwiazdy → punkt wyskoku na obrzeżu układu (powiązanie z punktem przylotu, W11, W23), co dodaje etap wewnątrzukładowy na początku i końcu lotu (W35).
  8. *Odkrywanie (#13):* promień teleskopu powinien przewyższać zasięg warp; czas lotu ustala, które odkryte cele są praktycznie osiągalne.
  9. *Komunikacja (#15):* opóźnienie wiadomości mogłoby wynikać z tej samej skali „prędkości sygnału" (W28).
  10. *Wizualizacja:* sekwencja startu i lot po linii na mapie galaktyki (§9.6); efekt warp tani (shader); postęp podróży na mapie.
  11. *Dane:* poziomy warp jako dane w katalogu (G-A): poziom → prędkość, zasięg, paliwo na ly, materiały, Atanor L / Antymateria, koszt; wzór t = narzut + d × h_na_ly(poziom); nowe reguły tylko w Rust (R-20).
- **Powiązania:** #1, #5, #6, #7, #10, #13, #15, dok. ekonomii §9.1, §9.2, §9.6, `exchange.rs`, EKO-1, R-4, R-5, Q10, W23.
- **Konflikty z decyzjami:** §9.1 (habitat hibernacyjny w gwiazdolocie) ↔ loty trwające godziny–dni; §9.2 (czasy 12 → 4 h/ly, minimum ok. 17 h na Proximę) ↔ cel „kilka godzin" (wymaga ≤ 1 h/ly).
- **Otwarte pytania:** Q21; W34, W35, W36 w kolejce.

### #17 — PoC wydobycia surowców z pasów asteroid · temat: T14 PoC i eksperymenty (+ T2 Ekonomia, T5 Flota) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Potrzebujemy poeksperymentować (poc) z wydobywaniem surowców z pasów asteroid"
- **Interpretacja (moja, NIEpotwierdzona):** potrzebny eksperyment (proof of concept), który zweryfikuje, jak wydobycie z pasów asteroid ma działać w grze. Nie wiem: co ma wykazać (skalę i wygląd pasa, rozgrywkę wydobycia, model danych i serwera, balans ekonomii), gdzie ma powstać (osobna aplikacja w `poc/`, tryb w `web-game`, symulacja headless), ani kto i kiedy go wykona.
- **Stan w projekcie:**
  * Wizja (`1-game-description.md` §2): „Pas Asteroid (Mining View)" jako trzeci tryb kamery; `InstancedMesh`, 5 000 asteroid w jednym draw callu, 3 warianty siatek, losowa skala i rotacja na GPU.
  * PoC `space-3d-poc`: jedna asteroida (500 minerałów, Ferryt); `MiningSystem` co 1 s do 10 j., ładownia 50; asteroida maleje wg pierwiastka sześciennego z pozostałych minerałów z dolną granicą 0,4 (`asteroid-shape.ts`, port `math/asteroid.rs`); pełna pętla Planeta → Księżyc → Asteroida → Planeta zweryfikowana (60 FPS).
  * `web-game`: `BeltView` — pas jako 420 skał dekoracyjnych (dwa `InstancedMesh`: `rock_A`, `rock_B`), ziarno z id ciała (mulberry32), pierścień obraca się z ω pasa; wybór = test pierścienia (cały pas jest jednym celem, brak pojedynczych skał). Rust: `MiningSystem`, `ShipState::Mining`, `MiningTick`, `mining_rate = 10`.
  * Dok. ekonomii: pas = 6–10 brył typów M (Ferryt + Platynit), C (Karbonit + Kriol), S (Silicyt); Górnik asteroidowy (Mk I–III: wydobycie 10 / 20 / 40 j./min, ładownia 100 / 200 / 400, załoga 4; wiertło, odłamki, asteroida maleje); **wyprawa jako receptura**: Platynit = 60 Paliwa → 5 Platynitu (+ 95 Ferrytu) w 75 min, 0 MW; 20 Nadprzewodnika / h = 5 wypraw po Platynit i 4 Fabryki atanorowe z rozwiązaniem referencyjnym.
  * Czego brakuje: skały jako indywidualne obiekty (stan, wybór), tryb Mining View, skala 5 000, mechanika aktywnego wydobycia, model danych pasa na serwerze, dowód zgodności wydobycia z recepturą wyprawy.
- **Co PoC mógłby rozstrzygnąć (hipotezy):**
  1. *Wydajność renderu:* czy 5 000 skał w jednym `InstancedMesh` / `BatchedMesh` mieści się w budżetach (≤ 150 draw calls, 200–400 tys. trójkątów, 60 FPS na sprzęcie referencyjnym i słabszym) z LOD i cullingiem; dziś 420 skał.
  2. *Wybór pojedynczej skały:* GPU picking po id instancji albo raycast po siatce przestrzennej, opóźnienie < 16 ms; zaznaczenie, podgląd zasobów (typ M / C / S).
  3. *Model rozgrywki:* (i) automat jak dziś (wyprawa jako timer, skała tylko kosmetyka), (ii) półaktywny (gracz wybiera skałę / typ, przydziela drony), (iii) aktywny (wiercenie jako minigra). Decyduje o zakresie serwera i o tym, czy wydobycie jest „zabawą", czy „logistyką".
  4. *Model danych i serwera:* skała jako kosmetyka klienta (ziarno + frakcja wyczerpania puli pasa) vs stan per skała. Przy wyłączności układów (Q19 a) i instancjonowanych światach nie ma rywalizacji o skały → stan per skała na serwerze zbędny; pas ma pulę, a klient rysuje „przerzedzenie" pasa. Obniża koszt serwera i protokołu.
  5. *Ekonomia i balans:* wyprawa po Platynit jako receptura (60 Paliwa → 5 Pt + 95 Fe w 75 min) vs wydobycie w j./min; ile statków i jakie automatyzacje potrzeba na 20 Nadprzewodnika / h; wpływ wyczerpania (skala do 0,4); regeneracja pasa? Narzędzie: symulacja headless (`sim-cli`, plan 04 §4.2).
  6. *Klucz do mid-game:* Platynit z asteroid M jest wejściem do Nadprzewodnika (Atanor L1) i Katalizatora (L2), a Nadprzewodnik do Kapsuły fuzyjnej (1 szt.) i Procesora kwantowego → całe paliwo międzygwiezdne (#5) i statki (#6) zależą od tempa wydobycia z pasa. Wysoka dźwignia przy niskim koszcie eksperymentu — dobry kandydat na wczesny krok.
  7. *Powiązania z innymi pomysłami:* #8 (załoga górnika: 4 osoby), #3 (Paliwo lokalne: 60 u na wyprawę), #10 (Górnik powstaje w Stoczni orbitalnej L1), #12 (układ startowy musi mieć pas asteroid), #13 (skład pasa M / C / S wykrywany teleskopem lub sondą), #16 (czas wyprawy vs lot międzygwiezdny), #7 (zagrożenia w pasie?).
  8. *Miejsce i tryb pracy:* konwencja PoC-ów — osobna aplikacja w `poc/` (Angular 22 standalone + Three.js 0.187 + vitest, własny port; `domain/` bez zależności od Angular i Three; design-system przez `file:`; `.npmrc` legacy-peer-deps; `CLAUDE.md` i `ANALIZA.md`), jak `space-interior-poc` (port 4430) i `space-3d-poc`. Drzewo główne zajmują równoległe sesje → PoC w osobnym katalogu / worktree, bez zmian w `web-game` i `server` do czasu decyzji.
  9. *Kryteria sukcesu (propozycja agenta):* 60 FPS i ≤ 150 draw calls dla 5 000 skał; picking < 16 ms; pas deterministyczny z ziarna; zapis stanu pasa ≤ X KB na gracza; symulacja wypraw zgodna z recepturą (±10%); decyzja o modelu rozgrywki (i / ii / iii).
- **Powiązania:** #3, #5, #6, #8, #10, #12, #13, #16; EKO-8 (automatyzacja logistyki); `1-game-description.md` §2; plan 04 §4.2; `PERF-REPORT.md`; `space-3d-poc/POC-PLAN.md`.
- **Konflikty z decyzjami:** brak; różnica wizja ↔ kod (5 000 skał w jednym draw callu vs 420 skał dekoracyjnych w dwóch meshach).
- **Otwarte pytania:** Q22; W37, W38, W39, W40 w kolejce.

### #18 — Gazowe giganty w układach: nie można na nich lądować, ale mają księżyce · temat: T15 Układy planetarne i ciała niebieskie · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Czy w układach słonecznych istnieją gazowe giganty ? Jak tak nie można na nich londować ale posiadają księżyce !" („londować" = lądować.)
- **Interpretacja (moja, do potwierdzenia):** w układach istnieją gazowe olbrzymy; nie są lądowalne (brak powierzchni do zabudowy), ale mają księżyce, które są lądowalne i służą jako bazy. Pierwsze zdanie odczytałem jako pytanie otwierające (czy w ogóle istnieją) i odpowiedziałem z projektu.
- **Stan w projekcie:**
  * Dok. ekonomii §3.2: **Gigas** — gazowy olbrzym (orbita 2600 j. / 25 h, promień 110, brak siatki, atmosfera gęsta, nasłonecznienie ×0,12, Hel-3 i Deuter przez Platformę czerpalną, rola: paliwo fuzyjne) i jego lodowy księżyc **Glacja** (220 j. wokół Gigasa, okres 1 h, siatka GP(4,0) = 162 kafelki, start promu z powierzchni 3 u, bez atmosfery, ×0,12, dużo Kriolu i Karbonitu; rola: baza zewnętrzna, lokalne paliwo). Era „Układ zewnętrzny" (dni 11–20): Gigas, Glacja, kometa Kerys. Platforma czerpalna (orbita; Stocznia L2, HQ L4; Hel-3 0,2 + Deuter 0,8 u/min, ×1,6 na poziom; własny reaktor, bo na orbicie Gigasa słońce daje ×0,12). Wyrzutnia masy działa na ciałach o niskiej grawitacji (Księżyc, Glacja). Planeta ↔ Glacja ok. 3800 j.: rezerwa powrotu ok. 76 u przekracza bak Astraeusa Mk I (100) → Mk II (bak 150) albo tankowanie na Glacji (EXP-7).
  * Kod: `BodyKind` = Star, Planet, Moon, Asteroid, Belt — **brak gazowego olbrzyma**; scenariusz Tau Ceti: 5 planet + pas, bez księżyców i olbrzymów; PoC Planeta Matka: Słońce, Planeta, Księżyc, asteroida. Lot do gwiazdy odrzucany (`NotLandable`); ciała bez siatki w modelu istnieją (gwiazda, pas). Mechanizm rodzica (`parent`) istnieje (Księżyc wokół Planety).
  * Wniosek: olbrzymy i ich księżyce istnieją tylko w dokumencie, nie w symulacji.
- **Konsekwencje:**
  1. *Model ciał:* nowy rodzaj ciała (GasGiant) albo planeta z flagą „nielądowalna"; reguła `NotLandable` uogólniona z gwiazd (lot ku olbrzymowi = dolot na jego orbitę / do stacji, nie lądowanie); księżyce z `parent` = olbrzym.
  2. *Zasoby bez lądowania:* Platforma czerpalna to budowla orbitalna na ciele bez siatki → model musi dopuszczać budowle orbitalne na ciele bez powierzchni (dziś zabudowa zakłada siatkę; do sprawdzenia w `build.rs`).
  3. *Księżyce jako „grunt" olbrzyma:* bazy, przemysł, magazyny i Wyrzutnia masy (niska grawitacja: start promu 3 u). Łańcuch: platforma (orbita olbrzyma) → stacja lub księżyc → przetwarzanie (Kapsuły fuzyjne w Atanorze L3). Zasilanie ×0,12 → reaktory.
  4. *Paliwo międzygwiezdne (#5):* Hel-3 i Deuter pochodzą głównie z olbrzyma (śladowo: Hel-3 z regolitu Księżyca, Deuter z wody) → układ bez olbrzyma ma trudną drogę do paliwa międzygwiezdnego (import = towar handlowy). Obecność olbrzyma w układzie startowym jest kluczowa dla #12 / W31 (Q23).
  5. *Paliwo lokalne (#3):* Glacja (dużo Kriolu = lód → Paliwo) daje samowystarczalne tankowanie w układzie zewnętrznym i rozwiązuje zasięg Astraeusa Mk I.
  6. *Generator układów (#11, #12):* reguły: olbrzymy poza „strefą śniegu", liczba księżyców (np. 1–4) i ich typy (lodowy / skalisty), rozmiary siatek (GP(3–4)), opcjonalnie pierścienie; dla gwiazd z realnymi danymi — znane planety; hybryda (WIZ-4 C).
  7. *Render:* olbrzym jako kula z proceduralnym shaderem atmosfery (wizja), bez siatki → tani; księżyce na krótkich orbitach (Glacja 1 h) → zagnieżdżone orbity w solverze orbit (jak Księżyc wokół Planety).
  8. *Zasada lądowania:* zakładam, że lądowanie na olbrzymie jest po prostu niemożliwe (rozkaz odrzucany jak dziś dla gwiazdy), bez dalszych skutków, chyba że decyzja z Q10 / Q11 obejmie olbrzymy (A7).
  9. *Zagrożenia:* ewentualne skutki wlotu w atmosferę (jak w #7) — do decyzji.
- **Powiązania:** #3, #5, #7, #10, #12, #13, W22, W24, W31, EXP-7, dok. ekonomii §3.2, §5.2 H, WIZ-4.
- **Konflikty z decyzjami:** brak; różnica dokument ↔ kod (olbrzymy i ich księżyce tylko w dokumencie).
- **Otwarte pytania:** Q23; W41 w kolejce.

### #19 — Ikony i grafika UI (budynki, surowce, rozwój nauki, ogólne UI), pixel-art dopuszczalny; awatary NPC i ikony planet; zoptymalizowane wytwarzanie i dostarczanie do przeglądarki · temat: T9 UI/UX (+ T10 Grafika i pipeline) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „Potrzebujemy ikonek/grafiki do interfejsu dla budynkow sorowcow rozwoju nauki i ogolnego UI. Wytwarzania i dostarczenia do przegladarki powinien byc zoptymalizowany. Ikonki moga byc w stylu pixelowym. Podobnie avatary ncp i ikonki planet"
- **Interpretacja (moja, NIEpotwierdzona):** zestawy ikon / grafik: (1) budynki, (2) surowce i materiały, (3) rozwój nauki, (4) ogólny UI, (5) awatary NPC, (6) ikony planet (i gwiazd); styl pixel-art dopuszczalny („mogą być"); wymaganie: zoptymalizowany proces wytwarzania i dostarczania do przeglądarki (rozmiar, liczba żądań, cache). Nie wiem: czy pixel-art ma zastąpić obrysowe ikony DS, czy je uzupełnić; czym jest „rozwój nauki" (system badań?); kto rysuje lub generuje; rozdzielczości; czy ikony kolorowe, czy w palecie DS.
- **Stan w projekcie:**
  * DS: 10 ikon obrysowych na siatce 24 px (`produce, research, build, upgrade, move, stop, rally, harvest, repeat, cancel`), ścieżki SVG w `icon-paths.ts` (stroke 1,75, końce kwadratowe) — polecenia RTS-owego command card; zasady DS: jeden kolor sygnałowy (bursztyn), czerwień tylko dla stanów krytycznych, JetBrains Mono, promień 0, bez cieni; kolory danych (np. gracza) poza DS.
  * Surowce w HUD: trzyliterowe kody taktyczne + etykieta + segmentowy miernik (`ResourcePanel`, `core/resources.ts`) — **bez ikon**; w świecie tinty złóż (`DEPOSIT_TINTS`), tony świata nie zbliżają się do sygnałowych (#FFB000, #FF5A4A).
  * Plan 06 §4.2: awatar gracza generowany z ziarna (sigil geometryczny: matryca 8×8 kropek z symetrią, 2 tony, ścięta ramka; SVG w kliencie; 24 / 48 / 96 px; zero treści do moderacji); §4.3 flaga: symbole z 24–32 ikon obrysowych. Awatarów NPC brak (frakcje NPC mają tylko dane, S1).
  * Plan 04: `#/katalog` (sekcja „Ikony i tokeny"; podglądy PNG z obrotnicy do `assets/previews/`); plan 03: manifest assetów i pipeline 3D (pole `license`); budżety z `init.md`: pierwsze pobranie < 15–25 MB, 100–150 draw calls, 200–400 tys. trójkątów.
  * Planety: ikon brak; planety w świecie to modele 3D z shaderem atmosfery; karta gwiazdy z PoC; na mapie galaktyki znaczniki (kolonia = mała flaga 12×8 px).
  * Skala zawartości (dok. ekonomii): 37 materiałów, ok. 45 budowli, 10 pojazdów + klasy międzygwiezdne (#1), poziomy L1–L5, typy ciał i biomy, 41+ gwiazd, ikony nauki (po decyzji), NPC.
- **Konsekwencje:**
  1. *Zakres:* rząd 300–500 ikon (materiały 37 + budowle ok. 45 + pojazdy / statki ok. 20 + klasy / napędy / paliwa + nauka + typy ciał i gwiazd ok. 30 + UI ogólne ok. 40 + awatary NPC 10–20) — szacunek agenta.
  2. *Styl vs DS (Q25):* DS to obrys i jeden kolor sygnałowy; pixel-art treści (37 materiałów trzeba odróżnić) potrzebuje koloru. Propozycja: treści (surowce, budynki, statki, planety, awatary NPC) w pixel-art z ograniczoną paletą z tokenów świata (bez tonów bliskich sygnałowym), a chrom UI (przyciski, nawigacja, polecenia) zostaje obrysowy w DS; spójne z matrycą 8×8 awatara gracza.
  3. *Wytwarzanie (optymalizacja):* (a) ręczny pixel-art (np. Aseprite) dla surowców i UI — pracochłonny, najwyższa jakość; (b) automat z modeli 3D (budynki, pojazdy, statki): render do niskiej rozdzielczości + paletyzacja tym samym rendererem co `#/katalog` — wygląd zgodny z grą, zero rysowania, powtarzalne w CI; (c) proceduralnie: planety (typ + biom + ziarno), gwiazdy (klasa widmowa), awatary NPC (ziarno) — generator układów (#11) tworzy tysiące ciał, więc ich ikon nie da się rysować ręcznie; (d) obrazy generowane AI + kwantyzacja — wymaga decyzji o licencji i spójności (M-6). Rekomendacja: b + c + niewielki zestaw ręczny (a).
  4. *Dostarczanie:* atlas sprite'ów (PNG8 indeksowany lub WebP lossless) + mapa JSON, CSS `image-rendering: pixelated`, całkowite skalowanie (×1 / ×2 / ×3 wg DPR); paczka rdzeniowa ładowana od razu i paczki doładowywane leniwie; hasz w nazwie pliku i długi cache; budżet (propozycja): rdzeń ≤ 100 KB po kompresji, całość rzędu 300–500 KB (pixel-art 32×32 w palecie ≈ 1 KB surowo, kompresuje się bardzo dobrze). Ikony obrysowe DS zostają jako ścieżki SVG (bajty). Etykiety w scenie 3D (`units-layer`) i znaczniki mapy galaktyki z tego samego atlasu jako tekstura (jeden draw call).
  5. *Rozmiary:* 16 / 24 / 32 / 48 / 64 px; pixel-art nie skaluje się płynnie → osobne rysunki lub tylko skalowanie całkowite; DS używa siatki 24 px.
  6. *Ikony planet:* funkcja (typ ciała, biom, temperatura, ziarno) → paleta + wzór (pasy dla olbrzymów #18, ocean / lód / pustynia), wypiekana do atlasu (skończona liczba archetypów × palet) albo rysowana w locie na canvasie; deterministyczna (jak awatar gracza), zgodna na serwerze i w kliencie.
  7. *Rozwój nauki (Q24):* kategoria ikon zakłada system badań / technologii (ikony badań, naukowców, laboratoriów, teleskopów) — w dokumentach projektu go nie ma (zob. #8, #13, Q8, Q12 c); DS ma ikonę `research` (kolba) tylko jako polecenie.
  8. *Awatary NPC:* kto jest NPC (frakcje, operatorzy hubów, personel #8, doradcy?), ile postaci (W44); styl pixel-portretów (ręczne lub z ziarna z elementów: głowa, hełm, wizjer, barwy frakcji); moderacja niepotrzebna (treść własna); użycie: karty kontraktów, huby, powiadomienia, dialogi.
  9. *Ikony w encyklopedii (#9):* każda klasa / materiał / budynek wymaga ikony; definicja ukończenia: wpis ma ikonę; katalog sprawdza pokrycie (brakujące ikony podświetlone); nazwa pliku = ID z katalogu.
  10. *Dostępność:* teksty alternatywne i etykiety z katalogu (i18n), nie tylko grafika; kontrast; czytelność w 16 px.
  11. *Licencje:* własne lub CC0 (np. paczki pixel-art); pole `license` w manifeście (plan 03, M-6).
- **Powiązania:** #1, #8, #9, #13, #18, DS (`icon-paths.ts`, `ResourcePanel`), plan 03 (manifest, pipeline), plan 04 (`#/katalog`), plan 06 (§4.2 awatar, §4.3 flaga), `PERF-REPORT.md`, M-6, TECH-7, W16.
- **Konflikty z decyzjami:** pixel-art wielobarwny ↔ zasada DS „ikony obrysowe z ostrymi końcami linii, jeden kolor sygnałowy"; awatar gracza (sigil 8×8 w stylu DS, plan 06) ↔ awatary NPC jako portrety — dwa style postaci.
- **Otwarte pytania:** Q24 (rozwój nauki), Q25 (styl); W42–W45 w kolejce.

### #20 — Grupy / frakcje / przymierza graczy: mechanizm i wartość dla gry (do wypracowania) · temat: T6 Social (+ T13) · status: nowy, do wypracowania — propozycja agenta niżej, wymaga reakcji · 2026-11-10
- **Słowa użytkownika:** „Gracze moga laczyc sie w grupy / frakcje / przymierza do wypracowania jest mechanizm i co to wnosi do gry"
- **Interpretacja (moja, NIEpotwierdzona):** użytkownik prosi o wypracowanie mechanizmu łączenia się graczy i o analizę, co to wnosi do gry. Trzy słowa: „grupy" (= korporacje?), „frakcje" (? — w planie 05 „frakcje" to NPC; frakcje graczy plan odrzucił w MVP), „przymierza" (= sojusze). Nie wiem: czy to trzy poziomy, czy synonimy; czy „frakcje" = NPC czy większe stronnictwa graczy (Q26); czy ma być konflikt między grupami (Q27).
- **Stan w projekcie (plan 05 §4–§6, §9–§11):**
  * **Korporacje** (SOC-2 B, S2): 2–20 członków; założenie ok. 5000 kr + 100 STA w hubie i port L2; role: szef (1), oficer (≤ 3), członek; role branżowe (górnik, inżynier, kupiec) tylko jako etykiety; skarbiec (kredyty + materiały, wpłaty każdego, wypłaty oficerów z dziennikiem); kontrakty wewnętrzne bez prowizji; biblioteka projektów Atanora (AT6); megaprojekty z wkładów w hubie: **Stacja badawcza** (+5% tempa receptur), **Terminal korporacyjny** (−1% prowizji, większa przepustowość), **Brama** (−30% czasu przesyłek między dwoma hubami); flaga i kolor (06); czat i tablica. Zrobione w galaxy-b6 (stan z notatek): role, zaproszenia, skarbiec i dziennik, tablica; zostają: port L2, kontrakty wewnętrzne, czat, megaprojekty.
  * **Sojusze** (S3, E5): pakt 2–5 korporacji; wspólne megaprojekty (Brama, Stacja badawcza: większy koszt i zasięg), wspólna tablica kontraktów (pierwszeństwo 1 h), czat sojuszu; dyplomacja tylko: sojusz / neutralny; korporacja w jednym sojuszu naraz, wyjście z 48-godzinnym okresem; „bez PvP sojusz to skala współpracy, nie obrony".
  * **Frakcje NPC** (SOC-3 B, S1 zrobione): 3–4 frakcje gospodarzy hubów, specjalizacje, reputacja −100…100 (progi: 25 cło −50%, 50 dostęp do receptur frakcji, 75 kontrakty premium); frakcje graczy / „strony konfliktu" (SOC-3 C) odrzucone w MVP.
  * PvP otwarte (WIZ-6); rekomendacja: brak bezpośredniego szkodzenia, rywalizacja przez rankingi (projektów, ekonomiczne), wyścigi o kontrakty i megaprojekty, sezony 2–4 miesiące (MP-4 B). Rankingi i sezony: S3.
  * Ryzyka z planu (§10): multikonta, inflacja, moderacja czatu / RODO, „megaprojekty premiują duże grupy" (limit 20 członków, bonusy procentowe, sojusze dla większych celów).
- **Propozycja mechanizmu (agent, do reakcji) — warstwy z uwzględnieniem #1–#19:**
  * **W0 Kontakty** (#15): odkryci gracze, wiadomości; bez wspólnych zasobów.
  * **W1 Korporacja (grupa):** to, co w S2, plus nowe po #1–#19: wspólna mapa odkryć i wzajemne „odkrycie" członków (#13–#15; członkowie widzą odkryte gwiazdy i graczy nawzajem), współfinansowanie bardzo drogiego statku międzygwiezdnego (#6) ze skarbca (statek korporacyjny z przydziałem czasu lub udziałami), reputacja grupowa u frakcji NPC (progi odblokowują plany i receptury wszystkim członkom; Q8 a), akademia i wymiana specjalistów (#8), wspólna biblioteka projektów Atanora (AT6).
  * **W2 Przymierze (sojusz, 2–5 korporacji):** megaprojekty dużej skali — **Brama / szlak warp** (stały skrót między dwoma układami członków: czas lotu ×0,5–0,7, budowa po obu końcach, koszt egzotyczny: Kapsuły fuzyjne / Antymateria, limit szlaków; #16), **Wielki teleskop** (macierz: promień odkrycia rośnie z wkładami, #13), **Stacja badawcza** (+% badań; Q24); prawa postoju i przeładunku (docki, #10) w układach członków; wspólna mapa i tablica kontraktów; czat.
  * **W3 Frakcja** — zależnie od Q26: (a) frakcje NPC jako patroni (reputacja grupowa; stan obecny rozszerzony), albo (b) duże sezonowe stronnictwa graczy: wybór raz na sezon, punktowa rywalizacja ekonomiczna (wkłady członków → punkty), nagrody (kosmetyka, plany), bez PvP — daje cel makro i rytm sezonów (MP-4 B).
- **Co to wnosi do gry (propozycja):**
  1. *Współfinansowanie rzeczy zbyt drogich dla jednego gracza* (statki #6, paliwo #5, megaprojekty): powód do łączenia się, naturalne ujście zasobów (EKO-5).
  2. *Wspólne odkrywanie i kontakt* (#13–#15): grupy jako mnożnik eksploracji (łączne teleskopy, współdzielona mapa, odkryci gracze).
  3. *Czas i geografia* (#16, zasada 2 planu 05): szlaki warp skracają loty między członkami z dni do godzin — namacalna korzyść z bliskości i łączenia się; sens mapy galaktyki.
  4. *Specjalizacja i handel wewnętrzny:* komplementarne układy (Platynit z pasa #17, Hel-3 z olbrzyma #18) tworzą współzależność; kontrakty wewnętrzne bez prowizji.
  5. *Bezpieczeństwo i wejście dla nowych:* mentoring, pożyczki ze skarbca, start przy grupie (W29), ewentualny fundusz ubezpieczeniowy floty (jeśli straty, #7).
  6. *Retencja i tożsamość:* wspólne cele i zobowiązania, czat, flagi i kolory (06), rankingi grup, sezony.
- **Ryzyka i zabezpieczenia:** nieaktywni członkowie (progi wkładu, rotacja ról, dziennik); nadużycia skarbca (limity wypłat, role, audyt — dziennik istnieje); dominacja dużych grup (limity 20 / 5, bonusy procentowe, malejące korzyści); toksyczność (moderacja, retencja 30 dni, wyciszanie); złożoność (głosowania nad wydatkami); multikonta (limity nowych kont); brak PvP = brak treści obronnej, więc wartość grup pochodzi wyłącznie z kooperacji i rywalizacji punktowej — potrzebne wyraźne cele, rankingi i megaprojekty (Q27).
- **Konsekwencje techniczne:** serwis galaktyki rozszerzony o wspólną mapę odkryć (G-L), szlaki warp jako krawędzie grafu galaktyki z czasem lotu (G-N), flotę korporacyjną i współwłasność statków (G-D), megaprojekty i sojusze (S3) z protokołem `Alliance*`, rankingi i sezony; nowe reguły tylko w Rust (R-20).
- **Powiązania:** #1, #5, #6, #8, #10, #13, #14, #15, #16, #17, #18; SOC-2, SOC-3, SOC-5, WIZ-6, MP-4; plan 05 §4–§6, §9–§11; plan 06 (flaga, kolor); S1, S2, S3, S4.
- **Konflikty z decyzjami:** frakcje graczy (SOC-3 C) odrzucone w MVP ↔ „frakcje" w wypowiedzi użytkownika (Q26); S-8 / WIZ-6 (brak PvP) ↔ wartość przymierzy (Q27); Brama w planie 05 skraca przesyłki między hubami — po #16 skraca loty statków między układami (przeprojektowanie).
- **Otwarte pytania:** Q26, Q27; W46–W50 w kolejce.

### #21 — Mechanizm premiujący wymianę i współpracę: wydajność wydobycia / wytwarzania konkretnego materiału lub dostępność w konkretnym układzie · temat: T2 Ekonomia (+ T6 Social, T15) · status: nowy, do wypracowania — propozycja agenta, wymaga reakcji · 2026-11-10
- **Słowa użytkownika:** „Potrzebujemy mechanizmu premiujacego wymiane i wspolprace. Moze wydajnosc wydobywania lub wytwarzania konkretnego materialu. Lub doatepnosc w konkretnym ukladzie"
- **Interpretacja (moja, NIEpotwierdzona):** potrzebny mechanizm, który nagradza wymianę (handel) i współpracę; dwie propozycje użytkownika: (1) wydajność wydobywania lub wytwarzania konkretnego materiału, (2) dostępność (materiału) w konkretnym układzie. Dwa odczytania: (A) geografia — układy różnią się mnożnikami i złożami, więc wymiana opłaca się sama z siebie; (B) nagroda za działanie — wymiana i współpraca dają bonusy (wydajność konkretnego materiału albo dostęp do układu partnera). Nie wiem, które i jak twardo (Q28, Q29).
- **Stan w projekcie:**
  * Dok. ekonomii §4.2: T0 pospolite (Ferryt, Silicyt, Kriol, Karbonit, Regolit), T0R rzadkie (Kupryt, Tytanit, Uranit, Platynit, Hel-3, Deuter), T0X egzotyczny (Kwantyt). Źródła: Kupryt / Tytanit / Uranit — Planeta (rzadko), Pyros, Księżyc; Platynit — asteroidy M (wyprawa górnicza); Hel-3 i Deuter — Gigas (czerpak; śladowo regolit Księżyca / woda); Kwantyt — jądro komety Kerys. Projektowany układ macierzysty ma wszystko → układ samowystarczalny.
  * §9.3: profile typów gwiazd — M: dużo Kriolu i Karbonitu, mało metali; G: jak macierzysty; A/F: dużo metali ciężkich i Platynitu, silne promieniowanie, energia ×7–8; brązowe karły: Deuter i Hel-3; biały karzeł: rzadki Kwantyt; mnożnik paneli ×0,05–×8. Asymetria układów jest więc zaprojektowana jako profil.
  * Kod: `BodyProfile.deposits` (udział złóż na powierzchni), `deposit_weights`; planety Tau Ceti o różnych profilach („bogata w metale, ale bez lodu i węgla: woda i paliwo musiałyby przylatywać z innych ciał"); mnożniki wydajności produkcji istnieją jako mechanizm (`output_factor`, `producer_power_growth` w regułach).
  * Handel (plan 05): huby NPC (bid 0,8·P, ask 1,25·P), cło frakcji 0–10% zależne od reputacji (progi 25 / 50 / 75), prowizja hubu 2%, Terminal handlowy 5 / 3,5 / 2%; megaprojekty (+% receptur, Brama); kontrakty gracz–gracz i korporacyjne; ryzyko multikont (§10).
  * Przepis na paliwo międzygwiezdne: Kapsuła = 5 Hel-3 + 10 Deuter + 1 Nadprzewodnik; Nadprzewodnik = 2 Miedź + 1 Platynit + 10 Wodór → cztery rzadkie surowce (Hel-3 i Deuter z olbrzyma, Platynit z pasa M, Kupryt z Planety / Pyrosa) z trzech typów ciał.
- **Propozycja mechanizmu (agent, do reakcji):**
  1. *Dostępność (twarda, rzadkie surowce):* T0R / T0X zależą od typów ciał obecnych w układzie (olbrzym #18, pas M #17, gorąca planeta, kometa); generator daje każdemu układowi tylko część (np. ≤ 3–4 z 7 rzadkich); pełne łańcuchy T3 / T4 (np. paliwo międzygwiezdne) wymagają wymiany lub współpracy. Zabezpieczenia: gwarancja lokalnej ścieżki T0–T2 (bez miękkiej blokady) oraz huby NPC jako zawsze dostępne źródło (po cenie z cłem) — nikt nie jest zablokowany przez nieaktywnych graczy.
  2. *Wydajność (miękka):* mnożniki „jakości złóż" per materiał per ciało / układ (np. ×0,5…×2) i profile typu gwiazdy (energia, chłodzenie, metale); premia specjalizacji dla zakładu produkującego materiał, w którym układ jest bogaty → opłaca się specjalizować i wymieniać nadwyżki (przewaga komparatywna).
  3. *Premia za samą wymianę i współpracę (pętla nagrody):* (a) **relacja handlowa** z partnerem rośnie z liczby i wartości zrealizowanych dostaw (poziomy 1–5): niższe cła i czas dostawy, wyższy limit przesyłek, na wyższych poziomach bonus wydajności konkretnego materiału dostarczanego przez partnera (+5…15%); (b) **kontrakt wspólnej produkcji:** dwie strony wnoszą różne półprodukty, wynik z +20% wydajności lub receptura dostępna tylko we współpracy; (c) **synergia korporacyjna:** za każdego członka dostarczającego komplementarny materiał + X% dla pozostałych (z limitem); (d) **dostęp:** partner może przyznać „prawo dostępu" do swojego układu (docki, postój, zakup w jego Terminalu handlowym, ograniczone wydobycie z jego pasa za udział) — dostępność jako nagroda za zaufanie; (e) **węzły handlowe graczy:** Terminal handlowy otwarty dla innych daje gospodarzowi prowizję, a gościom dostęp do rzadkich materiałów układu.
  4. *Zabezpieczenia:* limity i malejące korzyści (cap mnożników), różni partnerzy liczą się bardziej niż powtarzanie z jednym (anty-farming parą kont), wykrywanie multikont i limity dla nowych kont (plan 05 §10), ujścia (cła, prowizje) przeciw inflacji, ceny NPC jako sufit (anty-szantaż).
- **Co to wnosi (propozycja):** powód do handlu i współpracy niezależny od dobrej woli; „geografia ma znaczenie" (zasada 2 planu 05) — sens mapy galaktyki i odkrywania (#13: skład cudzych układów); naturalne grupy (komplementarne układy, #20); sens floty międzygwiezdnej i warp (#1, #16: towar trzeba wozić); sens wiadomości do odkrytych graczy (#15: negocjacje); paliwo międzygwiezdne jako produkt współpracy (#5); ujścia ekonomii (EKO-5).
- **Konsekwencje:**
  1. Generator układów (G-K) zarządza rozkładem rzadkich surowców z kontrolą *rozwiązywalności* (grupa ok. 5 sąsiednich układów ma razem wszystko; każdy układ ma ścieżkę T0–T2); parametry startowe do symulacji (propozycja agenta): T0 pospolite ≥ 95% układów; każdy T0R 30–60% (wg typu ciała); T0X 10–20% (komety, białe karły).
  2. Sprzeczność z Q23 (a): gwarancja olbrzyma w układzie startowym oznacza, że Hel-3 / Deuter nie jest dobrem handlowym na starcie; przy twardej dostępności (Q29 a / c) bliższe byłoby Q23 (b).
  3. Mnożniki wydajności po stronie świata (wydobycie, produkcja) to nowe reguły w Rust (R-20), oparte na istniejących `output_factor` i profilach; zmieniają wyniki symulacji (wzorce zgodności).
  4. Relacja handlowa i prawa dostępu to stan galaktyczny (para kont); efekty w galaktyce (cła, czas, limity) nie dotykają świata; efekty wydajności w świecie wymagają rozkazów systemowych do dziennika świata (wzorzec B6) — zacząć od efektów galaktycznych.
  5. UI: karta gwiazdy pokazuje mocne i słabe strony układu (po analizie sygnałów, #13) → kierowanie handlu; wskaźnik relacji z partnerem; ostrzeżenie o zależności.
  6. Balans: symulacja headless rynku (`sim-cli`, plan 04 §4.4): inflacja, przepływy, brak monopoli; rola NPC jako bezpiecznika.
  7. Ryzyka: wymuszony handel frustruje solistów (NPC jako zabezpieczenie), szantaż / wstrzymywanie dostaw bez PvP (sufit cen NPC), złożoność balansu tysięcy układów (symulacje), multikonta.
- **Powiązania:** #5, #6, #13, #14, #15, #16, #17, #18, #20; SOC-1, SOC-5, EKO-5; plan 05 §2, §3, §4, §10; dok. ekonomii §4.2, §9.3; Q23.
- **Konflikty z decyzjami:** Q23 (a) ↔ twarda dostępność Hel-3 / Deuteru; „układ samowystarczalny" w dok. ekonomii ↔ cel (zależność między układami).
- **Otwarte pytania:** Q28, Q29; W51–W55 w kolejce.

> Dwa kolejne pomysły (#22 morale, #23 stacje na orbitach) powiązane z edytorem wnętrz statków i stacji (`poc/space-interior-poc`, praca równoległej sesji, nieśledzona w gicie — tylko czytana). Temat: T16.

### #22 — Morale ludzi w koloniach, na statkach i stacjach ma znaczenie (wydajność fabryk, odkrycia naukowe); wpływ wyposażenia habitatów / statków / stacji · temat: T16 Stacje, wnętrza i morale (+ T2 Ekonomia, ludzie #8) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „morale ludzi w koloni i na statkach powinno miec znaczenie, moze niektore dkrycia naukowe są mozliwe tylko w 100% zmotywowanych naukowcow, fabryki 100% wydajnosci, na morale moge miec wpływ wyposażenie habitatow/statków/stacji kosmicznych"
- **Interpretacja (moja, NIEpotwierdzona):** każda lokalizacja z ludźmi (kolonia, statek, stacja) ma morale 0–100%. Efekty: (1) wydajność fabryk (i innych obsadzonych budowli) skaluje się z morale — 100% daje pełną wydajność; (2) niektóre odkrycia naukowe wymagają 100% zmotywowanych naukowców (bramka); (3) morale zależy m.in. od wyposażenia habitatów, statków i stacji. Nie wiem: punkt odniesienia (czy 100% to norma, czy cel; Q30), czy morale jest liczone per lokalizacja, czy per grupa (naukowcy / inżynierowie / technicy), jakie inne czynniki poza wyposażeniem, co morale robi na statkach.
- **Stan w projekcie:**
  * Dok. ekonomii §4.5: niedobór (potrzeb życiowych / załogi) obniża wydajność wszystkich budynków na ciele do 50% i wstrzymuje przyrost; potrzeby: 20 Wody, 10 Tlenu, 1 Żywność na 10 osób / h. Morale, motywacji i komfortu w dokumentach **nie ma** (sprawdzone wyszukiwaniem). W kodzie nie ma populacji ani efektu niedoboru; wydajność = efektywność mocy (P1 / P2 / P3) × 0,5 podczas rozbudowy (np. `atanor.rs`: `speed = efficiency × (0,5 przy Upgrading)`) — istnieje gotowy potok mnożników, do którego morale mogłoby dołączyć.
  * Kalibracja ekonomii (§3.1) zakłada pełną wydajność kolonii referencyjnej (60% mocy na produkcję); morale < 100% ją obniża.
  * Edytor wnętrz (`poc/space-interior-poc`): `ShipStats { berths, power, food, care, storage }` (wkład elementu do statku, „hak do ekonomii", D15), rozpoznawanie pomieszczeń z głosów wyposażenia (kwatery, mesa, ambulatorium, hydroponika, maszynownia, mostek, sala odpraw, magazyn energii, korytarz), szczelność kadłuba (`sealed`), pole pomieszczeń, światło (czy pokój oświetlony), pokłady 0–3. ANALIZA §8: wymagania funkcji, ruch załogi (czas dojścia), „wnętrze budynku w grze: Habitat lub Fabryka z planety ma układ jako dane; bilans wnętrza zasila ekonomię kolonii". Brak: typów pomieszczeń rekreacja / siłownia / laboratorium / ogród i pola komfortu.
  * Badania naukowe: w dokumentach brak systemu (Q24); naukowcy (#8, Q12); analiza sygnałów (#13).
- **Propozycja mechanizmu (agent, do reakcji):**
  1. *Morale M ∈ [0, 1]* per lokalizacja (kolonia / statek / stacja) i — po Q12 — per grupa (naukowcy, inżynierowie, technicy), bo każda grupa ma inne potrzeby (naukowcy: laboratorium, cisza, widok; technicy: obciążenie, bezpieczeństwo; inżynierowie: narzędzia, przestrzeń).
  2. *Cel T = f(wyposażenie, warunki):* wyposażenie z bilansu wnętrz — koje na osobę (berths ≥ załoga), mesa, hydroponika / żywność, ambulatorium (care na osobę), oświetlenie, szczelność kadłuba, powierzchnia na osobę, drogi dojścia; warunki — braki (żywność, tlen, woda, moc), przeciążenie lub niedobór załogi, awarie, na statkach czas lotu (#16).
  3. *Dynamika z inercją:* M dąży do T ze stałą czasową rzędu godzin (M += (T − M)·(1 − e^(−dt/τ))) — deterministyczna, bez losowości, tania; opcjonalnie spadek szybszy niż wzrost.
  4. *Efekty:* (a) mnożnik wydajności E(M) dopisany do potoku mnożników (moc × morale), np. E = 0,5 + 0,5·M (dno 50% jak w §4.5, 100% przy M = 1); (b) bramki: odkrycia / receptury / analizy z `min_morale` (część wymaga M_naukowców = 100%); (c) opcjonalnie niezawodność statków.
  5. *Wejście z wnętrz:* rozszerzyć `ShipStats` o `comfort` i dodać typy pomieszczeń (rekreacja, siłownia, laboratorium, ogród / widok przez szkło); dla habitatów planetarnych — poziomy / moduły wyposażenia albo układ z edytora.
  6. *UI:* odczyt morale z rozbiciem czynników („co psuje morale") — kluczowy, by model nie był nieprzejrzysty; kanał w `ResourcePanel` (`kind: 'load'`).
- **Konsekwencje:**
  1. *Skala wydajności:* dziś pełna wydajność = moc OK; po #22 wydajność = moc × morale → kalibracja §3.1 (kolonia referencyjna, tempo er) wymaga decyzji o punkcie odniesienia (Q30): 100% jako norma — kalibracja bez zmian; 100% jako cel — przeliczyć tempo.
  2. *Model ludzi (#8):* morale wzmacnia sens typów (Q12 b / c); EXP-3 (pojemność + potrzeby; pełna symulacja populacji poza zakresem) — morale grup jest kompromisem (kilka liczb zamiast osób).
  3. *Odkrycia zależne od morale* zakładają system badań / analizy (Q24, #13); bez niego bramka nie ma czego bramkować.
  4. *Statki (#16):* lot godziny–dni → morale załogi i wyposażenie statku; efekty na statku do ustalenia (wydobycie Górnika, prędkość, awaryjność) — W57.
  5. *Stacje (#23):* habitat orbitalny z wnętrzem → morale stacji; zaopatrzenie (W63).
  6. *Spirala śmierci* (niskie morale → niska wydajność → brak środków na poprawę): dno 50%, szybkie odbicie, darmowe minimum wyposażenia — W59.
  7. *Serwer:* trzy liczby per lokalizacja, deterministyczna aktualizacja w kroku; część stanu świata (hash, replika); nowe reguły tylko w Rust (R-20); koszt znikomy.
  8. *UI i dokumentacja:* wskaźnik morale i ikona (#19), hasło w encyklopedii (#9, np. MECH-MORALE).
- **Powiązania:** #8, #9, #13, #16, #19, #23; Q9, Q12, Q24; EXP-3; dok. ekonomii §3.1, §4.5; `space-interior-poc/ANALIZA.md` D15, §8.
- **Konflikty z decyzjami:** §4.5 (niedobór → 50%) ↔ morale jako skala ciągła; EXP-3 ↔ morale grup; kalibracja §3.1 (pełna wydajność) ↔ morale < 100%.
- **Doprecyzowanie (#24, 2026-11-10):** powierzchnia i rozbudowa struktury (klasa, poziom) są czynnikami morale: więcej powierzchni i wyższy poziom = wyższe morale w kolonii; wnętrza projektuje się w edytorze w granicach koperty zależnej od klasy i poziomu. Wzór (powierzchnia na osobę / całkowita / zagospodarowana) — Q33.
- **Otwarte pytania:** Q30, Q33; W56–W60 w kolejce.

### #23 — Mechanizm budowania stacji kosmicznych na orbitach · temat: T16 Stacje, wnętrza i morale (+ T5 Flota) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „potzebujemy mechanizm budowania stacji kosmicznych na orbitach"
- **Interpretacja (moja, NIEpotwierdzona):** potrzebny mechanizm wznoszenia stacji kosmicznych na orbitach ciał (liczba mnoga: różne orbity i ciała); obejmuje proces (kto, z czego, jak długo) i reprezentację (stacja jako budowla czy jako byt z modułami). Nie wiem: modularność, liczba stacji na ciało, rola edytora wnętrz, kto buduje.
- **Stan w projekcie:**
  * Dok. ekonomii §5.2 H: **Stacja orbitalna** (hub orbitalny ciała: docki 2 / 3 / 4 / 6 / 8, magazyn stacji 5000 j. ×1,8 na poziom, tankownia od L2, przeładunek między statkami od L3, osłony i port dalekiego zasięgu od L4; wymaga Montowni i HQ L2); **Terminal handlowy** jako „moduł stacji" (wymaga Stacji L2); Stocznia orbitalna (Stacja L2, HQ L3), Dok gwiezdny (Stocznia L3, HQ L4), Satelita energetyczny, Platforma czerpalna. Era „Industrializacja": brama do następnej = HQ L3 + Stacja orbitalna L1 (dni 2–4). Wyrzutnia masy (ciała o niskiej grawitacji), Prom orbitalny (30 / 50 / 80 j.; start z powierzchni Planety macierzystej 10 u paliwa).
  * Kod: budowle orbitalne mają 0 kafelków i wspólną pulę z ciałem (`rules.rs`); brak osobnej stacji, dockow, modułów i wynoszenia towarów; produkcja statków nie istnieje (#10). Modele: w assetach PoC 3D są moduły bazy KayKit (`basemodule_A/B/C`); złożonej stacji orbitalnej w scenie nie sprawdzano.
  * Edytor wnętrz (PoC): projektowanie wnętrz statków i stacji, pokłady 0–3, bilans, pomieszczenia; droga do web-game (domain → `packages/domain/src/interior`, render, UI; serwer waliduje tymi samymi regułami, port do Rust).
- **Propozycja mechanizmu (agent, do reakcji):**
  1. *Reprezentacja:* stacja = rdzeń (poziomy L1–L5 jak w dokumencie) + moduły w gniazdach; liczba gniazd rośnie z poziomem rdzenia; moduły: dodatkowe docki, magazyn, habitat orbitalny (koje, podtrzymanie życia, morale), laboratorium / teleskop (#13, Q24), stocznia (#10), terminal handlowy, satelita energetyczny. Na starcie jedna stacja na ciało, więcej w późniejszych etapach.
  2. *Budowa etapowa:* wybór orbity i gniazda → zlecenie modułu → materiały lub prefabrykaty na orbicie → czas montażu → moduł aktywny; wymagania: moc, załoga (inżynierowie #8), poziom rdzenia, HQ.
  3. *Wejście na orbitę:* prefabrykaty z Montowni (zgodnie z dokumentem: Stacja wymaga Montowni) wynoszone Promem lub Wyrzutnią masy; ograniczenia masy i rozmiaru promu (30 / 50 / 80 j.) dają sens klasom Promu; duże konstrukcje (Dok) z magazynu stacji (Q17).
  4. *Życie na stacji:* habitat orbitalny z wnętrzem (edytor wnętrz lub gotowy układ); berths = pojemność załogi; podtrzymanie życia (woda, tlen, żywność z hydroponiki) i zaopatrzenie z planety; morale (#22).
  5. *Własność i dostęp:* stacja należy do gracza; prawa dostępu dla partnerów (#21), stacje korporacyjne / sojuszu (#20).
  6. *Miejsca:* orbita planety, księżyca, gazowego olbrzyma (#18: stacja to tam jedyna zabudowa), przy pasie asteroid (baza górnicza #17), punkty Lagrange'a (teleskopy #13, szlaki warp #16) — W61.
- **Konsekwencje:**
  1. *Zmiana modelu:* z „budowle bez kafelka" na byt stacji z modułami (Q31) — zmiana stanu świata, protokołu repliki i hasha; nowe reguły w Rust (R-20).
  2. *Spójność z innymi grupami:* G-J (produkcja statków, orbita), Q17 (skąd materiały), G-P (olbrzymy: stacja jako jedyna zabudowa), G-H (ludzie), G-T (morale).
  3. *Ludzie (#8) i morale (#22):* stacja ma własną pulę ludzi i podtrzymanie życia, inaczej „stacje potrzebują ludzi" zostaje deklaracją; zaopatrzenie promami (W63).
  4. *Render:* stacja widoczna na orbicie jako złożona z modułów (KayKit `basemodule_*` / nowe), LOD, instancing; etykiety i ikony (#19).
  5. *Edytor wnętrz jako opcjonalna głęboka warstwa:* gracz projektuje wnętrza modułów (bilans → pojemność i morale) albo wybiera gotowe układy (W65).
  6. *Kamień milowy:* Stacja orbitalna L1 to brama ery (HQ L3 + Stacja L1, dni 2–4) → pierwsze moduły muszą być tanie i wynoszone Promem Mk I.
- **Powiązania:** #8, #10, #13, #17, #18, #20, #21, #22; Q17; W15, W22; dok. ekonomii §3.1, §5.2 H, §6.2; `space-interior-poc/ANALIZA.md` §7.
- **Konflikty z decyzjami:** dok. (orbita = budowle bez kafelka) ↔ stacja jako byt z modułami (Q31); kod: brak stacji, dockow i produkcji statków.
- **Doprecyzowanie (#24, 2026-11-10):** wnętrza stacji (rdzeń i moduły) mają koperty zależne od poziomu / klasy; habitat orbitalny = moduł z kopertą wnętrza.
- **Otwarte pytania:** Q31, Q32; W61–W66 w kolejce.

### #24 — Wnętrza habitatów, statków i stacji: koperta powierzchni i pokładów zależna od klasy i poziomu rozbudowy; więcej powierzchni i rozbudowy = wyższe morale · temat: T16 Stacje, wnętrza i morale · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „folder poc\space-interior-poc zawiera mechanizm projektowania i budowania wnętrz habitatów, statków, stacji kosmicznych. dostepna powieszchnia i ilość poziomów (pientro) jest zdeterminowana - klase i poziom rozbudowy danej struktury. im bardziej rozbudowane i więcej powierzchni tym większe morale w kolonii"
- **Interpretacja (moja, NIEpotwierdzona):** (1) edytor wnętrz z `poc/space-interior-poc` jest mechanizmem projektowania i budowy wnętrz habitatów, statków i stacji w grze (zgodne z ANALIZA §7–8); (2) każda struktura ma „kopertę" wnętrza: dostępna powierzchnia (pola na pokład) i liczba pokładów zależą od klasy i poziomu rozbudowy (Habitat L1–L5, klasa i Mk statku, rdzeń stacji i moduły); (3) morale kolonii rośnie z rozbudową i powierzchnią. Nie wiem: czy morale zależy od powierzchni na osobę, całkowitej czy zagospodarowanej (Q33); czy pojemność załogi wynika z koi w projekcie; czy „plan" z #6 to projekt z edytora (Q34); czy wnętrze projektuje się per egzemplarz, czy per klasa (szablon).
- **Stan w projekcie:**
  * Edytor: stała `MAX_DECK = 3` (pokłady 0–3) w `state/editor-store.ts` (globalna, nie per struktura); limitu powierzchni nie znalazłem (siatka 4 m, pole = 16 m²); `ShipStats` bez komfortu; ANALIZA §8: wymagania funkcji, ruch załogi, „Wnętrze budynku w grze: Habitat lub Fabryka z planety ma układ jako dane; bilans wnętrza zasila ekonomię kolonii".
  * Habitat: pojemność załogi 10 → 17 → 29 → 49 → 84 (L1–L5, stała tabela §4.5), HQ +5; wzrost na poziom: koszt ×2, czas ×1,8, wydajność ×1,6, moc ×1,45, załoga ×1,3. Załoga w pojazdach: Astraeus 3, Frachtowiec 5, Tankowiec 5, Górnik 4, Prom 2; Stocznia 15, Dok gwiezdny 30.
  * Kod: nie ma wnętrz; pojemność to tabela (`crew_balance`).
- **Konsekwencje:**
  1. *Koperta jako dane katalogu:* dla każdej struktury (klasa × poziom): liczba pokładów i dozwolona powierzchnia na pokład (prostokąt lub maska); edytor zastępuje globalny `MAX_DECK` wartością per struktura i wymusza granicę jako twardą regułę stawiania (D7).
  2. *Pojemność z koi:* pojemność załogi wynikałaby z `berths` w projekcie w granicach koperty, zamiast z tabeli 10 → 84; wymaga układów domyślnych dla graczy bez projektu (generowane / gotowe szablony) i kalibracji tak, by układ domyślny dawał wartości z tabeli. Przykład (agent, do strojenia): ok. 2 pól (32 m²) na osobę → Habitat L1–L5 ≈ 20 / 34 / 58 / 98 / 168 pól łącznie, np. na 1 / 1 / 2 / 3 / 4 pokładach.
  3. *Morale rośnie z powierzchnią i rozbudową:* nagroda za rozwój struktur obok kosztu; potrzebne malejące zwroty i koszty (×2 materiałów, ×1,45 mocy, ×1,3 załogi na poziom), by wyższy poziom nie był zawsze lepszy za darmo. Q33: powierzchnia na osobę vs całkowita vs zagospodarowana.
  4. *Statki:* koperta dotyczy części załogowej (mostek, kwatery, maszynownia); ładownia to osobna wartość klasy (#2). Mała klasa Mk I może mieć jeden pokład; okręt kolonizacyjny kilka (koloniści).
  5. *Stacje (#23):* rdzeń i moduły mają własne koperty; habitat orbitalny = moduł z kopertą wnętrza.
  6. *Per klasa, nie per egzemplarz:* przy dziesiątkach statków projekt per egzemplarz jest nierealny; sensowny jest szablon wnętrza per klasa i poziom (z którego powstają egzemplarze) oraz per budynek (Habitat). Odpowiada to na pytanie o „plan" (Q8, Q34) i bibliotekę projektów (AT6 / SOC-4).
  7. *Budżet wydajności edytora:* PoC: 143 elementów ≈ 83 draw calls; indeksy przeliczane w całości (O(n)) wystarczają dla setek elementów, dla dziesiątek tysięcy (stacja) potrzebny indeks przyrostowy (ANALIZA §6). Koperta jest więc też limitem wydajności; wysokie poziomy (Habitat L5 ≈ 170 pól) mogą przekroczyć setki elementów.
  8. *Walidacja po stronie serwera:* projekty wnętrz walidowane tymi samymi regułami (port `rules.ts`, `rooms.ts` do Rust, test zgodności jak w `server/conformance`); koperta wymuszana w obu miejscach (MP-6).
  9. *Droga do web-game:* domena → `packages/domain/src/interior`, render → `packages/render/src/interior`, UI → `apps/game`; rozszerzenie PoC o kopertę przed przeniesieniem.
  10. *Wymagania funkcji* (ANALIZA §8.2: kwatery wymagają koi i drzwi, mostek konsol) jako warunki wystarczalności projektu do zbudowania statku lub aktywacji modułu — „plan" staje się obiektem z walidacją.
- **Powiązania:** #2, #6, #8, #22, #23; Q8, Q30, Q33, Q34; W60, W62; `space-interior-poc/ANALIZA.md` D7, D15, §6–§8; dok. ekonomii §4.5, §5.1.
- **Konflikty z decyzjami:** pojemność załogi z tabeli ↔ z koi w projekcie; `MAX_DECK` globalne ↔ per struktura.
- **Otwarte pytania:** Q33, Q34; W67–W71 w kolejce.

### #25 — Metoda tranzytów: teleskopy skanują konkretne gwiazdy w sąsiedztwie i szacują planety z wykresu jasności · temat: T13 Galaktyka, odkrywanie i kontakt · status: doprecyzowany (Q35 b, 2026-11-10); otwarte W72–W76 · 2026-11-10
- **Słowa użytkownika:** „Teleskopy mają możliwość skanowania konkretnych gwiazd w sąśedztwie w celu poznaniu planet za pomocą „Metoda tranzytów” teleskopy po upływnie czasu rysują wykres opiera się głównie na wykrywaniu ich wpływu na gwiazdy macierzyste, ponieważ same obiekty są zbyt małe i ciemne, by bezpośrednio je fotografować - na tej podstawie szacuje jakie planety układ moze posiadać"
- **Interpretacja (moja, NIEpotwierdzona):** teleskop wybiera konkretną gwiazdę z sąsiedztwa (cel) i obserwuje ją w czasie; spadki jasności rysują wykres (krzywa blasku); z wykresu system szacuje planety: rozmiar z głębokości spadku, okres z odstępów, z okresu odległość od gwiazdy i temperaturę. Nie wiem: czy wynik jest zawsze zgodny z prawdą, czy z niepewnością (Q35); czy planety, których orbita nie leży „od krawędzi", są pomijane; czy teleskop ma kolejkę celów i ile naraz; czy inne metody (prędkości radialne, obrazowanie bezpośrednie) wejdą później.
- **Doprecyzowanie 2026-11-10 (Q35, odpowiedź „35 b”):** wynik skanu tranzytowego to szacunek z niepewnością i może pominąć planety (np. gdy orbita układu nie leży „od krawędzi”). Księżyców i pasów skan nie pokazuje (założenie A11, bez sprzeciwu). Wybór (b) zamiast (c) rozumiem tak, że wynik nie wymaga potwierdzenia kolejną obserwacją; forma niepewności i ewentualne fałszywe wykrycia — W76 (do potwierdzenia, nie zgaduję).
- **Stan w projekcie:** teleskopów nie ma (zob. #13); odkrywanie to Skanowanie po przybyciu (15 min, profile planet) i Sonda (profil układu docelowego, §9.4); `BodyProfile` ma typ, temperaturę, wodę, rating i złoża; mapa pokazuje wszystkie 41 gwiazd.
- **Konsekwencje:**
  1. *Poziomy wiedzy o układzie:* gwiazda w promieniu (dane katalogowe) → skan tranzytowy (szacunek planet: typ, rozmiar, okres, temperatura; bez złóż, księżyców i pasów) → sonda lub skan po przybyciu (pełny profil). Rośnie wartość sondy; wybór startu (#4) i celów ekspansji opiera się na szacunku.
  2. *Mapowanie na mechanikę:* poziom i rozmiar teleskopu → czułość (najmniejsza wykrywalna planeta); czas obserwacji → największy wykrywalny okres (potrzeba co najmniej dwóch tranzytów), więc zewnętrzne olbrzymy wymagają długich obserwacji; liczba celów naraz zależy od poziomu (kolejka).
  3. *Ukryta orientacja:* tranzyt widać tylko, gdy orbita leży „od krawędzi"; w grze jako ukryta właściwość gwiazdy (z ziarna) — układy z planetami bez wykrywalnych tranzytów istnieją (ustalone w Q35 b). Późniejszy postęp: spektrograf (prędkości radialne), koronograf (obrazowanie bezpośrednie).
  4. *Wykres jako UI:* krzywa blasku rysowana w czasie obserwacji z zaznaczonymi spadkami i szacunkiem planet pod spodem; komponent w stylu DS.
  5. *Autorytatywność:* serwer wylicza układ deterministycznie z ziarna (G-K) i wysyła klientowi tylko wykryte spadki i szum, nie pełny układ; obserwacja to zadanie w serwisie galaktyki (start, cel, czas), liczone leniwie; koszt niski.
  6. *Naukowcy i morale (#8, #22):* analizę wykonują naukowcy; szybkość i jakość mogłyby zależeć od morale (bramka „100%" dla wykrycia najmniejszych planet) — propozycja.
  7. *Role:* tranzyty = planety, analiza sygnałów = zajętość (#14) — rozdzielić.
  8. *Realne gwiazdy ze znanymi planetami:* prawda gry = katalog; wykrywalność zależy od ukrytej orientacji i czułości teleskopu.
- **Powiązania:** #4, #8, #12, #13, #14, #18, #22; Q18, Q24, Q35; dok. ekonomii §9.4; `BodyProfile`.
- **Konflikty z decyzjami:** §9.4 (sonda jako sposób poznania profilu) ↔ skan tranzytowy jako drugi, pośredni sposób (rozdzielenie ról).
- **Otwarte pytania:** brak (Q35 zamknięte odpowiedzią „35 b”); W72–W76 w kolejce.

### #26 — Cywilizacja tubylcza (średniowieczna) w ok. 1% układów; planeta z bogatymi złożami · temat: T15 Układy planetarne i ciała niebieskie (+ T6 Social, T13) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „układ słoneczny ma małą szanse (1%) zawierac nierozwinietą średniowieczna cywilizację, do wypracowania jest jakie daje to możliwości i wyzwania, planeta taka ma duże szanse na bogate surowce”
- **Interpretacja (moja, NIEpotwierdzona):** w ok. 1% układów (losowanie deterministyczne z ziarna przy generowaniu galaktyki) jedna planeta jest zamieszkana przez żywą cywilizację na poziomie średniowiecza, bez techniki kosmicznej; taka planeta z podwyższonym prawdopodobieństwem ma bogate złoża. Użytkownik zleca mi wypracowanie możliwości i wyzwań (analiza poniżej, same propozycje). Nie wiem: jaką rolę cywilizacja ma pełnić (Q36); czy to to samo co istniejąca planeta „medieval” (W77); czy dotyczy gwiazd rzeczywistych (W78); co znaczy „bogate” (W79).
- **Stan w projekcie:**
  * Teren: biom `medieval` istnieje (KayKit Medieval Hexagon); Tau Ceti c = `{biome: medieval, seed: 2}`. Osada (ok. 17 pól dróg, 17 budynków, zamek w centrum, ok. 320 drzew) jest w T7B traktowana jako **ruiny i tło** („osada bez pól ze złożem”); domena ma `settlement {center, roads, buildings{tile, kind, yaw}}` (dane, nie logika gry). T7B (budowle gracza na planecie `medieval` jako modele Medieval Hexagon) zrobione; T-23 (zanikanie ruin) czeka na decyzję użytkownika; T-24: lądowisko na planecie medieval = sci-fi.
  * Frakcje NPC: silnik rynku i kontraktów (`GalaxySim`, R-7, przełącznik `NPC_FACTIONS`); S1: kontrakty NPC, reputacja ∈ [−100, 100] (progi 25 cło −50%, 50 receptury, 75 kontrakty premium; plan 05 §4); „frakcje jako strony konfliktu” (SOC-3 C) odrzucone w MVP.
  * Brak walki i obrony w grze (WIZ-6 brak PvP; EKO-10 porażka otwarte).
  * Złoża: `depositWeights` na ciele; `BodyProfile` z oceną i złożami; poznanie profilu: Skanowanie po przybyciu (15 min) i Sonda (§9.4).
- **Konsekwencje (moja analiza, wszystko PROPOZYCJE):**
  *Możliwości*
  1. Układ-jackpot: bogate złoża (w tym rzadkie T0R) jako powód do wyprawy i rywalizacji; przy wyłączności układu (Q19 a) kto pierwszy zajmie układ, ten ma cywilizację; pasuje do asymetrii układów (#21).
  2. Partner handlowy: cywilizacja jako frakcja NPC w istniejącym silniku (kontrakty, reputacja, progi); płaci surowcami lub dostępem do złóż, kupuje narzędzia, metale, technologię; relacja otwiera złoża i receptury.
  3. Wymiana wiedzy: przekazanie techniki („uplift”) jako długi cel i nagroda; wymaga decyzji, czy cywilizacja się rozwija (W80).
  4. Ludzie (#8): źródło obsługi technicznej / robotników — tylko jeśli ton gry (WIZ-7) to dopuszcza.
  5. Treść i odkrywanie: rzadkie spotkanie, komunikaty naukowców (#29), wpis w encyklopedii (#9), motywy muzyczne (#28).
  6. Tanio wizualnie: biom `medieval` i `settlement` są gotowe; żywa osada = ruch, dym, światła.
  *Wyzwania*
  1. Ton i etyka (WIZ-7): kolonizacja zamieszkanej planety; potrzebna decyzja, czy eksploatacja jest dozwolona, jakie ma konsekwencje, czy można chronić (W82).
  2. Konflikt bez walki: wrogość tylko miękka (zdarzenia, opóźnienia, utrata reputacji, sabotaż dostaw) albo nowy system obrony; opcja (c) w Q36 to duża praca.
  3. Wykrywalność: cywilizacja średniowieczna nie emituje sygnałów — niewidoczna dla analizy sygnałów (#14) i tranzytów (#25); poznanie dopiero sondą lub skanem po przybyciu (§9.4, #31), więc rośnie wartość sondy.
  4. Wyłączność układu (Q19) i WIZ-1 C (instancja gracza): cywilizacja „należy” do gracza, który zajął układ; bez wyłączności relacja jest per gracz.
  5. Siatka heksów: osada zajmuje pola (drogi, budynki, las), mniej wolnych pól budowy; konflikt o pola ze złożem (W79).
  6. Determinizm i autorytatywność: flaga cywilizacji z ziarna w katalogu galaktyki (G-K); 1% przy ok. 100 układach w 20 ly daje ok. 1 przypadek; w 41 rzeczywistych gwiazdach oczekiwane 0,4 (W78); nowe reguły tylko w Rust (R-20), TS tylko wygląd.
  7. Skala treści: nazwy, kontrakty, komunikaty; ryzyko, że cywilizacja zostanie „węzłem zasobów” bez głębi.
  8. Skórka medieval (T7B, T-24) każe budowlom gracza wyglądać średniowiecznie na planecie `medieval`; przy żywej cywilizacji budowle gracza powinny zostać sci-fi (kontrast), więc reguła skórki wymaga zmiany (W77).
- **Powiązania:** #4, #7, #8, #12, #13, #14, #17, #18, #19, #20, #21, #22, #25, #28, #29, #32; WIZ-4, WIZ-6, WIZ-7, EKO-10, SOC-3, R-7; Q19, Q23, Q29; T-23, T-24, T-30; dok. ekonomii §9.4; `BodyProfile`, `depositWeights`, `settlement`.
- **Konflikty z decyzjami:** T7B / T-24 (skórka medieval dla budowli gracza) ↔ żywa osada; „frakcje jako strony konfliktu odrzucone w MVP” (05 §4, SOC-3 C) ↔ wrogie cywilizacje; Tau Ceti c = ruiny ↔ „żywa cywilizacja”; „układ samowystarczalny” ↔ bogate układy jako cel wypraw.
- **Otwarte pytania:** Q36; W77–W82 w kolejce.

### #27 — Tożsamość cywilizacji gracza: nazwa, kolor (wpływ na UI), flaga, awatar · temat: T9 UI/UX (+ T6 Social) · status: nowy, w dużej części pokryty planem 06 · 2026-11-10
- **Słowa użytkownika:** „gracz moze nadac swojej cywizlizacji nazwę, wybrać kolor który bedzie miał wpływ na UI, flagę, avatar gracza”
- **Interpretacja (moja, NIEpotwierdzona):** profil gracza zawiera nazwę cywilizacji, kolor, flagę i awatar; kolor „wpływa” na interfejs (zakres nieznany, Q37), a także na flagę i awatar (w planie 06: pole flagi i ton awatara w kolorze gracza). Nie wiem: czy nazwa cywilizacji to osobne pole obok callsign (zakładam tak, A13); czy flagę i awatar gracz wybiera sam, czy wynikają z koloru (W84).
- **Stan w projekcie:** `docs/plan/06-PANEL-UZYTKOWNIKA.md` (rekomendacje; brak wpisu w `DECISIONS.md`) już opisuje: profil `{callsign (unikalny, 3–16 znaków, zmiana raz na 30 dni), motto ≤ 80, color_id 1–12, avatar_seed, flag {layout, color1, color2, symbol}}`; paleta 12 stonowanych kolorów (żaden bliski bursztynowi #FFB000, cyjanowi #4FFFB0 ani czerwieni #FF5A4A; walidator rozróżnialności i kontrastu ≥ 3:1 na `hull`); awatar B = sigil 8×8 kropek generowany z ziarna (2 tony: tekst + kolor gracza, „losuj ponownie” do 10 razy); kompozytor flagi (6 układów × drugi kolor × 24–32 symbole, ok. 27 tys. kombinacji); maszt z flagą w 3D (U-4, dwutonowy); korporacje mają `flag` i `color_id` (oficer może nadpisać kolory członków); fazy U0 (mock w `localStorage`) – U3. **U-3: „kolor gracza nigdy nie jest kolorem interfejsu”** — tylko świat i mapa (znacznik kolonii, romby statków, pierścień zaznaczenia, pole flagi, karta gracza); bursztyn jedynym sygnałem HUD.
- **Konsekwencje:**
  1. Nowe względem planu 06: (a) nazwa cywilizacji jako pole profilu (filtr słów, widoczność na mapie galaktyki i dla odkrytych graczy #14 / #15, zmiana), (b) kolor jako motyw interfejsu (sprzeczne z U-3).
  2. Warianty „wpływu na UI” (Q37): (a) tylko znaczniki w świecie (plan 06); (b) akcent HUD w kolorze gracza — zmiana zasady DS „jeden kolor sygnałowy”, tokeny motywu, walidacja kontrastu dla każdej z 12 barw, testy zrzutów; (c) domyślnie (a) + opcjonalny motyw w ustawieniach. Kolory semantyczne (ostrzeżenie, błąd, sukces) zostają niezmienne.
  3. Spójność z #19: sigil 8×8 i ikony symboli flag (`icon-paths.ts`) pasują do pixel-artu; awatary NPC (#19) to osobna rzecz (portrety).
  4. Dostępność: tożsamość nigdy tylko kolorem — zawsze kolor + symbol flagi albo tag (plan 06 §4.1).
  5. Dane: tabela `profiles` jest planowana (02 §7, 06 §5); mock w `localStorage` pozwala zacząć bez serwera (U0).
  6. Moderacja: nazwa to tekst, więc filtr słów i zgłoszenia (jak callsign i motto); flaga bez tekstu i bez uploadów nie wymaga moderacji.
- **Powiązania:** #11, #14, #15, #19, #20; plan 06 (U-1…U-8), 05 §5 (flagi korporacji), 03 M-3; DS (`HudAvatar`, `HudFlag`, `HudSwatchPicker`).
- **Konflikty z decyzjami:** U-3 (rekomendacja planu 06) ↔ „kolor wpływa na UI”; DS „jeden kolor sygnałowy”; U-5 (callsign unikalny) ↔ nazwa cywilizacji (zakładam osobne pole).
- **Otwarte pytania:** Q37; W83–W85 w kolejce.

### #28 — Muzyka i dźwięki do gry · temat: T10 Grafika 3D, audio, pipeline · status: nowy · 2026-11-10
- **Słowa użytkownika:** „potrzebujemy muzyki, oraz dzwieków do gry”
- **Interpretacja (moja, NIEpotwierdzona):** potrzebna warstwa audio: muzyka tła oraz efekty dźwiękowe (interfejs, zdarzenia gry, świat 3D). Zakres, styl i źródło nieznane (W86–W88); bez pytania, bo to ogólna potrzeba — zakładam A12.
- **Stan w projekcie:** audio nie istnieje: w repozytorium nie ma użycia Web Audio ani bibliotek audio (sprawdzone po `AudioContext`, `PositionalAudio`, `new Audio(`, howler, tone.js), a dokumenty wspominają dźwięk tylko jako ikonę na zrzucie referencyjnym (`game-mechanics-analysis.md`). Pipeline assetów 3D (`plan/03`) ma manifest i budżety, dla audio nie ma odpowiednika; #19 robi to samo dla ikon.
- **Konsekwencje (PROPOZYCJE):**
  1. Kategorie: muzyka (pętle per widok: galaktyka / układ / planeta / kolonia; zmiana nastroju przy alarmie lub przylocie), dźwięki interfejsu (kliknięcia, panele, odmowa rozkazu `COMMAND_REJECTED`), dźwięki zdarzeń (37 typów `DomainEvent`: ukończenie budowy, przylot, koniec skanu…), dźwięki świata 3D (silniki, praca fabryk, ambient planety; pozycyjne), głosy (komunikaty #29 — opcjonalnie).
  2. Silnik w kliencie: Web Audio, magistrale (główna, muzyka, efekty, interfejs, ambient), ustawienia głośności w `profiles.settings` (06), odblokowanie po geście użytkownika (polityka autoplay), pauza przy nieaktywnej karcie, wyciszenie.
  3. Dostarczanie do przeglądarki (jak #19): Opus/OGG + AAC dla Safari, krótkie efekty w jednym pliku sprite (jedno żądanie), muzyka strumieniowana (pętle 1–3 min, 96–128 kbps), leniwe ładowanie po pierwszym geście, budżet rozmiaru startu (np. ≤ 5 MB), manifest audio (ID, plik, licencja, autor) jak manifest 3D.
  4. Źródło: wolne pakiety CC0 (np. Kenney, OpenGameArt, Freesound CC0), zamówiony kompozytor / sound designer, generowanie AI (licencje do sprawdzenia); licencje i atrybucja w katalogu (#9); ryzyko jak T-8 (KayKit): licencję trzeba potwierdzić przed wydaniem.
  5. Architektura: audio jest subskrybentem zdarzeń w kliencie, bez wpływu na symulację, determinizm i replikę (R-18). Przy nadrabianiu offline (R-5) nie odtwarzać setek dźwięków — jeden dźwięk „raportu” (#29).
  6. Dostępność: dźwięk nigdy jedynym nośnikiem informacji (wizualny odpowiednik); osobne suwaki; napisy dla głosów.
  7. Spójność: obrysowy, ostry styl DS sugeruje krótkie, czyste, syntetyczne dźwięki interfejsu; styl muzyki wynika z tonu gry (WIZ-7); cywilizacja tubylcza (#26) może dostać własny motyw.
- **Powiązania:** #9, #19, #26, #29; WIZ-7; TECH-5 / 7; plan 03, plan 06 (`settings`).
- **Konflikty z decyzjami:** brak (audio poza dokumentami).
- **Otwarte pytania:** brak zadanych; W86–W90 w kolejce (styl, MVP, źródło, dostarczanie, zachowanie); założenie A12.

### #29 — Interfejs komunikatów od załogi, naukowców, komputera pokładowego i AI (styl RPG?) · temat: T9 UI/UX (+ T16 ludzie) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „UI potrzebuje jakiegoś interfejsu do informowania używkoniak o komunikatach od załogi/naukowców/ komputera pokładowego/ AI ( coś na wzór RPG ? )”
- **Interpretacja (moja, NIEpotwierdzona):** potrzebny kanał informacji dla gracza, w którym komunikaty mają nadawcę (załoga, naukowcy, komputer pokładowy, AI) i narracyjną formę. „Na wzór RPG” może oznaczać: okno dialogowe z portretem i nazwą mówiącego, dziennik, a nawet wybory odpowiedzi z konsekwencjami. Nie wiem: czy ma być tylko informacja czy też decyzje (Q38); czy nadawcy to postacie z imionami czy kategorie (W92); kim jest „AI” (W91).
- **Stan w projekcie:**
  * Strumień zdarzeń: 37 typów `DomainEvent` w `domain-event.model.ts` (np. `STRUCTURE_BUILT`, `TRANSFER_ARRIVED`, `SCAN_COMPLETED`, `DEPOSIT_DEPLETED`, `MINING_STOPPED`, `COMMAND_REJECTED`); Rust ma odpowiedniki.
  * Klient: `GameService.log` (`LogEntry[]`) czytany tylko przez panel projektanta (`designer/telemetry.ts`, zakładka Dziennik); `lastRejection` „dla inspektora i toastów”. Interfejsu komunikatów dla gracza nie ma.
  * Plany: 05 §6 powiadomienia asynchroniczne (przesyłka dostarczona, zlecenie zrealizowane, kontrakt wygasa, megaprojekt ukończony) w HUD (dziennik) i w panelu użytkownika; 06 §3 zakładka „Powiadomienia” (lista, przeczytane, ustawienia w grze / e-mail), tabela `notifications`.
  * Braki: ludzie w symulacji to skalar `crew_balance` (#8 nie ma jeszcze kodu), brak badań i naukowców (Q24), brak „AI” w dokumentach; awatary NPC (#19) są w planie ikon.
- **Konsekwencje (PROPOZYCJE):**
  1. Model komunikatu: nadawca (Załoga / Naukowcy / Komputer pokładowy / AI / Rynek / System), ważność (info / ostrzeżenie / alarm / sukces), szablon z parametrami (słownik `pl.ts`), źródło (zdarzenie, ciało, statek), akcje („Pokaż”, „Wydaj rozkaz”), stan (nieprzeczytany / przeczytany). Komunikat jest widokiem zdarzeń: generowany w kliencie ze zdarzeń, bez zmiany symulacji; powiadomienia asynchroniczne i offline z serwera (05 §6, 06).
  2. Trzy warstwy UI: toast / baner (ulotny), dziennik pokładowy (przewijany, filtry po nadawcy i ważności, wyszukiwanie), okno komunikatu z portretem i imieniem (rzadkie, ważne zdarzenia: odkrycie, kontakt #26, alarm, awaria).
  3. Mapowanie nadawców na źródła: Komputer pokładowy = stany techniczne (paliwo, moc, ładunek, przylot, odmowa rozkazu); Załoga = ludzie i morale (#8, #22, #24); Naukowcy = odkrycia i analizy (#13, #25, #31, Q24); AI = narrator i doradca (wprowadzenie, podpowiedzi, podsumowania).
  4. Offline (R-5, 12 h): po nadrabianiu jeden „raport z nieobecności” (grupowanie, priorytety) zamiast setek komunikatów; ten sam raport wyzwala jeden dźwięk (#28).
  5. Elementy RPG (opcjonalne, drugi etap): portrety (awatary NPC z #19), imiona i role załogi (wymaga modelu osób #8 / Q12), osobowości, wybory z konsekwencjami (morale #22, reputacja, koszt) — dużo treści i nowy system zdarzeń z wyborami w Rust (R-20).
  6. Ograniczanie hałasu: nie każde zdarzenie jest komunikatem (`MINING_TICK`, `EXTRACTION_TICK` nie); grupowanie podobnych, limity częstotliwości, ustawienia gracza (które nadawcy pokazywać).
  7. Dostępność i treść: `aria-live` dla toastów, wizualne odpowiedniki dźwięków (#28), teksty PL z wariantami (anty-powtarzalność), ton postaci z WIZ-7, słownik gotowy na EN (W16).
- **Powiązania:** #8, #13, #19, #22, #24, #25, #26, #28, #31; Q12, Q24; 05 §6; 06 §3; `GameService.log`.
- **Konflikty z decyzjami:** brak wprost; HUD-dziennik z 05 §6 jest zwykłą listą powiadomień — #29 dodaje nadawców i formę narracyjną.
- **Otwarte pytania:** Q38; W91–W95 w kolejce.

### #30 — Parametry gwiazd: jasność, wielkość, kompozycja · temat: T15 Układy planetarne i ciała niebieskie (+ T13, T2) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „gwiazdy maja swoje parametry jasnosc, wielkosc, kompozycje”
- **Interpretacja (moja, NIEpotwierdzona):** każda gwiazda ma jasność, wielkość (promień) i „kompozycję” (skład: chemiczny, np. metaliczność, albo klasa widmowa — nie wiem, Q39), i te parametry mają mieć skutki w grze (zakres nieznany, Q39).
- **Stan w projekcie:**
  * Kod (Rust i TS): `Body.luminosity` (tylko gwiazdy, w L☉, domyślnie 1) i `insolation` (domyślnie jasność × (900 / promień orbity planety głównej)²) — jasność już wyznacza moc słoneczną; `radius` ciała to rozmiar wizualny; temperatura i woda planety w `BodyProfile` to opisy tekstowe, nie wyliczenia; pola składu nie ma.
  * Render galaktyki: `Star {spectralClass, color}`, `spectralType` (O B A F G K M BD WD), `luminosityClass` (I–V), rozmiar kropki z typu widmowego i klasy jasności (`starLook`, `STAR_BASE_SIZE`, `LUMINOSITY_BONUS`).
  * Dane PoC (`poc/space-galaxy-poc/star-map/.../stars.data.ts`): dla gwiazd rzeczywistych magnitudo pozorna i absolutna, klasa widmowa, kolor, odległość, temperatura (K), masa, promień, jasność, liczba planet; składu (metaliczności) brak.
- **Konsekwencje (PROPOZYCJE):**
  1. Jasność → energia i klimat: moc słoneczna (jest), temperatura równowagowa planet (~ jasność^¼ / √odległość), strefa życia (#32), woda, biom (T5: winter / dry / mixed), koszty ogrzewania lub chłodzenia (jeśli kiedyś).
  2. Wielkość (promień) → skala wizualna w widoku układu; strefa zagrożenia wokół gwiazdy (#7, G-G; rozmiar ∝ promień i jasność); głębokość spadku w skanie tranzytowym (#25: głębokość ≈ (R_planety / R_gwiazdy)², więc mała gwiazda = łatwiej wykryć mały świat).
  3. Skład → złoża: metaliczność gwiazdy koreluje z ilością ciężkich pierwiastków w układzie; układ bogaty w metale = więcej rzadkich surowców (T0R), ubogi = więcej lodu i wodoru. Naturalne źródło asymetrii układów (#21, Q23 / Q29) i „bogatych” układów (#26): skład → wagi generatora złóż (`depositWeights`).
  4. Odkrywanie (#13): jasność pozorna zależy od jasności i odległości — słabe gwiazdy trudniej zobaczyć z daleka, więc promień wykrycia teleskopu zależy też od jasności celu; czas i jakość skanu tranzytowego rośnie z jasnością (stosunek sygnału do szumu).
  5. Generator (G-K): parametry z ziarna dla gwiazd generowanych (rozkład typów widmowych: większość to karły M — słabe, z ciasną strefą życia), dla 41 rzeczywistych dane już są; realizm kontra grywalność.
  6. Dane i zgodność: rozszerzenie `CelestialBody` / katalogu o `radius` (R☉), temperaturę, masę, skład; parytet TS↔Rust i wektory zgodności; nowe reguły tylko w Rust (R-20).
  7. UI i encyklopedia (#9): karta gwiazdy z parametrami; wygląd gwiazdy z ziarna (#19 faza 2).
- **Powiązania:** #4, #7, #12, #13, #18, #19, #21, #25, #26, #31, #32; EKO (energia), WIZ-4; `Body.luminosity`, `insolation`, `galaxy-model.ts`, `stars.data.ts`.
- **Konflikty z decyzjami:** dok. ekonomii „układ samowystarczalny” (wszystkie rzadkie surowce w jednym układzie) ↔ skład gwiazdy jako źródło asymetrii (wspólne z #21); temperatura planet jako tekst ↔ liczona z jasności.
- **Otwarte pytania:** Q39; W96–W99 w kolejce.

### #31 — Przylot na obrzeża układu, odprawa ze znanymi danymi i skan potwierdzający · temat: T13 Galaktyka, odkrywanie i kontakt (+ T5 Flota) · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „po wybraniu lub dotarciu do układu docieramy na jego obrzeza następnie, dostajemy informacje o znanych informacjach i potwierdzamy je dodatkowym skanem pokazujacym dokładna ilosc plant, ich kompozycje i parametry”
- **Interpretacja (moja, NIEpotwierdzona):** po wyborze układu (start, #4) albo po dotarciu do niego (przylot, #1 / #16) statek pojawia się na obrzeżach układu; gracz dostaje odprawę z tym, co już wiadomo o układzie (dane katalogowe, szacunek ze skanu tranzytowego #25, ewentualnie dane z sondy), a następnie dodatkowy skan potwierdza to i pokazuje dokładną liczbę planet, ich skład i parametry. Nie wiem: czy obrzeża dotyczą każdego przylotu czy tylko pierwszego wejścia do nowego układu (W101); co dokładnie ujawnia skan, w tym czy „kompozycja” obejmuje złoża (W103); czy skan jest obowiązkowy przed lądowaniem.
- **Stan w projekcie:**
  * Skan po przybyciu istnieje: `SCAN_STARTED {shipId, endsAt}` → `SCAN_COMPLETED {bodyIds}` (ok. 15 min modelu), ciało ma `revealed` („nieznane do skanu układu”, domyślnie true) i `unknown_name`; po skanie przepływ startowy: `COLONY_SITE_CHOSEN` → `SPACEPORT_PLACED` → `COLONY_FOUNDED`.
  * Arka-1 startuje zadokowana przy ciele gwiazdy (`scenarios/tau_ceti.rs`); `order_transfer` odrzuca gwiazdę jako cel (`NotLandable`); `BodyKind` nie ma ciała „obrzeża”; tankowanie na bazie domowej jest darmowe i automatyczne (`docking.rs`) — na obrzeżach bazy nie ma.
  * Dok. ekonomii §9.4: Sonda poznaje profil układu docelowego jeszcze przed przylotem; skan po przybyciu daje profile planet.
- **Konsekwencje (PROPOZYCJE):**
  1. Model wiedzy o układzie z poziomami: katalog (gwiazda, liczba znanych planet) → szacunek z tranzytów (#25) → sonda (§9.4) → skan potwierdzający na miejscu; każda informacja ma źródło i pewność. Skan na obrzeżach domyka to, czego szacunek nie pokazuje: pominięte planety, księżyce, pasy, złoża (spójne z Q35 b).
  2. Odprawa („znane informacje”) jako ekran porównania „oczekiwano ↔ potwierdzono” — gracz widzi, co się zgadza, co szacunek pominął, co okazało się inne; naturalne miejsce na komunikat naukowców i komputera (#29).
  3. Obrzeża jako miejsce: wirtualne ciało-rubież na zewnątrz najdalszej orbity (nielądowalne, bez docku) albo punkt przylotu; z niego lot wewnątrzukładowy do ciał (czas i paliwo, istniejący `transfer`); kamera i animacja zbliżania się do układu (render).
  4. Paliwo: statek po skoku ma mało paliwa (#1, #3), a darmowe tankowanie nie działa poza bazą — zasięg wyboru miejsca kolonii z obrzeży zależy od paliwa po skoku: konkretyzuje Q4′ (czym płacimy skok i ile zostaje).
  5. Start gry (#4): skok → obrzeża → odprawa → skan → wybór planety kolonii; zmienia scenariusz startowy (dziś Arka stoi przy gwieździe) i W06 A.
  6. Przyloty statków międzygwiezdnych (#1, #16): ostatni odcinek to lot z obrzeży; port lub brama na obrzeżach po zasiedleniu (z S3) mogłaby go skracać (W101).
  7. Autorytatywność i mgła wojny (#13): serwer wysyła klientowi tylko to, co gracz wie; skan jest zadaniem w czasie z wynikiem wyliczonym z ziarna; nowe reguły w Rust (R-20); naukowcy i morale (#8, #22) mogą wpływać na szybkość i szczegółowość skanu (propozycja).
  8. Rozdział ról: tranzyty (#25) = oszacowanie z daleka, sonda = poznanie przed przylotem, skan na obrzeżach = potwierdzenie na miejscu; po sondzie skan bywa tylko formalnością (do rozstrzygnięcia, W103 / W104).
- **Powiązania:** #1, #3, #4, #12, #13, #16, #25, #26, #29, #30, #32; Q4′, Q18, Q35; dok. ekonomii §9.4; `SCAN_*`, `revealed`, `transfer.rs`, `docking.rs`, `tau_ceti.rs`.
- **Konflikty z decyzjami:** start Arki przy gwieździe (`tau_ceti.rs`, W06 A) ↔ przylot na obrzeża; darmowe tankowanie (`docking.rs`) ↔ brak bazy na obrzeżach; §9.4 (sonda poznaje profil przed przylotem) ↔ skan potwierdzający (rozdzielenie ról).
- **Otwarte pytania:** brak zadanych (doprecyzowuje Q4′); W100–W104 w kolejce.

### #32 — Strefa życia: obszar układu, w którym możliwa jest woda w stanie ciekłym · temat: T15 Układy planetarne i ciała niebieskie · status: nowy, wymaga doprecyzowania · 2026-11-10
- **Słowa użytkownika:** „układy słoneczne powinny posiadać strefe gdzie mozliwe jest życie / woda w stanie ciekłym”
- **Interpretacja (moja, NIEpotwierdzona):** każdy układ ma strefę zamieszkiwalną (pas orbit, na którym możliwa jest woda w stanie ciekłym, a więc życie); jej położenie wynika z jasności gwiazdy (#30). Nie wiem, co ma z niej wynikać mechanicznie: samo kryterium zamieszkania, bonus do oceny planety, zasób „życie”, miejsce rodzimego życia i cywilizacji (#26) — Q39, W107.
- **Stan w projekcie:** `insolation` (liczba) już wynika z jasności i odległości (900 jednostek modelu = odległość odniesienia); `BodyProfile.temperature` i `water` to opisy tekstowe; biomy terenu (winter / dry / mixed / medieval) przypisane ręcznie w scenariuszu (T-25: `mixed` → tc-e, planeta startowa); „linia śniegu” pojawia się tylko w opisie generatora olbrzymów (G-P); w katalogu materiałów nie ma surowców organicznych (T0: Ferryt, Silicyt, Kriol, Karbonit, Regolit).
- **Konsekwencje (PROPOZYCJE):**
  1. Wspólny model stref generatora (G-K): strefa gorąca (sucho, bez wody), strefa życia (woda ciekła), linia śniegu (lód; olbrzymy, G-P), strefa zimna. Granice z jasności: skoro insolacja = L × (900 / r)², promień granicy r = 900 × √(L / S), gdzie S to graniczna insolacja (orientacyjnie ok. 1,1 wewnętrznie i ok. 0,5 zewnętrznie, do kalibracji); można dać strefę miękką (gradient) zamiast ostrej granicy.
  2. Skutki dla planety: woda (ciekła / lód / para), biom (T5), ocena (`rating`), koszt i czas budowy (teren, T8), możliwość habitatu na powierzchni; planety poza strefą stają się zasobem (lód, metale) zamiast miejscem na kolonię — źródło decyzji „gdzie osiedlić się, gdzie wydobywać”.
  3. Wybór startu (#4, #12): „układ z potencjałem ekspansji” może wymagać planety w strefie życia; generator „dobrego startu” (W31) gwarantuje planetę w strefie.
  4. Tranzyty (#25): w strefie wokół gwiazdy typu G okresy są długie (potrzebna długa obserwacja), wokół karłów M krótkie (łatwo wykryć, ale strefa jest ciasna) — emergentna zależność między gwiazdą a wykrywalnością.
  5. Życie jako treść (do decyzji, W107): tylko warunek (taniej budować, wyższa ocena), zasób (biosfera → surowce organiczne, żywność), rodzime życie i cywilizacja (#26 tylko w strefie życia?); nowy surowiec oznacza zmianę katalogu i łańcuchów.
  6. Skan potwierdzający (#31) pokazuje, które planety leżą w strefie życia; szacunek z tranzytów daje okres i temperaturę, więc pozwala wstępnie ocenić.
  7. Dane i zgodność: strefa jako funkcja jasności gwiazdy i orbit; test generatora (każdy układ ma dobrze określoną strefę); nowe reguły tylko w Rust (R-20).
- **Powiązania:** #4, #12, #18, #25, #26, #30, #31; WIZ-4; G-K, G-P; T5 (biomy), T8 (teren a koszt), T-25.
- **Konflikty z decyzjami:** biomy przypisywane ręcznie w scenariuszu (T-25) ↔ wynik reguły strefy; temperatura / woda jako teksty ↔ liczone.
- **Otwarte pytania:** Q39 (razem z #30); W105–W108 w kolejce.

### #33 — Serwerowy generator gwiazd, planet i układów (przy skanie teleskopem i przy zakładaniu konta; sąsiedztwo graczy) · temat: T13 Galaktyka, odkrywanie i kontakt (+ T15, T11) · status: nowy, wymaga doprecyzowania · 2026-11-11
- **Słowa użytkownika:** „Serwer gry powinien posiadac generator nowych gwiazd, planet oraz ukladow slonecznych. Generator powinien generowac nowe uklady podczas skanowania za pomoca teleskopow. Oraz podczas tworzenia nowych kont uzytkownikow. Gwiazdy powinny byc generowane w sasiedztwie tak aby gracze byli w odleglosci kilku gwiazd”
- **Interpretacja (moja, NIEpotwierdzona):** generator po stronie serwera (Rust) tworzy układy na żądanie: (1) gdy teleskop skanuje nowy obszar (#13, #25), (2) gdy powstaje konto — układ startowy (#4, #12) w sąsiedztwie; gwiazdy rozmieszczane tak, by gracze mieli sąsiadów w odległości kilku gwiazd. Konkretyzuje G-K (katalog hybrydowy: 41 rzeczywistych + generowane).
- **Konsekwencje (PROPOZYCJE):**
  1. Determinizm: wynik generatora powinien być funkcją (ziarno galaktyki, współrzędne), nie kolejności próśb — inaczej skan A-potem-B i B-potem-A dają różne galaktyki; wygenerowane układy zapisywane przy odkryciu (R-15, trwałość).
  2. Generator zbiera #26 (1% cywilizacji), #30/#32 (parametry gwiazd, strefa życia), #21/Q29 (asymetria złóż), #12 (gwarancja potencjału ekspansji) i #18 (olbrzymy, księżyce) w jednym miejscu; reguły tylko w Rust (R-20), klient dostaje wynik jako dane.
  3. Skan teleskopem generuje „leniwie”: koszt obliczeń na serwerze w zadaniu galaktyki, limity (anty-nadużycia); wynik skanu #25 i dane #31 muszą pochodzić z tego samego ziarna.
  4. Konto: układ startowy + kilka gwiazd w pobliżu; sąsiedzi graczy → gęstość zależna od liczby graczy (klaster rośnie), wyłączność (Q19), kontakt/wiadomości (#14, #15), wspólny rynek i huby (rzeczywiste gwiazdy huby z S0).
  5. Rzeczywiste 41 gwiazd (WIZ-4): zostają jako stałe punkty (huby)? Generator wypełnia przestrzeń wokół.
- **Konflikty:** dziś katalog = 41 gwiazd na stałe (`GameApi.catalog().stars`), mapa pokazuje wszystkie; huby w rzeczywistych gwiazdach (plan 05) ↔ klaster graczy daleko od nich.
- **Otwarte pytania:** Q40; W109–W112.

## Otwarte pytania do użytkownika (aktywne) — zapis roboczy i historia; uporządkowany REJESTR PYTAŃ jest na końcu pliku
- **Q1 (do #4) — ZAMKNIĘTE 2026-11-10, odpowiedź „1 a" (gwiazda na mapie galaktyki, jednorazowy skok, paliwo wyznacza zasięg).** Treść pytania: „wybór układu" = gwiazda na mapie galaktyki czy planeta w jednym układzie? Co robi paliwo (zasięg wyboru / budżet zwiadu / tylko zapas startowy)? Potem: czym ma być Arka-1.
- **Q2 (do #1) — ZAMKNIĘTE 2026-11-10, odpowiedź: cała rodzina klas z ładownością.** Treść pytania: statki międzygwiezdne = wyłącznie gwiazdolot + sonda (jak w projekcie) czy rodzina klas z ładownością i poziomami (np. frachtowce handlowe)? Czy handel z hubami przechodzi na loty statków?
- **Q3 (do #3) — CZĘŚCIOWO ZAMKNIĘTE 2026-11-10:** odpowiedź dotyczyła paliwa międzygwiezdnego (#5); paliwo międzyplanetarne przyjęte jako założenie (zakomunikowane). Treść pytania: czy tankowanie przestaje być darmowe, a paliwo staje się towarem do wyprodukowania?
- **Q4 (do #4), zadane 2026-11-10:** czy zużycie paliwa na skok zależy od odległości (dalsza gwiazda = mniej paliwa po lądowaniu; kompromis blisko/ubogo vs daleko/bogato) i ile gwiazd ma być w zasięgu na starcie (kilka, 3–5, czy kilkanaście)? Odległości liczone od Układu Słonecznego jak w katalogu — do potwierdzenia.
- **Q4′ (zmiana brzmienia Q4 po #5, zadane 2026-11-10):** skok startowy płacimy (a) tą samą pulą paliwa co loty lokalne (dalej = mniej na pierwsze loty) czy (b) osobnym, jednorazowym ładunkiem skoku, po którym zostaje tylko limit zasięgu? Plus: ile gwiazd w zasięgu (kilka 3–5 czy kilkanaście)? Odległości od Układu Słonecznego jak w katalogu.
- **Q5 (do #4), zadane 2026-11-10:** zestaw startowy — Arka-1 (ładownia 2000 j., 2 łaziki, prom, sonda) zostaje jako nośnik kolonii, czy start jest dużo uboższy (sam mały statek i jego ładownia, np. 50 j.)? Z czego zbudujemy pierwsze budynki?
- **Q6 (do #1), zadane 2026-11-10:** handel zanim gracz ma własny statek międzygwiezdny — (a) tylko własne statki, handel odblokowuje się z pierwszym frachtowcem (kilkanaście dni bez huba), (b) własne statki + przewoźnik NPC za opłatą (wolniej, drożej, małe partie) jako wejście do handlu, (c) przesyłki zostają abstrakcyjne, a statki służą tylko do przewozu między własnymi układami i kolonizacji?
- **Q7 (do #1), zadane 2026-11-10:** lista klas międzygwiezdnych — propozycja: frachtowiec, tankowiec, okręt kolonizacyjny, sonda/zwiadowca, opcjonalnie kurier. Pasuje, czegoś brakuje, coś wyrzucić?
- **Q8 (do #6), zadane 2026-11-10:** czym jest „plan" potrzebny do zbudowania statku międzygwiezdnego? (a) odblokowany projekt: badanie albo zakup u frakcji NPC, (b) schemat w bibliotece gracza, który można stworzyć, wymienić i sprzedać (jak projekty Atanora), (c) to samo co poziom stoczni/doku, jak dziś, (d) coś innego?
- **Q9 (do #6), zadane 2026-11-10:** załoga — (a) tylko pojemność jak dziś (obsada stoczni i statku, zajęta, dopóki statek istnieje), (b) załoga leci ze statkiem i znika z kolonii na czas lotu, (c) osobny zasób do wyprodukowania (rekrutacja, szkolenie)?
- **Założenie do #3 (zakomunikowane 2026-11-10):** paliwo statków międzyplanetarnych = zwykłe Paliwo produkowane w kolonii (era Industrializacji), koniec darmowego tankowania na bazie; użytkownik ma poprawić, jeśli nie.
- **Założenie do #2 (zakomunikowane):** klasa = typ statku, poziom rozbudowy = Mk I–III; użytkownik ma poprawić, jeśli chodziło o coś więcej.

## Konflikty i wpływ na istniejące decyzje (aktywne)
- W06 A (domyślny start Tau Ceti + przylot Arki-1) ↔ #4.
- `docking.rs` (darmowe tankowanie na bazie) ↔ #3.
- Plan 05 „brak transportu między układami poza gwiazdolotem" ↔ #1 (rodzina klas międzygwiezdnych POTWIERDZONA w Q2: założenie przestaje obowiązywać) i #4 (wariant A).
- Przesyłki do hubów (`SHIP_TO_HUB`, `exchange.rs`: handling + d_ly × 7200 s/ly, bez statku i paliwa; S0–S2 w galaxy-b6) ↔ #1/Q2: loty floty (ładownia, paliwo, czas). Zmiana wymaga przepisania planu 05 §3.2 i części B6.
- Terminal handlowy w erze „Orbita i asteroidy" (dni 5–10) ↔ pierwszy statek międzygwiezdny po kilkunastu dniach (#1/Q2): luka w dostępie do huba — Q6.
- #6 „plan" ↔ zasada „progresja = poziomy HQ i budynków" (dok. ekonomii §3.1): konflikt, jeśli plan to osobny przedmiot lub badanie (Q8 a/b).
- #32: biomy przypisywane ręcznie w scenariuszu (T-25) ↔ wynik reguły strefy życia; `BodyProfile.temperature` / `water` jako teksty ↔ wartości liczone z jasności gwiazdy.
- #31: start Arki-1 przy gwieździe (`tau_ceti.rs`, W06 A) ↔ przylot na obrzeża i lot do ciał; darmowe tankowanie (`docking.rs`) ↔ brak bazy na obrzeżach; §9.4 (sonda poznaje profil przed przylotem) ↔ skan potwierdzający na miejscu (rozdzielenie ról).
- #30: dok. ekonomii „układ samowystarczalny” ↔ skład gwiazdy jako źródło asymetrii (wspólne z #21); temperatura planet jako tekst ↔ liczona z jasności.
- #29: HUD-dziennik z planu 05 §6 (lista powiadomień) ↔ komunikaty z nadawcami i formą narracyjną; brak postaci załogi w symulacji (`crew_balance` to skalar).
- #28: brak audio w projekcie i w pipeline assetów (plan 03); WIZ-7 (ton) otwarte.
- #27: U-3 (plan 06: kolor gracza tylko w świecie i na mapie) ↔ „kolor wpływa na UI”; DS „jeden kolor sygnałowy” (bursztyn); U-5 (callsign unikalny) ↔ nazwa cywilizacji.
- #26: T7B / T-24 (skórka medieval dla budowli gracza) ↔ żywa osada; SOC-3 C (frakcje jako strony konfliktu odrzucone w MVP) i brak walki ↔ wrogie cywilizacje; Tau Ceti c (ruiny) ↔ „żywa cywilizacja”; „układ samowystarczalny” ↔ bogate układy jako cel wypraw.
- #25: §9.4 (sonda jako sposób poznania profilu układu) ↔ skan tranzytowy jako drugi, pośredni sposób; rozdzielenie ról: tranzyty = planety, sygnały = zajętość.
- #24: pojemność załogi Habitatu z tabeli (10 → 84) ↔ z koi w projekcie w granicach koperty; `MAX_DECK` globalne (3) i brak limitu powierzchni w edytorze ↔ koperta per klasa i poziom.
- #22: dok. §4.5 (niedobór → 50% wydajności, bez morale) ↔ morale jako skala ciągła; EXP-3 (pojemność + potrzeby; pełna symulacja populacji poza zakresem) ↔ morale grup; kalibracja §3.1 (pełna wydajność) ↔ morale < 100%; edytor wnętrz: `ShipStats` bez pola komfortu i bez pomieszczeń rekreacyjnych.
- #23: dok. (orbita = budowle bez kafelka na ciele, wspólna pula) ↔ stacja jako byt z modułami (Q31); kod: brak stacji, dockow i produkcji statków.
- #21: Q23 (a) (gwarancja olbrzyma w układzie startowym) ↔ twarda dostępność Hel-3 / Deuteru; „układ samowystarczalny" w dok. ekonomii (wszystkie rzadkie surowce w jednym układzie macierzystym) ↔ cel zależności między układami.
- #20: frakcje graczy (SOC-3 C) odrzucone w MVP planu 05 ↔ „frakcje" w wypowiedzi użytkownika (Q26); brak PvP (S-8 / WIZ-6) ↔ wartość przymierzy (Q27); Brama z planu 05 (skraca przesyłki między hubami) ↔ po #16 skraca loty statków między układami (przeprojektowanie).
- #19: pixel-art wielobarwny ↔ zasada DS („ikony obrysowe z ostrymi końcami linii", jeden kolor sygnałowy); awatar gracza (sigil 8×8, plan 06 §4.2) ↔ awatary NPC jako portrety; „rozwój nauki" ↔ brak systemu badań w dokumentach (Q24).
- #18: dokument (Gigas + Glacja, Platforma czerpalna) ↔ kod (`BodyKind` bez GasGiant; Tau Ceti bez olbrzymów i księżyców; budowle orbitalne na ciele bez siatki do sprawdzenia).
- #17: wizja (`1-game-description.md` §2: 5 000 skał w jednym draw callu, tryb Mining View) ↔ kod (`BeltView`: 420 skał dekoracyjnych w dwóch `InstancedMesh`, pas = jeden cel, brak pojedynczych skał; PoC 3D ma jedną asteroidę).
- #16 (czas lotu od kilku godzin) ↔ §9.2 (napędy Mk I–IV: 12 → 4 h/ly, minimum ok. 17 h na Proximę) i §9.1 (habitat hibernacyjny w gwiazdolocie, 41 050 kr): cel „kilka godzin" wymaga ≤ 1 h/ly, a loty godziny–dni czynią hibernację zbędną.
- #11/#14 (jedna galaktyka, układy zajęte przez graczy) ↔ WIZ-1 = C i MP-2 (C w MVP, docelowo B): zajętość jako rejestr w galaktyce jest zgodna z C; wspólne układy z wieloma graczami = B / A (wyższa złożoność). #11 ↔ WIZ-4 (katalog 41 gwiazd, ~100 układów w 20 ly ≪ liczba graczy): wymusza galaktykę proceduralną / hybrydową.
- #12 ↔ W06 A (domyślny start Tau Ceti) i §9.3 (14 z 21 gwiazd bez planet): start tylko w układzie z potencjałem ekspansji.
- #13 (mgła wojny, odkrywanie teleskopami) ↔ dziś mapa galaktyki pokazuje wszystkie 41 gwiazd, `GameApi.catalog().stars` zwraca całość; ↔ §9.4 (sonda jako sposób poznania profilu): rozdzielić role teleskopu i sondy.
- #15 ↔ SOC-6 (rekomendacja B) i plan 05 §7 („bez czatu globalnego; wiadomości prywatne później"): #15 przyspiesza wiadomości prywatne i bramkuje je odkryciem.
- #10 (budowa międzygwiezdnych na orbicie) ↔ kod: nie ma produkcji statków (Stocznia tylko w katalogu), orbita nie ma własnego magazynu ani dockow; ↔ dok. ekonomii: Astraeus i Prom powstają na Lądowisku (powierzchnia), reszta w Stoczni orbitalnej — do uściślenia (Q16 d).
- #9 rozszerza D-1 (`#/katalog` w planie 04) o mechaniki i obiekty spoza materiałów / budynków (statki, stacje, ciała) oraz ewentualnie o widok gracza; brak konfliktu, ale wymaga decyzji o zakresie (Q14).
- #8 (typy ludzi, ludzie na statkach) ↔ EXP-3 (załoga = pojemność + potrzeby życiowe, pełna symulacja populacji poza zakresem) i kod (`crew_balance` = jedna liczba; brak populacji, załogi na statkach); #8 (naukowcy) ↔ zasada „progresja = poziomy HQ i budynków" (§3.1), jeśli wchodzą badania; nazewnictwo personelu ↔ role korporacji (SOC-2).
- #7 (a): obecna blokada lotu do gwiazdy (`NotLandable`, `simulation.rs`) ↔ „możliwe, ale z poważnymi konsekwencjami"; start Arki-1 przy gwieździe (`tau_ceti.rs`) ↔ strefa zagrożenia wokół gwiazdy.
- #5 (egzotyczne paliwo z Atanora L3+, Hel-3 i Deuter z olbrzyma) ↔ wczesny handel z hubami (Terminal handlowy w dniach 5–10): paliwo międzygwiezdne jest dostępne dopiero w dniach 11–20 → wzmacnia Q6.
- Wyjątek startowy: statek międzyplanetarny robi jednorazowy skok międzygwiezdny (#4 vs #1) — zaakceptowany przez użytkownika („1 a"); po skoku statek już nie opuszcza układu.
- Zestaw startowy: Arka-1 (ładownia 2000 j., 2 łaziki, prom, sonda) ↔ mały statek międzyplanetarny (#4 vs era Lądowania w dok. ekonomii) — czeka na Q5.
- Gwiazdy bez znanych planet (14 z 21 w katalogu do 17 ly) ↔ wymóg planety do lądowania na starcie (#4).

## Szkic planu (wstępny — zależy od odpowiedzi na Q1–Q3)
- **G-A Katalog statków** (#1, #2): klasy i poziomy jako dane + parytet TS↔Rust, stan `class` + `level`, modernizacja, karta statku. Rozmiar: średni. Prawie niezależne od reszty.
- **G-B Paliwo jako zasób** (#3): koniec darmowego tankowania, rozkaz tankowania z magazynu bazy, receptury paliwa, ujście w ekonomii, gwarancja drogi do pierwszej produkcji paliwa. Rozmiar: średni; dotyka zapisu, protokołu, nagrań wzorcowych.
- **G-C Start gry** (#4, wariant A potwierdzony): duży — mapa galaktyki w trybie wyboru celu (zasięg, koszt paliwa, karta gwiazdy); generator układów dla dowolnej gwiazdy (deterministyczny, Rust + WASM, gwarancja planety do lądowania i źródła wody); zestaw startowy i energia startowa dla różnych typów gwiazd; balans układów (symulacja headless na układ); skok startowy jako rozkaz/zdarzenie. Wymaga G-B i G-A (statek startowy to klasa z katalogu). Wariant B odrzucony.
- **G-D Flota międzygwiezdna i handel statkami** (#1, Q2 = cała rodzina klas): duży — klasy międzygwiezdne w katalogu (G-A), encja statku w serwisie galaktyki, rozkazy odlotu/przylotu w dzienniku świata, trasy cykliczne, przepisanie przesyłek hubowych na loty (zakres zależy od Q6), kalibracja paliwa/ładowni/prędkości, UI floty i doku, modele 3D. Wymaga G-A i G-B; po G-D handel z hubami zależy od zasięgu napędu. Porównywalny z S1/S2.
- **G-E Paliwo międzygwiezdne z Atanora** (#5): klasa paliwa i zużycie na ly w katalogu (parametr klasy i poziomu), receptury Kapsuły fuzyjnej (Atanor L3) i Antymaterii (Akcelerator), rozkaz tankowania, składowanie (kriomagazyn, Pułapka magnetyczna), rozwiązania referencyjne Atanora (EXP-6; bez nich liczby tymczasowe), ujście w ekonomii. Rozmiar: średni; część istnieje w projekcie (receptury), zależy od AT5 (receptury T3/T4 w silniku Atanora). Wymagane przed G-D.
- **G-F Budowa statków międzygwiezdnych: plan, załoga, kompozyty** (#6): rozmiar zależy od Q8 — (c) mały, (a) średni (badania lub sklep planów NPC), (b) duży (konstruktor, rynek planów, walidacja serwerowa); załoga wg Q9 (pojemność = mały, rekrutacja = średni); Dok gwiezdny jako stocznia klas międzygwiezdnych; łańcuch Karbonit → Polimer → Kompozyt. Wymagane przed G-D.
- **G-G Gwiazda jako strefa zagrożenia** (#7): rozmiar zależy od Q10 — (b) mały (komunikat w UI), (a) średni (rozkaz „lot ku gwieździe" z ostrzeżeniem, zdarzenia utraty/uszkodzeń wg Q11; strefa fizyczna dodatkowo dotyka planowania tras i wzorców zgodności), (c) wchodzi w G-D/G-F (skutki podróży międzygwiezdnej). Niezależne od G-A…G-F, ale punkt przylotu skoku startowego (#4, W11) trzeba rozstrzygnąć razem z G-C.
- **G-H Ludzie (personel)** (#8): rozmiar zależy od Q12 / Q13 — (a) mały (etykiety), (b) średni (wektor załogi 3 typów, katalog z trzema kolumnami zamiast jednej dla ok. 45 budowli × poziomy + pojazdy + klasy międzygwiezdne, `NoCrew` per typ, panel ludzi, załoga statków i stacji), (c) duży (+ system badań, przyrost i szkolenie, ludzie jako ładunek). Wymagane przed G-F (załoga budowy statków) i G-D (załoga floty); wpływa na G-C (skład osobowy startu, W12). Nowe reguły tylko w Rust (R-20), zmiana protokołu repliki i hasha stanu.
- **G-I Encyklopedia / katalog** (#9) — Q14 rozstrzygnięte: ETAP 1 = (a) dla zespołu (teraz), ETAP 2 = (c) oba widoki (później); poniższe warianty odpowiadają etapom: (a) = etap 1, (b) / (c) = etap 1 + widok gracza. Rozmiar: (a) średni: rozszerzenie `#/katalog` (D-1) o obiekty i mechaniki z jednym szablonem wpisu i systemem ID, generowanie z katalogu i manifestu, sprawdzanie pokrycia w CI, ok. 20–40 ręcznych haseł o mechanikach; (b) / (c) dodatkowo widok gracza: i18n, ton, odblokowywanie (stan „odkryte" w zapisie), UI kodeksu, podgląd 3D. Wymaga modelu danych z G-A / G-E / G-H (inaczej duplikacja pracy); szablon wpisu i ID można ustalić wcześnie, treść po stabilizacji katalogu.
- **G-J Stocznie i produkcja statków** (#10, spina #1 / #2 / #6 / #8): w całości nowy system — rozkazy budowy i modernizacji statków, sloty stoczni, czas (×1,5 na poziom), zużycie materiałów, moc, załoga (typy wg Q12), wymaganie planu (Q8), zdarzenia ukończenia, docki Stacji (2–8) jako limit przycumowanych statków, bramkowanie klas i poziomów Mk poziomem stoczni / doku (Q16). Zakres zależy od Q17: (b) mały-średni (pula ciała), (a) duży (magazyn stacji, wynoszenie: Prom, Wyrzutnia masy, kalibracja przepustowości, gwarancja niskiej grawitacji w generatorze, W24). Wymaga G-A (katalog klas), G-E (paliwo), G-F (plan / załoga / kompozyty), G-H (ludzie); poprzedza G-D (flota i handel).
- **G-K Galaktyka wspólna i starty** (#11, #12, #4): proceduralny / hybrydowy katalog gwiazd (realne 41 + generowane, deterministyczne z ziarna; WIZ-4), rejestr zajętości w serwisie galaktyki, generator układów „dobrego startu" (kryteria W31, ciało o niskiej grawitacji W24, woda / węgiel), alokacja startów przy wyłączności (Q19, W33), wzrost lub sezony (W30). Rozmiar: duży. Zależy od Q18, Q19.
- **G-L Odkrywanie (teleskopy i analiza sygnałów)** (#13, #14): teleskopy jako budowle (poziomy × zaawansowanie; miejsce W25), proces analizy w czasie (naukowcy #8, moc), mgła wojny na mapie galaktyki i w API (serwer wysyła tylko odkryte), wykrywanie graczy, zdarzenia / rozkazy systemowe do dzienników światów. Rozmiar: średni-duży. Zależy od G-K i G-H (naukowcy); rozdzielenie ról teleskopu i sondy (§9.4). Po #25: skan tranzytowy (kolejka celów, wykres jasności, szacunek planet z niepewnością, ukryta orientacja układu; ustalone w Q35 b: szacunek z niepewnością, który może pominąć planety).
- **G-M Wiadomości między graczami** (#15): skrzynka, protokół, powiadomienia, moderacja (filtr, zgłoszenia, wyciszanie / blokady, retencja 30 dni, RODO), reguły wzajemności (Q20), opóźnienie (W28), droga dla znajomych (W29). Rozmiar: średni. Zależy od G-L (odkryci gracze) i S2 (zaproszenia); przyspiesza „wiadomości prywatne później" z planu 05.
- **G-N Poziomy warp** (#16, Q21): dane napędów w katalogu (poziom → prędkość h/ly, zasięg ly, paliwo na ly, materiały, Atanor L / Antymateria, koszt), wzór czasu lotu t = narzut + d × h_na_ly(poziom), ekran lotu z ETA i postępem na mapie galaktyki, powiadomienia o przylocie, trwałość lotu po restarcie (rekord + timer), kalibracja czasu (cel: kilka godzin – kilka dni); przy wyborze poziomu na każdy lot (Q21 b / c) dodatkowo funkcja zużycia paliwa od poziomu i UI wyboru. Rozmiar: mały-średni (dane + UI), większy przy Q21 b / c. Wymaga G-A i G-E; część G-D (flota w serwisie galaktyki).
- **G-O PoC wydobycia z pasów asteroid** (#17, Q22): osobny katalog `poc/` wg konwencji PoC-ów (Angular 22 + Three.js + vitest, `domain/` bez Angulara i Three, własny port, `CLAUDE.md` + `ANALIZA.md`) albo symulacja headless w `sim-cli`; eksperymenty a–d z Q22; wynik = decyzje (model rozgrywki, model danych pasa, parametry wypraw), potem produkcja (wydobycie w Rust, rozszerzony `BeltView`). Rozmiar: mały-średni (PoC); wysoka dźwignia (Platynit → Nadprzewodnik → paliwo i statki międzygwiezdne), niski koszt; niezależny od pozostałych grup, może iść równolegle lub wcześniej. Wpływa na G-A (Górnik), G-K (pas asteroid w układzie startowym), G-L (skład pasa).
- **G-P Gazowe olbrzymy i ich księżyce** (#18, Q23): nowy rodzaj ciała (GasGiant, nielądowalny; reguła `NotLandable` uogólniona), księżyce z rodzicem = olbrzym, budowle orbitalne na ciele bez siatki (Platforma czerpalna), ścieżka Hel-3 / Deuter → Kapsuła fuzyjna (G-E), Wyrzutnia masy na księżycach, lokalne paliwo z lodu (Glacja), reguły generatora (strefa śniegu, liczba i typy księżyców; G-K). Rozmiar: średni; treść ery „Układ zewnętrzny" (dni 11–20), więc nie jest wymagana na starcie, ale generator układów (G-K) musi ją przewidywać.
- **G-Q Ikony i grafika UI** (#19, Q24, Q25): fazy — (1) rdzeń: surowce, budynki, pojazdy / statki (automat z modeli 3D + paletyzacja, ręczny zestaw dla surowców i UI) i atlas sprite'ów (PNG8 / WebP + JSON, `image-rendering: pixelated`, skalowanie całkowite, hasz w nazwie, leniwe paczki); (2) planety, gwiazdy, awatary NPC proceduralnie z ziarna; (3) nauka (po Q24) i pozostały UI. Rozmiar: średni-duży (pracochłonny, ale dzielony na fazy). Wchodzi w definicję ukończenia G-I (encyklopedia: wpis ma ikonę); zależy od Q24, Q25 oraz katalogu (G-A, G-E, G-H).
- **G-R Grupy, korporacje i przymierza po #1–#19** (#20, Q26, Q27): domknięcie S2 (port L2, kontrakty wewnętrzne, czat) i S3 (megaprojekty, sojusze, rankingi, sezony) z przeprojektowaniem pod nową galaktykę: wspólna mapa odkryć (G-L), współwłasność statków (G-D, W47), szlaki warp jako megaprojekt (G-N, W48), reputacja grupowa u frakcji NPC odblokowująca plany (Q8 a), akademia (G-H), Wielki teleskop (G-L). Rozmiar: duży, dzielony na fazy (S2 domknięcie → megaprojekty → sojusze → sezony). Zależy od Q26, Q27 i G-D, G-L, G-N; przy Q26 (b) dodatkowo stronnictwa sezonowe.
- **G-S Mechanizm wymiany i współpracy** (#21, Q28, Q29): (1) asymetria układów w generatorze (G-K): rozkład rzadkich surowców T0R / T0X wg typów ciał z kontrolą rozwiązywalności, mnożniki jakości złóż i profile gwiazd; (2) mnożniki wydajności wydobycia i produkcji per materiał w świecie (nowe reguły w Rust, R-20); (3) pętla nagrody w galaktyce: relacja handlowa (poziomy, cła, czas, limity), kontrakty wspólnej produkcji, prawa dostępu, węzły handlowe graczy; (4) zabezpieczenia: NPC jako siatka i sufit cen, limity, anty-farming, multikonta; (5) UI: mocne i słabe strony układu na karcie gwiazdy, wskaźnik relacji; (6) balans symulacją rynku (`sim-cli`). Rozmiar: duży, dzielony: najpierw asymetria + NPC (G-K), potem pętla nagrody. Zależy od Q28, Q29 (i Q23), G-K, G-L, G-D.
- **G-T Morale ludzi** (#22, Q30): model (wartość per lokalizacja / grupa, cel z wyposażenia i warunków, dynamika z inercją), efekty (mnożnik wydajności w potoku mnożników obok mocy, bramki odkryć `min_morale`), integracja z bilansem wnętrz (`ShipStats` + `comfort`, nowe typy pomieszczeń), dane o wyposażeniu habitatów w katalogu, UI z rozbiciem czynników, balans (spirala śmierci). Rozmiar: średni; zależy od Q30, Q12 / Q24, G-H (ludzie) i od wnętrz (PoC `space-interior-poc` → web-game, ANALIZA §7–8). Nowe reguły tylko w Rust (R-20).
- **G-U Stacje kosmiczne na orbitach** (#23, Q31, Q32): model stacji (rdzeń L1–L5 + moduły w gniazdach), moduły w katalogu, proces budowy etapowej (prefabrykaty z Montowni, wyniesienie, czas, załoga, moc), docki / magazyn / podtrzymanie życia, render modułowy (KayKit), wnętrza z edytora wnętrz (opcjonalnie), własność i dostęp. Rozmiar: duży; zależy od G-J (stocznie i orbita; Q17), G-H (ludzie), G-T (morale), G-P (stacje przy olbrzymach); pierwsze moduły muszą być osiągalne w erze Industrializacji (brama ery: HQ L3 + Stacja L1).
- **G-V Edytor wnętrz w grze** (z PoC `space-interior-poc`, ANALIZA §7–8): przeniesienie domeny (`packages/domain/src/interior`), renderu i UI do web-game, wnętrza habitatów i stacji jako dane, bilans wnętrza zasilający ekonomię i morale, walidacja po stronie serwera (port reguł do Rust). Rozmiar: duży; opcjonalna głęboka warstwa dla G-T i G-U (gotowe układy jako alternatywa). Po #24: koperta wnętrza (pokłady i powierzchnia) per klasa i poziom jako dane katalogu, wymuszana w edytorze i na serwerze; pojemność załogi z koi; układy domyślne; wymagania funkcji (mostek, kwatery, maszynownia, szczelność) jako warunek zbudowania; projekt per klasa (szablon); „plan" statku jako projekt z edytora (Q34).
- **G-W Cywilizacje tubylcze** (#26, Q36): losowanie ok. 1% układów (G-K, z ziarna), żywa osada na planecie (biom `medieval`, `settlement`), bogate złoża (wagi `depositWeights`), relacja z graczem wg Q36 — (a) tylko generator i wygląd, (b) frakcja NPC z kontraktami i reputacją (S1), (c) obrona i konflikt (nowy system), (d) reputacja przesuwa relację; zasady kontaktu (wykrywalność tylko sondą / skanem, #31); zmiana reguły skórki medieval (T7B). Rozmiar: (a) mały, (b) średni, (c) duży. Zależy od G-K, G-AB, S1; nowe reguły tylko w Rust (R-20).
- **G-X Tożsamość cywilizacji gracza** (#27, Q37): w większości plan 06 (U0–U3): profil, kolor z 12 barw z walidatorem, awatar-sigil, kompozytor flagi, maszt w 3D; nowe: nazwa cywilizacji (A13), motyw interfejsu wg Q37 (b / c: tokeny DS, kontrast, zrzuty). Rozmiar: mały-średni (U0 mock), średni z motywem UI. Zależy od planu 06 (konta U1), DS (P9), #19.
- **G-Y Audio** (#28, A12): silnik w kliencie (magistrale, głośności, odblokowanie po geście, zdarzenia → dźwięki), manifest audio z licencjami, dostarczanie (Opus/OGG + AAC, sprite efektów, strumieniowanie muzyki), zastępcze dźwięki z pakietów CC0; treść finalna po decyzji o stylu i źródle (W86–W88). Rozmiar: średni (silnik), treść osobno. Prawie niezależne; spina się z G-Z (dźwięki komunikatów) i G-I (licencje w katalogu).
- **G-Z Komunikaty pokładowe** (#29, Q38): model komunikatu (nadawca, ważność, szablon), mapowanie 37 typów zdarzeń, toasty, dziennik pokładowy, okno z portretem, „raport z nieobecności” po nadrabianiu offline; opcjonalnie dialogi z wyborami (Q38 c). Rozmiar: mały-średni dla (a) / (b), duży dla (c). Zależy od G-H (ludzie) i G-Q (portrety) dla warstwy postaci; powiadomienia serwerowe z planu 05 §6 / 06 §3.
- **G-AA Gwiazdy i strefa życia** (#30, #32, Q39): dane gwiazd (jasność, promień, temperatura, masa, skład) w modelu i katalogu z parytetem TS↔Rust, strefa życia i linia śniegu jako wspólny model stref w generatorze (G-K), temperatura planet i biom z reguł, strefa zagrożenia (G-G), wpływ na zasięg teleskopu i skan tranzytowy (G-L), karta gwiazdy (G-I). Rozmiar: średni; przed G-K (generator) i G-L. Zależy od Q39, Q23 / Q29 (skład → złoża).
- **G-AB Przylot na obrzeża i skan potwierdzający** (#31): obrzeża jako miejsce (ciało-rubież lub punkt), lot z obrzeży do ciał, model wiedzy o układzie (katalog → tranzyty → sonda → skan), odprawa „oczekiwano ↔ potwierdzono”, skan potwierdzający z poziomami szczegółowości, zmiana scenariusza startowego (Arka na obrzeżach) i paliwa po skoku (Q4′). Rozmiar: średni. Zależy od G-C (start), G-K, G-L, G-AA; spina się z #25 i §9.4.

---

## REJESTR PYTAŃ (źródło sekcji „Pytania bez odpowiedzi" w artefakcie)

Stan na 2026-11-10. Zasada użytkownika: pytania, na które nie odpowiada, nie blokują rozmowy — zostają zapisane tutaj i w artefakcie mają osobną sekcję (pełna treść, opcje, skutek braku decyzji, rekomendacja, co blokuje w planie). Rekomendacje to propozycje agenta, nie decyzje. W czacie nie powtarzam tej listy przy każdej odpowiedzi.

### A. Bez odpowiedzi (zadane użytkownikowi)

**Q4′ — Skok startowy i zasięg** (do #4; blokuje G-C)
- Pytanie: czym płacimy skok startowy statku międzyplanetarnego i ile gwiazd ma być w zasięgu na starcie?
- Opcje: (a) ta sama pula paliwa co loty lokalne (dalszy skok = mniej paliwa na pierwsze loty); (b) osobny, jednorazowy ładunek skoku, po którym zostaje tylko limit zasięgu. Do tego: kilka gwiazd (3–5) czy kilkanaście; odległości od Układu Słonecznego jak w katalogu (do potwierdzenia).
- Skutek braku decyzji: nie da się zaprojektować ekranu wyboru ani stawki skoku; generator układów bez wymagań wejściowych.
- Rekomendacja: (b). Zgodne z #5 (dwa rodzaje paliwa), prostszy model danych i UI; kompromis z (a) byłby w praktyce pozorny, bo przed erą Industrializacji paliwo lokalne prawie nie ma zastosowania. Zasięg dobrać tak, by dawał 8–12 realnych opcji z planetą do lądowania. Bez generatora planet: gwiazdy ze znanymi planetami to 2 przy 9 ly (Proxima, Barnard), 5 przy 12 ly (+ ε Eri, Tau Ceti, GJ 1061), 7 przy 13 ly (+ YZ Ceti, Kapteyn). Z generatorem planet dla gwiazd bez znanych planet: 11 gwiazd przy 9 ly, 18 przy 12 ly. Przy 5 ly zostają 3 gwiazdy, z czego 2 (α Cen A i B) bez znanych planet.

**Q5 — Zestaw startowy** (do #4; blokuje G-C)
- Pytanie: Arka-1 (ładownia 2000 j., 2 łaziki, prom, sonda) zostaje jako nośnik kolonii, czy start jest dużo uboższy (sam mały statek, np. Astraeus Mk I: ładownia 50 j.)? Z czego powstaną pierwsze budynki?
- Opcje: (a) Arka-1 zostaje, mały statek jest dodatkiem; (b) ubogi start: tylko ładownia małego statku; (c) *propozycja agenta, jeszcze niezadana:* osobny „zestaw kolonizacyjny" (kontener poza ładownią statku) o wartości portu L1 i ok. 10 pierwszych budowli, bez łazików i promu.
- Skutek braku decyzji: nie wiadomo, z czego powstanie port L1 (STA 120 · BET 80 · UKL 10) i pierwsze budowle; nie da się przebudować ery Lądowania ani tempa pierwszej godziny.
- Rekomendacja: (c) lub (a); (b) bez zestawu nie pozwala nawet zbudować portu (210 j. przy ładowni 50).

**Q6 — Handel, zanim gracz ma własny statek międzygwiezdny** (do #1; blokuje G-D i przepisanie planu 05 §3.2)
- Opcje: (a) tylko własne statki, handel odblokowuje się z pierwszym frachtowcem (kilkanaście dni bez huba); (b) własne statki + przewoźnik NPC za opłatą (wolniej, drożej, małe partie) jako wejście do handlu; (c) przesyłki zostają abstrakcyjne, a statki służą tylko do przewozu między własnymi układami i kolonizacji.
- Skutek braku decyzji: nie da się dokończyć S3/hubów ani zaprojektować floty handlowej; ryzyko przepisywania S0–S2 (galaxy-b6) dwa razy.
- Rekomendacja: (b). Dzisiejsze abstrakcyjne przesyłki (zrobione w B6) stają się trybem „przewoźnik NPC" z opłatą i karą czasu, więc wczesny handel (Terminal handlowy w dniach 5–10) zostaje, a własna flota daje powód do budowy (taniej, szybciej, większe partie).

**Q7 — Lista klas międzygwiezdnych** (do #1; blokuje G-A i G-D)
- Propozycja: frachtowiec, tankowiec, okręt kolonizacyjny, sonda/zwiadowca, opcjonalnie kurier. Pytanie: pasuje, czegoś brakuje, coś wyrzucić?
- Skutek braku decyzji: katalog klas z listą roboczą (bez kuriera).
- Rekomendacja: 4 klasy na start; kuriera dodać, gdy balans pokaże potrzebę małych szybkich partii (pokrywa się z przewoźnikiem NPC z Q6 b).

**Q8 — Czym jest „plan"** (do #6; blokuje G-F)
- Opcje: (a) odblokowany projekt: badanie albo zakup u frakcji NPC; (b) schemat w bibliotece gracza, który można stworzyć, wymienić i sprzedać (jak projekty Atanora); (c) to samo co poziom stoczni/doku, jak dziś; (d) coś innego; (e) *dodane po #24:* projekt wnętrza / statku z edytora wnętrz (szablon per klasa i poziom, spełniający wymagania funkcji) — zob. Q34.
- Skutek braku decyzji: rozmiar G-F nieznany — (c) mały, (a) średni, (b) duży (konstruktor, walidacja serwerowa, rynek planów).
- Rekomendacja: (a) na start (łączy się z reputacją i obowiązkami z S1), (b) jako późniejsze rozszerzenie.

**Q9 — Załoga** (do #6; blokuje G-F; po #8 rozstrzyga się razem z Q12 / Q13)
- Opcje: (a) tylko pojemność jak dziś (obsada stoczni i statku, zajęta, dopóki statek istnieje); (b) załoga leci ze statkiem i znika z kolonii na czas lotu; (c) osobny zasób do wyprodukowania (rekrutacja, szkolenie).
- Skutek braku decyzji: nieznany model populacji (EXP-3) i limit floty.
- Rekomendacja: (a), z (b) tylko dla okrętu kolonizacyjnego (koloniści opuszczają układ na stałe — już w §4.5).

**Q10 — Co znaczy „do gwiazd nie da się podlecieć"** (do #7; blokuje G-G)
- Pytanie: o co dokładnie chodzi? Dziś rozkaz lotu do gwiazdy jest po prostu odrzucany („nie do lądowania"), bez żadnych konsekwencji.
- Opcje: (a) Słońce/gwiazda w układzie: lot ku niej ma stać się możliwy, ale z poważnymi skutkami; (b) to uzasadnienie obecnego zakazu (fabuła, komunikat), mechanika bez zmian; (c) loty do innych gwiazd (międzygwiezdne): każda taka podróż niesie poważne konsekwencje; (d) coś innego.
- Skutek braku decyzji: #7 zostaje zapisany bez wpływu na plan; roboczo zakładam (b) (zero zmian).
- Uwaga po #16 (podróż międzygwiezdna długa, warp): odczytanie (c) staje się bardziej prawdopodobne.
- Rekomendacja: brak (za mało informacji). (b) jest najtańsze i bezpieczne; (a) ma sens tylko wtedy, gdy blisko gwiazdy czeka nagroda (energia, zasoby) — inaczej to pułapka bez celu.

**Q11 — Jakie „poważne konsekwencje"** (do #7; dotyczy odczytań (a) i (c); blokuje G-G)
- Opcje: (a) zniszczenie statku z ładunkiem i załogą; (b) uszkodzenia (koszt naprawy, przestój) zależne od zbliżenia i osłony (Metamateriał osłonowy / Osłona radiacyjna); (c) utrata załogi (ludzie z kolonii) niezależnie od statku; (d) tylko kara ekonomiczna; (e) skutki stopniowane: ostrzeżenie → uszkodzenia → zniszczenie, zależnie od osłony.
- Skutek braku decyzji: nie da się zaprojektować zdarzeń ani ostrzeżeń w UI.
- Rekomendacja: (e) — daje progresję (osłony), a ostrzeżenie chroni przed utratą bardzo drogiego statku (#6) jednym kliknięciem; brak PvP, więc utrata powinna być świadoma.

**Q12 — Co robią trzy grupy ludzi i czy to osobne pule** (do #8; blokuje G-H; rozstrzyga się razem z Q9)
- Pytanie: czym różnią się inżynierowie, naukowcy i obsługa techniczna? Hipoteza agenta: obsługa techniczna = obsada budynków i statków (dzisiejsza „Załoga"); inżynierowie = budowa / rozbudowa i zaawansowana produkcja (stocznie, doki, Atanor L3+, reaktory); naukowcy = badania (odblokowania, plany, receptury).
- Opcje: (a) typy kosmetyczne: jedna pula, wymagania łączne, UI pokazuje strukturę; (b) trzy osobne pule z osobnymi limitami (budynek, statek, stacja wymaga konkretnej liczby każdego typu); (c) (b) plus różne funkcje (naukowcy produkują badania, inżynierowie przyspieszają budowę lub odblokowują zaawansowane budowle, technicy = obsada i utrzymanie); (d) inaczej.
- Skutek braku decyzji: rozmiar G-H nieznany — (a) mały, (b) średni, (c) duży (nowy system badań); Q8 (plan) i Q9 (załoga) wiszą.
- Uwaga po #19: „rozwój nauki" jako kategoria ikon sugeruje, że system badań jest planowany (Q24).
- Uwaga po #22: morale liczone per grupa (naukowcy / inżynierowie / technicy) wzmacnia Q12 (b / c).
- Rekomendacja: (b) na start, (c) etapami: najpierw limity per typ, potem badania (łączy się z Q8 a).

**Q13 — Skąd biorą się ludzie i specjaliści** (do #8; blokuje G-H)
- Opcje: (a) ogólny przyrost w Habitatach + szkolenie specjalistów w budynkach (Akademia, Instytut: czas i koszt); (b) przyrost każdego typu w odpowiednim budynku mieszkalnym; (c) najem z zewnątrz (huby i frakcje NPC kontraktują specjalistów za kredyty lub reputację) + koloniści z gwiazdolotów; (d) kombinacja / inaczej.
- Skutek braku decyzji: nieznany model populacji (EXP-3) i tempo wzrostu kolonii.
- Rekomendacja: (a), z (c) jako zastrzykiem na starcie (najem za kredyty): szkolenie daje ujście zasobów i czasu, a najem u NPC łączy się z S1; (b) najprostsze, ale najmniej interesujące.

**Q14 — Dla kogo jest encyklopedia** (do #9; ZAMKNIĘTE 2026-11-10 — zob. sekcja C; poniżej treść historyczna)
- Opcje: (a) dla zespołu / projektu: dokumentacja (źródło prawdy z ID, generowana z katalogu danych i manifestu; podgląd modeli, budżety, licencje); (b) dla gracza w grze: Kodeks z hasłami (fabuła, liczby, odblokowywanie postępem); (c) oba z jednego źródła danych (dwa widoki: pełny dla zespołu, odblokowany dla gracza); (d) inaczej.
- Skutek braku decyzji: nie wiadomo, czy dotykać UI gry i zapisu świata; roboczo zakładam (a) (rozszerzenie planowanego `#/katalog`).
- Rekomendacja: (c) etapami — najpierw (a) jako rozszerzenie `#/katalog` (D-1) o obiekty i mechaniki z jednym szablonem wpisu, potem widok gracza z odblokowywaniem postępem.

**Q15 — Zalążek encyklopedii w artefakcie** (do #9)
- Pytanie: czy dołączyć do artefaktu sekcję „Słownik pojęć" z hasłami wynikającymi z naszych pomysłów (statek międzyplanetarny i międzygwiezdny, skok startowy, Kapsuła fuzyjna, Antymateria, Załoga, plan…) jako zalążek encyklopedii?
- Opcje: tak / nie / tak, ale jako osobny artefakt.
- Skutek braku decyzji: artefakt bez słownika.
- Rekomendacja: tak, jako krótka sekcja w artefakcie głównym.

**Q16 — Która budowla to „kosmiczna stocznia"** (do #10; blokuje G-J; zamyka W8)
- Opcje: (a) Stocznia orbitalna — wyższe poziomy odblokowują klasy międzygwiezdne (L4: sonda i małe), a Dok gwiezdny zostaje dla okrętu kolonizacyjnego (gwiazdolotu); (b) Dok gwiezdny rozszerzony na całą rodzinę (poziom = klasa / moduł); (c) nowy obiekt „Kosmiczna stocznia" tylko dla międzygwiezdnych, a Stocznia orbitalna zostaje dla międzyplanetarnych; (d) inaczej (np. także gdzie budujemy międzyplanetarne).
- Skutek braku decyzji: nie da się przypisać klas do budowli ani narysować drzewa wymagań; roboczo zakładam (a) z Dokiem dla okrętu kolonizacyjnego.
- Rekomendacja: (a) z Dokiem dla okrętu kolonizacyjnego — zgodne z obecnym projektem (Stocznia L4 buduje sondę międzygwiezdną, Dok montuje gwiazdolot), najmniej nowych budowli; (c) tylko jeśli ma być odrębna ścieżka rozwoju.

**Q17 — Skąd stocznia bierze materiały** (do #10; blokuje G-J i rdzeń logistyki orbitalnej)
- Opcje: (a) z magazynu stacji — trzeba je wynieść z powierzchni (Prom, Wyrzutnia masy); (b) z puli ciała jak budowa na powierzchni, bez wynoszenia; (c) mieszanie: ciężkie półprodukty trzeba mieć na orbicie, reszta z puli.
- FAKT (dok. ekonomii §5.1, ujawniony przy pisaniu dokumentu): moduły orbitalne montują drony Stacji orbitalnej z materiałów dostarczonych do magazynu stacji — dokument już zakłada (a).
- Skala: rdzeń gwiazdolotu to ok. 14,6 tys. j. półproduktów = ok. 182 kursów Promu Mk III albo ok. 37 h Wyrzutni masy L3.
- Skutek braku decyzji: nie da się wycenić ani zaprojektować logistyki orbitalnej (Prom, Wyrzutnia masy, magazyn stacji); roboczo zakładam (b) (prościej, jak dziś w kodzie).
- Rekomendacja: (a) — spójne z „budujemy na orbicie", daje sens Promowi, Wyrzutni masy i magazynowi stacji oraz wyborowi miejsca stoczni; wymaga kalibracji (przepustowość wynoszenia vs rozmiar zleceń) i gwarancji ciała z niską grawitacją w generatorze układów (W24).

**Q18 — Jak pogodzić wybór gwiazdy startowej (#4) z odkrywaniem teleskopami (#13), zajętością układów (#14) i startem w układzie z potencjałem ekspansji (#12)** (blokuje G-C, G-K, G-L)
- Opcje: (a) synteza: na starcie masz podstawowy teleskop (na statku); gwiazdy w małym promieniu są już przeanalizowane (bez czekania), widać, które są wolne i nadają się na start; wybierasz jedną i skaczesz (#4 zostaje, ograniczone odkryciem); (b) start przydzielany przez grę w wolnym układzie z potencjałem ekspansji (bez wyboru), skok z #4 odpada lub staje się narracją; (c) wybór z krótkiej listy 3–5 wolnych układów oferowanych przez grę, teleskopy dopiero po starcie; (d) inaczej.
- Skutek braku decyzji: nie da się zaprojektować pierwszych minut gry ani ekranu startowego; roboczo zakładam (a).
- Rekomendacja: (a) z natychmiastową analizą promienia startowego (żeby nie czekać na starcie), (c) jako uproszczenie MVP; (b) usuwa pierwszą decyzję strategiczną z #4.

**Q19 — Wyłączność układu** (do #14; blokuje G-K; zastępuje W1)
- Opcje: (a) jeden gracz na układ (cały układ); (b) kilku graczy może dzielić układ (np. osobne planety); (c) inaczej.
- Kontekst: WIZ-1 = C (kolonie instancjonowane) i MP-2 (C w MVP, docelowo B). Wyłączność wymaga rejestru zajętości w serwisie galaktyki; (b) wymaga wspólnych układów (MP-2 B / A), czyli wyższej złożoności.
- Skutek braku decyzji: nie da się zaprojektować alokacji startów ani rozmiaru galaktyki; roboczo zakładam (a).
- Rekomendacja: (a) — zgodne z instancjonowanymi światami i prostsze; zajętość to wpis w galaktyce, nie współdzielony świat.

**Q20 — Czy odkrycie gracza jest wzajemne** (do #14 / #15; blokuje G-M)
- Opcje: (a) jednostronne: mogę napisać do gracza, którego odkryłem, nawet jeśli on mnie nie odkrył (wiadomość ujawnia mnie); (b) wzajemne: kontakt dopiero, gdy obie strony się odkryły; (c) jednostronne, ale odbiorca może wyciszyć i zablokować; (d) inaczej.
- Kontekst: prywatność, spam, nękanie, moderacja (SOC-6).
- Skutek braku decyzji: nie da się zaprojektować reguł skrzynki i moderacji; roboczo zakładam (c).
- Rekomendacja: (c) z limitem — do czasu odpowiedzi lub akceptacji odbiorcy można wysłać jedną wiadomość, odbiorca może zablokować; chroni przed spamem i nie wymaga wzajemnego odkrycia.

**Q21 — Czy poziom warp jest stałą cechą napędu, czy wybiera się go przy każdym locie** (do #16; blokuje G-A, G-D, G-E, G-N)
- Opcje: (a) stała cecha napędu / statku (jak Mk I–IV): poziom warp = tier napędu, zasięg, prędkość i zużycie paliwa rosną z poziomem; (b) wybierany przy każdym locie do maksimum statku: szybciej = więcej paliwa na ly (decyzja czas ↔ koszt); (c) oba: napęd daje maksymalny warp, a gracz wybiera warp ≤ maksimum przy każdym locie; (d) inaczej.
- Skutek braku decyzji: nie da się zaprojektować danych napędów ani ekranu lotu; roboczo zakładam (a).
- Rekomendacja: (c) — dodaje realną decyzję (czas ↔ paliwo ↔ moment przylotu), a model pozostaje prosty (jedna funkcja zużycia paliwa od poziomu). Wymaga kalibracji: zużycie paliwa na ly rośnie z poziomem.

**Q22 — Co ma wykazać PoC wydobycia z pasów asteroid** (do #17; blokuje G-O)
- Opcje (można kilka): (a) skalę i wygląd pasa oraz wybór pojedynczej skały (np. 5 000 skał w jednym draw callu, tryb Mining View); (b) rozgrywkę wydobycia (automat vs półaktywne vs aktywne); (c) model danych i serwera (skała jako kosmetyka klienta vs stan per skała; zapis, determinizm); (d) balans ekonomii wypraw (liczba statków, tempo, Platynit); (e) wszystko po kolei.
- Skutek braku decyzji: PoC bez zakresu; roboczo zakładam (e) w kolejności c + d → a → b.
- Rekomendacja: zacząć od (c) i (d) jako tanich (symulacja headless i szkic modelu danych) oraz (a) jako PoC renderu; (b) dopiero po decyzji o modelu rozgrywki — (c) i (d) mogą pokazać, że wystarczy automat z kosmetyczną skałą (najtańsze rozwiązanie), a wtedy aktywne wydobycie nie jest potrzebne.

**Q23 — Czy każdy układ ma gazowego olbrzyma z księżycami** (do #18; blokuje G-K, G-E, G-P)
- Opcje: (a) każdy układ startowy ma co najmniej jednego olbrzyma z co najmniej jednym księżycem (gwarancja drogi do paliwa międzygwiezdnego); (b) olbrzymy losowo, część układów bez nich — paliwo międzygwiezdne trzeba tam importować (towar handlowy); (c) olbrzymy tylko w niektórych typach układów (np. poza strefą śniegu); (d) inaczej.
- Skutek braku decyzji: generator układów bez reguły dla olbrzymów; W31 (kryteria „dobrego startu") niepełne; roboczo zakładam (b) dla układów ogólnych i (a) dla startowych.
- Uwaga po #21: twarda dostępność rzadkich surowców (Q29 a / c) jest sprzeczna z gwarancją olbrzyma w układzie startowym (a) — wtedy bliższe jest (b).
- Rekomendacja: (a) dla układów startowych (inaczej #12 nie zapewnia ścieżki do paliwa z #5), (b) dla pozostałych (import paliwa jako motor handlu).

**Q24 — Czym jest „rozwój nauki"** (do #19; wiąże się z #8, #13, Q8, Q12; blokuje G-Q i część G-F / G-H / G-L)
- Pytanie: co oznacza „rozwój nauki" w grze? Kategoria ikon zakłada system, którego w dokumentach projektu nie ma.
- Opcje: (a) system badań: lista lub drzewko badań odblokowujących budynki, statki, receptury, poziomy teleskopów i napędów; punkty nauki produkują naukowcy i laboratoria (#8, #13); (b) brak osobnego systemu: „nauka" to poziomy budynków, napędów i teleskopów (jak dziś), a ikony tylko je ilustrują; (c) coś innego.
- Skutek braku decyzji: nieznany zakres ikon nauki (ok. 30–60 haseł przy (a)) i rozmiar systemu badań; Q8 (plan), Q12 (c), #13 wiszą.
- Uwaga po #22: odkrycia zależne od morale naukowców (bramka „100%") zakładają system badań (Q24 a).
- Rekomendacja: (a) etapami — lekka lista badań dla odblokowania statków międzygwiezdnych / planów (Q8 a) i teleskopów (#13), bez pełnego drzewka na starcie.

**Q25 — Styl ikon** (do #19; blokuje G-Q)
- Opcje: (a) hybryda: treści (surowce, budynki, statki, planety, awatary NPC) w pixel-art z ograniczoną paletą z tokenów świata (bez tonów bliskich sygnałowym #FFB000 / #FF5A4A), chrom UI (przyciski, nawigacja, polecenia) zostaje obrysowy w DS; (b) wszystko pixel-art monochromatyczny w kolorach DS; (c) zostajemy przy ikonach obrysowych DS, pixel-art tylko dla awatarów NPC i planet; (d) inaczej.
- Skutek braku decyzji: nie da się ustalić pipeline'u ani palety; roboczo zakładam (a).
- Rekomendacja: (a) — 37 materiałów trzeba odróżnić kolorem, a chrom UI zachowuje zasadę jednego koloru sygnałowego; zgodne z matrycą 8×8 awatara gracza.

**Q26 — Co oznaczają „frakcje"** (do #20; blokuje G-R)
- Opcje: (a) frakcje NPC (jak dziś): gracz lub grupa buduje reputację, odblokowuje receptury i plany; (b) duże stronnictwa graczy ponad korporacjami i sojuszami (np. wybierane na sezon, punktowa rywalizacja ekonomiczna, bez PvP) — plan 05 odrzucił to w MVP (SOC-3 C); (c) synonimy korporacji i sojuszy — jedna struktura w dwóch rozmiarach; (d) inaczej.
- Skutek braku decyzji: nieznany zakres G-R: (c) / (a) mały, (b) duży; roboczo zakładam (c) + (a).
- Rekomendacja: (c) + (a) na start (korporacja → przymierze, frakcje NPC jako patroni z reputacją grupową); (b) jako opcja sezonowa później, gdy będzie dość graczy (MP-3).

**Q27 — Konflikt między grupami** (do #20; zamyka częściowo WIZ-6 / S-8)
- Opcje: (a) brak bezpośredniego szkodzenia: współpraca, rankingi, wyścigi o megaprojekty i układy; (b) ograniczone narzędzia konfliktu ekonomicznego (cła, embargo, blokady hubów) bez niszczenia statków i kolonii; (c) pełne PvP (statki i kolonie można niszczyć); (d) inaczej.
- Skutek: bez PvP wartość przymierzy pochodzi wyłącznie z kooperacji i rywalizacji punktowej; z PvP potrzeba obrony, ochrony nowych graczy i mechaniki zniszczeń (por. #7).
- Skutek braku decyzji: roboczo zakładam (a) (rekomendacja planu 05 / S-8).
- Rekomendacja: (a) w MVP, (b) po wspólnych układach (S4).

**Q28 — Źródło premii za wymianę i współpracę** (do #21; blokuje G-S)
- Opcje: (a) tylko geografia: układy różnią się złożami i mnożnikami wydajności, więc wymiana opłaca się sama z siebie (bez osobnych bonusów); (b) tylko działanie: sama wymiana i współpraca dają bonusy (poziomy relacji handlowej, kontrakty wspólnej produkcji, dostęp do układu partnera); (c) oba: asymetria układów + bonusy za wymianę i współpracę; (d) inaczej.
- Skutek braku decyzji: nie wiadomo, czy projektować rozkłady złóż (G-K), czy system bonusów (galaktyka); roboczo zakładam (c).
- Rekomendacja: (c) — geografia daje powód, bonusy dają trwałość i nagradzają zaufanie.

**Q29 — Siła zależności między układami** (do #21; blokuje G-K, G-S; wiąże się z Q23)
- Opcje: (a) wymóg: rzadkie materiały (T0R / T0X) występują tylko w części układów — bez wymiany nie da się zrobić części łańcuchów (np. paliwa międzygwiezdnego); (b) premia: wszystko da się zdobyć lokalnie, wymiana tylko obniża koszt lub zwiększa wydajność; (c) kombinacja: kilka kluczowych rzadkich materiałów wymaga wymiany (z NPC jako zabezpieczeniem), reszta to premia; (d) inaczej.
- Skutek braku decyzji: generator układów bez reguły rozkładu surowców; roboczo zakładam (c).
- Rekomendacja: (c) z hubami NPC jako siatką bezpieczeństwa (po wysokiej cenie): zależność jest realna, ale nikt nie jest zablokowany.
- Uwaga: (a) / (c) kolidują z gwarancją olbrzyma w układzie startowym (Q23 a).

**Q30 — Morale: punkt odniesienia** (do #22; blokuje G-T; wpływa na kalibrację §3.1)
- Opcje: (a) 100% to stan normalny przy spełnionych podstawowych potrzebach (koje, jedzenie, tlen, szczelność); braki i przeciążenie obniżają morale, a wyposażenie ponad minimum daje odporność (wolniejszy spadek, szybsze odbicie) i odblokowuje szczytowe efekty (odkrycia wymagające 100%); (b) 100% to trudny cel: domyślnie wydajność jest poniżej 100%, a wyposażenie stopniowo ją podnosi (kalibrację ekonomii trzeba przeliczyć, bo dziś zakłada pełną wydajność); (c) inaczej.
- Skutek braku decyzji: nie wiadomo, czy przeliczać kalibrację ekonomii; roboczo zakładam (a).
- Uwaga po #24: powierzchnia i rozbudowa struktury są czynnikami morale (wzór: Q33).
- Rekomendacja: (a) — nie rozjeżdża kalibracji ekonomii (§3.1), a wyposażenie ma wciąż sens (odporność + bramka szczytowych odkryć); (b), jeśli morale ma być głównym suwakiem rozwoju kolonii.

**Q31 — Model stacji kosmicznej** (do #23; blokuje G-U; wiąże się z Q17)
- Opcje: (a) stacja jako budowla orbitalna na ciele (jak dziś: Stacja orbitalna L1–L5, a Stocznia, Terminal, Dok to osobne budowle z „orbitą" zamiast kafelków); (b) stacja jako osobny byt: rdzeń + moduły dokładane w gniazdach (docki, magazyn, habitat orbitalny, laboratorium, teleskop, stocznia, terminal), własna załoga i magazyn, wnętrza z edytora; wiele stacji na różnych orbitach; (c) kompromis: rdzeń Stacji orbitalnej (poziomy L1–L5 jak w dokumencie) + moduły w gniazdach (liczba gniazd rośnie z poziomem rdzenia), wnętrza modułów opcjonalnie z edytora, jedna stacja na ciało na starcie, więcej w późniejszych etapach; (d) inaczej.
- Skutek braku decyzji: nie da się zaprojektować danych ani UI stacji; roboczo zakładam (c).
- Rekomendacja: (c) — rozwija istniejący model poziomów (L1–L5) i „moduł stacji" (Terminal handlowy), nie wymaga od razu pełnej wielostacyjności, a zostawia drogę do (b).

**Q32 — Jak buduje się stację na orbicie** (do #23, #10; wiąże się z Q17)
- Opcje: (a) materiały wynosi się na orbitę (Prom, Wyrzutnia masy), a moduły montują drony stacji z magazynu orbitalnego; (b) osobna klasa statku konstrukcyjnego dolatuje na orbitę i montuje moduły (potrzebuje załogi / inżynierów i stoczni); (c) prefabrykaty: moduły powstają w Montowni na planecie i są wynoszone w całości (ograniczenia masy i rozmiaru Promu 30 / 50 / 80 j.), łączone na orbicie; (d) inaczej.
- Skutek braku decyzji: nie da się wycenić ani zaprojektować logistyki budowy; roboczo zakładam (c) dla pierwszych modułów.
- FAKT (dok. §5.1): moduły orbitalne montują drony Stacji orbitalnej z materiałów w magazynie stacji, czyli opcja (a) jest zapisana w dokumencie; (c) to propozycja alternatywna dla pierwszych modułów.
- Rekomendacja: (c) na początek — najprostszy łańcuch (Montownia → Prom → orbita), zgodny z wymaganiem „Stacja orbitalna wymaga Montowni", daje sens klasom Promu; (a) dla dużych konstrukcji (Dok gwiezdny, Q17 a).

**Q33 — Od czego zależy morale: powierzchnia** (do #24, #22; blokuje G-T)
- Opcje: (a) powierzchnia na osobę (przestrzeń / ciasnota); (b) całkowita powierzchnia habitatu niezależnie od liczby osób; (c) powierzchnia faktycznie zagospodarowana funkcjami (pomieszczenia z funkcją; puste pola się nie liczą), w przeliczeniu na osobę; (d) inaczej.
- Skutek braku decyzji: nie da się zapisać wzoru morale; roboczo zakładam (c).
- Rekomendacja: (c) — premiuje i rozbudowę, i projektowanie wnętrza (puste pola nic nie dają), uwzględnia liczbę osób (przeludnienie obniża), zgodne z rozpoznawaniem pomieszczeń w edytorze; z malejącymi zwrotami, by wyższy poziom nie był lepszy za darmo.

**Q34 — Czy „plan" z #6 to projekt z edytora wnętrz** (do #6, #24, Q8; blokuje G-F, G-V)
- Opcje: (a) tak: plan = projekt wnętrza / statku (szablon per klasa i poziom) z edytora, spełniający wymagania funkcji (mostek, kwatery na załogę, maszynownia, szczelny kadłub) i wymagany do zbudowania statku; klasy odblokowują poziomy stoczni jak dziś; (b) nie: plan to osobny przedmiot / badanie (Q8 a / b / c); (c) oba: klasa odblokowana badaniem lub zakupem + projekt wnętrza z edytora jako „plan wykonawczy"; (d) inaczej.
- Skutek braku decyzji: Q8 zostaje otwarte, a G-F nie ma wskazania; roboczo nie zakładam nic.
- Rekomendacja: (a) — spójne z edytorem, który i tak liczy bilans (koje = załoga, materiały z elementów); (c), gdy powstanie system badań (Q24 a).

**Q36 — Jaką rolę ma pełnić cywilizacja tubylcza?** (do #26; blokuje G-W)
- Opcje: (a) tło i nagroda eksploracji: opis i wygląd planety oraz bogate złoża, bez interakcji; (b) partner NPC: wymiana i kontrakty z reputacją (silnik frakcji S1), dostęp do części złóż zależy od relacji; wrogość tylko jako zdarzenia (opóźnienia, utrata zaufania), bez walki; (c) przeszkoda: aktywnie broni planety (wymaga mechaniki obrony i walki, której dziś nie ma); (d) zależnie od działań gracza: reputacja przesuwa relację od partnerstwa do wrogości miękkiej; (e) inaczej.
- Skutek braku decyzji: nie da się oszacować pracy (od małej do dużej) ani zaprojektować kontaktu; roboczo planuję tylko generator (ok. 1% układów, żywa osada jako teren, bogate złoża) bez interakcji.
- Rekomendacja: (b), rozszerzalne do (d) — wykorzystuje S1 (kontrakty NPC, reputacja −100…100, progi 25 / 50 / 75), nie wymaga walki (WIZ-6 brak PvP; „frakcje jako strony konfliktu” odrzucone w MVP, SOC-3 C), a bogate złoża stają się nagrodą za relację, nie darmowym łupem.

**Q37 — Co ma robić wybrany kolor cywilizacji?** (do #27; blokuje G-X)
- Opcje: (a) tak jak w planie 06 (U-3): tylko świat i mapa — znacznik kolonii, statki, flaga, awatar, karta gracza; HUD zostaje bursztynowy; (b) kolor zmienia też akcent całego interfejsu gracza (zmiana zasady DS „jeden sygnał”, tokeny motywu, walidacja kontrastu każdej z 12 barw); (c) (a) domyślnie plus opcjonalny motyw interfejsu w ustawieniach (z 12 sprawdzonych barw; ostrzeżenia, błędy i sukces zachowują swoje kolory); (d) inaczej.
- Skutek braku decyzji: realizuję (a) z planu 06; DS bez zmian.
- Rekomendacja: (c) — spełnia „wpływ na UI” bez utraty znaczenia bursztynu jako sygnału i bez ryzyka kontrastu u wszystkich graczy naraz; (a) jest bezpiecznym minimum, (b) wymaga przeprojektowania zasady DS.

**Q38 — Zakres interfejsu komunikatów od załogi, naukowców, komputera i AI** (do #29; blokuje G-Z)
- Opcje: (a) tylko informacja: toasty + dziennik pokładowy z nadawcą i ważnością; (b) (a) + okno komunikatu z portretem i imieniem dla ważnych zdarzeń (odkrycie, kontakt, alarm), bez wyborów; (c) (b) + dialogi z wyborami i konsekwencjami (RPG): morale, reputacja, koszty — wymaga systemu zdarzeń z wyborami w Rust; (d) inaczej (np. kim jest „AI”).
- Skutek braku decyzji: roboczo (a) z modelem komunikatu rozszerzalnym na (b).
- Rekomendacja: (b) na start (model komunikatu, dziennik, toasty, okno z portretem), (c) później jako osobna warstwa treści, gdy powstaną ludzie (#8) i badania (Q24).

**Q39 — Parametry gwiazd i strefa życia: co mają robić?** (do #30, #32; blokuje G-AA)
- Pytanie: co mają robić jasność, wielkość i „kompozycja” gwiazdy oraz strefa, w której możliwa jest woda w stanie ciekłym? Dodatkowo: czym jest „kompozycja” — skład chemiczny gwiazdy (np. metaliczność), klasa widmowa, czy coś innego?
- Opcje: (a) tylko opis i wygląd: dane w karcie gwiazdy i encyklopedii, kolor i rozmiar w widokach, strefa życia jako etykieta planety; (b) (a) + energia i klimat: jasność wyznacza moc słoneczną (jak dziś `insolation`), strefę życia, temperaturę planet i biom; wielkość — strefę zagrożenia wokół gwiazdy (#7) i głębokość tranzytów (#25); (c) (b) + skład gwiazdy wpływa na bogactwo złóż i rzadkie surowce w układzie (asymetria układów, #21, #26); (d) inaczej.
- Skutek braku decyzji: roboczo (a) i dotychczasowy `insolation`; strefa życia liczona i skład czekają.
- Rekomendacja: (c) etapami — najpierw (b) (dane, strefa życia, temperatura z jasności), skład po decyzji o asymetrii układów (Q23 / Q29).

**[ZAMKNIĘTE 2026-11-11: odpowiedź „A” = (a) deterministyczna funkcja ziarna i współrzędnych, leniwie, zapis po odkryciu; przenieść do C]**
**Q40 — Model generatora galaktyki** (do #33; blokuje G-K, G-L)
- Opcje: (a) deterministyczna funkcja (ziarno galaktyki, współrzędne): układ w danym miejscu zawsze taki sam, generowany leniwie przy skanie lub zakładaniu konta, zapisywany po odkryciu; (b) losowo na żądanie i zapis wyniku (kolejność skanów zmienia galaktykę); (c) pula wygenerowana z góry (duży katalog, skan tylko ujawnia); (d) inaczej.
- Skutek braku decyzji: roboczo (a).
- Rekomendacja: (a) — powtarzalność, brak konfliktów przy równoległych skanach, łatwe testy zgodności; (c) jako optymalizacja.

### B. Założenia zakomunikowane użytkownikowi (bez sprzeciwu = przyjęte roboczo)
- A1 (#2): „klasa" = typ statku, „poziom rozbudowy" = Mk I–III (Astraeus: ładownia 50/80/120).
- A2 (#1, #2): klasy międzygwiezdne mają poziomy (Mk I–III) jak reszta statków.
- A3 (#3): paliwo międzyplanetarne = zwykłe Paliwo produkowane w kolonii (era Industrializacji); koniec darmowego tankowania.
- A4 (#5, #6): odczyt literówek: „antratora" = Atanor; „planu Załogi" = „planu, załogi".
- A5 (#5, niski priorytet): „egzotyczna materia" = Kapsuła fuzyjna i Antymateria (nie nowy materiał).
- A6 (#16): „wrap" = warp; cel czasu lotów międzygwiezdnych: najkrótszy ok. kilka godzin (najlepszy warp, bliska gwiazda), najdłuższy ok. kilka dni; tabelę poziomów zaproponuję w artefakcie.
- A7 (#18): lądowanie na gazowym olbrzymie jest po prostu niemożliwe (rozkaz odrzucany jak dziś dla gwiazdy), bez dalszych skutków; jeśli ma mieć skutki jak w #7 → Q10 / Q11.
- A8 (#22): morale liczone osobno dla grup ludzi (po Q12), do tego czasu jedna wartość na lokalizację; efekty: mnożnik wydajności (dno 50% jak w §4.5) + bramki odkryć wymagających 100% morale naukowców (po Q24).
- A9 (#23): na starcie jedna stacja na ciało; wiele stacji i moduły w gniazdach w późniejszych etapach.
- A10 (#24): pojemność załogi (koje) wynika z wnętrza w granicach koperty (pokłady i powierzchnia zależne od klasy i poziomu); dla graczy bez własnego projektu — układ domyślny dający wartości z dotychczasowej tabeli (Habitat 10 → 84); wnętrze projektowane per klasa i poziom (szablon), nie per egzemplarz.
- A11 (#25): skan tranzytowy podaje typ planety, okres i temperaturę, bez złóż, księżyców i pasów; teleskop obsługuje kolejkę celów; orientacja układu (od niej zależy widoczność tranzytu) jest ukryta i wyliczana z ziarna. Że wynik jest szacunkiem z niepewnością i może pominąć planety — rozstrzygnięte w Q35 b.
- A12 (#28): na start silnik audio (kategorie, głośności, odblokowanie po geście, zdarzenia → dźwięki) i zastępcze dźwięki oraz muzyka z wolnych pakietów (CC0); styl muzyki i źródło finalne dopiero później (jak w Q14); audio nie zmienia symulacji.
- A13 (#27): nazwa cywilizacji to osobne pole profilu obok callsign (callsign zostaje unikalnym uchwytem konta); filtr słów jak dla callsign; widoczna na mapie galaktyki i dla odkrytych graczy.

### C. Zamknięte
- Q1 → „1 a": wybór gwiazdy na mapie galaktyki; jednorazowy skok statku międzyplanetarnego (wyjątek startowy przyjęty); paliwo wyznacza zasięg.
- Q2 → cała rodzina klas międzygwiezdnych z ładownością.
- Q3 → częściowo: paliwo międzygwiezdne = droga egzotyczna materia z Atanora (#5); międzyplanetarne = założenie A3.
- Q14 → „Póki co (a) dla dev. Docelowo na dalszym etapie (c)": etap 1 = encyklopedia dla zespołu (dokumentacja z ID, generowana z danych), etap 2 (później) = oba widoki z jednego źródła (pełny dla zespołu, odblokowywany postępem dla gracza).
- Q35 → „35 b” (2026-11-10): wynik skanu tranzytowego (#25) to szacunek z niepewnością i może pominąć planety (np. gdy orbita nie leży „od krawędzi”); księżyców i pasów nie pokazuje (A11). Treść pytania: (a) zawsze zgodny z prawdą, lecz niepełny; (b) szacunek z niepewnością, może pominąć planety; (c) może się mylić i wymaga potwierdzenia kolejną obserwacją; (d) inaczej. Q35 przestaje blokować G-L; forma niepewności — W76.

- Q40 → „A” (2026-11-11): generator = deterministyczna funkcja (ziarno, współrzędne), leniwie, zapis po odkryciu.

**Odpowiedzi z artefaktu „Doprecyzowanie pomysłów” (odczyt bazy `refine`, 2026-11-11) — pozycje A przeniesione tutaj; bez odpowiedzi został tylko Q4′ (nie było go w artefakcie jako zapisywalny wpis).**
- Q5 → (c) w wersji użytkownika: zestaw startowy = jeden statek międzygwiezdny najniższej klasy z podstawowym wyposażeniem, materiałami i załogą; wybór planety, kolonia, ekspansja w układzie. Uwaga #4 (i4): zatankowany na 75% wg „standardowego” planu, materiały na start kolonii, standardowa załoga, morale 75%. → Arka-1 (2000 j., 2 łaziki, prom, sonda) wypada jako start; do przeliczenia (port L1 = 210 j.).
- Q6 → (b), z doprecyzowaniem: przewoźnik NPC dopiero po zbudowaniu „wielkiej handlowej stacji kosmicznej” (droga budowla; oferty sprzedaży i kupna; wędrowni handlowcy NPC realizują zamówienia między stacjami; stacje na obrzeżach układów; inni gracze mogą cumować i handlować). Zmienia założenie „wczesny Terminal handlowy dni 5–10” i dzisiejsze abstrakcyjne przesyłki z B6.
- Q7 → 4 klasy; większa = więcej pokładów i powierzchni; silnik (moc, paliwo) wyznacza prędkość FTL. Lista nazw nie potwierdzona wprost (roboczo: frachtowiec, tankowiec, okręt kolonizacyjny, sonda).
- Q8 → (b): plan = schemat w bibliotece gracza (stworzyć, wymienić, sprzedać). #6 (i6): potrzebna lista „klas” modeli planów i definicja powierzchni do zabudowy. #2 (i2): ładunek = powierzchnia przeznaczona na ładunek w planie konstrukcji.
- Q9 → (a): załoga to tylko pojemność. #8 (i8): jedna pula ludzi, rozbudowywana liczbą habitatów (pula per planeta / statek / stacja).
- Q10 → (d): lot ku gwieździe niemożliwy na razie; załoga odmawia. #7 (i7): „załoga odmawia lotu”. Q11 → (a) zastosowane tylko jako odmowa załogi (bez zniszczeń) → G-G sprowadza się do komunikatu.
- Q12 → (a) (typy kosmetyczne, jedna pula). Q13 → (a), z notą „szkolenia nie wymagane”.
- Q15 → (c) (słownik jako osobny artefakt). Q16 → (a) Stocznia orbitalna.
- Q17 → (b) + opis: stocznie biorą materiały z puli planety; pule mają planety, statki, stacje magazynujące / handlowe; magazyny trzeba budować (limity); w statkach pojemność z zagospodarowanej przestrzeni w projekcie; trzy typy magazynów: stałe / kompozyty, gazowe / ciekłe, metamateriały. Zmienia dok. ekonomii §5.1 (drony stacji z magazynu stacji).
- Q18 → (a) + nota: pierwszy skan musi pokazać kilka możliwości i pozwolić wskazać tylko tę w zasięgu.
- Q19 → (b): kilku graczy może dzielić układ; kolonie tylko na pustych planetach. Odwrotność rekomendacji (a); wyłączność per planeta, nie per układ.
- Q20 → (c) + odbiorca może odpowiedzieć. Q21 → (c).
- Q22 → bez wyboru, nota: struktury w pasie asteroid, mechanizm wydobycia / przetworzenia / transportu surowców (wahadłowce, małe statki).
- Q23 → (c) (olbrzymy tylko w niektórych typach układów) + nota: nie można lądować, potrzebne PoC i assety. Q24 → (a) system badań. Q25 → (d) + nota: potrzebne przykłady stylów do podglądu i wyboru. Q26 → (c) (frakcje = korporacje / sojusze).
- Q27 → (c) pełne PvP, nota: PvP w następnym etapie, frakcje prowadzą ekspansję. KONFLIKT z WIZ-6, S-8, SOC-3 C i „brak PvP”.
- Q28 → (c) + nota: ekonomia ma nagradzać handel / kontakt / frakcję, ale też PvP. Q29 → (c).
- Q30 → (b) + skala: <50% słabo, 70% ok, 85% super, 95–100% odblokowuje nowe technologie (wydobycie i przetwarzanie). Odwrotność rekomendacji (a): kalibrację ekonomii §3.1 trzeba przeliczyć.
- Q31 → bez wyboru: model stacji / statystyki / klasy / plany / sposób budowy na orbicie jako zadanie do wypracowania.
- Q32 → (c) + nota: budujemy z puli planety, na orbicie planety; stację można przenieść na inną orbitę (drogie).
- Q33 → (c) + wyposażenie, oświetlenie, kompletność załogi. Q34 → (c).
- Q36 → (a), na razie bez eksploracji i integracji. Q37 → (c). Q38 → (c) dialogi z wyborami (RPG). Q39 → (a) na razie tylko opis.
- #11 (i11): generator ma rozmieszczać gwiazdy tak, by gracze się spotkali, ale dzieliło ich kilka gwiazd. #13 (i13): teleskopy na statkach i jako osobne satelity. #5 (i5): wielkość wytwarzania zależy od budowy procesu w Atanorze; potrzebny złożony mechanizm, wiele sposobów o różnej efektywności. #3 (i3): „tak”.

**Rozstrzygnięcia z artefaktu „Rozstrzygnięcia” (baza `decide`, 2026-11-11) — wszystkie pytania z rejestru A mają teraz odpowiedź.**
- Q4′ → (a) skok płacony z tej samej puli paliwa co loty lokalne (nota: loty lokalne nie zużywają wiele paliwa; rekomendowałem (b)); zasięg startowy 3–5 gwiazd (rekomendowałem 8–12; przy 3–5 bez generatora planet zostaje mało opcji z planetą do lądowania — #33 generator to rozwiązuje).
- Q7 → (a) cztery klasy: frachtowiec, tankowiec, okręt kolonizacyjny, sonda/zwiadowca.
- Q22 → (b) PoC pasa asteroid tylko zapisany jako zadanie na później.
- Q31 → (c) model stacji zostaje otwarty.
- K1 → (a) MVP bez PvP; PvP projektowane w następnym etapie (WIZ-6, S-8, SOC-3 C bez zmian na teraz).
- K2 → (a) wyłączność per planeta (rejestr zajętości w galaktyce), światy kolonii nadal instancjonowane (WIZ-1=C bez zmian).
- K3 → (a) zadanie: przeliczyć kalibrację ekonomii (§3.1) pod morale jako trudny cel.
- K4 → (a) badania liczy ogólna pula ludzi + laboratoria, bez osobnych naukowców (zgodne z Q12 a).
- K5 → (a) przygotować artefakt z próbkami stylu ikon (pixel-art, obrys, hybryda) — do zrobienia.
- K6 → (a) zaktualizować doc w Claude Docs i pamięć.

- Q25/K5 → „A hybrydowy” (2026-11-11, po próbkach w artefakcie „Style ikon” https://claude.ai/artifact/XDSZBCxBZyhUeVkK1YzqGq): treści gry (surowce, budynki, statki, planety, awatary NPC) w pixel-art 12×12 z ograniczoną paletą na obrysowym kafelku; chrom UI zostaje obrysowy w DS. Paleta bez tonów bliskich sygnałowym #FFB000 / #FF5A4A. Następne: pełny zestaw (37 materiałów), potem budynki i statki; pipeline i budżet rozmiaru — W-ikony z #19.

### D. W kolejce (jeszcze niezadane — wynikają z analizy)
- W72 (#25): kolejka celów teleskopu — ile celów naraz, czas obserwacji (godziny–dni), zależność od poziomu, priorytety i anulowanie.
- W73 (#25): ukryta orientacja układu — odsetek układów z wykrywalnym tranzytem; czy brak tranzytu da się obejść inną metodą.
- W74 (#25): dodatkowe metody (spektrograf — prędkości radialne; koronograf — obrazowanie bezpośrednie) jako postęp technologii teleskopów.
- W75 (#25): interfejs wykresu — krzywa blasku, szum, oś czasu; czy gracz zaznacza spadki, czy analiza jest automatyczna.
- W76 (#25, po Q35 b): forma niepewności wyniku skanu — przedziały (rozmiar ±, okres ±) czy klasy (skalista / olbrzym / nieokreślona); jak niepewność maleje z czasem obserwacji i poziomem teleskopu; czy gracz widzi wskaźnik pewności; czy są fałszywe wykrycia (wybór b zamiast c sugeruje, że nie — do potwierdzenia).
- W77 (#26): relacja z istniejącą planetą `medieval` (Tau Ceti c, ruiny osady): ta sama koncepcja (cywilizacja żywa vs wymarła) czy osobny motyw; czy Tau Ceti c ma być pierwszym przykładem; skórka medieval dla budowli gracza (T7B, T-24, T-30) zostaje, czy na żywej planecie budowle gracza pozostają sci-fi.
- W78 (#26): losowanie 1%: na układ czy na planetę; wynik stały z ziarna (G-K); czy dotyczy 41 gwiazd rzeczywistych (oczekiwane ok. 0,4) czy tylko generowanych; wykluczenie z układów startowych (#12) czy dozwolone.
- W79 (#26): „bogate surowce”: większe złoża, rzadsze typy (T0R), więcej pól ze złożem (`depositWeights`); kalibracja z Q23 / Q29; złoża pod terytorium cywilizacji (osada zajmuje pola).
- W80 (#26): rozwój cywilizacji: statyczna czy ewoluuje (epoki, wpływ gracza, „uplift”); zegar i skutki.
- W81 (#26): kontakt: wykrywalność (brak sygnałów radiowych → niewidoczna dla analizy sygnałów #14 i tranzytów #25; tylko sonda / skan po przybyciu), pierwszy kontakt, komunikacja (#15), prawo do wydobycia (traktat, opłata, zakaz), wrogość miękka.
- W82 (#26): ton i etyka (WIZ-7): eksploatacja dozwolona z konsekwencjami / zakazana / zachęcana; ochrona (kwarantanna); wpływ na morale załóg (#22); własność układu przy wyłączności (Q19).
- W83 (#27): nazwa cywilizacji a callsign (A13): unikalność, zmiana (co 30 dni?), filtr, miejsca wyświetlania (mapa, wiadomości #15, karta, rankingi).
- W84 (#27): flaga i awatar: czy gracz komponuje sam (kompozytor 06 §4.3, sigil 8×8 z „losuj ponownie”), czy wynikają z koloru; flaga w 3D (U-4).
- W85 (#27): kiedy ustawia się tożsamość: kreator przed wyborem gwiazdy (#4) czy w panelu (`#/dowodca`); mock w `localStorage` (U0); kolor korporacji nadpisujący kolory członków (06 §4.1); powiązanie z grupami (#20).
- W86 (#28): styl muzyki (ambient / elektronika, orkiestra, retro-chiptune pasujący do pixel-artu #19, zmienna wg widoku i epoki); zależny od tonu gry (WIZ-7).
- W87 (#28): zakres MVP audio: dźwięki interfejsu i zdarzeń, muzyka tła per widok, dźwięki świata 3D (pozycyjne), głosy komunikatów (#29); kolejność.
- W88 (#28): źródło: pakiety CC0 / zamówiony kompozytor i sound designer / generowanie AI (licencje); atrybucja i licencje w katalogu (#9); budżet.
- W89 (#28): dostarczanie do przeglądarki: formaty (Opus/OGG + AAC), sprite efektów, strumieniowanie muzyki, leniwe ładowanie po geście, budżet rozmiaru, cache; manifest audio (ID, plik, licencja).
- W90 (#28): zachowanie: odblokowanie po geście (autoplay), pauza w tle, wyciszenie, osobne głośności (muzyka / efekty / interfejs / ambient), dostępność (odpowiedniki wizualne), zbiorczy dźwięk po nadrabianiu offline (R-5), zdarzenia → dźwięki bez wpływu na symulację i replikę (R-18).
- W91 (#29): „AI”: kim jest (komputer okrętowy, doradca, przewodnik / wprowadzenie, narrator podsumowań); jedna postać czy kilka; głos.
- W92 (#29): nadawcy jako postacie z imionami i portretami (awatary NPC #19) czy kategorie z ikonami; zależność od modelu ludzi (#8, Q12).
- W93 (#29): mapowanie zdarzeń na komunikaty: 37 typów `DomainEvent` → nadawca, ważność, szablon; które zdarzenia nie generują komunikatów (`MINING_TICK`, `EXTRACTION_TICK`); grupowanie; limity.
- W94 (#29): offline: „raport z nieobecności” po nadrabianiu (R-5, 12 h) zamiast setek komunikatów; powiadomienia asynchroniczne z serwera (05 §6, 06 §3) a komunikaty narracyjne z klienta.
- W95 (#29): UI: toasty / baner, dziennik pokładowy (filtry, wyszukiwanie, przypięte), okno z portretem; komponenty DS (HUD), dostępność (`aria-live`), skróty; treść PL (`pl.ts`), anty-powtarzalność tekstów.
- W96 (#30): dane: `radius` (R☉), temperatura, masa, skład (metaliczność / składniki), typ widmowy w modelu ciała i katalogu; parytet TS↔Rust i wektory (R-20); skąd dane dla 41 rzeczywistych gwiazd (PoC `stars.data.ts` ma jasność, promień, temperaturę, masę) i rozkłady dla generowanych.
- W97 (#30): wpływ na wykrywanie: jasność pozorna = f(jasność, odległość) w zasięgu teleskopu (#13); stosunek sygnału do szumu skanu tranzytowego (#25) rośnie z jasnością gwiazdy.
- W98 (#30): wielkość gwiazdy a strefa zagrożenia (#7, G-G): promień strefy ∝ promień i jasność; skala wizualna w widoku układu (`view-scale`).
- W99 (#30): karta gwiazdy w UI i encyklopedii (#9); parametry w ikonie / wizualizacji gwiazdy (#19 faza 2).
- W100 (#31): obrzeża układu jako byt: wirtualne ciało (nowy `BodyKind`, np. rubież) czy punkt; promień obrzeży względem najdalszej orbity; skala; kamera i animacja zbliżenia.
- W101 (#31): czy obrzeża dotyczą każdego przylotu statku międzygwiezdnego (także do własnego układu), czy tylko pierwszego wejścia do nowego układu; port / brama na obrzeżach po zasiedleniu (z S3).
- W102 (#31): lot z obrzeży do ciał: czas i paliwo (statek po skoku ma mało paliwa, #1 / #3); darmowe tankowanie na bazie (`docking.rs`) nie działa na obrzeżach; Q4′.
- W103 (#31): co ujawnia skan potwierdzający: liczba planet, typy, skład (atmosfera? złoża?), temperatura, woda, księżyce i pasy, planety niewidoczne dla tranzytów; poziomy skanu (podstawowy / szczegółowy) i zależność od sprzętu, załogi (naukowcy #8) i morale (#22); czas (dziś 15 min); czy skan jest obowiązkowy przed lądowaniem.
- W104 (#31): model wiedzy o układzie: poziomy (katalog → szacunek z tranzytów #25 → sonda → skan potwierdzający) ze źródłem i pewnością każdej informacji; porównanie „oczekiwano ↔ potwierdzono” w UI; `revealed` w ciele → bogatszy model; serwer wysyła tylko to, co gracz wie (mgła wojny).
- W105 (#32): wzór strefy życia: granice wewnętrzna i zewnętrzna z jasności (r = 900 × √(L / S)), strefa miękka (gradient: za gorąco / dobrze / za zimno) czy ostra; skutki dla gwiazd typu M (strefa blisko i wąska).
- W106 (#32): skutki dla planety: woda (ciekła / lód / para), biom (T5: winter / dry / mixed / medieval), ocena, koszty budowy (teren T8), możliwość habitatu na powierzchni; planety poza strefą jako zasób (lód, rzadkie surowce) zamiast kolonii.
- W107 (#32): „życie”: tylko warunek zamieszkania, zasób (biosfera, surowce organiczne, żywność), czy miejsce rodzimego życia i cywilizacji (#26 tylko w strefie?); w obecnym katalogu brak surowców organicznych (T0: Ferryt, Silicyt, Kriol, Karbonit, Regolit).
- W108 (#32): generator: strefa życia i linia śniegu (G-P) jako wspólny model stref po jasności (G-K); gwarancja planety w strefie dla układu startowego (#12); księżyce olbrzymów w strefie (Q23); tranzyty (#25): planety w strefie wokół gwiazdy typu G mają długie okresy (długa obserwacja), wokół M krótkie.
- W109 (#33): „kilka gwiazd” — ile i w jakiej odległości (ly) mają mieć sąsiedzi gracza; czy gracz widzi sąsiadów od razu; gęstość a liczba graczy.
- W110 (#33): umieszczanie nowego konta: przy istniejących graczach (klaster rośnie) czy nowe skupisko; wolne układy startowe (Q19), kryteria dobrego startu (W31).
- W111 (#33): limity i koszt skanu generującego; kolejka, cache, ochrona przed nadużyciem (masowe skanowanie).
- W112 (#33): relacja z 41 rzeczywistymi gwiazdami i hubami (WIZ-4); migracja katalogu stałego do generowanego.
- W67 (#24): kształt koperty — prostokąt czy maska (pierścień stacji, wydłużony kadłub statku); pokłady o różnej powierzchni (zwężanie)?
- W68 (#24): tabele koperty (pokłady, powierzchnia) dla Habitatu, klas statków i modułów stacji — kalibracja z bilansem edytora.
- W69 (#24): projekt per egzemplarz czy per klasa (szablon); co z istniejącymi egzemplarzami po zmianie szablonu; ułatwienia dla graczy bez projektu (układy domyślne, auto-układ).
- W70 (#24): czy fabryki i inne budynki (nie tylko habitaty) mają wnętrza (ANALIZA §8.4: „Habitat lub Fabryka") i czy wpływają na morale / wydajność.
- W71 (#24, #22): jak morale kolonii agreguje się z wielu habitatów i stacji (średnia ważona obsadą, minimum, osobno per lokalizacja).
- W56 (#22): czynniki morale poza wyposażeniem — jedzenie (różnorodność), obciążenie pracą i zmiany, bezpieczeństwo (szczelność, awarie zasilania), czas lotu (#16), sukcesy i porażki, kontakt z innymi (#15)?
- W57 (#22, #16): co morale załogi robi na statkach (wydobycie Górnika, prędkość, awaryjność, zużycie paliwa)?
- W58 (#22, #13, Q24): które odkrycia wymagają 100% morale naukowców; czy analiza sygnałów (#13) też zależy od morale; progi inne niż 100%?
- W59 (#22): spirala śmierci (niskie morale → niska wydajność → brak środków) — zabezpieczenia: dno 50%, szybkie odbicie, darmowe minimum wyposażenia.
- W60 (#22): nowe typy pomieszczeń i wyposażenia w edytorze wnętrz i katalogu (rekreacja, siłownia, laboratorium, ogród, okna / widok), nowe pole `comfort` w `ShipStats`.
- W61 (#23): sloty orbitalne — ile stacji na ciało, wysokości orbit, punkty Lagrange'a (teleskopy, szlaki warp), stacje przy pasie asteroid i w głębokiej przestrzeni.
- W62 (#23): moduły stacji — lista, wymagania, limit gniazd wg poziomu rdzenia.
- W63 (#23, #8, #22): życie na stacji — własna pula załogi, podtrzymanie życia (woda, tlen, żywność), zaopatrzenie promami (W15).
- W64 (#23, #10): skąd materiały na orbicie — to samo co Q17 (magazyn stacji vs pula ciała).
- W65 (#23): wygląd i modułowość 3D — składanie stacji z modeli (KayKit `basemodule_*`), punkty zaczepienia, LOD; rola edytora wnętrz (opcjonalny vs wymagany).
- W66 (#23, #14, #20, #21): własność i dostęp — stacje innych graczy, stacje korporacji i sojuszu, wspólne stacje, prawa dostępu.
- W51 (#21): które materiały są rzadkie i gdzie — lista T0R / T0X i rozkład w typach ciał i układów; parametry startowe do symulacji.
- W52 (#21): rola NPC jako bezpiecznika — ceny, cła, limity tak, aby nie zabić handlu między graczami.
- W53 (#21): relacja handlowa — poziomy, progi, efekty; czy działa w obie strony, czy per kierunek.
- W54 (#21, #20): węzły handlowe graczy (Terminal handlowy otwarty dla innych) — prowizja gospodarza, prawa dostępu, ochrona.
- W55 (#21, #13): jawność składu układów — czy analiza sygnałów ujawnia, w czym układ jest bogaty, czy trzeba to poznać handlem lub wywiadem.
- W46 (#20): członkostwo — jedna grupa na gracza czy wiele; zmiana grup (karencja), wyrzucanie, głosowania nad wydatkami.
- W47 (#20, #6): współwłasność statków — jak przydzielać czas i zyski (udziały, kolejka, wynajem wewnętrzny).
- W48 (#20, #16): szlaki warp (Brama) — liczba, koszt, zasięg; czy działają tylko dla członków, czy dla wszystkich za opłatą (cło).
- W49 (#20, #13, #14): wspólna mapa odkryć — czy członkowie korporacji i sojuszu widzą odkrycia nawzajem; prywatność gracza.
- W50 (#20): rankingi i sezony grup — nagrody, reset, czy grupy przetrwają sezon.
- W42 (#19): kto produkuje grafikę — ręcznie (grafik / użytkownik), automatycznie z modeli 3D, proceduralnie, czy generowanie AI (licencja M-6)?
- W43 (#19): rozmiary i liczba wariantów (16 / 24 / 32 / 48 / 64 px), DPR, budżet wagi paczek (rdzeń vs doładowywane).
- W44 (#19): lista NPC i zastosowań awatarów (frakcje, huby, personel, doradcy), liczba postaci.
- W45 (#19): czy ikony w scenie 3D (etykiety jednostek, znaczniki mapy galaktyki) mają być tym samym atlasem jako tekstura.
- W41 (#18): ile księżyców ma olbrzym (np. 1–4), jakich typów i wielkości; czy olbrzym ma pierścienie; czy w układzie może być więcej niż jeden olbrzym.
- W37 (#17): miejsce i wykonawca PoC — osobna aplikacja w `poc/` (Angular + Three, jak `space-interior-poc`), symulacja headless w `sim-cli`, czy tryb w web-game; kiedy startować i czy w osobnej sesji / worktree (drzewo główne zajęte przez równoległe sesje).
- W38 (#17): czy pas jest skończony (wyczerpywalny), czy się regeneruje; ile skał i zasobów na pas; wpływ na tempo i długość gry.
- W39 (#17): czy wydobycie jest w pełni automatyczne (trasy cykliczne), czy gracz podejmuje decyzje w pasie (wybór skał i typów); powiązanie z EKO-8.
- W40 (#17, #7): zagrożenia w pasie (kolizje, promieniowanie, piraci) — czy w ogóle.
- W34 (#16): co z „habitatem hibernacyjnym" gwiazdolotu (§9.1) przy lotach godziny–dni — usunąć, zmienić w zwykły habitat z zapasem żywności, czy zostawić jako „stazę"?
- W35 (#16, #7): czy warp można włączyć dopiero poza studnią grawitacyjną gwiazdy (punkt wyskoku na obrzeżu układu) — dodatkowy etap wewnątrzukładowy na początku i końcu lotu?
- W36 (#16): czy można przerwać lot warp lub zmienić cel w trakcie (konsekwencje: paliwo, utknięcie w głębokiej przestrzeni; por. #7)?
- W25 (#13): gdzie stoją teleskopy — powierzchnia (atmosfera), orbita (Stacja), głęboka przestrzeń; czy kilka teleskopów / kolonii się sumuje (promień od jednej kolonii czy od sumy).
- W26 (#14): czy gracz może ukryć swój układ (ekranowanie, brak emisji), czy zawsze jest wykrywalny w promieniu cudzych teleskopów?
- W27 (#13): co ogranicza analizę sygnałów — czas, naukowcy (#8), energia / moc obliczeniowa; czy czas rośnie z odległością.
- W28 (#15): czy wiadomości mają opóźnienie zależne od odległości (jak przesyłki 2 h/ly), czy kosmetyczne; wolny tekst vs gotowe komunikaty.
- W29 (#15): jak grać ze znajomymi z prawdziwego życia, skoro kontakt wymaga odkrycia (zaproszenie po callsign / kod, start obok, korporacja).
- W30 (#11, #14): skończoność i wzrost galaktyki — stała liczba gwiazd czy rośnie z graczami; sezony (MP-4) / resety.
- W31 (#12): kryteria „dobrego startu" (min. liczba i typy ciał, woda, węgiel, energia, ciało o niskiej grawitacji); czy gra zawsze przydziela / oferuje takie układy.
- W32 (#13): czy huby NPC i frakcje są odkryte od początku (handel od ery Orbity i asteroid: Terminal handlowy), czy trzeba je odkryć teleskopem?
- W33 (#11, #14): ochrona nowych graczy — minimalna odległość od innych graczy na starcie, okres bez wykrycia.
- W22 (#10): na orbicie którego ciała można budować stocznię — tylko planeta macierzysta i Księżyc, czy każde ciało ze Stacją orbitalną (Glacja, Gigas…)? Wpływ: stocznia przy Wyrzutni masy ułatwia wynoszenie.
- W23 (#10, #1, #5): przylot statku międzygwiezdnego do układu docelowego — dolatuje do orbity planety (musi mieć napęd i paliwo lokalne) czy zostaje na obrzeżu, a ładunek przejmują statki międzyplanetarne?
- W24 (#10, #4): czy generator układów musi zapewniać ciało o niskiej grawitacji (Księżyc / Glacja) dla Wyrzutni masy, czy gracz może polegać na samych Promach (ok. 10 u paliwa na kurs z Planety macierzystej)?
- W18 (#9, etap 2): jawność haseł dla gracza — wszystkie od początku czy odblokowywane postępem (era, Skanowanie, sonda, badania)?
- W19 (#9, następne pytanie dla etapu 1): gdzie ma żyć — trasa w grze `#/katalog`, strona dokumentacji (Pages / MkDocs, D-3), pliki Markdown w repo?
- W20 (#9): zakres „innych assetów" — modele 3D, ikony, tokeny DS, teksty UI, dźwięki (audio w projekcie dziś nie istnieje).
- W21 (#9): język i ton haseł — techniczny (zespół) vs fabularny (gracz); wersje językowe (dziś PL).
- W12 (#8, #4): skład osobowy na starcie — ilu ludzi i jakich typów leci statkiem startowym i co mogą zbudować (ryzyko miękkiej blokady).
- W13 (#8): przydział ludzi do budynków i statków — automatyczny (priorytety jak moc) czy ręczny?
- W14 (#8, #1): ludzie jako ładunek — moduły pasażerskie w klasach statków, przewóz specjalistów między ciałami i układami.
- W15 (#8): stacje kosmiczne — własna pula załogi i podtrzymanie życia (woda, tlen, żywność) czy pula planety?
- W16 (#8): nazewnictwo — „inżynier / górnik / kupiec" (role w korporacji, SOC-2) vs. typy personelu.
- W17 (#8, #7): czy utrata statku lub skutki z Q11 niszczą ludzi (specjalistów) i jak to wpływa na rejestr personelu?
- W10 (#7): czy w pobliżu gwiazdy jest nagroda (energia, egzotyczne zasoby), czy to wyłącznie zakaz/pułapka? Jeśli nagroda — jaka i jak chroniona osłonami?
- W11 (#4, #7): punkt przylotu skoku startowego — poza strefą zagrożenia (obrzeże układu), nie przy gwieździe jak dziś Arka-1.
- W1 (#4) → PRZENIESIONE do Q19 (po #14): wyłączność układu — czy wielu graczy może wybrać tę samą gwiazdę w swoich instancjach (MP-2, WIZ-1 = C)?
- W2 (#4): nieodwracalność wyboru układu startowego — nieodwracalny / jedno darmowe przeskoczenie w pierwszej godzinie / restart kolonii?
- W3 (#4) → częściowo odpowiedziane przez #13 (widać tylko to, co odkryte i przeanalizowane): informacja przed wyborem gwiazdy — tylko dane katalogowe czy pełny profil?
- W4 (#4) → częściowo odpowiedziane przez #12 (start tylko w układzie pozwalającym na ekspansję międzyplanetarną; kryteria w W31): czy wszystkie gwiazdy w zasięgu są dopuszczone na start (czerwone karły ×0,05 energii: wykluczyć / alternatywne źródło energii w zestawie / tryb trudny)?
- W5 (#1): automatyzacja tras floty międzygwiezdnej (EKO-8), trasy cykliczne.
- W6 (#1, #6): ryzyko i PvP dla statków w locie (WIZ-6), straty, ubezpieczenie.
- W7 (#6): skala ceny klas międzygwiezdnych („bardzo drogie": rząd 10–100 tys. kr vs ułamek gwiazdolotu).
- W8 (#1, #6): gdzie budować klasy międzygwiezdne (Stocznia L4 vs Dok gwiezdny) i co odblokowuje poziom.
- W9 (#1, #2): czy zasięg (ly) jest osobnym, ulepszalnym napędem (Mk I–IV), czy poziom statku podnosi wszystko naraz.
- Zależności: G-B przed G-C; G-A równolegle. Całość po scaleniu terenu (server-b6) i B6 (galaxy-b6): konflikty w `event.rs`, `simulation.rs`, `rules.rs`.

# Warstwa społecznościowa: handel, frakcje, gildie, sojusze

> **Status:** PROPOZYCJA do akceptacji. Decyzje SOC-1…SOC-6 z `docs/game-design-questions.md` są nadal otwarte; ten dokument je uszczegóławia i prosi o rozstrzygnięcie (§7).
> **Data:** 2026-11-07

## 1. Stan zastany (FAKT)

| Element | Stan | Źródło |
|---|---|---|
| Model gry | C: układ gracza instancjonowany; wspólne rynek, korporacje, rankingi; architektura gotowa na wspólne układy (A) | WIZ-1, Z5, MP-2 (rekomendacja C → B) |
| Rynek w mocku | huby Syriusz (Sirius A) i Słońce; cena `P = V · clamp((popyt/podaż)^0,3; 0,5; 3)`; hub kupuje za 0,8·P, sprzedaje za 1,25·P; notowania co 10 min modelu; `MarketQuote { material, value, bid, ask, change }` | `galaxy-sim.ts`, dok. ekonomii 4.6 |
| Inni gracze w mocku | `SimulatedPlayer { name, corporation, homeStar, colonies, score }`; 6 korporacji z nazw (Konsorcjum Orion, Kolektyw Hel-3, Gildia Ferrytu, Spółka Kriogen, Syndykat Kwantyt, Unia Lagrange); plansza galaktyki „Kolonie innych graczy” | `galaxy-sim.ts`, W11 B |
| Waluta | kredyty `kr` w tabelach wartości materiałów (V) i notowaniach; EKO-7 (barter czy kredyty) formalnie otwarte | dok. ekonomii 4.2, 4.6 |
| Logistyka | magazyn lokalny, materiały przemieszczają się fizycznie (Z3); statki i prom w układzie; brak transportu między układami poza gwiazdolotem | Z3, D4 |
| Projekty Atanora | deterministyczny silnik, pomiar rozwiązań (cykle, obszar, ramiona); plan AT6 „biblioteka projektów, weryfikacja przez powtórkę, histogramy” | `atanor-expansion-design.md` §8 |
| Propozycje z analizy | księga zleceń w hubach + kontrakty NPC; korporacje małe z skarbcem i megaprojektami; frakcje NPC w rzeczywistych układach; rankingi projektów i sezonowe; czat korporacji i hubu | analiza §10, pytania SOC-1…6 |
| PvP | otwarte (WIZ-6); analiza rekomenduje ekonomię i kooperację bez bezpośredniego szkodzenia | WIZ-6 |

## 2. Zasady projektowe warstwy social

1. **Asynchroniczność.** Każda interakcja działa, gdy drugiej strony nie ma: zlecenia czekają w księdze, kontrakty mają termin, wkłady do megaprojektu sumują się.
2. **Geografia ma znaczenie.** Dostawa do hubu trwa zależnie od odległości w latach świetlnych; huby w różnych gwiazdach mają różne ceny; to daje sens mapie galaktyki (WIZ-3 A).
3. **Materiały są fizyczne także w handlu.** Sprzedaż = wysyłka z magazynu ciała do hubu (przesyłka w drodze); kupno = przesyłka z hubu do portu kolonii. Nic nie teleportuje się (Z3).
4. **Serwer rozstrzyga.** Ceny, dopasowania zleceń, metryki projektów Atanora i wkłady liczy serwer; klient tylko składa zlecenia (02 §8).
5. **NPC dają płynność i treść na zimny start** (R8): frakcje jako animatorzy rynku i zleceniodawcy kontraktów.
6. **Bez bezpośredniego szkodzenia** w MVP (rekomendacja dla WIZ-6): rywalizacja przez rankingi, wyścigi o kontrakty i megaprojekty.
7. **Ujścia** (EKO-5): opłaty hubu, cła frakcji, koszty megaprojektów, utrzymanie korporacji.

## 3. Handel

### 3.1 Huby i księga zleceń (SOC-1 A)

| Element | Propozycja |
|---|---|
| Huby | 3–5 stacji w rzeczywistych gwiazdach: Syriusz i Słońce (kanwa) + 1–3 do wyboru spośród gwiazd w zasięgu Mk I/II od Tau Ceti (np. Epsilon Eridani, Procyon). Każdy hub ma frakcję-gospodarza (§4) i cło |
| Księga zleceń | per hub × materiał: zlecenia kupna i sprzedaży z limitem ceny, ilością, terminem (do 7 dni); dopasowanie cena-czas; częściowe realizacje |
| Animator (NPC) | frakcja hubu kwotuje wokół `P` z dok. 4.6 (bid 0,8·P, ask 1,25·P) z ograniczoną głębokością (np. 10% dziennego wolumenu referencyjnego); `P` reaguje na saldo transakcji (popyt/podaż) jak w mocku. Gracze handlują między sobą wewnątrz spreadu NPC |
| Opłaty | prowizja hubu 2% (ujście) + cło frakcji 0–10% zależne od reputacji (§4) |
| Waluta | kredyty `kr` (rekomendacja EKO-7): saldo konta gracza w galaktyce; bez kredytów fizycznych w świecie (nie zajmują magazynu) |

### 3.2 Przesyłki

- `Shipment { id, world_id, from_body, hub, cargo, departs_at, arrives_at, status }`.
- Czas dostawy: `t = t_obsługi(port) + d_ly × k_ly` (parametr ekonomii; punkt wyjścia: k = 2 h/ly; odległość między gwiazdami z pozycji W10 w `stars.data.ts`; do ustalenia symulacją 04 §4.4).
- Wysyłka pobiera materiały z magazynu ciała natychmiast (rozkaz `SHIP_TO_HUB` w świecie); przybycie do kolonii to **rozkaz systemowy** `HUB_DELIVERY` wpisany do dziennika świata z numerem kroku, więc powtórka pozostaje deterministyczna (most galaktyka → świat).
- Wymaga portu kosmicznego L1+ i (opcjonalnie, później) terminala handlowego (katalog H) zwiększającego przepustowość.

### 3.3 Kontrakty

| Typ | Kto wystawia | Treść | Nagroda |
|---|---|---|---|
| NPC (frakcja) | serwer, cyklicznie wg potrzeb frakcji | dostarcz X jednostek materiału M do hubu H do czasu T | kredyty powyżej ceny rynkowej + reputacja |
| Gracz → gracz | gracz w hubie | dostarcz / odbierz; cena stała; depozyt | kredyty |
| Korporacyjny | oficer korporacji | wkład do skarbca lub megaprojektu | udział, rola |
| Projektowy (AT6, SOC-4) | gracz | „zaprojektuj maszynę dla receptury R z metrykami ≤ …” | kredyty, licencja |

Dane: `contracts { id, issuer_type, issuer_id, kind, requirements (jsonb), reward, deadline, taker, status }`.

## 4. Frakcje NPC (SOC-3 B)

| Element | Propozycja |
|---|---|
| Liczba i siedziby | 3–4 frakcje, każda gospodarzem jednego lub dwóch hubów; nazwy do wzięcia z puli mocka (np. Konsorcjum Orion — Syriusz, Unia Lagrange — Słońce, Kolektyw Hel-3 — Procyon) |
| Profil | każda frakcja ma specjalizację (energia, kriogenika, elektronika) wpływającą na: które materiały skupuje chętniej (wyższy popyt), jakie kontrakty wystawia, jakie receptury udostępnia za reputację |
| Reputacja | `reputation(account, faction) ∈ [−100, 100]`; rośnie za kontrakty i wolumen, maleje z czasem (−1/dzień powyżej 0) i za niewykonane kontrakty; progi: 25 cło −50%, 50 dostęp do receptur frakcji, 75 kontrakty premium |
| Rola na zimny start | frakcje = `GalaxySim` z mocka uruchomiony na serwerze jako NPC (R-7); ich kolonie widać na mapie jak dziś |
| Ryzyko | frakcje jako „strony konfliktu” (SOC-3 C) odrzucamy w MVP; nie są to frakcje graczy |

## 5. Gildie (korporacje, SOC-2 B)

| Element | Propozycja |
|---|---|
| Wielkość | 2–20 członków; założenie kosztuje (np. 5000 kr + 100 STA w hubie) i wymaga portu L2 |
| Role | szef (1), oficer (≤ 3), członek; role branżowe jako etykiety profilu: górnik, inżynier, kupiec (bez mechaniki w MVP, poza filtrami) |
| Skarbiec | kredyty + materiały zdeponowane w hubie siedziby; wpłaty każdego, wypłaty oficerów z dziennikiem |
| Kontrakty wewnętrzne | tablica korporacji; bez prowizji hubu |
| Biblioteka projektów Atanora | projekty udostępnione członkom (AT6); ranking wewnętrzny |
| Megaprojekty | wspólna budowa z wkładów materiałowych w hubie: **Stacja badawcza** (+5% tempa receptur członków), **Terminal korporacyjny** (−1% prowizji, większa przepustowość przesyłek), **Brama** (skrócenie czasu przesyłek między dwoma hubami o 30%; po otwarciu wspólnych układów także lotów) — kolejność i liczby do symulacji |
| Flaga i kolor | z kompozytora 06; widoczne na mapie galaktyki i w profilach |
| Komunikacja | czat korporacji, tablica ogłoszeń (SOC-6 B) |

Dane: `corporations { id, name, tag(3–4), flag, hub_id, treasury_kr, created_by }`, `corp_members { corp_id, account_id, role, joined_at }`, `corp_ledger { corp_id, ts, who, delta, note }`, `megaprojects { id, corp_id|alliance_id, kind, progress (jsonb per materiał), completed_at }`.

## 6. Sojusze (między korporacjami)

Sojusz = pakt 2–5 korporacji (bez PvP sojusz to skala współpracy, nie obrony).

| Funkcja | Propozycja |
|---|---|
| Wspólne megaprojekty | Brama i Stacja badawcza jako projekty sojuszu (większy koszt, większy zasięg bonusu) |
| Wspólna tablica kontraktów | kontrakty widoczne dla członków sojuszu przed publikacją w hubie (pierwszeństwo 1 h) |
| Czat sojuszu | jak korporacji |
| Dyplomacja | tylko stany: sojusz, neutralny. Wrogość pojawi się dopiero z decyzją o rywalizacji o zasoby (SOC-5 C, po otwarciu wspólnych układów) |
| Limity | korporacja w jednym sojuszu naraz; wyjście z 48-godzinnym okresem |

Faza E5. Dane: `alliances { id, name, flag }`, `alliance_members { alliance_id, corp_id, joined_at }`.

## 7. Rankingi, sezony, komunikacja

| Element | Propozycja | Pytanie |
|---|---|---|
| Rankingi projektów Atanora | per receptura: histogramy koszt / cykle / obszar jak w *Opus Magnum*; projekt publiczny po zweryfikowaniu powtórką na serwerze | SOC-4 B |
| Rankingi ekonomiczne | wartość netto (magazyny × V + kredyty + budynki × koszt), wolumen handlu, reputacja; tygodniowe i sezonowe | SOC-5 B |
| Sezony | 2–4 miesiące; reset światów i rynku; zostają: biblioteka projektów, kosmetyka (06), osiągnięcia, historia rankingów | MP-4 B |
| Czat | kanały: korporacja, sojusz, hub (regionalny); bez czatu globalnego; wiadomości prywatne później; filtr słów, zgłoszenia, wyciszanie przez oficerów i moderatora; retencja 30 dni | SOC-6 B |
| Powiadomienia | asynchroniczne: przesyłka dostarczona, zlecenie zrealizowane, kontrakt wygasa, megaprojekt ukończony; w HUD (dziennik) i w panelu użytkownika; e-mail opcjonalnie (06) | — |

## 8. Architektura i interfejs

- **Serwer:** `galaxy` w `game-server` (02 §3): transakcje SQL dla zleceń i skarbców; zadania cykliczne (notowania NPC co 10 min, wygasanie zleceń, kontrakty NPC, zanik reputacji); most do światów przez rozkazy systemowe (`HUB_DELIVERY`, `SHIP_TO_HUB` to rozkaz gracza w świecie, który tworzy przesyłkę w galaktyce).
- **Protokół:** wiadomości `Galaxy { PlaceOrder, CancelOrder, Quotes, Shipments, Contracts, TakeContract, Corporation*, Alliance*, Chat*, Rankings }` i push `GalaxyPush` (02 §6).
- **Domena świata:** nowe rozkazy `SHIP_TO_HUB { bodyId, hubId, cargo }` i zdarzenia `SHIPMENT_DEPARTED`, `HUB_DELIVERY`; reguła: wymaga portu i wolnej przepustowości.
- **Klient:** ekran hubu (księga, moje zlecenia, przesyłki, kontrakty), panel korporacji (członkowie, skarbiec, megaprojekty, czat), mapa galaktyki z warstwami (G1): huby, kolonie korporacji i sojuszu, trasy przesyłek; wszystko z komponentów DS. Kanwa: 3 nowe plansze (`type::design`: Hub, Korporacja, Kontrakty).
- **Dane testowe:** `GalaxySim` rozszerzony o zlecenia NPC i kontrakty, by ekrany dało się testować na mocku przed serwerem (jak W11 B).

## 9. Fazy (epic::social)

| Faza | Zakres | Etap | Brama |
|---|---|---|---|
| S0 | Huby z notowaniami NPC i księgą (tylko NPC po drugiej stronie), przesyłki, rozkaz `SHIP_TO_HUB`, ekran hubu na mocku | E2 | sprzedaż i kupno przez hub działa w e2e na mocku i na serwerze |
| S1 | Zlecenia gracz–gracz, kontrakty NPC, reputacja, cła; frakcje jako NPC na serwerze | E4 | dwóch graczy wymienia materiały przez hub; kontrakt NPC rozliczony |
| S2 | Korporacje: założenie, role, skarbiec, tablica, czat; flagi (06) | E4 | korporacja z 3 kont, wpłata i wypłata w dzienniku |
| S3 | Megaprojekty, sojusze, rankingi (projekty, ekonomia), sezony | E5 | megaprojekt ukończony wkładami 2 korporacji; sezon zamknięty i otwarty |
| S4 | Rynek projektów Atanora (licencje), wspólne układy (wariant A), rywalizacja o zasoby | po E5 | decyzje SOC-4 C, MP-2 B |

## 10. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Inflacja i manipulacja rynkiem (R7) | prowizje i cła jako ujścia; głębokość NPC ograniczona; limity zleceń na konto; telemetria rynku w 04 §4.4; sezony |
| Multikonta (przerzucanie materiałów) | limit przesyłek dla nowych kont; wykrywanie wzorców (ten sam adres IP, jednostronne transfery); kary reputacji |
| Zimny start | frakcje NPC kwotują i zlecają od pierwszego dnia (S0) |
| Rynek „płaski” bez geografii | czas dostawy i cła per hub; specjalizacje frakcji |
| Moderacja czatu, RODO | bez czatu globalnego; filtr, zgłoszenia, retencja 30 dni; eksport i usunięcie danych (06) |
| Megaprojekty premiują duże grupy | limit 20 członków; bonusy procentowe, nie wyłączne; sojusze dla większych celów |

## 11. Pytania (PYTANIE)

| ID | Pytanie | Opcje | Rekomendacja |
|---|---|---|---|
| S-1 (SOC-1) | Model rynku | A księga w hubach + NPC; B globalny natychmiastowy; C tylko kontrakty | **A** |
| S-2 (SOC-2) | Korporacje | A brak w MVP; B małe 2–20; C duże | **B** (S2 w E4) |
| S-3 (SOC-3) | Frakcje NPC | A brak; B w rzeczywistych układach; C frakcje graczy | **B**; `GalaxySim` jako ich silnik (R-7) |
| S-4 (SOC-4) | Projekty Atanora | A prywatne; B publiczne z rankingami; C rynek licencji | **B** w E5, C później |
| S-5 (SOC-5) | Rywalizacja | A rankingi projektów; B + sezonowe ekonomiczne; C + wyścig o zasoby | **B**; C po wspólnych układach |
| S-6 (SOC-6) | Komunikacja | A bez czatu; B korporacja i hub; C globalny + prywatne | **B** |
| S-7 (EKO-7) | Waluta | kredyty; barter | **kredyty** `kr` (model już je liczy) |
| S-8 (WIZ-6) | PvP | brak bezpośredniego szkodzenia; ograniczone (blokady hubów); pełne | **brak** w MVP; decyzja o rywalizacji o zasoby razem z MP-2 B |
| S-9 | Które gwiazdy są hubami poza Syriuszem i Słońcem | 1–3 z zasięgu Mk II | Epsilon Eridani i Procyon (dane w `stars.data.ts`, obie w zasięgu kanwy) |
| S-10 | Czas dostawy k [h/ly] | 1; 2; 4 | 2 (do kalibracji w `sim-cli`) |
| S-11 | Sojusze w MVP | E5; później | E5 (S3) |

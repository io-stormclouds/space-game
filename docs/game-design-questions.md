# Pytania do doprecyzowania — projekt gry

> **Status:** do uzupełnienia przez zespół. Etap 1 stage-gate („Zasady gry i mechanika”).
> **Data:** 2026-11-07
> **Kontekst:** [`game-mechanics-analysis.md`](game-mechanics-analysis.md) — fakty z PoC (Część I) i propozycje integracji (Część II). Pytania odwołują się do rozdziałów tego dokumentu.

## Jak korzystać

Każde pytanie ma:

- identyfikator i priorytet: **P0** blokuje dalsze prace; **P1** jest potrzebne przed szczegółowym projektem ekonomii; **P2** może poczekać;
- uzasadnienie, dlaczego odpowiedź jest istotna;
- możliwe opcje;
- rekomendację, czyli moją propozycję, nie decyzję;
- pole **Decyzja** do wpisania ustaleń.

Fakty przytaczane w uzasadnieniach pochodzą z kodu PoC (odnośniki w dokumencie analizy). Rekomendacje są propozycjami.

## Najpierw: decyzje P0

Pięć decyzji, od których zależy reszta:

1. **Model gry i świata** — `WIZ-1`, `MP-1`, `MP-2`. Wspólny trwały świat, sesje czy własna kolonia z asynchroniczną galaktyką?
2. **Rola Atanora** — `WIZ-2`. Rdzeń produkcji, opcjonalna optymalizacja czy minigra?
3. **Skala czasu** — `EKO-1`, `TECH-1`. Sekundy (jak w PoC), godziny (jak w wizji) czy hybryda? Od tego zależy model serwera.
4. **Charakter interakcji** — `WIZ-6`. PvP czy wyłącznie ekonomia i kooperacja?
5. **Rola mapy galaktyki** — `WIZ-3`, `POC-1` (wraz z `WIZ-4`). Co gracz robi na mapie i czy gwiazdy są rzeczywiste?

---

## 1. Wizja i gatunek

### WIZ-1. Jaki model gry wybieramy: trwały wspólny świat, sesje czy własna kolonia z asynchroniczną galaktyką? · P0

**Dlaczego to istotne:** ta decyzja wyznacza architekturę serwera (zdarzeniowy czy pokoje z tickiem), zakres MVP, tempo, monetyzację i stopień wykorzystania każdego PoC. Od niej zależą prawie wszystkie pozostałe.

**Opcje:**
- **A. Wspólna galaktyka** — trwały świat MMO-lite, czas płynie bez przerwy, układy gwiezdne współdzielone.
- **B. Sesje ekonomiczne** — mecze 2–8 graczy po 45–90 min.
- **C. Własna kolonia + asynchroniczna galaktyka** — instancjonowany układ gracza; wspólne są rynek, korporacje i rankingi.

**Rekomendacja:** **C jako MVP, z architekturą gotową na A.** Najniższe ryzyko, brak problemu zimnego startu, najbliżej obecnych PoC (wszystkie są jednoosobowe). Te same kontrakty domenowe pozwolą później otworzyć wspólne układy. Szczegóły: analiza §12.

**Decyzja:** —

### WIZ-2. Jaką rolę ma Atanor w grze? · P0

**Dlaczego to istotne:** Atanor to mechanika najbardziej wyróżniająca grę, ale też najbardziej niszowa. Od jego roli zależą próg wejścia, drabina surowców, wartość handlu projektami i zakres prac (edytor, walidacja na serwerze, rankingi).

**Opcje:**
- **A. Rdzeń produkcji** — każdy produkt T1+ wymaga zaprojektowanej maszyny.
- **B. Optymalizacja** — gra daje prefabrykaty (działające, przeciętne), a własny projekt daje przewagę w przepustowości, koszcie i zajmowanym terenie.
- **C. Osobna minigra** — np. wyzwania i kontrakty z nagrodami, luźno związane z ekonomią.
- **D. Rezygnacja z Atanora.**

**Rekomendacja:** **B.** Zachowuje unikalność gry i daje treść dla warstwy social (rankingi, udostępnianie projektów), a nie zmusza do programowania graczy nastawionych na ekonomię.

**Decyzja:** —

### WIZ-3. Co gracz robi na mapie galaktyki? · P0

**Dlaczego to istotne:** PoC galaktyki nie ma żadnej mechaniki, tylko wizualizację i kartę gwiazdy. Bez tej decyzji gra nie ma warstwy makro ani miejsca na social.

**Opcje:**
- **A. Wspólna mapa ekspansji i handlu** — huby rynkowe, odległość wyznacza czas dostawy, terytoria korporacji.
- **B. Nawigacja** — wybór układu („poziomu”) bez własnych mechanik.
- **C. Encyklopedia / edukacja** — karta gwiazdy bez wpływu na rozgrywkę.

**Rekomendacja:** **A.** Dane gwiazdy kształtują ekonomię układu: jasność wpływa na energię słoneczną, a klasa widmowa na profil złóż.

**Decyzja:** —

### WIZ-4. Gwiazdy rzeczywiste czy galaktyka proceduralna? · P1

**Dlaczego to istotne:** rzeczywiste sąsiedztwo Słońca to mocny wyróżnik, ale w promieniu ~20 ly jest rzędu stu układów — za mało na tysiące graczy we wspólnym świecie. Dane w PoC są do tego niespójne (→ `POC-3`).

**Opcje:**
- **A. Tylko rzeczywiste gwiazdy** (np. do 50 ly), z katalogu.
- **B. Galaktyka proceduralna.**
- **C. Hybryda** — rzeczywiste gwiazdy jako huby i punkty orientacyjne, proceduralne układy planetarne (i ewentualnie dodatkowe gwiazdy).

**Rekomendacja:** **C.** Realizm i rozpoznawalność tam, gdzie gracz je widzi, skalowalność tam, gdzie jest potrzebna. Układy planetarne i tak trzeba generować (seedy, jak w 3D PoC).

**Decyzja:** —

### WIZ-5. Czy gra ma cel edukacyjny? · P1

**Dlaczego to istotne:** `space-atanor/mechanics.md` opisuje PoC jako przygotowany „w celach edukacyjnych” (ma panel dydaktyczny z grafem), a karta gwiazdy pokazuje rzeczywiste dane astrofizyczne. Cel edukacyjny zmienia grupę docelową, ton, monetyzację (np. licencje dla szkół) i wymagania (dokładność danych).

**Opcje:**
- **A. Rozrywka** — edukacja jako „smaczki” (rzeczywiste dane, opisy).
- **B. Gra edukacyjna** dla szkół lub uczelni.
- **C. Dwa produkty** — gra oraz osobny tryb edukacyjny.

**Rekomendacja:** **A**, z rzetelnymi danymi jako atutem. B lub C rozważyć po MVP.

**Decyzja:** —

### WIZ-6. PvP: czy gracze mogą sobie bezpośrednio szkodzić? · P0

**Dlaczego to istotne:** to pytanie blokujące nr 4 z `1-game-description.md`. Walka wymaga systemu bojowego, obrony, balansu, ochrony nowych graczy, często także synchronicznego netcode. Zmienia też charakter społeczności i retencję.

**Opcje:**
- **A. Brak PvP** — rywalizacja wyłącznie ekonomiczna (rynek, rankingi, wyścig o zasoby).
- **B. Ograniczone PvP** — np. blokady lub piractwo na szlakach handlowych w wybranych strefach, rozstrzygane asynchronicznie.
- **C. Pełne PvP** z niszczeniem baz.

**Rekomendacja:** **A w MVP**, B jako późniejsza opcja (tylko w strefach, do których gracz wchodzi świadomie). Ekonomia i kooperacja są rdzeniem wizji.

**Decyzja:** —

### WIZ-7. Kim jest gracz (fantazja i ton)? · P2

**Dlaczego to istotne:** ta decyzja ustawia narrację, UI, nazewnictwo (alchemia czy inżynieria), styl graficzny i to, co jest „bohaterem” gry: kolonia, statek czy korporacja.

**Opcje:**
- **A. Inżynier-przedsiębiorca** — zarząd korporacji kolonialnej.
- **B. Władca imperium** (konwencja 4X).
- **C. Kapitan statku.**

**Rekomendacja:** **A.** Pasuje do ekonomii, do Atanora i do rynku.

**Decyzja:** —

### WIZ-8. Platforma: komputer, tablet, telefon? · P1

**Dlaczego to istotne:** edytor Atanora (oś czasu, precyzyjne klikanie heksów) i sterowanie w 3D PoC (LPM/PPM, przeciąganie kamery) zakładają mysz. Wersja mobilna zmienia UI, budżet wydajności i model sesji.

**Opcje:**
- **A. Desktop-first** (przeglądarka na komputerze).
- **B. Komputer + tablet.**
- **C. Mobile-first.**

**Rekomendacja:** **A**, ale z responsywnym UI rynku i raportów, tak żeby szybkie asynchroniczne „zajrzenie do gry” działało na telefonie.

**Decyzja:** —

---

## 2. Ekonomia

### EKO-1. Jaka jest skala czasu? · P0

**Dlaczego to istotne:** PoC działa w sekundach (lot 4–16 s, wydobycie 5 s, budowa natychmiastowa), a wizja zakłada godziny (ekspedycja 20 min, kolonizacja 3 h). Od tej decyzji zależą model serwera, sens postępu offline, długość sesji, retencja i monetyzacja (pokusa sprzedawania przyspieszaczy).

**Opcje:**
- **A. Sekundy–minuty** — tempo RTS, jak w PoC.
- **B. Minuty–godziny** — tempo przeglądarkowych strategii w rodzaju OGame.
- **C. Hybryda** — krótkie operacje lokalne (budowa i loty w układzie: minuty), długie operacje międzygwiezdne (godziny).

**Rekomendacja:** **C.** Sesja ma dawać satysfakcję w 10 minut, a powrót po kilku godzinach ma być nagradzający. Wszystkie czasy trzymać jako parametry danych, żeby łatwo je balansować.

**Decyzja:** —

### EKO-2. Czy energia reguluje produkcję w czasie? · P1

**Dlaczego to istotne:** w PoC moc tylko blokuje budowę. Wizja robi z energii główny regulator tempa (utrzymanie budynków; przy deficycie kopalnie pracują na 20%). To główne źródło decyzji „na co wydać” i napięcia w ekonomii.

**Opcje:**
- **A. Bramka przy budowie** — jak w PoC.
- **B. Utrzymanie + kara wydajności przy deficycie** — jak w wizji.
- **C. Pełna sieć energetyczna** — przesył między ciałami (satelity mikrofalowe z wizji), magazyny energii.

**Rekomendacja:** **B w MVP**, C jako rozwinięcie razem z infrastrukturą orbitalną.

**Decyzja:** —

### EKO-3. Magazyn globalny czy lokalny? · P1

**Dlaczego to istotne:** w PoC magazyn jest globalny. Ekstraktory na Księżycu zasilają go natychmiast, więc transport statkiem nie ma uzasadnienia ekonomicznego: pomiar pokazuje, że kursy statkiem dają średnio tyle, co jedna kopalnia, a wymagają klikania. Od lokalności magazynu zależy, czy logistyka w ogóle jest mechaniką.

**Opcje:**
- **A. Globalny** — jak w PoC.
- **B. Osobny na każdym ciele** — trzeba wozić między planetą, Księżycem i asteroidą.
- **C. Osobny na każdy układ** — wspólny w obrębie układu, transport tylko między układami.

**Rekomendacja:** **B, razem z automatycznymi trasami (`EKO-8`).** Logistyka orbitalna z 3D PoC (okna transferowe) staje się wtedy realną decyzją, a nie klikaniem. Przy C loty wewnątrz układu znów straciłyby sens.

**Decyzja:** —

### EKO-4. Ile surowców i poziomów przetwórstwa? · P1

**Dlaczego to istotne:** długość łańcuchów produkcji wyznacza rolę Atanora, głębokość handlu i złożoność balansu. PoC ma 3 surowce bez przetwórstwa, wizja przewiduje T1 → rzadkie → egzotyczne.

**Opcje:**
- **A. Minimum** — 3 surowce i jeden poziom produktów.
- **B. Średnio** — 3 poziomy (surowce planetarne → rzadkie z asteroid i innych gwiazd → egzotyczne), łącznie ok. 8–12 surowców i 10–20 produktów.
- **C. Głęboko** (jak w Factorio) — kilkadziesiąt produktów.

**Rekomendacja:** **B** (w MVP 6–9 surowców i 5–8 receptur). To wystarczy, żeby handel i specjalizacja miały sens.

**Decyzja:** —

### EKO-5. Jakie ujścia (sinks) wprowadzamy? (wielokrotny wybór) · P1

**Dlaczego to istotne:** bez ujść surowce się kumulują, ceny na rynku spadają do zera, a gra traci napięcie. W PoC jedynym ujściem jest jednorazowy koszt budowy.

**Opcje:**
- **A.** Utrzymanie budowli (energia, surowce).
- **B.** Paliwo jako zużywany produkt.
- **C.** Zużycie lub degradacja maszyn i statków.
- **D.** Opłaty rynkowe i transportowe.
- **E.** Kolonizacja i megaprojekty jako duże jednorazowe ujścia.
- **F.** Limity magazynu (nadwyżka przepada).

**Rekomendacja:** **A + B + D + E + F.** C odłożyć: jest frustrujące i wymaga dużo mikrozarządzania.

**Decyzja:** —

### EKO-6. Paliwo: darmowe czy produkowane? · P2

**Dlaczego to istotne:** w PoC tankowanie w bazie jest darmowe, więc paliwo ogranicza tylko zasięg. Jako produkt (np. Kriol → paliwo w atanorze) staje się ujściem, łączy logistykę z produkcją i nadaje sens oknom transferowym (koszt lotu waha się od 12 do 48 zależnie od fazy orbit).

**Opcje:**
- **A. Darmowe** — jak w PoC.
- **B. Produkt z łańcucha** (Kriol → paliwo).
- **C. Surowiec kupowany na rynku.**

**Rekomendacja:** **B**, z możliwością zakupu na rynku jak w C.

**Decyzja:** —

### EKO-7. Waluta: barter czy kredyty? · P1

**Dlaczego to istotne:** w 3D PoC zadeklarowano `credits = 1000`, ale nic z nich nie korzysta. Specyfikacja `staff.md.txt` przewidywała kredyty w górnym pasku. Waluta upraszcza rynek, ale niesie inflację i wymaga ujść.

**Opcje:**
- **A. Barter** — wyłącznie surowce.
- **B. Jedna waluta miękka** (kredyty), zarabiana na rynku i w kontraktach.
- **C. Waluta miękka + twarda** (premium).

**Rekomendacja:** **B.** Waluta twarda zależy od `MON-1`.

**Decyzja:** —

### EKO-8. Na ile automatyzujemy logistykę? · P1

**Dlaczego to istotne:** w PoC każdy kurs to dwa ręczne rozkazy bez kolejki. Przy wielu statkach i grze asynchronicznej to się nie skaluje. Automatyzacja zmienia rolę gracza z pilota w planistę.

**Opcje:**
- **A. Ręczne rozkazy.**
- **B. Trasy cykliczne** — konwoje A → B → A z warunkami, np. „wracaj z pełną ładownią”.
- **C. Pełna automatyzacja** z priorytetami i reagowaniem na popyt.

**Rekomendacja:** **B.** Wystarcza do gry asynchronicznej, a zostawia planowanie (okna transferowe, wybór tras).

**Decyzja:** —

### EKO-9. Czy ruch orbit ma być widoczną mechaniką (okna transferowe)? · P2

**Dlaczego to istotne:** pomiar pokazuje, że koszt i czas lotu planeta → asteroida zmieniają się 3–4-krotnie zależnie od fazy orbit. To może być głęboka mechanika planowania albo frustrujący szum.

**Opcje:**
- **A. Tak** — planer okien (wykres kosztu i czasu w funkcji czasu) i nagroda za dobre planowanie.
- **B. Neutralizacja** — stały koszt i czas dla danej trasy.
- **C. Częściowo** — trasy cykliczne same wybierają dobre okna.

**Rekomendacja:** **A + C.** Planer dla zaangażowanych, automatyka dla pozostałych.

**Decyzja:** —

### EKO-10. Co może pójść źle (porażka)? · P1

**Dlaczego to istotne:** PoC wyklucza porażkę konstrukcyjnie: moc nie spadnie poniżej zera, statek nie utknie. Bez ryzyka decyzje nie mają wagi. Z drugiej strony zbyt twarda porażka w grze asynchronicznej (gdy gracz jest offline) frustruje.

**Opcje:**
- **A. Brak** (sandbox).
- **B. Miękka** — deficyty, przestoje, kary za niewykonane kontrakty, spadek reputacji.
- **C. Twarda** — utrata kolonii lub statków.

**Rekomendacja:** **B**, z ochroną przed stratami w czasie nieobecności gracza.

**Decyzja:** —

---

## 3. Social

### SOC-1. Jaki model rynku? · P1

**Dlaczego to istotne:** w wizji rynek jest głównym łącznikiem między graczami („asynchroniczny rynek galaktyczny”). Model rynku wyznacza głębokość handlu, rolę geografii galaktyki, podatność na manipulacje i złożoność serwera.

**Opcje:**
- **A. Księga zleceń w hubach** — kupno i sprzedaż z limitem ceny; dostawa trwa zależnie od odległości.
- **B. Globalny rynek** z natychmiastową dostawą.
- **C. Tylko kontrakty** (gracz–gracz, NPC), bez giełdy.

**Rekomendacja:** **A + kontrakty NPC** (zapewniają płynność na starcie). Geografia nadaje sens mapie galaktyki i logistyce.

**Decyzja:** —

### SOC-2. Korporacje (sojusze): jaka wielkość i jakie funkcje? · P2

**Dlaczego to istotne:** wizja przewiduje korporacje budujące wspólnie megastruktury. Wielkość grup wpływa na balans (duże grupy dominują), na potrzebne narzędzia (skarbiec, uprawnienia) i na moderację.

**Opcje:**
- **A. Brak w MVP.**
- **B. Małe** (5–20 osób) — wspólny skarbiec, kontrakty wewnętrzne, megaprojekty z bonusem pasywnym.
- **C. Duże** (50–200+ osób) — hierarchia, terytorium, dyplomacja.

**Rekomendacja:** **B.** W MVP megaprojekty dają bonusy pasywne; bramy zmieniające mapę później.

**Decyzja:** —

### SOC-3. Czy wprowadzamy frakcje NPC? · P2

**Dlaczego to istotne:** frakcje dają kontrakty, kontekst fabularny i ruch na rynku, gdy graczy jest mało (zimny start). Wymagają za to projektowania treści.

**Opcje:**
- **A. Brak.**
- **B. Frakcje NPC w rzeczywistych układach** — kontrakty, reputacja, cła.
- **C. Frakcje graczy wybierane na starcie** (strony konfliktu).

**Rekomendacja:** **B.** Rozwiązuje zimny start rynku i daje krótkoterminowe cele.

**Decyzja:** —

### SOC-4. Projekty atanorów: prywatne, publiczne czy na sprzedaż? · P1

**Dlaczego to istotne:** deterministyczny silnik pozwala weryfikować projekty na serwerze, a dzielenie się rozwiązaniami to sprawdzony element social w tym gatunku (histogramy i GIF-y w *Opus Magnum*, `mechanics.md` §4). Handel projektami może jednak zniechęcić do samodzielnego projektowania.

**Opcje:**
- **A. Prywatne.**
- **B. Publiczne** — udostępnianie, rankingi dla każdej receptury (koszt / cykle / obszar), eksport GIF.
- **C. Rynek projektów** — sprzedaż licencji, tantiemy.

**Rekomendacja:** **B w MVP, C później**, po sprawdzeniu, czy handel nie zabija projektowania.

**Decyzja:** —

### SOC-5. Jak rywalizują gracze? · P2

**Dlaczego to istotne:** bez PvP rywalizacja potrzebuje innych kanałów. Rankingi i sezony to też główne powody, dla których gracze wracają.

**Opcje:**
- **A. Tylko rankingi projektów** atanorów.
- **B. A + sezonowe rankingi ekonomiczne** (wartość netto, wolumen handlu).
- **C. B + wyścigi o ograniczone zasoby** (unikalne złoża, miejsca w megaprojektach).

**Rekomendacja:** **B.** C po otwarciu wspólnych układów (wariant A).

**Decyzja:** —

### SOC-6. Jak komunikują się gracze? · P2

**Dlaczego to istotne:** czat wymaga moderacji (RODO, szkodliwe treści, nękanie), ale bez komunikacji korporacje i handel nie działają.

**Opcje:**
- **A. Bez czatu** — tylko interakcje systemowe (zlecenia, kontrakty, gotowe komunikaty).
- **B. Czat korporacji i hubu**, tablica kontraktów, powiadomienia asynchroniczne.
- **C. Pełny czat globalny** + wiadomości prywatne.

**Rekomendacja:** **B**, z podstawową moderacją (zgłoszenia, filtr, wyciszanie).

**Decyzja:** —

---

## 4. Multiplayer

### MP-1. Tryb synchroniczny, asynchroniczny czy hybrydowy? · P0

**Dlaczego to istotne:** to pytanie blokujące nr 3 z `1-game-description.md`. Wyznacza model serwera (zdarzeniowy czy tick 10–20 Hz), koszty, potrzebę netcode i doświadczenie gracza (czy gracze muszą być online jednocześnie).

**Opcje:**
- **A. Asynchroniczny** — wszystko przez zdarzenia i timery.
- **B. Synchroniczny** — pokoje czasu rzeczywistego.
- **C. Hybryda** — świat asynchroniczny + push na żywo (czat, notowania, powiadomienia).

**Rekomendacja:** **C.** Pozycje ciał i lotów klient liczy sam z czasu serwera (orbity są analityczne), więc nie trzeba przesyłać strumienia pozycji.

**Decyzja:** —

### MP-2. Co jest współdzielone, a co instancjonowane? · P0

**Dlaczego to istotne:** współdzielona przestrzeń daje interakcje emergentne (konkurencja o asteroidy, handel lokalny), ale komplikuje balans, ochronę nowych graczy i skalowanie.

**Opcje:**
- **A. Wszystko współdzielone** — galaktyka, układy, planety.
- **B. Galaktyka i układy wspólne**, powierzchnie planet prywatne.
- **C. Wspólna tylko warstwa galaktyczna** (rynek, korporacje, mapa hubów); układy to instancje graczy.

**Rekomendacja:** **C w MVP, docelowo B.**

**Decyzja:** —

### MP-3. Ilu graczy na świat? · P1

**Dlaczego to istotne:** skala wyznacza projekt rynku (płynność), mapy (liczba układów, zob. `WIZ-4`), serwera (jeden węzeł czy shardy) i budżet infrastruktury.

**Opcje:**
- **A. 50–200** — społeczność, serwer prywatny.
- **B. 1–5 tys. aktywnych.**
- **C. 10 tys. i więcej.**

**Rekomendacja:** **B jako cel projektowy**, na jednym węźle („single-node first” z `init.md`). A na pierwsze testy.

**Decyzja:** —

### MP-4. Świat trwały czy sezonowy? · P1

**Dlaczego to istotne:** w trwałych ekonomiach narasta inflacja i przewaga weteranów. Sezony to resetują, ale mogą zniechęcać do długoterminowych inwestycji.

**Opcje:**
- **A. Trwały**, bez resetów.
- **B. Sezony** (np. 2–4 miesiące) z trwałą metaprogresją (kosmetyka, osiągnięcia, biblioteka projektów).
- **C. Oba** — świat trwały i osobne serwery sezonowe.

**Rekomendacja:** **B.** Daje kontrolę nad balansem i naturalny rytm wydarzeń. Biblioteka projektów atanorów przechodzi między sezonami.

**Decyzja:** —

### MP-5. Czy kolonia rozwija się, gdy gracz jest offline? · P1

**Dlaczego to istotne:** wizja mówi, że „surowce kapią, gdy gracz śpi”. Pełny postęp offline daje mocny powód do powrotu, ale nagradza boty i wymaga ochrony przed stratami.

**Opcje:**
- **A. Tak, bez limitu.**
- **B. Tak, do limitu** (np. pojemność magazynu lub 8–12 h).
- **C. Nie** (gra sesyjna).

**Rekomendacja:** **B.** Limit magazynu to naturalny powód do powrotu i zarazem ujście.

**Decyzja:** —

### MP-6. Autorytatywność i ochrona przed oszustwami? · P1

**Dlaczego to istotne:** wszystkie PoC liczą stan po stronie klienta. W grze z rynkiem każda luka (fałszywe surowce, zmanipulowany projekt atanora) psuje ekonomię wszystkim graczom.

**Opcje:**
- **A. Pełny serwer autorytatywny** — klient tylko wizualizuje.
- **B. Klient liczy, serwer weryfikuje** (powtórki).
- **C. Hybryda** — ekonomia, loty i rynek na serwerze; projekt atanora liczony u klienta i weryfikowany na serwerze przez odtworzenie powtórki.

**Rekomendacja:** **C.**

**Decyzja:** —

---

## 5. Monetyzacja

### MON-1. Jaki model biznesowy? · P1

**Dlaczego to istotne:** model biznesowy wpływa na projekt ekonomii (gdzie nie wolno dawać przewagi za pieniądze), na tempo (timery), na wymagania techniczne (płatności, konta) i wiąże się z `WIZ-5`.

**Opcje:**
- **A. Premium** — jednorazowy zakup.
- **B. Free-to-play** z kosmetyką i przepustką sezonową.
- **C. Subskrypcja.**
- **D. Brak** — projekt niekomercyjny lub edukacyjny.

**Rekomendacja:** **B**, jeśli projekt jest komercyjny: pasuje do sezonów (`MP-4`) i do niskiego progu wejścia w przeglądarce. W przeciwnym razie D.

**Decyzja:** —

### MON-2. Gdzie leży granica pay-to-win? · P1

**Dlaczego to istotne:** w grze z rynkiem graczy każda płatna przewaga ekonomiczna przenosi się na innych (ceny, rankingi) i niszczy zaufanie.

**Opcje:**
- **A. Tylko kosmetyka** — skórki statków i baz, motywy atanora, ramki GIF.
- **B. A + wygoda bez przewagi** — dodatkowe sloty na projekty, statystyki.
- **C. B + przyspieszacze** timerów lub surowce.

**Rekomendacja:** **A lub B. C wykluczyć.**

**Decyzja:** —

### MON-3. Czy dopuszczamy wymianę waluty premium na rynku gry? · P2

**Dlaczego to istotne:** taka wymiana (model „licencji” znany z gier MMO) pozwala grającym za darmo zdobyć premium, a płacącym — walutę gry. Ogranicza zewnętrzny handel za prawdziwe pieniądze, ale wiąże ekonomię gry z realnym pieniądzem.

**Opcje:**
- **A. Nie.**
- **B. Tak, pod kontrolą** — ograniczenia, opłaty.

**Rekomendacja:** **A w MVP**, ponowna ocena na podstawie danych z ekonomii.

**Decyzja:** —

---

## 6. Zakres MVP

### MVP-1. Które warstwy wchodzą do MVP? · P1

**Dlaczego to istotne:** integracja trzech mechanik to największe ryzyko produktowe (R1 w analizie). MVP powinno je zweryfikować, ale zakres musi pasować do zespołu (`MVP-6`).

**Opcje:**
- **A. Wszystkie trzy w wersji minimalnej** (vertical slice) — 1 układ, Atanor z 3–5 recepturami, mapa z 3–5 układami i rynkiem NPC.
- **B. Kolonia + Atanor**, galaktyka jako prosty wybór układu.
- **C. Tylko kolonia** (3D) z ekonomią.

**Rekomendacja:** **A.** B i C nie sprawdzają, czy całość jest spójna i ciekawa.

**Decyzja:** —

### MVP-2. Jaki jest cel MVP? · P1

**Dlaczego to istotne:** cel wyznacza poziom dopracowania (jakość czy szybkość), grupę testową i metryki.

**Opcje:**
- **A. Walidacja fun factoru** — zamknięte testy, 20–100 osób.
- **B. Publiczny soft launch.**
- **C. Demo** dla wydawcy lub inwestora.

**Rekomendacja:** **A.**

**Decyzja:** —

### MVP-3. Ile trybu wieloosobowego w MVP? · P1

**Dlaczego to istotne:** pełny tryb wieloosobowy wydłuża MVP o serwer, konta, persystencję i moderację. Bez niego nie da się sprawdzić warstwy social.

**Opcje:**
- **A. Single-player + symulowany social** — rynek NPC, lokalne rankingi.
- **B. Asynchroniczny multiplayer** — konta, zapis na serwerze, wspólny rynek, rankingi projektów.
- **C. Pełny** — czat, korporacje, megaprojekty.

**Rekomendacja:** **B.**

**Decyzja:** —

### MVP-4. Ile treści w MVP? · P2

**Dlaczego to istotne:** treść (budowle, surowce, receptury, układy) to główny koszt balansu i grafiki.

**Opcje:**
- **A. Minimum** — zawartość PoC (3 surowce, 8 budowli, 4 poziomy Atanora).
- **B. Średnio** — 6–9 surowców, 10–12 budowli, 5–8 receptur, 5–10 układów.
- **C. Szeroko** — 15+ surowców, 20+ budowli, 20+ receptur.

**Rekomendacja:** **B.**

**Decyzja:** —

### MVP-5. Jak zmierzymy sukces MVP? · P2

**Dlaczego to istotne:** bez kryteriów nie da się podjąć decyzji „kontynuować, zmienić czy porzucić” na bramce stage-gate.

**Opcje:**
- **A. Jakościowo** — wywiady, obserwacja.
- **B. Ilościowo** — retencja D1/D7, długość sesji, odsetek graczy, którzy zbudowali własny atanor, liczba transakcji na gracza.
- **C. Oba.**

**Rekomendacja:** **C**, z telemetrią w kodzie od pierwszego buildu.

**Decyzja:** —

### MVP-6. Jaki mamy horyzont i zespół? · P1

**Dlaczego to istotne:** zakres wynikający z pozostałych odpowiedzi musi zmieścić się w zasobach. Bez tej informacji rekomendacje zakresu są tylko orientacyjne.

**Opcje:**
- **A.** ok. 3 miesiące, 1–2 osoby.
- **B.** ok. 6 miesięcy, 3–5 osób.
- **C.** 12+ miesięcy, większy zespół.

**Rekomendacja:** tu potrzebna jest informacja od zespołu. Jako założenie do planowania proponuję **B**. Przy A zakres trzeba zawęzić do `MVP-1` B lub C.

**Decyzja:** —

---

## 7. Technologia

### TECH-1. Model ruchu i upływu czasu na serwerze? · P0

**Dlaczego to istotne:** to pytanie blokujące nr 1 z wizji. 3D PoC jest bliski modelowi trajektoryjnemu (orbity analityczne, krzywe Béziera), ale czas przylotu wynika z korekty w każdej klatce, a produkcja z akumulatorów 1 Hz. Tak to nie zadziała na serwerze zdarzeniowym.

**Opcje:**
- **A. Model zdarzeniowy (trajektorie)** — ETA i koszty liczone przy rozkazie, kolejka priorytetowa zdarzeń, produkcja liczona leniwie jako tempo × czas.
- **B. Symulacja z tickiem** 10–20 Hz.

**Rekomendacja:** **A.** Wymaga zmiany modelu transferu w 3D PoC (stałe ETA, krzywa wyznaczana raz), ale klient dalej rysuje to samo.

**Decyzja:** —

### TECH-2. Język serwera i podział usług? · P1

**Dlaczego to istotne:** `init.md` preferuje Rust i wymaga uzasadnienia tej decyzji oraz wskazania ryzyk. Przy modelu zdarzeniowym słabnie argument „brak GC w pętli 60 Hz”, ale zostają inne: mały ślad pamięci, gęstość połączeń, praca na jednym węźle.

**Opcje:**
- **A. Rust dla całości** (Axum/Tokio).
- **B. Hybryda** — Rust dla rdzenia symulacji i weryfikacji, Java/Go/Node dla API social.
- **C. TypeScript/Node dla całości** — wspólny kod z klientem.

**Rekomendacja:** **A w postaci modularnego monolitu.** Jeden język serwera i mniejszy koszt utrzymania na jednym węźle. Ryzyka: wolniejsze tempo developmentu i podwójna implementacja logiki (`TECH-3`). Ostateczne rozstrzygnięcie należy do `ARCHITECTURE-DISCOVERY.md`.

**Decyzja:** —

### TECH-3. Jak współdzielimy logikę między klientem (TS) a serwerem? · P1

**Dlaczego to istotne:** klient musi przewidywać (podgląd kosztu, symulacja atanora, okna transferowe), a serwer rozstrzygać. Dwie niezależne implementacje w końcu się rozjadą.

**Opcje:**
- **A. Dwie implementacje** + wspólne wektory testowe (złote powtórki).
- **B. Rdzeń w Rust** skompilowany do WASM dla klienta.
- **C. Serwer w TS** (Node) z tym samym kodem domenowym.

**Rekomendacja:** **B dla silnika Atanora i formuł ekonomii, A jako siatka bezpieczeństwa.** Silnik Atanora jest mały i deterministyczny, więc to dobry kandydat na pierwszy moduł WASM. Jeśli `TECH-2` = C, pytanie odpada.

**Decyzja:** —

### TECH-4. Framework frontendu? · P2

**Dlaczego to istotne:** wszystkie PoC używają Angulara 22 (zoneless, Signals), a w 3D PoC ten wzorzec jest sprawdzony (60 fps, pętla gry poza detekcją zmian). Zmiana frameworka oznacza przepisanie UI.

**Opcje:**
- **A. Angular** — jak w PoC.
- **B. Inny** (React, Svelte, Solid).

**Rekomendacja:** **A.**

**Decyzja:** —

### TECH-5. Jeden renderer czy dwa? · P2

**Dlaczego to istotne:** 3D PoC i galaktyka używają Three.js, Atanor — PixiJS. Dwa silniki to większy bundle (budżet pierwszego pobrania z `init.md` to 15–25 MB) i ryzyko dwóch kontekstów WebGL naraz.

**Opcje:**
- **A. Three.js + PixiJS** — każdy w osobnym, leniwie ładowanym widoku (jeden kontekst naraz).
- **B. Wszystko w Three.js** — Atanor w kamerze ortograficznej.
- **C. Wszystko w Pixi** poza widokiem 3D.

**Rekomendacja:** **A na start**, bo zachowuje gotowy renderer Atanora; zmierzyć bundle. B, jeśli pomiar przekroczy budżet.

**Decyzja:** —

### TECH-6. Tryby widoku: ciągła scena czy osobne widoki? · P2

**Dlaczego to istotne:** wizja zakłada trzy osobne tryby (planeta, układ, pas asteroid), a 3D PoC pokazuje kafelki planety i cały układ w jednej scenie przy 60 fps i 19 draw calls (wg `POC-PLAN.md`).

**Opcje:**
- **A. Jedna ciągła scena układu** (jak w PoC) + osobny widok galaktyki + osobny Atanor.
- **B. Trzy osobne tryby** jak w wizji + galaktyka + Atanor.

**Rekomendacja:** **A.** PoC potwierdza, że to wykonalne. Osobny tryb tylko dla pasa asteroid (instancing), jeśli taki się pojawi.

**Decyzja:** —

### TECH-7. Pipeline assetów? · P2

**Dlaczego to istotne:** PoC używa glTF + `.bin` + PNG (ok. 0,5 MB, wystarczy na prototyp). Docelowy budżet wymaga `.glb` z kompresją meshopt/Draco i tekstur KTX2 (`init.md`).

**Opcje:**
- **A. Ręczna konwersja.**
- **B. Automatyczny krok w buildzie** — np. gltf-transform (meshopt + KTX2) i walidacja budżetu trójkątów, na wzór `model-library.spec.ts`.
- **C. Bez kompresji**, dopóki assety są małe.

**Rekomendacja:** **B**, z testem budżetu w CI wzorowanym na `model-library.spec.ts`.

**Decyzja:** —

### TECH-8. Reprezentacja planety? · P2

**Dlaczego to istotne:** to pytanie blokujące nr 2 z wizji. 3D PoC odpowiada na nie siatką Goldberga (642 kafelki, wybieranie myszą, budowa, łazik). Trzeba to potwierdzić albo odrzucić.

**Opcje:**
- **A. Siatka Goldberga** — jak w PoC.
- **B. Ograniczona liczba slotów** (węzłów) na globie.
- **C. Panel zarządzania** z tłem 3D.

**Rekomendacja:** **A.** Działa i daje decyzje przestrzenne (złoża, sąsiedztwo). Na małych ciałach rozważyć mniejsze n.

**Decyzja:** —

### TECH-9. Persystencja? · P2

**Dlaczego to istotne:** reducer i zdarzenia domenowe w 3D PoC prowadzą naturalnie do event sourcingu. Log zdarzeń ułatwia debugowanie ekonomii, ale wymaga snapshotów i migracji.

**Opcje:**
- **A. PostgreSQL ze stanem i logiem zdarzeń** ekonomicznych (event sourcing z okresowymi snapshotami).
- **B. PostgreSQL tylko z bieżącym stanem.**
- **C. Baza NoSQL / klucz-wartość.**

**Rekomendacja:** **A.** Redis opcjonalnie dla sesji i kolejek, zgodnie z `init.md`.

**Decyzja:** —

---

## 8. Niejasności w PoC (pytania do autorów)

### POC-1. Jaką mechanikę miał sprawdzać `space-galaxy-poc`? · P0

**Dlaczego to istotne:** kod nie zawiera żadnej mechaniki, tylko wizualizację i kartę gwiazdy. Nie wiadomo, czy chodziło o eksplorację, ekspansję, nawigację międzygwiezdną, rynek czy edukację.

**Opcje:**
- **A. Eksploracja** — odkrywanie układów.
- **B. Ekspansja i kolonizacja.**
- **C. Nawigacja i trasy** (handel).
- **D. Tylko prezentacja lub edukacja.**

**Rekomendacja:** traktować PoC jako bazę dla **B + C** (zgodnie z `WIZ-3`). Prosimy autorów o potwierdzenie intencji.

**Decyzja:** —

### POC-2. Co przedstawia `space-galaxy-poc/prtscr.png`? · P2

**Dlaczego to istotne:** zrzut pokazuje funkcje, których nie ma w kodzie: wycieczkę „Take a tour”, suwak skali, kąty 90° i 120°, dźwięk, gwiazdy spoza zbioru 41. Jeśli to docelowy wygląd, zmienia się zakres prac.

**Opcje:**
- **A. Docelowy wygląd i funkcje.**
- **B. Inspiracja.**
- **C. Przypadkowy plik.**

**Rekomendacja:** traktować jako **B** do czasu potwierdzenia.

**Decyzja:** —

### POC-3. Czy dane gwiazd mają być poprawne astronomicznie? · P1

**Dlaczego to istotne:** dane zawierają niespójności. Komentarz mówi o skali 8, a kod używa 16. Współrzędne nie zgadzają się z polem `distance` m.in. dla Vegi, Altaira i Deneba. Deneb leży poza zasięgiem kamery. Jeśli odległości mają wyznaczać czasy lotów i ceny transportu, błędy przeniosą się na ekonomię.

**Opcje:**
- **A. Tak** — import z katalogu (np. HYG lub Gaia), z weryfikacją licencji.
- **B. Nie** — mapa stylizowana.

**Rekomendacja:** **A**, jeśli `WIZ-4` = A lub C.

**Decyzja:** —

### POC-4. Czy gotowe rozwiązania poziomów Atanora są celowe? · P1

**Dlaczego to istotne:** każdy poziom startuje z gotowym programem, więc gracz nie musi niczego projektować. Do tego rozwiązanie L2 kończy się kolizją (pomiar). Nie wiadomo, czy to zamierzony tutorial, czy tymczasowe dane testowe.

**Opcje:**
- **A. Tutorial** z gotowym rozwiązaniem do obejrzenia.
- **B. Puste poziomy** — gracz projektuje od zera.
- **C. Częściowe podpowiedzi** — np. rozstawione ramiona bez programu.

**Rekomendacja:** **C** dla pierwszych receptur, **B** dla kolejnych. L2 do naprawy.

**Decyzja:** —

### POC-5. Jak definiujemy metryki Atanora? · P1

**Dlaczego to istotne:** metryki są rdzeniem oceny, a w propozycji integracji przekładają się na przepustowość, koszt i zajęty teren. Dziś „CYKLE” pokazuje pozycję głowicy osi czasu (po REPEAT wraca do 0), szyny są darmowe, a obszar jest liczony z pozycji na końcu ticka, a nie z przebytej drogi.

**Opcje:**
- **A. Definicje jak w *Opus Magnum*** — cykle do wyprodukowania N sztuk, koszt wszystkich elementów łącznie z szynami, obszar jako pola, przez które cokolwiek przeszło.
- **B. Własne definicje pod ekonomię** — np. cykle na sztukę w stanie ustalonym.

**Rekomendacja:** **B**, z metryką „cykle na sztukę w stanie ustalonym”, bo to ona przekłada się na przepustowość. Koszt z szynami. Obszar liczony z przebytej drogi.

**Decyzja:** —

### POC-6. Które elementy mechaniki Atanora są wymagane? · P1

**Dlaczego to istotne:** `mechanics.md` i `task.md` opisują więcej, niż jest w kodzie: wiązania rzędu 2 i 3, ramiona wieloramienne, kalcynację, duplikację, kolizje trajektorii, histogramy, eksport GIF. Każdy element kosztuje czas pracy i podnosi złożoność dla gracza.

**Opcje:**
- **A. Minimum** — obecny zestaw + glif transmutacji i szyny w edytorze + kolizje trajektorii.
- **B. Pełny zestaw** z `mechanics.md`.
- **C. Zestaw własny**, dobrany do receptur kosmicznych.

**Rekomendacja:** **A w MVP**, potem C.

**Decyzja:** —

### POC-7. Tematyka Atanora: alchemia czy kosmiczna rafineria? · P1

**Dlaczego to istotne:** atomy alchemiczne (ołów, złoto, sól, rtęć) nie łączą się z surowcami z 3D PoC (Ferryt, Kriol, Silicyt). Tematyka wpływa na nazewnictwo, grafikę i spójność świata.

**Opcje:**
- **A. Zostaje alchemia** — stylizacja na „kosmiczną alchemię”.
- **B. Reskin na rafinerię lub syntezę** — atomy to surowce i półprodukty z ekonomii.
- **C. Hybryda** — nazwa „atanor” zostaje, mechanika i surowce są kosmiczne.

**Rekomendacja:** **C.**

**Decyzja:** —

### POC-8. Jaka ma być funkcja Habitatu i Magazynu? · P1

**Dlaczego to istotne:** w 3D PoC obie budowle tylko kosztują i zużywają moc, ale nic nie robią (magazyn nie ma limitu, nie ma populacji).

**Opcje:**
- **A. Habitat = siła robocza** (limit liczby budowli lub maszyn), **Magazyn = pojemność magazynu.**
- **B. Usunąć**, dopóki nie będą potrzebne.
- **C. Inna funkcja** — prosimy autorów o intencję.

**Rekomendacja:** **A.** Obie budowle stają się wtedy elementem ujść i planowania (`EKO-5`).

**Decyzja:** —

### POC-9. Do czego miały służyć kredyty? · P2

**Dlaczego to istotne:** `credits = signal(1000)` jest zadeklarowane i nieużywane. `staff.md.txt` przewidywał kredyty w górnym pasku.

**Opcje:**
- **A. Waluta rynku** (`EKO-7` = B).
- **B. Usunąć.**

**Rekomendacja:** zgodnie z decyzją w `EKO-7`.

**Decyzja:** —

### POC-10. Jaka jest rola łazika? · P1

**Dlaczego to istotne:** łazik tylko jeździ po kafelkach (ścieżka BFS, blokowana przez budowle) i nie ma wpływu na ekonomię.

**Opcje:**
- **A. Eksploracja** — odkrywanie złóż (mgła wojny na kafelkach).
- **B. Konstruktor** — budowa tylko w zasięgu łazika (czas dojazdu = czas budowy).
- **C. Transport powierzchniowy.**
- **D. Usunąć.**

**Rekomendacja:** **A + B.** Nadaje znaczenie czasowi i przestrzeni na planecie.

**Decyzja:** —

### POC-11. Jaką rolę mają Księżyc i loty wewnątrz układu? · P1

**Dlaczego to istotne:** statek nie ma nic do zrobienia na Księżycu (może tylko stać), a złoża Księżyca (wyłącznie Silicyt) trafiają od razu do globalnego magazynu. Scenariusz Planeta → Księżyc → Asteroida ze `staff.md.txt` był demonstracją, a nie mechaniką.

**Opcje:**
- **A. Księżyc = osobna kolonia** z własnym magazynem (`EKO-3` = B).
- **B. Stacja przeładunkowa lub tankowania** — tańsze okna do asteroid.
- **C. Tylko punkt orientacyjny.**

**Rekomendacja:** **A + B.**

**Decyzja:** —

### POC-12. Który dokument jest źródłem prawdy dla zasad gry? · P1

**Dlaczego to istotne:** `CLAUDE.md` w 3D PoC mówi, że przy rozbieżności z planem „wygrywa kod”. `staff.md.txt` nazywa siebie wiążącą specyfikacją. `1-game-description.md` to wizja z innymi założeniami (energia, tempo). Bez ustalonej hierarchii dokumentów decyzje będą się rozjeżdżać.

**Opcje:**
- **A. Nowy GDD** — wizja (`1-game-description.md`) + zaakceptowane odpowiedzi z tego dokumentu; PoC to materiał referencyjny.
- **B. Specyfikacje PoC** pozostają wiążące.

**Rekomendacja:** **A.**

**Decyzja:** —

### POC-13. Które elementy 3D PoC są kluczową mechaniką, a które tłem? · P1

**Dlaczego to istotne:** 3D PoC łączy dwie mechaniki: budowę na kafelkach (z energią) i logistykę orbitalną. Pomiar pokazuje, że przy obecnym balansie logistyka nic nie daje: kursy statkiem przynoszą średnio tyle, co jedna kopalnia. Trzeba wiedzieć, na którą z nich stawiamy.

**Opcje:**
- **A. Budowa i energia.**
- **B. Logistyka orbitalna.**
- **C. Obie równorzędnie** — logistyka po przejściu na magazyn lokalny.

**Rekomendacja:** **C** (wymaga `EKO-3` = B).

**Decyzja:** —


Tematyka kosmicznej strategii ekonomicznej to **jeden z najlepszych możliwych wyborów pod kątem ograniczeń WebGL/WebGPU oraz architektury backendowej**. Pustka kosmiczna eliminuje najtrudniejsze wyzwania grafiki webowej (gęsta roślinność, skomplikowane cieniowanie terenu, occlusion culling w zamkniętych przestrzeniach).

Poniżej znajduje się usystematyzowana analiza zasad gry (Game Design) powiązana bezpośrednio z ograniczeniami technicznymi 3D i serwera, przygotowująca projekt do budowy prototypu (POC).

---

### 1. Game Design: Pętla Rozgrywki (Core Loop) i Ekonomia

Ekonomia kosmiczna musi opierać się na twardych ograniczeniach przepustowości, aby wymuszać na graczu planowanie, a nie tylko bezmyślne klikanie:

```
[Surowce Tier 1 (Planeta)] ──> [Budowa Elektrowni / Kopalń] ──> [Deficyt Energii]
           │                                                            │
           ▼                                                            ▼
[Stocznia & Pierwsze Statki] <─────────────────────────── [Balansowanie Sieci Energetycznej]
           │
           ├─> [Wydobycie Asteroid] ──> Surowce Rzadkie (Tytan, Platyna)
           │                                    │
           ▼                                    ▼
[Kolonizacja Nowych Planet] ────────> [Surowce Egzotyczne (Kryształy, Antymateria)]
           │                                    │
           └────────────> [Megastruktury / Stacje / Zaawansowana Flota]

```

* **Energia jako główny regulator tempa (Bottleneck):**
* Każdy budynek na planecie, satelita i stacja kosmiczna ma koszt utrzymania w energii ($E_{upkeep}$).
* Wyczerpanie energii nie zatrzymuje gry, ale drastycznie obniża wydajność kopalń (np. do 20%) i wyłącza tarcze orbitalne. Wymusza to inwestycje w panele słoneczne (efektywne blisko gwiazdy) lub reaktory fuzyjne (wymagające rzadkich izotopów z gazowych olbrzymów/asteroid).


* **Trzy Poziomy Infrastruktury:**
1. *Powierzchnia Planety:* Kopalnie bazowe (żelazo, krzem, woda), elektrownie, centra badawcze, silosy magazynowe.
2. *Orbita:* Satelity energetyczne (przesył mikrofalowy), stocznie orbitalne, stacje obronne, platformy przeładunkowe.
3. *Głęboki Kosmos (Deep Space):* Pasy asteroid (ruchome bazy wydobywcze), punkty tranzytowe, megastruktury badawcze.


* **Pętla Retencji i Elementy Społecznościowe:**
* **Asynchroniczny Rynek Galaktyczny:** Gracz nie musi posiadać wszystkich planet; układ gwiezdny bogaty w krzem handluje z graczem kolonizującym lodowe globy bogate w wodę i deuter.
* **Sojusze / Korporacje:** Budowa wspólnych Megastruktur (np. Gwiezdna Brama skracająca czas lotu flot w sojuszu, stacje badawcze dające pasywne bonusy wszystkim członkom).
* **Mechanika Powrotu:** Produkcja i loty flot trwają w czasie rzeczywistym (np. ekspedycja na pas asteroid: 20 minut; kolonizacja odległej planety: 3 godziny).



---

### 2. Architektura Web 3D: Przekucie Ograniczeń Przeglądarki w Styl Gry

Przeglądarka ma ograniczony budżet pamięci i draw calls. Kosmos pozwala na radykalne optymalizacje:

* **Separacja Poziomów Skali (Three-Tier Camera System):**
* Zamiast płynnego, bezszwowego zoomu z powierzchni planety w przestrzeń kosmiczną (co zarzyna WebGL przez streaming tekstur), stosujemy **trzy odrębne tryby widoku**:
1. *Widok Planety/Bazy:* Kula planety w centrum z proceduralnym shaderem atmosfery + uproszczone heksy/sloty budynków na powierzchni.
2. *Widok Układu Słonecznego:* Słońce (1 dynamiczne światło), orbity narysowane liniami wektorowymi, planety jako małe sfery, statki poruszające się po krzywych.
3. *Pas Asteroid (Mining View):* Zastosowanie `InstancedMesh`. Renderowanie 5 000 asteroid w **dokładnie jednym draw callu**, przy użyciu zaledwie 3 wariantów siatek 3D z losową skalą i rotacją na GPU.




* **Budżet Modeli Statków i Stacji:**
* Format: wyłącznie `.glb` skompresowane przez `meshopt` / `draco`.
* Materiały: 1 wspólny atlas tekstur PBR (KTX2/Basis) dla całej floty danej frakcji. Dzięki temu 50 statków na ekranie to 1 draw call (`BatchedMesh` w Three.js / Babylon.js).



---

### 3. Model Serwera: Wpływ na Wybór Java vs. Rust i Single-Node

W tym typie gry kluczowa jest decyzja, **jak traktujemy ruch statków i upływ czasu**:

#### Wariant A: Ruch Trajektoryjny / Event-Driven (Model OGame / Stellaris)

Statki nie są symulowane klatka po klatce fizyką newtonowską. Wysłanie floty to rekord w bazie: `start_time`, `duration`, `arrival_time`, `origin`, `target`.

* **Wpływ na serwer:** Obciążenie CPU serwera jest niemal zerowe. Cała ekonomia opiera się na **Kolejce Czasowej (Priority Queue)**. Serwer nie liczy nic w pętli 60 Hz – budzi się tylko wtedy, gdy kończy się budowa lub flota dolatuje do celu.
* **Werdykt Java vs. Rust:**
* **Java:** Bardzo szybka implementacja logiki rynkowej i bazodanowej. Jednak sam JVM i biblioteki pochłoną min. 500 MB – 1 GB RAM na starcie.
* **Rust:** Taka pętla zdarzeń na bibliotece `tokio` zużywa **poniżej 25 MB RAM** i obsługuje miliony oczekujących timerów bez mrugnięcia okiem. Na pojedynczym serwerze za kilkadziesiąt złotych można utrzymać całą globalną grę.



#### Wariant B: Ruch Czasu Rzeczywistego / Fizyka Wektorowa (RTS w kosmosie)

Statki poruszają się w czasie rzeczywistym w przestrzeni 3D, omijają przeszkody, wchodzą w zasięg radarów i strzelają z uwzględnieniem pozycji.

* **Wpływ na serwer:** Wymaga stałej pętli symulacji (Tick Rate np. 10–20 Hz).
* **Werdykt Java vs. Rust:**
* **Zdecydowanie Rust.** Ciągła alokacja wektorów pozycji tysięcy statków w Javie wygeneruje presję na Garbage Collector, powodując okresowe mikro-zacięcia (stuttering) w synchronizacji sieciowej. Rust gwarantuje deterministyczny czas klatki.



---

### 4. Krytyczne Pytania Blokujące (Przed rozpoczęciem POC)

Przed zakodowaniem pierwszego prototypu musimy ustalić fundamenty mechaniki:

1. **Model Poruszania Floty:**
* Czy gracz wydaje rozkaz "leć na asteroidę X" i widzi pasek postępu / z góry wyliczoną trajektorię (Wariant A), czy steruje statkiem / flotą w przestrzeni 3D w czasie rzeczywistym z kolizjami i fizyką (Wariant B)?


2. **Reprezentacja Planety:**
* Czy powierzchnia planety to siatka pól/heksów (jak w *Civilization* / *Stellaris*), czy stylizowany glob 3D z ograniczoną liczbą punktów rozbudowy (nodów), czy czysty panel zarządzania z estetycznym tłem 3D?


3. **Wielodostępność i Czas Świata:**
* Czy czas płynie nieprzerwanie (gra działa 24/7 na serwerze, surowce kapią, gdy gracz śpi), czy jest to symulacja sesyjna (rozgrywka trwa np. 60 minut w pokoju z kilkoma graczami)?


4. **Charakter Interakcji:**
* Czy skupiamy się w 100% na ekonomii, handlu i kooperacji (budowa imperium, rynek, wspólne megaprojekty), czy planujemy bezpośrednią walkę PvP i niszczenie baz innych graczy?


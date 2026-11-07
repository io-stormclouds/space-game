**Star-Atanor** Projektujesz PoC gra w celach edukacujnych w przeglądarce internetowej Mechanizm to  logiczno-inżynieryjnej o otwartej strukturze (*open-ended*), w której gracz wciela się w inżyniera projektującego maszyny przekształcające surowce w pożądane produkty związku alchemicznych/pierwiasktów. Zamiast szukać jednego, z góry narzuconego rozwiązania, gracz ma pełną swobodę w budowie mechanizmu, a jedynym warunkiem zaliczenia etapu jest wyprodukowanie określonej liczby kopii docelowego związku. 

Wykorzytaj Angular oraz PixiJS 

Główne filary mechaniki rozgrywki:

### 1. Przestrzeń robocza i elementy wejścia/wyjścia

* **Siatka heksagonalna:** Cała akcja rozgrywa się na planszy opartej na sześciokątnych polach. W większości poziomów przestrzeń jest teoretycznie nieskończona, co daje pełną swobodę w rozmieszczaniu podzespołów.
* **Reagenty (wejścia) i produkty (wyjścia):** Każdy poziom określa, jakimi atomami/cząsteczkami dysponujesz na wejściu (np. żywioły: woda, ogień, ziemia, powietrze; sól; rtęć; metale jak ołów, cyna, złoto) oraz jaki związek końcowy musisz złożyć i dostarczyć do strefy wyjściowej.

### 2. Narzędzia i komponenty mechaniczne

Gracz buduje aparaturę, kupując i układając na planszy komponenty fizyczne:

* **Ramiona mechaniczne:** Podstawowe narzędzie manipulacji. Występują w różnych wariantach – o stałej długości (1, 2, 3 pola), wieloramienne (obracające się krzyżaki) oraz teleskopowe (tłoki, które mogą się wydłużać i skracać).
* **Szyny (Tracks):** Ścieżki, po których podstawy ramion mogą się przesuwać tam i z powrotem, drastycznie zwiększając zasięg maszyny.
* **Glify transmutacji i łączenia:**
* **Łączniki i rozdzielacze (Bonding / Unbonding):** Tworzą lub zrywają wiązania pojedyncze, podwójne bądź potrójne między stykającymi się atomami.
* **Glify alchemiczne:** Odpowiadają za modyfikację atomów, np. transmutację metali (podnoszenie ołowiu do miedzi, żelaza i ostatecznie złota za pomocą rtęci), kalcynację (zamiana żywiołów w sól) czy duplikację.



### 3. Programowanie sekwencyjne (Oś czasu)

Mechanizm nie działa automatycznie – każde ramię musi zostać zaprogramowane na osi czasu przypominającej taśmę montażową lub partyturę muzyczną:

* **Dyskretne cykle:** Czas w grze podzielony jest na jednostki (cykle/tiki). W jednym cyklu ramię może wykonać jedną akcję: chwycić atom, puścić, obrócić w lewo/prawo, wydłużyć/skrócić, przesunąć się po szynie lub obrócić całą trzymaną cząsteczkę wokół uchwytu.
* **Równoległość i pętle (*loops*):** Wszystkie ramiona wykonują instrukcje symultanicznie. Gracz układa program w pętlę powtarzającą cykl produkcyjny, dbając o to, by ruchome elementy nie zderzyły się ze sobą w przestrzeni ani nie zablokowały.

### 4. Optymalizacja i histogramy

W *Opus Magnum* nie da się „przegrać” – po zbudowaniu działającej maszyny gra generuje ocenę w oparciu o trzy niezależne, często wykluczające się parametry:

* **Koszt (Cost):** Sumaryczna cena wszystkich użytych ramion, szyn i glifów.
* **Cykle (Cycles):** Czas (liczba jednostek czasu) potrzebny do wyprodukowania wymaganej partii towaru (najszybsza przepustowość).
* **Obszar (Area):** Liczba heksagonalnych pól siatki, przez które przemieściły się komponenty maszyny lub manipulowane atomy.

Wyniki gracza są zestawiane na dynamicznych histogramach z osiągnięciami społeczności i znajomych ze Steam. Zachęca to do tworzenia zupełnie różnych wariantów maszyn dla tego samego zadania: miniaturowych, tanich i wolnych, albo potężnych, ultraszybkich „fabryk” działających równolegle.

Gra posiada również wbudowane narzędzie do natychmiastowego eksportu działającej maszyny do zapętlonego formatu **.GIF**, co stało się jednym z jej najbardziej rozpoznawalnych elementów społecznościowych.
### 1. Techniczny mechanizm działania gry (Model silnika)

Od strony inżynierii oprogramowania gra typu *Opus Magnum* to **dyskretny, deterministyczny symulator stanów oparty na grafach i siatce heksagonalnej**. Złożony mechanizm dzieli się na cztery główne podsystemy:

#### Układ współrzędnych i plansza

* **Współrzędne osiowe (Axial Coordinates $q, r$):** Najwygodniejszy model matematyczny dla heksów o orientacji pionowej (*pointy-topped* lub *flat-topped*). Trzecią współrzędną wylicza się jako $s = -q - r$.
* **Siatka obiektów:** Macierz rzadka lub tablica asocjacyjna przechowująca referencje do pól statycznych:
* Wejścia (*Reagents*) – źródła podające atomy.
* Wyjścia (*Products*) – pochłaniacze walidujące strukturę cząsteczki.
* Glify (*Glyphs*) – pola funkcyjne (wiązanie, rozrywanie, transmutacja).
* Szyny (*Tracks*) – graf skierowany wyznaczający dopuszczalne wektory przesunięć podstawy ramion.



#### Model cząsteczek (Dynamiczne grafy nieskierowane)

* **Atomy jako węzły (Nodes):** Posiadają unikalne ID, typ elementarny (np. Sól, Ogień, Ołów) oraz aktualne współrzędne $(q, r)$.
* **Wiązania jako krawędzie (Edges):** Wiązania o określonym rzędzie (pojedyncze, podwójne, potrójne).
* **Cząsteczka (*Molecule*):** Spójna składowa grafu. Gdy ramię mechaniczne chwyta pojedynczy atom i wykonuje obrót lub translację, przekształceniu afinicznemu ulega **cała składowa grafu**. Wszelkie kolizje sprawdzane są dla wszystkich węzłów danej cząsteczki jednocześnie.

#### Architektura ramion mechanicznych (*Manipulator Entities*)

* Parametry: pozycja bazowa $(q_b, r_b)$, kąt obrotu $\theta \in \{0, 1, 2, 3, 4, 5\}$, długość zasięgu $L$, stan chwytaka (`true`/`false`), wskaźnik trzymanego węzła.
* Dopuszczalne akcje elementarne:
* `GRAB` / `DROP` – zmiana stanu chwytaka.
* `ROTATE_CW` / `ROTATE_CCW` – obrót ramienia (wraz z trzymaną cząsteczką) wokół bazy o 60°.
* `PIVOT_CW` / `PIVOT_CCW` – obrót trzymanej cząsteczki wokół punktu chwytu (ramię pozostaje w miejscu).
* `EXTEND` / `RETRACT` – zmiana długości ramienia (w przypadku tłoków).
* `TRACK_POS` / `TRACK_NEG` – translacja bazy wzdłuż szyny.



#### Deterministyczna pętla symulacji (Tick Pipeline)

Każdy cykl dyskretny ($t \to t+1$) musi być przetwarzany w ściśle zdefiniowanych podfazach, aby wyeliminować błędy kolejnościowe (*race conditions*):

1. **Faza rozkazów (Dispatch):** Odczytanie instrukcji przypisanych do ramion w kolumnie czasu $t$.
2. **Faza kinematyki (Kinematic Transformation):** Przeliczenie nowych planowanych współrzędnych baz ramion oraz chwyconych cząsteczek.
3. **Faza detekcji kolizji (Collision Resolution):**
* Sprawdzenie, czy dwa atomy nie nakładają się na to samo pole $(q, r)$.
* Sprawdzenie, czy trajektorie ruchu nie przecinają się nielegalnie w trakcie ruchu.
* W razie kolizji: natychmiastowe przerwanie symulacji ze stanem błędu (*Jam/Crash*).


4. **Faza reakcji i glifów (Interaction):**
* Wykrycie stykających się atomów leżących na glifach wiązania $\to$ dodanie krawędzi do grafu cząsteczki.
* Obsługa glifów rozrywania $\to$ usunięcie krawędzi (możliwy podział cząsteczki na dwa osobne podgrafy).
* Sprawdzenie pól wyjścia $\to$ jeśli dostarczona cząsteczka jest izomorficzna z grafem docelowym, zostaje skonsumowana, a licznik postępu poziomu wzrasta.


5. **Inkrementacja cyklu ($t = t + 1$):** Zapętlenie taśmy rozkazów w oparciu o globalny marker `REPEAT`.

--
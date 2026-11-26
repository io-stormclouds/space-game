# E1 · Niezależny przegląd kodu obu zespołów (miara „jakość”, plan 07 §5)

> **Data:** 2026-11-26. **Wykonanie:** dwóch recenzentów (osobne agenty, ten sam opis zadania, dostęp tylko do jednej gałęzi i do kontraktu z `2494ede`; bez raportów koordynatora i bez wiedzy o drugim zespole). Tylko odczyt kodu, uruchomienia testów, sondy w katalogu tymczasowym.
> **Skala wag:** KRYTYCZNE = błędny wynik / niedeterminizm / naruszony kontrakt; POWAŻNE = ryzyko błędu, osłabiony test, wyjście poza zakres; DROBNE = jakość; UWAGA = do rozważenia.

## Podsumowanie

| | `auto/E1` (Fable 5.2) | `auto/E1-ref` (Opus 5.5) |
|---|---|---|
| KRYTYCZNE / POWAŻNE | 0 / 0 | 0 / 0 |
| DROBNE / UWAGA | 3 / 6 | 5 / 6 |
| Diff `2494ede..HEAD` | 24 pliki, +3726 / −48 | 26 plików, +2564 / −51 |
| Pliki poza zakresem | `server/Cargo.lock` (+2, krawędzie zależności ścieżkowych) | `server/Cargo.lock` (+2, to samo) |
| Testy akceptacyjne vs baza | tylko 26 × zdjęte `#[ignore]` | tylko 26 × zdjęte `#[ignore]` |
| Złote powtórki, `vectors.json` | bez zmian | bez zmian |
| `cargo test -p game-core --test galaxy_gen` | 26/26, 2,5 s (debug) | 26/26, 5,5 s (debug) |
| Zgodność `wasm32` (niezależnie) | plik wzorcowy równy bajt w bajt (666 054 B) | plik wzorcowy równy (667 109 B) + dodatkowe żądanie (ziarno 987654321, ujemne komórki, 300 układów) równe natywnie i w wasm |
| Zdegenerowane parametry | bez paniki i pętli; materiał zastępczy, gdy brak złóż | po cichu: zawieszenie `place_account` przy `max_ly = ∞` / `cell_ly = 0`, puste `deposit_weights` (wbrew kontraktowi) przy udziałach 0, utrata cywilizacji przy `max_planets = 1` |

**Wniosek koordynatora (PROPOZYCJA):** obie implementacje są poprawne dla parametrów domyślnych; różnice dotyczą odporności na parametry zdegenerowane (przewaga `auto/E1`) i wydajności rozmieszczania kont (koszt `auto/E1` rośnie z liczbą kont, do zmierzenia przed E3/E4). Zgodnie z decyzją człowieka z 2026-11-26 („rozstrzygnie przegląd; Fable zostaje, chyba że przegląd znajdzie poważniejsze błędy”) na `main` zostaje `auto/E1`. `auto/E1-ref` jest na `origin` jako gałąź archiwalna.

## `auto/E1` (Fable 5.2)

| Waga | Miejsce | Opis | Dowód |
|---|---|---|---|
| UWAGA | `generator/mod.rs:246-250` vs `cell_stars.rs:135-146` | `cell_of` liczy komórkę dzieleniem, krawędzie komórki mnożeniem; dla `cell_ly` niebędącego dokładną liczbą binarną gwiazda przy samej krawędzi może mieć `cell_of(pos) != key.cell` | sonda node: `cell_ly` 10, 4, 5, 7, 12,5 → 0 rozbieżności; 3,3 → 600, 0,1 → 615 na współrzędnych −5000..5000 |
| UWAGA | `system.rs:347-381` | materiał zastępczy, gdy ciało nie wylosuje złoża, podnosi faktyczny udział ponad `DepositParams::share` | przy domyślnych udziałach P(brak) ≈ 0,05 %; przy 7 × 0,1 udział ≈ 0,168 zamiast 0,1 (wymusza to kontrakt „at least one entry”) |
| UWAGA | `placement.rs:122-202` | brak pamięci podręcznej między wywołaniami; koszt jednego wywołania liniowy z liczbą kont, łącznie kwadratowy | 500 kont: cały plik testów 2,5 s debug; zmierzyć przed E3/E4 |
| UWAGA | `wasm-host/src/galaxy-gen.spec.ts:76` | bez zbudowanego modułu test `wasm32` jest cicho pomijany | bramka buduje moduł przed vitest; samo `npm run test:unit` na czystym drzewie nie sprawdza |
| UWAGA | `conformance/vectors/galaxy-gen.json` | układy wzorcowe tylko z komórek x = 2000..2099, y = z = 0; `place_account` bez porównania bajtowego | kontrakt E1-09 spełniony (50 komórek, 200 układów) |
| UWAGA | `server/Cargo.lock` (+2) | jedyny plik spoza zakresu | tylko krawędzie `conformance → game-wasm`, `game-wasm → game-core`; bez zmian wersji |
| DROBNE | `system.rs:143-149` | kontrola „olbrzym poniżej linii śniegu” odrzuca olbrzyma po przycięciu ciał wewnętrznych | osiągalna tylko przy `snow_line_insolation < 0` |
| DROBNE | `cell_stars.rs:63`, `system.rs:114` | martwe gałęzie bez komentarza | odczyt kodu |
| DROBNE | `system.rs:229-231` | komentarz o kolejności losowań pomija `deposit_seed` | odczyt kodu |

Ocena recenzenta: implementacja poprawna względem kontraktu i testów, losowanie kluczowane bez stanu globalnego, wynik bajtowo równy natywnie i na `wasm32`; dobre zachowanie przy bezsensownych parametrach; `place_account` porównany w testach jednostkowych z wyszukiwaniem siłowym, ale najbardziej złożony i kosztowny.

## `auto/E1-ref` (Opus 5.5)

| Waga | Miejsce | Opis | Dowód |
|---|---|---|---|
| UWAGA | `placement.rs:116-121` | brak walidacji `PlacementParams`/`cell_ly`; przy `max_ly = ∞`, `cell_ly = 0` zakres komórek nasyca się do całego `i32` (zawieszenie / brak pamięci zamiast `None`) | wyliczenie (nie uruchamiano) |
| UWAGA | `system.rs:241-248` | za małe okno orbit po cichu obcina olbrzymy, pas, najbardziej wewnętrzną planetę (opisane w nagłówku, niezgłaszane) | sonda: okno 300..400 → olbrzymów 0 zamiast 174 na 2002 układy |
| UWAGA | `system.rs:150-153, 202` | `max_planets = 1` + olbrzym → układ traci cywilizację | sonda: 1548 / 2002 zamiast 100 % |
| UWAGA | `system.rs:331-348` | udziały złóż = 0 → puste `deposit_weights` (narusza kontrakt `SurfaceSpec`) | sonda: 1572 planety na 2002 układy |
| UWAGA | `galaxy-gen.spec.ts:76` | jak w `auto/E1`: cichy skip bez modułu | odczyt kodu i `gate.mjs` |
| UWAGA | `game-wasm/src/lib.rs` | haczyk testowy w produkcyjnym module (bez `cfg`) | dopuszczone (P-16 a, pytanie 13 = a) |
| DROBNE | `cell_stars.rs:139-144` | przy niecałkowitym `cell_ly` awaryjne `low` może leżeć w komórce c−1 | prawdopodobieństwo ≈ 1e-14 na oś |
| DROBNE | `cell_stars.rs:178`, `placement.rs:144` | zduplikowana `distance` | odczyt |
| DROBNE | `cell_stars.rs:147-158`, `system.rs:332-347` | losowanie ważone napisane dwa razy | odczyt |
| DROBNE | `cell_stars.rs:162` | wspólne `between` w module gwiazd | odczyt |
| DROBNE | `system.rs:99-100, 286` | `colour = 0` jako atrapa dla planety skalistej | odczyt |

Ocena recenzenta: kontrakt i zakres dotrzymane, arytmetyka staranna (`below` na u128, strumienie rozdzielone celami), komentarze zgodne z kodem; słabości tylko przy parametrach zdegenerowanych, na które generator reaguje po cichu; zalecana walidacja parametrów przed E3.

## Pytania wynikające z przeglądu (dla człowieka, nieblokujące)

1. **Walidacja `GalaxyParams` / `PlacementParams` przed E3** (obie gałęzie po cichu korygują albo obcinają). Rekomendacja: funkcja `validate()` zwracająca błąd konfiguracji serwera, wywoływana przy starcie usługi galaktyki (E3-01).
2. **Przynależność do komórki przy `cell_ly` niebędącym dokładną liczbą binarną** (`auto/E1`). Rekomendacja: dopuszczać tylko `cell_ly` będące liczbą całkowitą (walidacja z pkt 1); domyślne 10 jest bezpieczne.
3. **Udział złóż a materiał zastępczy** (`auto/E1`): dokumentacja `DepositParams::share` czy kontrakt „co najmniej jedno złoże”. Rekomendacja: kontrakt ma pierwszeństwo; dopisać do dokumentacji parametru, że udział jest minimalny.
4. **Koszt `place_account`** (`auto/E1`): pomiar przy 10 000 kont przed E3-04.

# Brief pilotażu E1: generator galaktyki, zadania E1-03 … E1-09

> **Status:** obowiązuje oba zespoły pilotażu w tym samym brzmieniu. Poza repozytorium jest to jedyne wejście wykonawcy i weryfikatora.
> **Baza:** `main`@`2494ede` (kontrakt i testy akceptacyjne z zadania E1-01, zatwierdzone przez człowieka).
> **Data:** 2026-11-13. Język raportów: polski; kod, identyfikatory i komentarze: angielski.

## 0. Parametry uruchomienia

Koordynator podaje je w poleceniu, które uruchamia agenta:

| Parametr | Znaczenie |
|---|---|
| ROLA | `wykonawca` albo `weryfikator` |
| ZADANIE | identyfikator, np. `E1-03` |
| DRZEWO | bezwzględna ścieżka worktree zadania; przygotowuje je koordynator |
| GAŁĄŹ ZADANIA | gałąź wyciągnięta w DRZEWIE: `<gałąź etapu>-task/<ZADANIE>` |
| GAŁĄŹ ETAPU | gałąź zespołu, do której koordynator scala zadania po wyniku PASS |
| BAZA | commit, z którego wychodzi GAŁĄŹ ZADANIA (czubek GAŁĘZI ETAPU w chwili startu) |

Gałąź zadania nie nazywa się `<gałąź etapu>/<ZADANIE>`, bo git nie przechowuje obok siebie gałęzi `x` i `x/y`.

Wykonawca czyta sekcje 1–6, weryfikator sekcje 1–4 i 7.

## 1. Cel i zakres

Moduł `game_core::galaxy::generator` (`server/crates/game-core/src/galaxy/generator/`) ma już typy, sygnatury, opis zachowania i parametry, a każda funkcja kończy się na `unimplemented!()`. Zadania E1-03 … E1-08 piszą ciała funkcji. Zadanie E1-09 nagrywa plik wzorcowy i sprawdza te same bajty na `wasm32`.

Kryterium każdego zadania to jego testy akceptacyjne. Testy E1-03 … E1-08 już istnieją w `server/crates/game-core/tests/galaxy_gen.rs` z atrybutem `#[ignore = "<zadanie>"]`. Dwa testy E1-09 pisze wykonawca E1-09 według §3.

**Poza zakresem wszystkich zadań:** `game-session`, `game-server`, protokół i `GameApi`, interfejs, istniejące światy i ich wzorce, wartości parametrów generatora, `server/README.md` (to osobne zadanie E1-10, którego ten brief nie obejmuje), refaktory.

## 2. Wejście

**Wolno czytać:** wszystko w DRZEWIE oraz ten brief.

**Wiążące, w tej kolejności:**
1. `CLAUDE.md` i `docs/DECISIONS.md`.
2. Kontrakt: komentarze dokumentacyjne w `generator/mod.rs`, `generator/params.rs` i nagłówek `generator/rng.rs`. Mówią, co funkcja ma zwracać; test sprawdza to, co tam napisano.
3. Testy akceptacyjne: `server/crates/game-core/tests/galaxy_gen.rs`.

**Pomocnicze:** `docs/plan/08-MAPA-DROGOWA.md` (etap E1), `docs/plan/07-AUTONOMIA.md` §2–3, `docs/reports/tasks/E1-01.md` (kontrakt, lista testów, wartości domyślne).

**Nie wolno:**
- czytać innych gałęzi i innych drzew roboczych: żadnego `git log --all`, `git show <inna gałąź>`, `git diff <inna gałąź>`, żadnych katalogów `space-game*` poza DRZEWEM; dozwolone odniesienia w git to BAZA i własna gałąź;
- szukać ani używać kodu generatora spoza DRZEWA (inne katalogi na dysku, katalogi tymczasowe, sieć);
- pytać koordynatora o rozwiązanie. Niejasność zapisuje się jako pytanie w raporcie (§4.6).

## 3. Zadania

Kolejność: E1-03 → E1-04 → E1-05 → E1-06 → E1-07 → E1-08 → E1-09, jedno naraz. Każde zadanie startuje z GAŁĘZI ETAPU zawierającej scalone poprzednie.

| Zadanie | Funkcje do napisania | Testy zadania | Pliki, które wolno zmienić |
|---|---|---|---|
| **E1-03** Deterministyczne losowanie z klucza | `Rng::for_cell`, `Rng::next_u64`, `Rng::next_f64`, dokładnie według algorytmu z nagłówka `rng.rs` | `rng_is_a_pure_function_of_its_key`, `rng_matches_recorded_values`, `neighbouring_cells_are_uncorrelated` | `generator/rng.rs` |
| **E1-04** Gwiazdy w komórce i rejestr 41 gwiazd | `cell_of`, `stars_in_cell` | `same_cell_same_stars_bytes`, `order_of_cells_does_not_matter`, `real_stars_are_kept`, `star_parameters_are_positive`, `spectral_distribution_within_bounds`, `density_matches_the_parameter` | `generator/` (bez `params.rs`) |
| **E1-05** Układ planetarny gwiazdy | `generate_system` | `same_star_same_system_bytes`, `systems_do_not_depend_on_generation_order`, `orbits_strictly_increase`, `insolation_follows_luminosity`, `no_zero_or_negative_parameters`, `system_type_distribution_within_bounds`, `rocky_moon_share_within_bounds`, `deposit_weights_use_catalog_materials` | `generator/` (bez `params.rs`) |
| **E1-06** Strefa życia jako obliczenie | `habitable_zone`, `HabitableZone::label`, `SystemSpec::planet_zones` | `habitable_zone_scales_with_sqrt_luminosity`, `zone_labels_match_orbits`; dodatkowo `cargo test -p conformance` bez zmian | `generator/` (bez `params.rs`) |
| **E1-07** Konwersja do `CelestialBody` | `system_bodies` | `generated_bodies_feed_the_orbit_solver`, `default_insolation_equals_the_spec`, `grids_build_for_every_landable_body` | `generator/` (bez `params.rs`); `models/`, `sim/`, `math/` tylko do odczytu |
| **E1-08** Rozmieszczanie kont | `place_account` | `placement_is_deterministic`, `placement_never_returns_an_occupied_system`, `nearest_neighbour_distance_within_bounds`, `placement_only_offers_systems_with_a_landable_planet` | `generator/` (bez `params.rs`) |
| **E1-09** Plik wzorcowy i zgodność na `wasm32` | zob. niżej | zob. niżej | zob. niżej |

`generator/` oznacza `server/crates/game-core/src/galaxy/generator/`: istniejące pliki i nowe prywatne moduły pomocnicze. W każdym zadaniu wolno też usunąć własne wiersze `#[ignore]` w pliku testów (§4.1) i dodać raport zadania.

FAKT do E1-08: testy rozmieszczają 500 kont po kolei w profilu debug; czas tych testów jest kosztem implementacji, nie testu.

### E1-09: plik wzorcowy i zgodność na `wasm32` (decyzja P-16 a)

1. **Plik wzorcowy** `server/conformance/vectors/galaxy-gen.json`, nagrany natywnie, jako tekst JSON: parametry domyślne z ziarnem 20261111; 50 komórek (25 wokół Sol: x i y od −2 do 2, z = 0; 25 komórek x = 2000 … 2024, y = 0, z = 0) i 200 pierwszych układów z komórek x ≥ 2000. Sposób nagrania wybiera wykonawca; raport podaje polecenie, które odtwarza plik bez różnic.
2. **Test natywny:** nowy test `galaxy_generator_matches_its_recorded_vectors` w `server/conformance/tests/golden.rs` porównuje wynik generatora z plikiem. Dwa istniejące testy tego pliku zostają bez zmian.
3. **Eksport do testu w WASM:** `sg_galaxy` w `server/crates/game-wasm/src/lib.rs` przyjmuje żądanie JSON przez bufor wejściowy i zwraca tekst przez bufor wyjściowy, tak jak `sg_sync`. Eksport jest poza `GameApi`: żadnych zmian w `game-protocol`, `GameApi` ani `web-game/packages/api`.
4. **Test na `wasm32`:** nowy `web-game/packages/wasm-host/src/galaxy-gen.spec.ts` (vitest) porównuje tekst zwrócony przez moduł WASM z plikiem wzorcowym bajt w bajt. Test ma być faktycznym porównaniem pełnej treści, nie testem samego formatu.
5. `git diff --stat BAZA -- server/conformance/replays server/conformance/vectors/vectors.json` jest puste.

Pliki, które wolno zmienić w E1-09: `server/conformance/**` (nowy plik wzorcowy, nowy test, kod nagrywający), `server/crates/game-wasm/src/lib.rs`, nowy `galaxy-gen.spec.ts` i to, co jest konieczne do jego uruchomienia w `web-game/packages/wasm-host`, a także `Cargo.toml` crate'ów `game-wasm` i `conformance` wyłącznie dla zależności między crate'ami workspace (z wynikającą z tego zmianą listy zależności w `Cargo.lock`, bez nowych pakietów). Kod generatora (`generator/`) w E1-09 się nie zmienia; jeśli test na `wasm32` wykaże różnicę bajtów, to jest wynik do zgłoszenia (§4.6), a poprawka generatora wymaga zgody koordynatora.

## 4. Reguły

### 4.1 Testy i kontrakt

- W `server/crates/game-core/tests/galaxy_gen.rs` wolno wyłącznie usunąć wiersze `#[ignore = "<ZADANIE>"]` przy testach własnego zadania. Żadnej innej zmiany w tym pliku: ani treści testów, ani progów, ani funkcji pomocniczych, ani atrybutów cudzych testów.
- Testy statystyczne biegną na stałym ziarnie. Progu się nie przesuwa. Jeśli implementacja zgodna z kontraktem nie trafia w próg, wykonawca to zgłasza (§4.6), zamiast dobierać implementację pod ziarno.
- Kontrakt jest stały: typy publiczne, sygnatury, komentarze dokumentacyjne, `params.rs` w całości (typy i wartości domyślne). Wraz z ciałem funkcji znika jej atrybut `#[expect(unused_variables, …)]`.
- Zasady z nagłówka `generator/mod.rs` (czyste funkcje, losowość tylko przez `Rng`, typy o stałej szerokości, reguła zmiennoprzecinkowa i `libm`, kolejność map) obowiązują dosłownie.
- Istniejące testy repozytorium zostają nietknięte i zielone; istniejące wzorce (`server/conformance/replays`, `vectors/vectors.json`) bez zmian.

### 4.2 Zakazy

- `docs/DECISIONS.md`, kontrakty protokołu (`game-protocol`, `GameApi`), liczby ekonomii, zamrożony `web-game/packages/domain/src/sim/` (R-2).
- `cargo update`; nowy pakiet zewnętrzny albo zmiana wersji pakietu (wymaga zgody: pytanie i status „zablokowane”). Zależność między crate'ami tego workspace (po ścieżce) jest dozwolona tylko w E1-09 i tylko wtedy, gdy eksport albo test jej wymaga.
- Zmiany poza plikami zadania z §3; refaktory przy okazji.
- `main`, `git push`, `force push`, przepisywanie historii, `--no-verify`.

### 4.3 Git

- Cała praca w DRZEWIE, na GAŁĘZI ZADANIA. Głównego drzewa `C:\my-projects\space-game` nie dotykaj.
- Przed każdym commitem: `git -C <DRZEWO> branch --show-current`. Do commita dodawaj pliki po ścieżkach (`git add <ścieżki>`), nigdy `git add -A`.
- Commit po każdym zielonym kroku; komunikat po polsku: co i dlaczego.
- Scalenia do GAŁĘZI ETAPU nie robi wykonawca ani weryfikator.

### 4.4 Środowisko (ta maszyna, Windows)

- `cargo` nie jest na PATH: `export PATH="$USERPROFILE/.cargo/bin:$PATH"` (bramka robi to sama). Toolchain `stable-x86_64-pc-windows-gnu`; obcych binariów nie wolno pobierać.
- Nie uruchamiaj `cargo` równolegle z e2e ani `ng test`. W tych zadaniach nikt nie uruchamia `node tools/gate.mjs --full`.
- Pierwsza kompilacja w nowym drzewie trwa kilka minut. Zadanie E1-09 wymaga `npm ci` w `web-game/`.
- vitest połyka `console.log`; pomiary zapisuj do pliku.

### 4.5 Bramka

- E1-03 … E1-08: `node tools/gate.mjs --area=rust,docs`.
- E1-09: `node tools/gate.mjs --area=rust,web,docs`.
- Zadanie nie jest skończone, dopóki bramka nie jest zielona. Zieleni nie uzyskuje się zmianą ani wyłączeniem testu.

### 4.6 Niejasność, sprzeczność, brak decyzji

Nie zgadujesz. Jeśli kontrakt jest niejasny, sprzeczny z testem albo wymaga decyzji, której nie ma w repozytorium:
1. zapisz w raporcie zadania PYTANIE: fakt, opcje, rekomendacja, co blokuje;
2. jeżeli da się skończyć zadanie bez rozstrzygnięcia, skończ je i oznacz pytanie jako nieblokujące;
3. w przeciwnym razie oznacz zadanie jako „zablokowane”, zatwierdź to, co jest (raport obowiązkowo), i zakończ pracę.

### 4.7 Limity

Najwyżej 3 iteracje poprawek po wyniku FAIL weryfikatora; potem zadanie dostaje status „zablokowane”. Dwa zablokowane zadania z rzędu zatrzymują etap.

## 5. Procedura wykonawcy

1. Pierwsza czynność: zapisz czas startu, `date -u +%Y-%m-%dT%H:%M:%SZ`.
2. Sprawdź DRZEWO: `git -C <DRZEWO> branch --show-current` zwraca GAŁĄŹ ZADANIA, `git -C <DRZEWO> rev-parse --short HEAD` zwraca BAZĘ, drzewo jest czyste.
3. Przeczytaj wejście (§2) w zakresie swojego zadania.
4. Napisz implementację. Usuń wiersze `#[ignore = "<ZADANIE>"]` przy swoich testach.
5. **Pierwszy przebieg:** gdy uznasz implementację za kompletną i kod się kompiluje, uruchom testy zadania pierwszy raz, `cargo test -p game-core --test galaxy_gen -- <nazwy testów zadania>`, i zapisz wynik (ile z ilu zielonych), zanim cokolwiek poprawisz. Tej liczby potem nie zmieniasz. W E1-09 pierwszym przebiegiem jest pierwsze uruchomienie obu nowych testów.
6. Poprawiaj do zieleni. Licz **przebiegi do zieleni**: każde uruchomienie testów zadania po zmianie kodu, łącznie z pierwszym (1 oznacza zieleń od pierwszego przebiegu).
7. Uruchom cały plik: `cargo test -p game-core --test galaxy_gen`. Wynik: 0 nieudanych; zielone są testy tego i poprzednich zadań, reszta pominięta.
8. Uruchom bramkę (§4.5). Licz jej przebiegi do zieleni.
9. Napisz raport `docs/reports/tasks/<ZADANIE>.md` (§6) i zatwierdź wszystko na GAŁĘZI ZADANIA. Na końcu zapisz czas zakończenia i uzupełnij go w raporcie (osobny commit jest w porządku).
10. Zakończ wiadomością w formacie z §6.3.

Po wyniku FAIL koordynator przekazuje powody weryfikatora. Poprawka to nowa iteracja: popraw, powtórz kroki 7–9, dopisz do raportu sekcję „Iteracja N” (co zarzucono, co zmieniono) i zaktualizuj miary.

## 6. Raport zadania

### 6.1 Plik `docs/reports/tasks/<ZADANIE>.md`, nagłówki w tej kolejności

1. **Status:** `gotowe do weryfikacji` albo `zablokowane`; gałąź, commit.
2. **Co zrobiono:** pliki i jedno zdanie na plik.
3. **Decyzje wykonawcy:** wybory, których kontrakt nie przesądza, każdy z powodem.
4. **Miary** (tabela z §6.2).
5. **Wynik testów i bramki:** wklejony koniec wyjścia `cargo test -p game-core --test galaxy_gen` i wyjście bramki.
6. **Pytania do człowieka:** PYTANIE, FAKT, opcje, rekomendacja, co blokuje; albo „brak”.
7. **Ryzyka.**
8. **Iteracje po weryfikacji:** tylko jeśli były.

Etykiety: USTALENIE / FAKT / PROPOZYCJA / PYTANIE. Nie zamieniaj PROPOZYCJI w USTALENIE.

### 6.2 Miary (te same pola w każdym raporcie)

| Miara | Jak zapisać |
|---|---|
| Start, koniec (UTC) | z `date -u`; czas zegarowy w minutach |
| Pierwszy przebieg | `k / n` testów zadania zielonych (§5 krok 5) |
| Przebiegi do zieleni | liczba (§5 krok 6) |
| Przebiegi bramki do zieleni | liczba |
| Rozmiar zmiany | ostatni wiersz `git diff --stat <BAZA>..HEAD` oraz liczba plików |
| Pliki poza zakresem zadania | lista albo „brak” |
| Zmiany istniejących testów | poza usunięciem własnych `#[ignore]`: lista albo „brak” |
| Pytania do człowieka | liczba, w tym blokujące |
| Zablokowanie | tak / nie |
| Iteracje po FAIL weryfikatora | liczba (0 przy pierwszym oddaniu) |

Tokeny i koszt zapisuje koordynator z danych narzędzia; wykonawca ich nie szacuje.

### 6.3 Wiadomość końcowa wykonawcy

```text
ZADANIE: <id>
STATUS: gotowe do weryfikacji | zablokowane
GAŁĄŹ: <gałąź zadania>   COMMIT: <skrót>
RAPORT: docs/reports/tasks/<id>.md
PIERWSZY PRZEBIEG: k/n
PRZEBIEGI DO ZIELENI: m
BRAMKA: zielona | czerwona   (przebiegów: p)
CZAS: <start> – <koniec> UTC
PYTANIA: <liczba> (blokujących: <liczba>)
```

## 7. Weryfikator

Osobny agent. Dostaje ten brief i parametry z §0; nie zna rozumowania wykonawcy, czyta tylko DRZEWO (gałąź zadania i raport). Niczego nie poprawia i niczego nie zatwierdza w git. Wszystkie polecenia uruchamia w DRZEWIE; po sobie zostawia czyste drzewo.

Sprawdza po kolei:

1. **Stan:** `git status` czyste; HEAD na GAŁĘZI ZADANIA; `git log <BAZA>..HEAD` zawiera tylko commity zadania.
2. **Zakres:** każdy plik z `git diff --stat <BAZA>..HEAD` należy do plików zadania z §3 (plus raport zadania).
3. **Plik testów:** `git diff <BAZA>..HEAD -- server/crates/game-core/tests/galaxy_gen.rs` zawiera wyłącznie usunięte wiersze `#[ignore = "<ZADANIE>"]`, tyle, ile testów ma zadanie. W E1-09 ten plik jest bez zmian.
4. **Kontrakt:** `params.rs` bez zmian; w `mod.rs` i `rng.rs` nie zmieniły się typy publiczne, sygnatury ani komentarze dokumentacyjne (znikają tylko `unimplemented!()` i atrybuty `#[expect]` napisanych funkcji).
5. **Zakazy z §4.2:** brak zmian w `docs/DECISIONS.md`, protokole, liczbach ekonomii, istniejących wzorcach i istniejących testach; w `Cargo.lock` żadnych nowych pakietów ani zmian wersji; w `Cargo.toml` żadnych zależności zewnętrznych (w E1-03 … E1-08 oba pliki bez zmian).
6. **Zasady modułu:** brak stanu globalnego, zegara i wejścia-wyjścia w generatorze; losowość tylko przez `Rng`; funkcje wymienione w regule zmiennoprzecinkowej (`ln`, `exp`, `pow` w tym `powi` i `powf`, `sin`, `cos` i pokrewne) nie pochodzą z metod `f64`; wynik nie zależy od iteracji po `HashMap`. Inne spostrzeżenia o zgodności z nagłówkiem modułu zapisuje jako uwagi.
7. **Testy:** `cargo test -p game-core --test galaxy_gen` daje 0 nieudanych, a liczba zielonych równa się liczbie testów tego i poprzednich zadań; testy zadania są wśród zielonych. W E1-06 także `cargo test -p conformance`.
8. **Bramka** z §4.5 zielona (uruchamia ją sam, nie polega na raporcie).
9. **Raport zadania:** istnieje, ma nagłówki z §6.1 i miary z §6.2; liczby zgadzają się z tym, co widać w repozytorium (rozmiar zmiany, pliki).
10. **Tylko E1-09:** oba nowe testy porównują pełną treść (nie sam format); polecenie nagrania z raportu odtwarza plik wzorcowy bez różnic; warunek 5 z opisu E1-09.

Wynik to wiadomość końcowa w tym formacie:

```text
ZADANIE: <id>
WYNIK: PASS | FAIL
POWODY: <dla FAIL: ponumerowana lista, każdy z plikiem i wierszem albo poleceniem i jego wynikiem; dla PASS: „brak”>
SPRAWDZENIA: 1 ok/nie · 2 ok/nie · … · 10 ok/nie/nie dotyczy
UWAGI: <spostrzeżenia, które nie są powodem FAIL, albo „brak”>
BRAMKA: <wklejone wiersze kroków i wynik>
```

FAIL daje każde niespełnione sprawdzenie 1–10. Jakość kodu, styl i pomysły na ulepszenia nie są powodem FAIL; trafiają do uwag.

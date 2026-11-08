# server — backend gry w Rust

Workspace Cargo z portem domeny gry i narzędziami zgodności (plan `docs/plan/02-BACKEND-RUST.md`). Stan: **B0, B1 i B2 wykonane 2026-11-08** (port całej domeny z silnikiem Atanora i rejestrem gwiazd, złote powtórki, scenariusze `fabryka` i obciążenia S/M/L, pomiar kroku i WASM). Serwer sieciowy (`game-server`, B4) jeszcze nie istnieje.

```bash
cargo test --workspace                 # testy jednostkowe + zgodność z TS (wektory, powtórki)
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
cargo run -p conformance --release -- vectors conformance/vectors/vectors.json
cargo run -p conformance --release -- replay conformance/replays
cargo run -p conformance --release -- bench load-l 600      # czas kroku scenariusza (tau-ceti, planeta-matka, fabryka, load-s/m/l)
cargo build -p game-wasm --target wasm32-unknown-unknown --profile wasm   # rustup target add wasm32-unknown-unknown
```

## Układ

| Ścieżka | Zawartość | Odpowiednik TS |
|---|---|---|
| `crates/game-core` | domena: model świata, zdarzenia, rozkazy, reducer, reguły, katalog i model ekonomii, systemy, scenariusze, symulacja; silnik Atanora (`atanor/`); rejestr gwiazd (`galaxy/`). Bez I/O, bez async, `#![forbid(unsafe_code)]` | `web-game/packages/domain` |
| `crates/game-core/src/atanor` | siatka heksów, cząsteczki, ramiona (także wielochwytakowe), glify, potok taktu z kolizjami trajektorii, pomiar przepustowości, limity poziomów budynku, 4 poziomy PoC i 5 receptur | `domain/src/atanor/*` (bez edytora klienta poza `programIssues` i `solutionKey`) |
| `crates/game-core/src/sim/systems/atanor.rs` | produkcja Fabryki atanorowej z maszyny gracza (AT4): wdrożenie, zapłata i zwrot materiałów, takty, oczekiwanie na surowce i miejsce | `sim/systems/atanor-system.ts` |
| `crates/game-core/src/sim/scenarios/{factory,load}.rs` | światy `fabryka` i `load-s/m/l` z generatorem Mulberry32; w TS leżą obok mocka, serwer Rust musi je startować sam (R-11) | `mock-server/src/{factory,load,rng}.ts` |
| `crates/game-core/data/catalog.json` | katalog ekonomii wyeksportowany z `catalog-data.ts` (`npm run conformance:catalog` w `web-game/`). Liczby zmienia się w TS i eksportuje ponownie | `economy/catalog-data.ts` |
| `crates/game-core/data/stars.json` | 41 gwiazd PoC galaktyki (`npm run conformance:stars`) | `galaxy/stars.data.ts` |
| `crates/game-wasm` | `wasm-bindgen` nad `game-core`: `Session` (start dowolnego scenariusza, rozkaz, krok, świat jako JSON). Adapter `GameApi` w B3 | `packages/mock-server` w workerze |
| `conformance` | biblioteka i narzędzie: powtórka `SaveFile` z mocka i porównanie świata, zdarzeń i odrzuceń; sprawdzenie wektorów liczbowych; `bench` | `tools/conformance/*.ts` nagrywa wzorce |
| `conformance/vectors`, `conformance/replays` | nagrane wzorce (rewizja w `expected.json` → `source.revision`) | — |

Moduły `game-core` odpowiadają plikom TS jeden do jednego (`math/goldberg.rs` ↔ `sim/math/goldberg-grid.ts`, `atanor/pipeline.rs` ↔ `atanor/engine/pipeline.ts` itd.), żeby czytać je obok siebie.

## Zasady portu

- **Ten sam JSON.** `serde` z `camelCase`, pola opcjonalne pomijane jak `undefined`, `null` tam, gdzie TS ma `null` (`Structure.batch`, `ArmState.trackId` rozróżniają brak klucza od `null`). Słowniki ilości (`Qty`) to `IndexMap`: kolejność kluczy jak w obiekcie JS, bo widać ją w tekstach („brakuje FER 10 · SIL 10”) i w kolejności sumowania. Grafy cząsteczek też trzymają porządek wstawiania (pierwsza zgłoszona kolizja, kolejność atomów w składowej).
- **Ta sama arytmetyka.** `Math.hypot` (normalizacja + sumowanie Kahana), `Math.round`, `toFixed`, `Math.imul`, `|0` są odtworzone w `math/js.rs` bit w bit. W silniku Atanora `sin`/`cos` tablicy obrotów idą przez crate `libm` (port fdlibm, ten sam algorytm co `Math` w V8), bo decydują o kolizjach, polu i wyjściu poza planszę, gdzie tolerancja nic nie daje (R-10). Pozostałe funkcje przestępne (`pow`, `atan2`) mogą różnić się o ulp; porównania używają tolerancji 1e-9 dla liczb niecałkowitych.
- **Ta sama kolejność.** `Simulation::step` wykonuje systemy w kolejności TS; stan ciągły (loty, jazdy, akumulatory, silniki maszyn) żyje w systemach, nie w świecie, tak samo jak w TS. Silnik maszyny Atanora jest funkcją liczby wykonanych taktów, więc po wczytaniu zapisu odtwarza się go, wykonując `ticks` taktów.
- **Dane katalogu w jednym miejscu.** Rust czyta `catalog.json` i `stars.json` wygenerowane z TS; po osiągnięciu parytetu kierunek się odwraca (plan 02 §5.3, pytanie R-6).

## Wyniki B0–B2 (2026-11-08, ten komputer, build release)

| Co | Wynik |
|---|---|
| Testy | 37 jednostkowych (geodezja, siatka, Bézier, szum, asteroida, zasoby, zdarzenia, katalog, model ekonomii, heksy, graf cząsteczek, trajektorie, maszyny wzorcowe receptur, poziomy PoC, limity budynku, fabryka, światy obciążenia, gwiazdy) + 2 zgodności w `conformance/tests/golden.rs` (wektory, powtórki) |
| Wektory liczbowe z TS | 18 sekcji zgodnych: geodezja, 7 siatek ze złożami, 55 pozycji orbit, 7 przechwyceń, Bézier, asteroida, szum, stopy, światy startowe, 209 specyfikacji poziomów budynków, tabele ekonomii, 41 gwiazd, **silnik Atanora**: 15 maszyn i 512 taktów (wzorcowe rozwiązania 9 poziomów na planszach ich budynków, zacięcia wszystkich 5 rodzajów, skończone zapasy; pomiar, materiały, klucz, sprawdzenia poziomów 1–5, każdy takt i migawka końcowa) |
| Złote powtórki | 8 zgodnych (świat, zdarzenia, odrzucenia): pierwsza sesja kanwy (19 200 kroków), pętla PoC, ekonomia PoC, zmiany tempa, odmowy, **fabryka** (20 787 kroków, 11 rozkazów, 6 odrzuconych: szkic, trzy wdrożenia z zapłatą, zwrotem i oddaniem atomów z maszyny, 90 pobrań i 29 dostaw, oczekiwanie na MIE, rozbiórka), **load-s** (600 kroków), **load-m** (60 kroków) |
| Czas kroku (`bench`, 1 min modelu) | `tau-ceti` 5,8 µs · `fabryka` 7,6 µs · `load-s` (20 budowli) 5,2 µs · `load-m` (300 budowli, 41 statków, 20 łazików) 103 µs · `load-l` (1500 budowli, 201 statków, 100 łazików) **≈ 1,0 ms** (1048 µs przez 120 kroków, 992 µs przez 600) |
| `game_wasm.wasm` (profil `wasm`, bez `wasm-opt`, bez kleju JS) | 818 kB; 239 kB po gzip (B1: 566 / 176 kB; przyrost to Atanor, gwiazdy i scenariusze) |

Rewizja TS, z której nagrano wzorce: `1dca6be` (zob. `conformance/replays/*/expected.json` → `source.revision`).

### Brama E1 „krok L ≤ 1 ms”

Bezpośredni port liczył krok L w 2,7 ms; tabela specyfikacji budynków w `Rules::new` (zamiast liczenia `spec()` od zera przy każdym wywołaniu, dziesiątki tysięcy razy na krok) zbiła go do ≈ 1,0 ms. Następne gorące miejsca, zachowujące semantykę TS, nadają się do pamięci podręcznej na krok: `storage_capacity` i `power_balance` liczone od nowa dla każdego ciała w każdym systemie (O(budowli)), `construction::assign` przeglądające wszystkie budowle dla każdego bezczynnego łazika. PROPOZYCJA: zrobić to w B4 przy pętli serwera, gdy znany będzie krok (R-4).

## Czego port nie zawiera

- `galaxy-sim.ts` (symulowani gracze i rynek): dane testowe serwera (B3, pytanie R-7), nie domena.
- `MockServer` (plik zapisu, tempa, migawki, strumień zdarzeń): to warstwa serwera — `game-server` w B4 (`conformance/replay.rs` odtwarza już jego `replay`).
- Edytor maszyny po stronie klienta (`atanor/editor/solution-edit.ts`) poza dwoma sprawdzeniami, które serwer powtarza przy wdrożeniu (`programIssues`, `solutionKey`).

Po każdej zmianie domeny TS: `npm run conformance:catalog`, `conformance:stars`, `conformance:vectors`, `conformance:replays` (z zacommitowanej rewizji, zob. `web-game/tools/conformance/README.md`), potem `cargo test --workspace`.

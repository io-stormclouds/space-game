# Zgodność domeny TS z `server/` (Rust)

Skrypty nagrywają z domeny TypeScript dane wzorcowe, które port w Rust (`server/crates/game-core`) musi odtworzyć (plan `docs/plan/02-BACKEND-RUST.md` §5). Porównanie robi `cargo test -p conformance` albo `cargo run -p conformance -- …` w `server/`.

| Skrypt                        | Co zapisuje                                                                                                                                                                                                                                                                                                                                                                                                                                     | Gdzie                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run conformance:catalog` | katalog ekonomii (`catalog-data.ts`) jako JSON; jedyne źródło liczb dla Rusta                                                                                                                                                                                                                                                                                                                                                                   | `server/crates/game-core/data/catalog.json`                    |
| `npm run conformance:stars`   | rejestr 41 gwiazd (`galaxy/stars.data.ts`) jako JSON                                                                                                                                                                                                                                                                                                                                                                                            | `server/crates/game-core/data/stars.json`                      |
| `npm run conformance:vectors` | wektory liczbowe: geodezja, 7 siatek Goldberga ze złożami, pozycje orbit, przechwycenia, krzywa Béziera, kształt asteroidy, szum, stopy budynków, światy startowe obu scenariuszy, tabele i `spec()` ekonomii, 41 gwiazd z pozycjami, **silnik Atanora** (15 maszyn: wzorcowe rozwiązania 9 poziomów na planszach ich budynków, zacięcia 5 rodzajów, skończone zapasy; pomiar, materiały, klucz, sprawdzenia poziomów 1–5, każdy takt, migawka) | `server/conformance/vectors/vectors.json`                      |
| `npm run conformance:replays` | złote powtórki: 8 skryptów gry na mocku (kanwa, PoC, ekonomia, tempa, odmowy, `fabryka` z wdrożeniami maszyn Atanora, `load-s`, `load-m`) (`SaveFile` + zdarzenia każdego kroku + liczba odrzuconych rozkazów)                                                                                                                                                                                                                                  | `server/conformance/replays/<nazwa>/{save.json,expected.json}` |

## Nagrywanie z zacommitowanej wersji

Domena TS zmienia się równolegle z portem. Żeby wzorce odpowiadały konkretnej rewizji, nagrywaj z eksportu tej rewizji, nie z drzewa roboczego:

```bash
# katalog poza repozytorium
SNAP=/tmp/ts-head
git archive HEAD web-game/packages/domain web-game/packages/api web-game/packages/mock-server | tar -x -C "$SNAP"
git rev-parse HEAD > "$SNAP/REVISION"
# tsconfig z mapą pakietów na eksport (paths: @space-game/domain, api, mock-server → $SNAP/web-game/packages/*/src/index.ts)
node_modules/.bin/tsx --tsconfig "$SNAP/tsconfig.json" tools/conformance/record-vectors.ts
node_modules/.bin/tsx --tsconfig "$SNAP/tsconfig.json" tools/conformance/record-replays.ts ../server/conformance/replays "$(cat "$SNAP/REVISION")"
```

`expected.json` zapisuje rewizję w polu `source.revision`. Pliki `record-vectors.ts` i `record-replays.ts` importują czyste moduły (`geodesic`, `lead-intercept`, `seeded-noise`, `atanor`) ścieżką względną, bo indeks pakietu ich nie eksportuje; to funkcje i dane bez stanu, więc wersja z drzewa roboczego daje te same liczby (sprawdź `git diff HEAD -- web-game/packages/domain` przed nagraniem).

## Reguły porównania

- liczby całkowite, teksty, kolejność zdarzeń i kluczy: dokładnie;
- pozostałe liczby: tolerancja względna i bezwzględna 1e-9 (różnice `sin`, `cos`, `pow`, `atan2` między V8 i libm);
- `Math.hypot` i `toFixed` są odtworzone w Rust bit w bit, więc paliwo i czasy lotu wychodzą identycznie.

## Zakres (2026-11-08, po B2)

Nagrania obejmują wszystkie scenariusze mocka: `tau-ceti`, `planeta-matka`, `fabryka` (szkic, wdrożenia i produkcja maszyny Atanora, zwroty, oczekiwanie na surowce, rozbiórka) oraz `load-s` i `load-m` (światy F5 generowane z ziarna 5150). `load-l` służy tylko do pomiaru czasu kroku (`cargo run -p conformance --release -- bench load-l 600`). Poza nagraniami zostaje `galaxy-sim.ts` (rynek i symulowani gracze: dane testowe serwera, pytanie R-7).

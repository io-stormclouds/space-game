# Zgodność domeny TS z `server/` (Rust)

Skrypty nagrywają z domeny TypeScript dane wzorcowe, które port w Rust (`server/crates/game-core`) musi odtworzyć (plan `docs/plan/02-BACKEND-RUST.md` §5). Porównanie robi `cargo test -p conformance` albo `cargo run -p conformance -- …` w `server/`.

| Skrypt                        | Co zapisuje                                                                                                                                                                                                                                                                                                                                                                                                                                     | Gdzie                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run conformance:catalog` | katalog ekonomii (`catalog-data.ts`) i reguły terenu (`terrain-data.ts`, klucz `terrain`) jako JSON; jedyne źródło liczb dla Rusta                                                                                                                                                                                                                                                                                                                                                                   | `server/crates/game-core/data/catalog.json`                    |
| `npm run conformance:stars`   | rejestr 41 gwiazd (`galaxy/stars.data.ts`) jako JSON                                                                                                                                                                                                                                                                                                                                                                                            | `server/crates/game-core/data/stars.json`                      |
| `npm run conformance:vectors` | wektory liczbowe: geodezja, 7 siatek Goldberga ze złożami, **teren** (`terrain`: klasy pól, drogi osady i jej środek z `classifyTerrain` dla każdej z 7 siatek w 10 stylach: `{medieval,2}`, `{mixed,7}`, `{medieval,11}` i od T5 konfiguracje wszystkich ciał z nadpisaniami `ground`, `basin`, `basinLevel`, `landingCap`, zapisanymi tylko gdy ustawione; kierunek osady jak w `buildWorldGrids`; klasy porównywane dokładnie, kierunek bit w bit), pozycje orbit, przechwycenia, krzywa Béziera, kształt asteroidy, szum, stopy budynków, światy startowe obu scenariuszy, tabele i `spec()` ekonomii, 41 gwiazd z pozycjami, **silnik Atanora** (15 maszyn: wzorcowe rozwiązania 9 poziomów na planszach ich budynków, zacięcia 5 rodzajów, skończone zapasy; pomiar, materiały, klucz, sprawdzenia poziomów 1–5, każdy takt, migawka) | `server/conformance/vectors/vectors.json`                      |
| `npm run conformance:replays` | złote powtórki: 9 skryptów gry na mocku (kanwa, PoC, ekonomia, tempa, odmowy, `fabryka` z wdrożeniami maszyn Atanora, `teren` z regułami terenu na Tau Ceti c, `load-s`, `load-m`) (`SaveFile` + zdarzenia każdego kroku + liczba odrzuconych rozkazów)                                                                                                                                                                                                                                  | `server/conformance/replays/<nazwa>/{save.json,expected.json}` |

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

Nagrania obejmują wszystkie scenariusze mocka: `tau-ceti`, `planeta-matka`, `fabryka` (szkic, wdrożenia i produkcja maszyny Atanora, zwroty, oczekiwanie na surowce, rozbiórka) oraz `load-s` i `load-m` (światy F5 generowane z ziarna 5150).

Od T8 (2026-11-09, rewizja `5aa512a`) powtórka `teren` pokazuje reguły terenu na Tau Ceti c: port odrzucony na wodzie (`BAD_TERRAIN`) i postawiony na trzech polach drogi (koszt × 85 %, czas × 75 %), prom, SOL na drodze, SOL w lesie, HAB na skale, SOL na wodzie (odmowa), anulowanie budowy w lesie (zwrot 75 % kosztu po terenie), budowy do końca. Skrypt sprawdza te liczby sam (rzuca wyjątek, gdy mock robi co innego). Nagranie T8 zmieniło `kanwa-pierwsza-sesja`, `tempo-zmiany`, `odmowy` i `fabryka` tylko kluczem `surfaceGrid.terrain` ciała tc-c, a `load-m` przez filtr pól niebudowalnych; `poc-petla`, `poc-ekonomia` i `load-s` różnią się tylko polem `source`. Pliki `save.json` nagrane nowszym Node różnią się w `meta.galaxy` (ceny rynku: `Math.pow`/`Math.exp` V8, ostatnie cyfry); `meta` nie wchodzi do porównania z Rustem, więc `save.json` tych trzech powtórek zostaje z poprzedniego nagrania.

Od T5 etap 2 (2026-11-10, rewizja `048d426`) wektory mają 70 klasyfikacji terenu (biomy `winter` i `dry`, nadpisania konfiguracji), a wszystkie 9 powtórek nagrano ponownie. `kanwa-pierwsza-sesja`, `poc-petla`, `tempo-zmiany`, `odmowy` i `fabryka` różnią się tylko kluczami `surfaceGrid.terrain` ciał (teren na każdej planecie Tau Ceti, na planecie i Księżycu PoC; port kanwy stoi w strefie lądowania tc-e, więc kosztuje tyle co przed T5). W `teren` odmowy `BAD_TERRAIN` mają opis `wydma` zamiast `woda` (jeziora Tau Ceti c wyschły). `poc-ekonomia` buduje na trawie, więc stawia na innych polach (10 380 kroków zamiast 10 200). W `load-s` i `load-m` listy wolnych pól omijają wodę i wydmy nowych ciał, więc losowanie rozkłada budowle, statki i łaziki inaczej. W `save.json` powtórek `poc-petla`, `poc-ekonomia` i `load-s` `meta.galaxy` różni się tylko ostatnimi cyframi (jak przy T8). Te pliki i tak musiały się zmienić, więc zostały w nowym nagraniu. Preset wydajności `load-m-teren` jest tylko w mocku TS: nie ma go w Rust ani w nagraniach.

`load-l` służy tylko do pomiaru czasu kroku (`cargo run -p conformance --release -- bench load-l 600`). Poza nagraniami zostaje `galaxy-sim.ts` (rynek i symulowani gracze: dane testowe serwera, pytanie R-7).

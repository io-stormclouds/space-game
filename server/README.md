# server — backend gry w Rust

Workspace Cargo z portem domeny gry i narzędziami zgodności (plan `docs/plan/02-BACKEND-RUST.md`). Stan: **B0, B1 i B2 wykonane 2026-11-08** (port całej domeny z silnikiem Atanora i rejestrem gwiazd, złote powtórki, scenariusze `fabryka` i obciążenia S/M/L, pomiar kroku i WASM). **B3 wykonane 2026-11-09**: `GameApi` na WebAssembly w workerze klienta, przełącznik `mock-ts` / `wasm`, zgodność z mockiem. **B4 w wersji MVP 2026-11-09**: `game-server` (konta, świat na gracza, WebSocket, harmonogram światów, zapis i odtworzenie) oraz tryb `remote` w kliencie. Szczegóły i braki: sekcje B3 i B4 niżej.

```bash
cargo test --workspace                 # testy jednostkowe + zgodność z TS (wektory, powtórki)
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
cargo run -p conformance --release -- vectors conformance/vectors/vectors.json
cargo run -p conformance --release -- replay conformance/replays
cargo run -p conformance --release -- bench load-l 600      # czas kroku scenariusza (tau-ceti, planeta-matka, fabryka, load-s/m/l)
cargo build -p game-wasm --target wasm32-unknown-unknown --profile wasm   # rustup target add wasm32-unknown-unknown
cargo run -p game-server --release                          # serwer gry (zmienne środowiska: sekcja B4)
DEV_MODE=true cargo run -p game-server --release            # tempa, pauza, krok, konto przy pierwszym logowaniu
```

W `web-game/`: `npm run wasm:build` (moduł do `apps/game/public/wasm/`), `npm run e2e:wasm`, `npm run e2e:remote`.

## Układ

| Ścieżka | Zawartość | Odpowiednik TS |
|---|---|---|
| `crates/game-core` | domena: model świata, zdarzenia, rozkazy, reducer, reguły, katalog i model ekonomii, systemy, scenariusze, symulacja; silnik Atanora (`atanor/`); rejestr gwiazd (`galaxy/`). Bez I/O, bez async, `#![forbid(unsafe_code)]` | `web-game/packages/domain` |
| `crates/game-core/src/atanor` | siatka heksów, cząsteczki, ramiona (także wielochwytakowe), glify, potok taktu z kolizjami trajektorii, pomiar przepustowości, limity poziomów budynku, 4 poziomy PoC i 5 receptur | `domain/src/atanor/*` (bez edytora klienta poza `programIssues` i `solutionKey`) |
| `crates/game-core/src/sim/systems/atanor.rs` | produkcja Fabryki atanorowej z maszyny gracza (AT4): wdrożenie, zapłata i zwrot materiałów, takty, oczekiwanie na surowce i miejsce | `sim/systems/atanor-system.ts` |
| `crates/game-core/src/sim/scenarios/{factory,load}.rs` | światy `fabryka` i `load-s/m/l` z generatorem Mulberry32; w TS leżą obok mocka, serwer Rust musi je startować sam (R-11) | `mock-server/src/{factory,load,rng}.ts` |
| `crates/game-core/data/catalog.json` | katalog ekonomii wyeksportowany z `catalog-data.ts` (`npm run conformance:catalog` w `web-game/`). Liczby zmienia się w TS i eksportuje ponownie | `economy/catalog-data.ts` |
| `crates/game-core/data/stars.json` | 41 gwiazd PoC galaktyki (`npm run conformance:stars`) | `galaxy/stars.data.ts` |
| `crates/game-session` | gra jednego gracza za kontraktem `GameApi`. `GameSession`: stały krok, tempa, dziennik rozkazów, zapis, wczytanie, powtórka i zapytania UI (katalog, dostępność, duch budowy, karta i sugestia pola, tabele ekonomii, przepływy). `GalaxySim`: symulowani gracze i rynek. `Host`: protokół wiadomości (żądanie → odpowiedź i pushe snapshot / events / frame). Bez I/O i bez zegara | `mock-server` (`server.ts`, `host.ts`, `galaxy-sim.ts`), `api` (`contract.ts`, `protocol.ts`) |
| `crates/game-wasm` | `game-session` dla przeglądarki: zwykłe ABI C (`sg_input`, `sg_handle`, `sg_tick`, `sg_snapshot`, `sg_output_ptr`) z wiadomościami JSON w pamięci liniowej, importy `env.sg_now` i `env.sg_panic`. Bez `wasm-bindgen` i bez generatora kleju (R-13) | `mock-server/src/worker.ts`; loader w `web-game/packages/wasm-host` |
| `crates/game-server` | serwer sieciowy (B4): Axum + Tokio, WebSocket `/ws`, `/health`, konta (argon2id), świat na konto, harmonogram (aktywny / uśpiony / nadrabianie), zapis migawki i dziennika przez wątek I/O, odtworzenie powtórką | `mock-server` + nowe |
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

## B3: GameApi na WebAssembly (2026-11-09)

- `game-session` to port `MockServer`, `ServerHost` i `GalaxySim` 1:1: te same odpowiedzi, te same pushe w tej samej kolejności, te same komunikaty błędów. Ten sam crate obsługuje worker klienta i serwer sieciowy.
- `game-wasm` ma surowe ABI z JSON (R-13), więc do budowania wystarcza `cargo` i target `wasm32-unknown-unknown`. Rozmiar: **1194 kB, 326 kB gzip** (profil `wasm`, bez `wasm-opt`). Przyrost względem B2 to `game-session`, `GalaxySim` i `serde` kontraktu.
- Klient: pakiet `web-game/packages/wasm-host` (loader, worker, wersja w wątku). Aplikacja wybiera implementację z `?api=mock-ts|wasm|remote` i zapamiętuje wybór w `localStorage` (`sg.api`). Domyślnie `mock-ts`, więc build klienta nie wymaga Rusta.
- Zgodność: `packages/wasm-host/src/wasm-host.spec.ts` wysyła te same żądania do mocka TS i do WASM, a odpowiedzi porównuje pole po polu (tolerancja 1e-9). 17 przypadków, wszystkie zgodne:
  - start wszystkich 6 scenariuszy;
  - katalog i tabele ekonomii (domyślne i zmienione parametry);
  - dostępność, duch budowy (także `PORT`), karta pola, sugestia pola, przepływy;
  - tempa, pauza, krok, rozkazy z odmowami, zapis;
  - **8 złotych powtórek** przez `replay`, dalsze kroki, `load` i znów dalsze kroki;
  - pętla z `tick`.
- e2e: projekt Playwright `chromium-wasm` (`npm run e2e:wasm`) uruchamia te same testy z `sg.api=wasm`. Wynik na tym komputerze (2026-11-09, Chrome, 2 workery, `flow.spec.ts`):
  - test presetu przechodzi na `mock-ts`, `wasm` i `remote`;
  - „Play flow” (logowanie → kolonia) przechodzi na `mock-ts` (50 s) i `remote` (13 s), a na `wasm` jest **niestabilny** (1 z 2 przebiegów, 2,2 min). Pada limit 5 s na kliknięcie portu w pętli budowy.
  - Logika jest ta sama co w `remote` (ten sam `game-session`), więc to wydajność w przeglądarce: worker serializuje cały świat do JSON co 100 ms, a strona go parsuje.
  - Do zrobienia: migawki rzadziej lub przyrostowo, `postMessage` z obiektem zamiast tekstu, `wasm-opt`.
  - Pełnego zestawu e2e nie przepuszczono na żadnym trybie; wcześniejsze masowe porażki dawał zawieszony `ng serve` na porcie testów.
- Zmienne Playwrighta: `E2E_CHANNEL=chrome` uruchamia zainstalowanego Chrome'a (przeglądarka Playwrighta 1248 nie jest tu pobrana), a `E2E_PORT` pozwala ominąć działający już `ng serve` na 4420, który Playwright użyłby ponownie.

## B4: serwer sieciowy, MVP (2026-11-09)

Zrobione:
- **Połączenie:** WebSocket `/ws`. Pierwsza ramka to `{"type":"hello","protocolVersion":1,"callsign","password","register"?}`, a odpowiedź to `welcome` (konto, świat, `devMode`, `stepSeconds`, czas serwera) albo `error` i zamknięcie. Potem płyną te same wiadomości co w workerze, jako ramki tekstowe JSON (R-3: JSON na start, MessagePack później).
- **Konta:** znak wywoławczy + hasło (argon2id) w `DATA_DIR/accounts.json`. W `DEV_MODE` pierwsze logowanie zakłada konto; w produkcji konto powstaje tylko z `register: true`.
- **Świat na gracza** (Model C): zadanie Tokio z `Host`. W produkcji krok trwa 1 s w tempie ×1 (R-4); w `DEV_MODE` 1/60 s i dostępne są wszystkie tempa jak w mocku. W produkcji klient nie zmienia tempa, nie pauzuje, nie wczytuje i nie restartuje świata (`start` zwraca bieżącą migawkę).
- **Harmonogram:** świat bez połączenia zapisuje się i usypia po `IDLE_SECONDS`. Przy wybudzeniu nadrabia przespany czas krokami po 1 min modelu, z limitem `OFFLINE_LIMIT_HOURS` (R-5: 12 h). Zmiana tempa trafia do harmonogramu, więc powtórka zostaje dokładna.
- **Zapis:**
  - Migawka (`SaveFile`: świat, harmonogram temp, wszystkie rozkazy od startu) powstaje co `SNAPSHOT_SECONDS`, po rozłączeniu, przy uśpieniu i przy zamknięciu.
  - Między migawkami rośnie dziennik `log.jsonl` (rozkazy, zmiany tempa).
  - Zapisuje jeden wątek I/O przez kanał, więc pętla świata nie czeka na dysk.
  - **Odtworzenie = powtórka** scenariusza z rozkazami migawki i dziennika (ten sam kod co złote powtórki). Sprawdzają to test `restored_world_is_the_replay_of_its_log` i test WebSocket z restartem serwera (`tests/ws.rs`).
- **Klient:**
  - `createRemoteWorker` w `packages/api` to WebSocket udający Worker; tryb `?api=remote`, adres serwera `?server=ws://…/ws` (domyślnie port 8080 tego hosta).
  - Strona logowania zapisuje znak wywoławczy; bez logowania gracz dostaje konto gościa.
  - Kod dostępu to sekret przechowywany w przeglądarce, bo pole hasła w formularzu jest jeszcze makietą.
- **e2e:** `npm run e2e:remote` buduje serwer, startuje go w `DEV_MODE` na porcie 8090 (dane w `target/e2e-data`) i uruchamia projekt `chromium-remote`. Każdy test to nowe konto gościa.
- **`deploy/`:** `Dockerfile` serwera i `docker-compose.yml` (serwer + Caddy ze statycznym klientem). **Nie uruchamiane na tym komputerze**, bo Docker Desktop jest wyłączony.

Zmienne: `ADDR` (127.0.0.1:8080), `DATA_DIR` (./data), `DEV_MODE`, `WORLD_STEP_SECONDS` (1; dev 1/60), `SNAPSHOT_SECONDS` (60), `IDLE_SECONDS` (300), `OFFLINE_LIMIT_HOURS` (12).

Brakuje względem planu 02 §11 B4 (następne kroki):
- PostgreSQL (`sqlx`, migracje, tabele z §7) zamiast plików. Interfejs `WorldRepository` jest gotowy, adapter plikowy działa. Na tym komputerze nie ma PostgreSQL ani działającego Dockera.
- MessagePack i uzgadnianie stanu (`Events` + `StateHash`, klient z WASM) zamiast migawki całego świata ~10 Hz. Dziś serwer wysyła to samo co worker: migawkę co 100 ms i klatkę co tick.
- Odtworzenie z migawki i ogona dziennika zamiast powtórki od startu. Dziś odtworzenie jest dokładne z konstrukcji, ale jego koszt rośnie z wiekiem świata.
- Limity (rozkazy/s, `PreviewBuild`/s), metryki Prometheus, sesje w cookie i jednorazowy token WS, prawdziwe pole hasła i rejestracja w kliencie.
- `panic = "abort"` w profilu `release`: panika w jednym świecie kończy cały proces. Serwer potrzebuje osobnego profilu z `unwind` i `catch_unwind` wokół kroku.

### Toolchain na tym komputerze

- Rust 1.99.1 z rustup, toolchain `stable-x86_64-pc-windows-gnu`, bo nie ma tu MSVC Build Tools.
- `cargo` leży w `%USERPROFILE%\.cargo\bin`. PATH nie był zmieniany; skrypty `web-game` szukają `cargo` w tym katalogu.
- Toolchain `gnu` bez MinGW nie ma `dlltool`, a wymagają go crate'y z `windows-link` (`raw-dylib`). Dlatego `Cargo.lock` przypina wersje oparte na `windows-sys 0.59` / `windows-targets`: `tokio 1.47.1`, `mio 1.0.4`, `socket2 0.6.0`, `getrandom 0.2.15` i `0.3.1`.
- Na Linuksie i w kontenerze te przypięcia nie są potrzebne.

## Czego port nie zawiera

- `galaxy-sim.ts` i `MockServer` nie są częścią `game-core`; mieszkają w `game-session` (B3). Czy NPC mają działać na serwerze produkcyjnym, rozstrzyga wciąż otwarte pytanie R-7.
- Edytor maszyny po stronie klienta (`atanor/editor/solution-edit.ts`) poza dwoma sprawdzeniami, które serwer powtarza przy wdrożeniu (`programIssues`, `solutionKey`).

Po każdej zmianie domeny TS: `npm run conformance:catalog`, `conformance:stars`, `conformance:vectors`, `conformance:replays` (z zacommitowanej rewizji, zob. `web-game/tools/conformance/README.md`), potem `cargo test --workspace`.

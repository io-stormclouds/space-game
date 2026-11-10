# server — backend gry w Rust

Workspace Cargo z portem domeny gry i narzędziami zgodności (plan `docs/plan/02-BACKEND-RUST.md`). Stan: **B0, B1 i B2 wykonane 2026-11-08** (port całej domeny z silnikiem Atanora i rejestrem gwiazd, złote powtórki, scenariusze `fabryka` i obciążenia S/M/L, pomiar kroku i WASM). **B3 wykonane 2026-11-09**: `GameApi` na WebAssembly w workerze klienta, przełącznik `mock-ts` / `wasm`, zgodność z mockiem. **B4 w toku**: `game-server` (konta, świat na gracza, WebSocket, harmonogram światów, zapis i odtworzenie z punktu kontrolnego i końcówki dziennika, limity) oraz tryb `remote`, w którym klient trzyma kopię świata w WASM i dostaje od serwera tylko rozkazy, kroki i skrót stanu (R-18). **T8 (teren) 2026-11-09**: klasy pól i drogi osady (`math/terrain.rs`, bit w bit z `classifyTerrain`), reguły budowy na terenie (`sim/terrain_rules.rs`: `BAD_TERRAIN`, koszt `ceil(q·%/100)`, czas pierwszej budowy × %, port i `load-m` omijają wodę), pola terenu w karcie pola, duchu i katalogu `game-session`. **B6 w toku**: usługa galaktyki (huby z księgą zleceń, kredyty, przesyłki między kolonią a hubem, frakcje NPC z wyłącznikiem, R-7); brama „dwóch graczy handluje przez hub” przechodzi w teście WebSocket; w kliencie ekran hubu (F3). Szczegóły i braki: sekcje B3, B4 i B6 niżej.

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
| `crates/game-session` | gra jednego gracza za kontraktem `GameApi`. `GameSession`: stały krok, tempa, dziennik rozkazów, zapis, wczytanie, powtórka i zapytania UI (katalog, dostępność, duch budowy, karta i sugestia pola, tabele ekonomii, przepływy). `GalaxySim`: symulowani gracze i rynek. `Host`: protokół wiadomości (żądanie → odpowiedź i pushe snapshot / events / frame). `sync`: punkt kontrolny (`Checkpoint`), dalszy bieg według cudzych zmian (`follow`), skrót stanu, komunikaty kopii i `SyncCursor` serwera (R-18). `exchange`: wspólny rynek galaktyki (B6, R-20, R-22): księgi zleceń w hubach, kredyty i towary kont, przesyłki, frakcje NPC. Bez I/O i bez zegara | `mock-server` (`server.ts`, `host.ts`, `galaxy-sim.ts`), `api` (`contract.ts`, `protocol.ts`, `galaxy.ts`); `sync` i `exchange` nowe |
| `crates/game-wasm` | `game-session` dla przeglądarki: zwykłe ABI C (`sg_input`, `sg_handle`, `sg_tick`, `sg_snapshot`, `sg_sync`, `sg_view`, `sg_output_ptr`) z wiadomościami JSON w pamięci liniowej, importy `env.sg_now` i `env.sg_panic`. Bez `wasm-bindgen` i bez generatora kleju (R-13) | `mock-server/src/worker.ts`; loader, worker i kopia świata w `web-game/packages/wasm-host` |
| `crates/game-server` | serwer sieciowy (B4): Axum + Tokio, WebSocket `/ws`, `/health`, konta (argon2id), świat na konto, harmonogram (aktywny / uśpiony / nadrabianie), zapis punktu kontrolnego i dziennika przez wątek I/O, odtworzenie z punktu kontrolnego i końcówki dziennika, komunikaty dla kopii klientów, limit żądań; usługa galaktyki (`galaxy.rs`, B6): rynek na zegarze serwera, most do światów, `galaxy.json` | `mock-server` + nowe |
| `conformance` | biblioteka i narzędzie: powtórka `SaveFile` z mocka i porównanie świata, zdarzeń i odrzuceń; sprawdzenie wektorów liczbowych; `bench` | `tools/conformance/*.ts` nagrywa wzorce |
| `conformance/vectors`, `conformance/replays` | nagrane wzorce (rewizja w `expected.json` → `source.revision`) | — |

Moduły `game-core` odpowiadają plikom TS jeden do jednego (`math/goldberg.rs` ↔ `sim/math/goldberg-grid.ts`, `atanor/pipeline.rs` ↔ `atanor/engine/pipeline.ts` itd.), żeby czytać je obok siebie.

## Zasady portu

- **Ten sam JSON.** `serde` z `camelCase`, pola opcjonalne pomijane jak `undefined`, `null` tam, gdzie TS ma `null` (`Structure.batch`, `ArmState.trackId` rozróżniają brak klucza od `null`). Słowniki ilości (`Qty`) to `IndexMap`: kolejność kluczy jak w obiekcie JS, bo widać ją w tekstach („brakuje FER 10 · SIL 10”) i w kolejności sumowania. Grafy cząsteczek też trzymają porządek wstawiania (pierwsza zgłoszona kolizja, kolejność atomów w składowej).
- **Ta sama arytmetyka.** `Math.hypot` (normalizacja + sumowanie Kahana), `Math.round`, `toFixed`, `Math.imul`, `|0` są odtworzone w `math/js.rs` bit w bit. W silniku Atanora `sin`/`cos` tablicy obrotów idą przez crate `libm` (port fdlibm, ten sam algorytm co `Math` w V8), bo decydują o kolizjach, polu i wyjściu poza planszę, gdzie tolerancja nic nie daje (R-10). Pozostałe funkcje przestępne (`pow`, `atan2`) mogą różnić się o ulp; porównania używają tolerancji 1e-9 dla liczb niecałkowitych.
- **Ta sama kolejność.** `Simulation::step` wykonuje systemy w kolejności TS; stan ciągły (loty, jazdy, akumulatory, silniki maszyn) żyje w systemach, nie w świecie, tak samo jak w TS. Silnik maszyny Atanora jest funkcją liczby wykonanych taktów, więc po wczytaniu zapisu odtwarza się go, wykonując `ticks` taktów. Loty liczą się z planu w świecie. Resztę (jazdy łazików w toku, akumulatory wydobycia i ekstrakcji) `Simulation::export_state` zapisuje w `SimState`; zapis z nim (`Checkpoint`) wznawia się bit w bit, co sprawdza test `checkpoint_resumes_exactly` na wszystkich złotych powtórkach. `SaveFile` mocka zostaje bez zmian.
- **Ten sam JSON w obie strony.** `serde_json` z `float_roundtrip`: liczba wraca z tekstu do tego samego `f64` (jak `JSON.parse`). Bez tego ostatni bit liczb potrafił się różnić i świat po przejściu przez JSON rozjeżdżał się z oryginałem.
- **Dane katalogu w jednym miejscu.** Rust czyta `catalog.json` i `stars.json` wygenerowane z TS; po osiągnięciu parytetu kierunek się odwraca (plan 02 §5.3, pytanie R-6).

## Wyniki B0–B2 (2026-11-08, ten komputer, build release)

| Co | Wynik |
|---|---|
| Testy | 37 jednostkowych (geodezja, siatka, Bézier, szum, asteroida, zasoby, zdarzenia, katalog, model ekonomii, heksy, graf cząsteczek, trajektorie, maszyny wzorcowe receptur, poziomy PoC, limity budynku, fabryka, światy obciążenia, gwiazdy) + 2 zgodności w `conformance/tests/golden.rs` (wektory, powtórki) |
| Wektory liczbowe z TS | 18 sekcji zgodnych: geodezja, 7 siatek ze złożami, 55 pozycji orbit, 7 przechwyceń, Bézier, asteroida, szum, stopy, światy startowe, 209 specyfikacji poziomów budynków, tabele ekonomii, 41 gwiazd, **silnik Atanora**: 15 maszyn i 512 taktów (wzorcowe rozwiązania 9 poziomów na planszach ich budynków, zacięcia wszystkich 5 rodzajów, skończone zapasy; pomiar, materiały, klucz, sprawdzenia poziomów 1–5, każdy takt i migawka końcowa) |
| Złote powtórki | 8 zgodnych (świat, zdarzenia, odrzucenia): pierwsza sesja kanwy (19 200 kroków), pętla PoC, ekonomia PoC, zmiany tempa, odmowy, **fabryka** (20 787 kroków, 11 rozkazów, 6 odrzuconych: szkic, trzy wdrożenia z zapłatą, zwrotem i oddaniem atomów z maszyny, 90 pobrań i 29 dostaw, oczekiwanie na MIE, rozbiórka), **load-s** (600 kroków), **load-m** (60 kroków) |
| Czas kroku (`bench`, 1 min modelu) | `tau-ceti` 5,8 µs · `fabryka` 7,6 µs · `load-s` (20 budowli) 5,2 µs · `load-m` (300 budowli, 41 statków, 20 łazików) 103 µs · `load-l` (1500 budowli, 201 statków, 100 łazików) **≈ 1,0 ms** (1048 µs przez 120 kroków, 992 µs przez 600) |
| `game_wasm.wasm` (profil `wasm`, bez `wasm-opt`, bez kleju JS) | 818 kB; 239 kB po gzip (B1: 566 / 176 kB; przyrost to Atanor, gwiazdy i scenariusze) |

Rewizja TS, z której nagrano wzorce: `5aa512a` (T8, teren w rozgrywce; wcześniej `1dca6be`; zob. `conformance/replays/*/expected.json` → `source.revision`). Od T8: sekcja wektorów `terrain` (21 klasyfikacji: 7 siatek × 3 style, klasy i drogi porównywane dokładnie, kierunek osady bit w bit) i 9. powtórka `teren` (port odrzucony na wodzie i postawiony na drodze, budowy na drodze, w lesie i na skale, anulowanie w lesie, czasy × % terenu).

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
- e2e: projekt Playwright `chromium-wasm` (`npm run e2e:wasm`) uruchamia te same testy z `sg.api=wasm`. Wynik na tym komputerze (Chrome, `flow.spec.ts`):
  - test presetu przechodzi na `mock-ts`, `wasm` i `remote`;
  - „Play flow” (logowanie → kolonia), powtórzony 2026-11-09 po południu na nieobciążonej maszynie: **4 z 4** (`mock-ts` 29 s, `wasm` 26 s, po dwa przebiegi). Rano na `wasm` przeszedł 1 z 2. Tamtą niestabilność dawało obciążenie komputera: zawieszony `ng serve` i równoległy build. Pomiar w Node to potwierdza: migawka z WASM kosztuje 0,2–0,4 ms (`load-m`: 1,6 ms), a tick 0,03–0,2 ms, tyle co w mocku.
  - Pełnego zestawu e2e nie przepuszczono na żadnym trybie.
- Rozmiar modułu po B4 (kopia świata, `float_roundtrip`): **1339 kB, 356 kB gzip**.
- Zmienne Playwrighta: `E2E_CHANNEL=chrome` uruchamia zainstalowanego Chrome'a (przeglądarka Playwrighta 1248 nie jest tu pobrana), a `E2E_PORT` pozwala ominąć działający już `ng serve` na 4420, który Playwright użyłby ponownie.

## B4: serwer sieciowy (MVP 2026-11-09, protokół kopii tego samego dnia)

Zrobione:
- **Połączenie:** WebSocket `/ws`, ramki tekstowe JSON (R-3). Pierwsza ramka to `{"type":"hello","protocolVersion":3,"callsign","password","register"?}` (wersja 3 od B6; klient wersji 2 dostaje `error`), a odpowiedź to `welcome` (konto, świat, `devMode`, `stepSeconds`, czas serwera) albo `error` i zamknięcie.
- **Kopia świata u klienta (R-18):**
  - Zaraz po `welcome` serwer wysyła `reset`: punkt kontrolny świata, czyli zapis plus stan kroków spoza świata.
  - Potem wysyła tylko zmiany. `sync` zawiera rozkazy i zmiany tempa przypięte do kroków oraz krok, do którego doszedł świat; w `DEV_MODE` przychodzi co tick (16 ms), w produkcji co krok (1 s). Co 5 s przychodzi `hash`, czyli FNV-1a stanu.
  - Klient (`packages/wasm-host/src/replica.ts`, worker `replica-worker.ts`) prowadzi ten sam `game-session` w WASM tymi rozkazami i krokami. Sam robi zdarzenia, klatki i migawki dla UI.
  - Zapytania UI (duch budowy, karta pola, dostępność, katalog, zapis) liczy kopia, bez podróży do serwera. Do serwera idą tylko żądania zmieniające grę, a odpowiedź przychodzi po `sync` z ich skutkiem.
  - Inny skrót albo luka w krokach powoduje `{"type":"resync"}` i nowy `reset`.
  - Po sieci nie płyną migawki ani klatki. Wcześniej, w MVP, serwer wysyłał cały świat co 100 ms; teraz po sieci idą rozkazy i kroki, a pełny świat raz na połączenie. Ruchu w bajtach nie mierzyłem.
- **Testy kopii:**
  - `sync::tests` w `game-session`: punkt kontrolny wznawia się bit w bit we wszystkich 8 złotych powtórkach, a kopia prowadzona przez `SyncCursor` przez JSON zostaje równa także przy pauzie, zmianach tempa i restarcie świata;
  - `world::tests::replica_follows_the_world`;
  - `tests/ws.rs` przez prawdziwy WebSocket: skrót się zgadza, a zapis z kopii jest identyczny z zapisem serwera;
  - `replica.spec.ts` w TS.
- **Konta:** znak wywoławczy + hasło (argon2id) w `DATA_DIR/accounts.json`. W `DEV_MODE` pierwsze logowanie zakłada konto; w produkcji konto powstaje tylko z `register: true`.
- **Świat na gracza** (Model C): zadanie Tokio z `Host`. W produkcji krok trwa 1 s w tempie ×1 (R-4); w `DEV_MODE` 1/60 s i dostępne są wszystkie tempa jak w mocku. W produkcji klient nie zmienia tempa, nie pauzuje, nie wczytuje i nie restartuje świata (`start` zwraca bieżącą migawkę).
- **Harmonogram:** świat bez połączenia zapisuje się i usypia po `IDLE_SECONDS`. Przy wybudzeniu nadrabia przespany czas krokami po 1 min modelu, z limitem `OFFLINE_LIMIT_HOURS` (R-5: 12 h). Zmiana tempa trafia do harmonogramu, więc powtórka zostaje dokładna.
- **Zapis:**
  - Migawka (punkt kontrolny: `SaveFile` ze światem, harmonogramem temp i wszystkimi rozkazami od startu, plus `SimState`) powstaje co `SNAPSHOT_SECONDS`, po rozłączeniu, przy uśpieniu i przy zamknięciu.
  - Między migawkami rośnie dziennik `log.jsonl` (rozkazy, zmiany tempa).
  - Zapisuje jeden wątek I/O przez kanał, więc pętla świata nie czeka na dysk.
  - **Odtworzenie = punkt kontrolny + końcówka dziennika** (`GameSession::follow`, ten sam kod co kopia klienta). Koszt nie rośnie z wiekiem świata.
  - Migawki bez `SimState` (pliki sprzed zmiany) i każdy błąd przechodzą na powtórkę całego dziennika od startu scenariusza.
  - Sprawdzają to:
    - test `restored_world_is_the_replay_of_its_log`: świat odtworzony obiema drogami równa się żywemu światu;
    - test WebSocket z restartem serwera (`tests/ws.rs`).
- **Limity i awarie:**
  - Każde połączenie ma wiadro żetonów: `MAX_REQUESTS_PER_SECOND` (20/s, chwilowo do 40). Nadmiar dostaje odpowiedź z błędem „za dużo żądań”, a połączenie zostaje; `resync` kosztuje 10 żetonów.
  - Profil `release` ma `panic = unwind` (R-19). Panika kończy tylko zadanie świata; jego klienci są rozłączani, a następne połączenie odtwarza świat z dysku.
- **Klient:**
  - Tryb `?api=remote` uruchamia worker kopii (`game-replica.worker.ts`). Potrzebuje modułu WASM (`npm run wasm:build`). Adres serwera: `?server=ws://…/ws`, domyślnie port 8080 tego hosta.
  - Dane logowania idą do workera przy pierwszym żądaniu (`connectOnFirstRequest` w `packages/api`).
  - Zerwane połączenie kopia ponawia z rosnącym odstępem: 1, 2, 4 s i dalej, najwyżej 10 s, maksymalnie 8 prób bez nowego punktu kontrolnego.
    - Żądania w drodze dostają błąd, bo nie wiadomo, czy dotarły do świata.
    - Zapytania UI kopia dalej odpowiada z ostatniego stanu.
    - Nowe rozkazy czekają na następny `reset`.
    - Odmowa logowania kończy połączenie bez ponawiania.
  - Strona logowania zapisuje znak wywoławczy; bez logowania gracz dostaje konto gościa.
  - Kod dostępu to sekret przechowywany w przeglądarce, bo pole hasła w formularzu jest jeszcze makietą.
- **e2e:** `npm run e2e:remote` buduje serwer i moduł WASM, startuje serwer w `DEV_MODE` na porcie 8090 (dane w `target/e2e-data`) i uruchamia projekt `chromium-remote`. Każdy test to nowe konto gościa. Wyniki pełnego zestawu (17 testów, Chrome, 2026-11-09 wieczorem):
  - `mock-ts`, 4 workery: 17 z 17 (2,4 min).
  - `remote`, 4 workery: 16 z 17 i 15 z 17. Za każdym razem padał inny test zależny od czasu: liczniki GPU po 20 przełączeniach, karta Arki zaraz po wejściu, opis „w locie” w trakcie krótkiego lotu. Każdy z nich przechodzi powtarzany przy 2 workerach (3 z 3 na `mock-ts` i na `remote`). Tryb `remote` jest bardziej wrażliwy na obciążenie: w każdym teście dochodzi logowanie, kompilacja modułu i punkt kontrolny.
  - `remote`, 2 workery (jak w CI), po przeniesieniu argon2 poza wątki runtime: **17 z 17** (1,8 min).
  - Przechodzą wszystkie testy panelu projektanta F6 (tabele ekonomii, przepływy, powtórka gry, eksport i import zapisu): liczy je kopia w kliencie, tym samym kodem co serwer.
- **Logowanie:** argon2 liczy się w puli `spawn_blocking`, poza blokadą kont, więc logowanie nie wstrzymuje ticków światów ani innych logowań.
- **`deploy/`:** `Dockerfile` serwera i `docker-compose.yml` (serwer + Caddy ze statycznym klientem). **Nie uruchamiane na tym komputerze**, bo Docker Desktop jest wyłączony. Obraz klienta musi teraz zawierać moduł WASM.

Zmienne: `ADDR` (127.0.0.1:8080), `DATA_DIR` (./data), `DEV_MODE`, `WORLD_STEP_SECONDS` (1; dev 1/60), `SNAPSHOT_SECONDS` (60), `IDLE_SECONDS` (300), `OFFLINE_LIMIT_HOURS` (12), `MAX_REQUESTS_PER_SECOND` (20).

Brakuje względem planu 02 §11 B4 (następne kroki):
- PostgreSQL (`sqlx`, migracje, tabele z §7) zamiast plików. Interfejs `WorldRepository` jest gotowy, adapter plikowy działa. Na tym komputerze nie ma PostgreSQL ani działającego Dockera.
- Metryki Prometheus, sesje w cookie i jednorazowy token WS, prawdziwe pole hasła i rejestracja w kliencie.
- MessagePack (R-3, odłożony) i kompresja `reset` dla dużych światów, po pomiarze.

### Toolchain na tym komputerze

- Rust 1.99.1 z rustup, toolchain `stable-x86_64-pc-windows-gnu`, bo nie ma tu MSVC Build Tools.
- `cargo` leży w `%USERPROFILE%\.cargo\bin`. PATH nie był zmieniany; skrypty `web-game` szukają `cargo` w tym katalogu.
- Toolchain `gnu` bez MinGW nie ma `dlltool`, a wymagają go crate'y z `windows-link` (`raw-dylib`). Dlatego `Cargo.lock` przypina wersje oparte na `windows-sys 0.59` / `windows-targets`: `tokio 1.47.1`, `mio 1.0.4`, `socket2 0.6.0`, `getrandom 0.2.15` i `0.3.1`.
- Na Linuksie i w kontenerze te przypięcia nie są potrzebne.

## B6: usługa galaktyki (w toku od 2026-11-09)

Plan 02 §11 B6 i 05-SOCIAL S0–S1. Brama „dwóch graczy handluje przez hub” przechodzi w teście WebSocket (`tests/ws.rs::two_players_trade_through_a_hub`).

Zrobione:
- **Rynek (`game-session::exchange`, R-22):** czysty, deterministyczny moduł; czas jest argumentem.
  - 4 huby: Syriusz, Słońce, Procyon, Epsilon Eridani. Każdy ma księgę zleceń na każdy materiał katalogu.
  - Zlecenia kupna i sprzedaży z limitem. Kupno wiąże kredyty z prowizją, sprzedaż wiąże towar w hubie.
  - Dopasowanie: lepsza cena, potem starsze zlecenie; gracz przed frakcją przy równej cenie; po cenie strony czekającej. Częściowe realizacje, bez handlu z samym sobą.
  - Prowizja 2% od każdej strony. Zlecenia wygasają po 7 dniach, najwyżej 50 na konto.
  - Konto ma kredyty (start 1000 kr) i towary w każdym hubie.
- **Frakcje NPC (R-7):** gospodarze hubów, czyli Konsorcjum Orion, Unia Lagrange, Kolektyw Hel-3 i Spółka Kriogen.
  - Działają na `GalaxySim` z mocka. Kupują po 0,8·P, sprzedają po 1,25·P, najwyżej `NPC_DEPTH` sztuk na materiał między aktualizacjami. Ich transakcje przesuwają P.
  - Ich dowódcy są na liście graczy z `npc: true`.
  - `NPC_FACTIONS=off` je wyłącza: w hubach zostają tylko zlecenia graczy. Wyłączenie zachowuje kredyty, towary i zlecenia graczy.
- **Przesyłki:**
  - `SHIP_TO_HUB` to rozkaz w świecie gracza. Wymaga działającego portu; towar od razu schodzi z magazynu.
  - Świat zgłasza wysyłkę usłudze. Po czasie `0,5 h + 2 h/ly` (w `DEV_MODE` sekundy) towar jest na koncie w hubie.
  - Żądanie galaktyki `shipHome` wysyła towar z hubu do kolonii. Po przylocie usługa wpisuje do świata rozkaz systemowy `HUB_DELIVERY`; budzi przy tym świat, jeśli śpi.
  - Świat przyjmuje przesyłkę raz, bo sprawdza swój dziennik. Dostawę, która nie może wylądować, usługa zwraca do hubu.
  - `HUB_DELIVERY` od klienta jest odrzucane.
  - Oba rozkazy są w dzienniku z krokiem, więc powtórka, odtworzenie i kopia klienta zostają dokładne (R-21).
- **Usługa (`game-server/src/galaxy.rs`, R-20):**
  - Jedno zadanie Tokio na zegarze serwera; tick co 250 ms w dev, co 1 s w produkcji.
  - Żądania `{id, galaxy: {op: view | placeOrder | cancelOrder | shipHome}}` dostają `reply`. Po każdej zmianie każdy podłączony klient dostaje `{type: "galaxy", view}` swojego konta: kredyty, huby z notowaniami, księgą i odległością, zlecenia, przesyłki, transakcje, inni gracze.
  - Stan trafia do `DATA_DIR/galaxy.json` atomowo, najwyżej co 1 s i przy zamknięciu. Plik, którego nie da się odczytać, jest odkładany na bok.
- **Światy na serwerze nie mają własnej galaktyki** (`SessionOptions::galaxy = None`). Zapis ma `meta.galaxy: null`, więc kopia klienta też jej nie ma.
  - Huby i graczy w migawce wkleja kopia z widoku usługi (`replica.ts`).
  - Mock i WASM offline odpowiadają na handel `NO_TRADE`.
- **Protokół 3:** `REMOTE_PROTOCOL_VERSION` w `packages/api`. `GameApi` ma `galaxy(op)` i `onGalaxy(listener)`, a typy są w `packages/api/src/galaxy.ts`.
- **Testy:**
  - `exchange::tests`: handel wewnątrz widełek frakcji, głębokość i ruch ceny, pieniądze, towary i zakaz handlu z sobą, rynek bez frakcji i wygasanie, przesyłki w obie strony, stan po JSON i wyłączenie frakcji;
  - `hub::tests` w `game-core`;
  - `world::tests::trade_crosses_into_the_galaxy_and_back_once`;
  - w `tests/ws.rs` przez prawdziwy WebSocket: dwóch graczy (przesyłka, oferta, kupno, prowizje, dostawa do kolonii, rynek po restarcie), frakcje wyłączone, odmowa protokołu 2;
  - `replica.spec.ts`: widok galaktyki w migawkach i żądanie rynku.
  - e2e `remote`, pełny zestaw, Chrome, 2 workery: **17 z 17** (1,9 min). Widok galaktyki w kliencie pokazuje huby i graczy z usługi.
- **Ekran hubu** (`apps/game/src/app/hud/hub-panel.ts`, F3 albo „Hub” w górnym pasku):
  - kredyty, prowizja, zakładki 4 hubów z gospodarzem, odległością i czasem dostawy;
  - tabela notowań: kupują / sprzedają, zmiana, zapas w kolonii i w hubie;
  - zlecenie kupna lub sprzedaży z ilością i ceną;
  - „Wyślij z kolonii” (`SHIP_TO_HUB`) i „Sprowadź do kolonii”;
  - moje zlecenia z anulowaniem, przesyłki z odliczaniem, ostatnie transakcje.
  - Bez serwera panel mówi, że handel działa tylko w grze na serwerze.
  - e2e `hub.spec.ts` na `remote` (25 s): wysyłka do Epsilon Eridani, sprzedaż frakcji po jej cenie kupna, odkupienie, sprowadzenie do kolonii (zapas wraca dokładnie), zlecenie w księdze i anulowanie.
  - Pełny zestaw `remote` z hubem (2 workery): 17 z 18. Padł test pliku projektu Atanora (AT6): klikał fabrykę, zanim kamera doleciała do planety. Ten sam test był niestabilny na mocku przy 4 workerach. Poprawiony (czeka na kafle do 10 s); potem 4 z 4 powtórzeń, a pełny zestaw `remote` **18 z 18** (2,7 min).
- **Scalenie z terenem (2026-11-10):** `server-b6` (T0–T8) scalone do `galaxy-b6`. Jedyny konflikt był w wierszu stanu tego README. Moduł WASM po scaleniu: 1398 kB (370 kB gzip).
- **S1: kontrakty frakcji, reputacja, cła (R-23):**
  - Każda frakcja trzyma w swoim hubie 3 otwarte kontrakty, jeden z nich premium (od reputacji 75).
  - `takeContract` przyjmuje kontrakt, `deliverContract` dostarcza go z towaru w hubie przed terminem. Za to jest nagroda ponad cenę i reputacja; za niedotrzymany termin kara.
  - Reputacja rośnie za kontrakty i obroty z frakcją, a powyżej zera maleje o 1 dziennie. Cło od transakcji z frakcją zależy od reputacji: 10% / 5% / 2,5% / 0%.
  - Ekran hubu pokazuje reputację i cło u gospodarza oraz listę kontraktów z przyciskami „Przyjmij” i „Dostarcz”.
  - Testy:
    - `exchange::tests::contracts_pay_and_build_reputation`;
    - przez WebSocket `a_faction_contract_is_taken_delivered_and_paid` (brama S1 „kontrakt NPC rozliczony”);
    - e2e `hub.spec.ts`: najtańszy kontrakt przyjęty, kupiony w hubie, dostarczony i opłacony.
  - Po S1 i scaleniu z terenem: `cargo test --workspace`, clippy, fmt; vitest 463/463; e2e `mock-ts` 18 przeszło + 1 pominięty (kontrakt tylko na serwerze), e2e `remote` **19 z 19** (2,4 min), oba przy 2 workerach.

Zmienne: `NPC_FACTIONS` (on), `NPC_SEED`, `NPC_PLAYERS` (6), `NPC_UPDATE_SECONDS` (600; dev 10), `NPC_DEPTH` (50), `HUB_FEE` (0,02), `START_CREDITS` (1000), `ORDER_HOURS` (168), `SHIPPING_SECONDS_PER_LY` (7200; dev 2), `SHIPPING_HANDLING_SECONDS` (1800; dev 2), `CONTRACT_HOURS` (48; dev 1), `CONTRACTS_PER_HUB` (3).

Brakuje względem B6 i 05-SOCIAL (następne kroki):
- Ekran hubu: księga zleceń poziomami (dane już są w widoku), handel dwóch graczy w e2e (jest w teście WebSocket).
- Specjalizacje frakcji (które materiały skupują chętniej, jakie kontrakty wystawiają) i receptury za reputację 50.
- Korporacje (S2), czat, rankingi.
- PostgreSQL dla rynku (transakcje SQL jak w planie §8) razem z adapterem światów.
- Zgłoszenie wysyłki po awarii: jeśli serwer padnie między rozkazem `SHIP_TO_HUB` a zapisem `galaxy.json` (≤ 1 s), przesyłka przepada. Do usunięcia przez dziennik wysyłek albo przez transakcję w PostgreSQL.

## Czego port nie zawiera

- `galaxy-sim.ts` i `MockServer` nie są częścią `game-core`; mieszkają w `game-session` (B3). Na serwerze `GalaxySim` napędza frakcje NPC usługi galaktyki (R-7), a nie pojedyncze światy.
- Edytor maszyny po stronie klienta (`atanor/editor/solution-edit.ts`) poza dwoma sprawdzeniami, które serwer powtarza przy wdrożeniu (`programIssues`, `solutionKey`).

Po każdej zmianie domeny TS: `npm run conformance:catalog`, `conformance:stars`, `conformance:vectors`, `conformance:replays` (z zacommitowanej rewizji, zob. `web-game/tools/conformance/README.md`), potem `cargo test --workspace`.

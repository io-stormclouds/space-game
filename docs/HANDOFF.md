# Przekazanie projektu na nową maszynę (2026-11-26)

> **Status:** FAKT na dzień przeniesienia. Dokument dla człowieka i agentów, którzy wznawiają pracę na innej maszynie. Źródła prawdy pozostają bez zmian: `CLAUDE.md`, `docs/DECISIONS.md`, `docs/plan/`, kod i testy.

## 1. Stan repozytorium

- `main` na `origin` (GitHub `io-stormclouds/space-game`) zawiera całą pracę. Pełna bramka `node tools/gate.mjs --full` zielona na końcowym commicie domknięcia (wynik w §6).
- Na `origin` są też gałęzie archiwalne pilotażu: `auto/E1` (zespół Fable 5.2, scalony do `main`), `auto/E1-coord` (raporty koordynatora, scalone), `auto/E1-ref` (zespół Opus 5.5, **niescalony**: druga implementacja tego samego kontraktu, do porównań).
- Lokalne worktree i gałęzie zadań starej maszyny zostały usunięte po scaleniu.

## 2. Co zrobiono przy domknięciu (2026-11-26)

| Co | Gdzie |
|---|---|
| Niezależny przegląd kodu obu generatorów (miara „jakość”) | `docs/reports/E1-review.md` |
| E1-10: sekcja „Generator galaktyki”, raport pilotażu z miarami obu zespołów, porównanie, propozycja decyzji | `server/README.md`, `docs/reports/E1.md` §2.3, §2.4, §7 |
| Ziarno `Rng` mieszane przed współrzędnymi (E1 §4 pkt 6), operacje dokładne `f64` w kontrakcie (pkt 1) | `server/crates/game-core/src/galaxy/generator/{rng,mod}.rs`, `docs/reports/tasks/E1-rng-seed.md` |
| Jeden rejestr decyzji (ustalenia z listopada, P-10…P-52, T-*, decyzje po E1) | `docs/DECISIONS.md` |
| T-8: licencja KayKit Medieval Hexagon = CC0 (sprawdzone na stronie autora) | `web-game/apps/game/public/assets/kaykit-hex/README.txt` |
| Pośredni LOD budowli na ciele w fokusie (L planet < 200 tys. trójkątów) | `web-game/packages/render/src/system/`, `web-game/docs/PERF-REPORT.md`, `docs/reports/tasks/LOD-mid-structures.md` |
| Miary zespołu odniesienia przeniesione z katalogu tymczasowego starej maszyny | `docs/reports/E1-ref/` |

## 3. Pytania do człowieka (otwarte)

1. ~~Start E2~~ — **rozstrzygnięte 2026-11-26: wariant a** (W-16): autonomia etapowa od E2 z Fable 5.2 (koordynator, wykonawcy, weryfikatorzy), Opus 5.5 do niezależnych przeglądów. Warunki wejścia E2 z mapy (decyzja po E1, P-20 a, P-21 a) są spełnione.
2. E1 §4 pkt 7 i 11 (G-37, G-41): ciało poza oknem orbit; granice `PlacementParams`.
3. Z przeglądu (`docs/reports/E1-review.md`, nieblokujące): walidacja parametrów generatora przed E3, `cell_ly` tylko całkowite, semantyka udziału złóż, pomiar `place_account` przy 10 000 kont.
4. Rejestr, status „otwarte”: R-30 (tożsamość gwiazd w usłudze galaktyki), R-32 (protokół 4, rozstrzyga E3-07), C-11 (model stacji; P-41 = b rozstrzyga część), G-31 (reguła biomu planet generowanych, przed E4-01).
5. `UNIFICATION.md` P7, P8.

## 4. Zadania zapisane na później

- Dokument ekonomii (generowany z `web-game/tools/economy-model/template.md`, liczby tylko przez model): §5.1 moduły orbitalne z puli planety (C-5); §3.1 i §4.5 kalibracja przy morale (C-9, K3, P-34 a); §9 gwiazdolot, napędy, habitat hibernacyjny (C-1, C-2, P-33 a, P-52 a); odsyłacz EXP-3 → C-7.
- `PERF-REPORT.md`: L planet draw calls (UWAGA 110; BatchedMesh budowli na ciało).
- Wygląd pasma LOD-mid przy krawędzi tarczy (decyzja człowieka 2026-11-26: zostaje, poprawka później): bryły zastępcze mają rozmiar całego prostopadłościanu modelu i są wyraźnie kanciaste (`docs/img/lod-mid/`). Kierunek: uproszczone modele średniego detalu dla najcięższych budowli (wiertło, skład, wiatrak), opcje w `docs/reports/tasks/LOD-mid-structures.md` §8. Zapas pod 200 tys. trójkątów w L planet to ok. 23 tys.
- Komentarz „PROPOSAL T-7” w `design-system/src/tokens/design-tokens.ts` (T-7 przyjęte).
- **Następny krok: E2** (`docs/plan/08-MAPA-DROGOWA.md` §4 „E2 — Fundament”, 6 zadań, E2-01 pierwsze: bramka `--full` z e2e na `wasm` i `remote`), w trybie z planu 07 §2 i decyzji W-5, W-15, W-16; potem E3–E11.
- Serwer B6 dalej (`server/README.md`, „Brakuje względem B6”): specjalizacje frakcji, port L2 korporacji, czat, stacja badawcza, tabele PostgreSQL.

## 5. Uruchomienie na nowej maszynie

```bash
git clone https://github.com/io-stormclouds/space-game.git && cd space-game
cd web-game && npm ci && cd ..            # Node ≥ 22 (README web-game); legacy-peer-deps w .npmrc
rustup target add wasm32-unknown-unknown  # Rust z rustup
node tools/gate.mjs --full                # typy, testy, Rust, build, e2e
cd web-game && npm start                  # gra na http://localhost:4420
```

- `Cargo.lock` przypina wersje pod `stable-x86_64-pc-windows-gnu` bez MinGW (R-17, `server/README.md` „Toolchain”). Na Linuksie / z MSVC przypięcia nie są potrzebne, ale **nie** rób `cargo update` bez potrzeby: zmienia bajty zależności i może zmienić wyniki testów.
- `CLAUDE.md` § „Środowisko” opisuje już nową maszynę (2026-11-26: Windows z MSVC, `cargo` na PATH, Chromium Playwrighta, Docker, lokalny PostgreSQL; porty 4420 i 4430 człowieka bez zmian) i zasady wspólne dla każdej maszyny.
- **Poprzednia maszyna** (dla porównań pomiarów i historii): Windows bez MSVC i MinGW, toolchain `stable-x86_64-pc-windows-gnu`, `cargo` poza PATH (`%USERPROFILE%\.cargo\bin`), bez pobranego Chromium Playwrighta (stąd domyślne `E2E_CHANNEL=chrome` w bramce), bez PostgreSQL, Docker wyłączony, pobieranie obcych binariów blokowane (stąd surowe ABI `game-wasm` zamiast `wasm-bindgen`, R-13); laptop Ryzen 7 8840HS, Radeon 780M, ekran 120 Hz (pomiary `PERF-REPORT.md` z 10.11 i 26.11).
- Testowy PostgreSQL (opcjonalnie): kontener `postgres:16-alpine` na `127.0.0.1:55432`, użytkownik / hasło / baza `sg`, potem `TEST_DATABASE_URL=postgres://sg:sg@127.0.0.1:55432/sg cargo test`. Uruchomienie `deploy/`: `POSTGRES_PASSWORD=… HTTP_PORT=8088 docker compose -p space-game -f deploy/docker-compose.yml up -d --build`.

### Pułapki znane ze starej maszyny

- **Playwright bez pobranego Chromium:** `E2E_CHANNEL=chrome` (zainstalowany Chrome); bramka ustawia to sama. Port e2e bramka bierze z puli 4441–4449 i odmawia 4420 i 4430.
- **Obciążenie maszyny psuje e2e:** nie uruchamiaj `cargo build/test` równolegle z e2e, `ng test` ani `npm run perf`; e2e z `--workers=1` lub `2` na słabszych maszynach (przy 6 wątkach testy `atanor`/`flow` przekraczały 5 s).
- **Zawieszony `ng serve` po przerwanym Playwright** zostaje na porcie i następne przebiegi go używają (wszystkie testy przekraczają czas): sprawdź port przed startem i zatrzymaj tylko własne procesy.
- **Git Bash przerabia argumenty wyglądające jak ścieżki** (`#/scenariusz-…`): prefiks `MSYS_NO_PATHCONV=1`.
- **vitest połyka `console.log`:** pomiary zapisuj do pliku.
- **`npm run perf` jest ograniczony vsync** (120 Hz na laptopie): sygnałem budżetu są trójkąty i draw calls, nie FPS. Pomiary przed/po porównuj na tym samym GPU.
- **Świeży worktree** potrzebuje `npm ci` w `web-game/` przed bramką (`econ:check` wymaga `tsx`). `git worktree remove --force` zostawia `web-game/node_modules` (dowiązania workspace): usuń resztę osobno.
- **Równoległe sesje** dzielą drzewo robocze: przed commitem `git branch --show-current`, stage'uj tylko własne pliki.
- **Agenci uruchamiani z jednej sesji dzielą jej katalog tymczasowy:** nie trzymaj tam niczego, czego wykonawca nie powinien widzieć (pilotaże).

## 6. Wynik bramki końcowej

`node tools/gate.mjs --full` na gałęzi domknięcia (`auto/domkniecie`, commit `a7cc924`, port e2e 4441), 2026-11-26, przed scaleniem do `main`:

```text
> web:typecheck ... ok (4.0 s)
> web:wasm-build ... ok (22.5 s)
> web:unit (vitest) ... ok (8.6 s)
> rust:fmt ... ok (0.4 s)
> rust:clippy ... ok (18.9 s)
> rust:test ... ok (61.1 s)
> docs:econ-check ... ok (0.8 s)
> tools:test (node --test) ... ok (0.2 s)
> web:app-tests (ng test) ... ok (7.4 s)
> web:build ... ok (7.0 s)
> web:e2e (port 4441) ... ok (125.1 s)
BRAMKA: ZIELONA
```

Pomiar `npm run perf` po LOD-mid (1440×900; ekran 60 Hz, więc FPS nieporównywalny z raportem z 10.11): L planet 176 987 trójkątów i 110 draw calli, M planet 143 862, teren-M planet 156 268; brak „PRZEKROCZONY” (`web-game/docs/PERF-REPORT.md`).

## 7. Wymagania serwera: 20 graczy testowych z bazą danych

Układ z `deploy/docker-compose.yml`: `game-server` + PostgreSQL (`postgres:17-alpine`) + Caddy (`caddy:2`, TLS i proxy), na Linuksie z Docker Engine.

**FAKT (pomiary i kod):**

| Co | Wartość | Źródło |
|---|---|---|
| Krok świata w produkcji | co 1 s, jeden świat na konto | `server/README.md` (protokół, usługa galaktyki) |
| Koszt kroku | `load-m` (300 budowli) 103 µs, `load-l` (1400–1500 budowli) ≈ 1,0 ms | `server/README.md`, tabela pomiarów (`bench`) |
| Logowanie (argon2id, `Argon2::default()`) | 19 MiB pamięci na jedno trwające logowanie, poza wątkami runtime (`spawn_blocking`) | `server/crates/game-server/src/accounts.rs` |
| Obraz serwera (distroless) | 30,5 MB; build w kontenerze 1,5 min (laptop) | `server/README.md` (B4) |

Wniosek z pomiarów: 20 światów wielkości `load-l` to ok. 20 ms CPU na sekundę, czyli ok. 2% jednego rdzenia. CPU nie ogranicza; o rozmiarze maszyny decyduje pamięć PostgreSQL i system.

**PROPOZYCJA (szacunek, niezmierzony na tym projekcie):**

| Profil | vCPU | RAM | Dysk | Uwagi |
|---|---|---|---|---|
| Minimum | 1 | 1 GB | 10 GB SSD | obraz serwera budowany gdzie indziej (lokalnie albo CI) i tylko pobierany na serwer |
| Wygodnie | 2 | 2 GB | 20 GB SSD | zapas na PostgreSQL, logi, kopie zapasowe, jednoczesne logowania (20 × 19 MiB ≈ 0,4 GB w najgorszym razie) |
| Build na serwerze | 2 | 2–4 GB | ≥ 20 GB | obraz Rusta do kompilacji ok. 1,5 GB + pamięć podręczna kilku GB; przy 1 GB RAM kompilacja może się nie zmieścić |

Koszt samego Dockera (szacunek):
- Linux, Docker Engine: `dockerd` + `containerd` ok. 50–100 MB RAM, kontenery bez maszyny wirtualnej.
- Obrazy razem: ok. 0,4 GB (serwer 30,5 MB zmierzone; `postgres:17-alpine` ok. 250–300 MB i `caddy:2` ok. 50 MB to wartości typowe).
- Docker Desktop (Windows, macOS): maszyna wirtualna 1–2 GB RAM i kilka–kilkanaście GB dysku. Wystarcza na komputer deweloperski, ale na serwer dla graczy szkoda zasobów.
- Bez Dockera (plik wykonywalny jako usługa systemowa + natywny PostgreSQL i Caddy/nginx) oszczędza ok. 100 MB RAM, ale traci gotowy `deploy/docker-compose.yml`. Przy 20 graczach różnica nie ma znaczenia.

**Do zrobienia (otwarte):** twarde liczby z nowej maszyny: `docker stats` i `/metrics` (histogram czasu ticku) przy 20 zalogowanych kontach, wynik do `server/README.md` (B4). Ruchu sieciowego w bajtach dotąd nie mierzono.

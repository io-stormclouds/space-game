# CLAUDE.md — zasady pracy agenta w tym repozytorium

Gra ekonomiczno-strategiczna w kosmosie: klient Angular 22 + Three.js (`web-game/`), serwer Rust (`server/`), PoC (`poc/`, tylko do odczytu), dokumenty (`docs/`). Język dokumentów i tekstów UI: polski; kod, identyfikatory i komentarze: angielski.

## Źródła prawdy (czytaj przed pracą)

1. `docs/DECISIONS.md` — rejestr decyzji (ID R-, W-, M-, A-, G-, C-, S-, U-, D-, T-, P-). **Obowiązuje**, dopóki człowiek go nie zmieni. Od 2026-11-26 zawiera też ustalenia z listopada, odpowiedzi P-10…P-52 i decyzje terenu T-*.
2. `docs/plan/` — plan (00 INIT, 01 WORKFLOW, 02 BACKEND, 03 PIPELINE-3D, 05 SOCIAL, 06 PANEL).
3. `docs/analysis/2026-11-11-dziennik-pomyslow.md` — dziennik pomysłów #1–#33, rejestr pytań i **ustalenia z listopada 2026** (sekcja C rejestru). Ustalenia przeniesione do `DECISIONS.md` 2026-11-26; nowe ustalenia z sesji nadpisują rekomendacje agentów, ale **nie** wpisy w `DECISIONS.md`, dopóki człowiek ich tam nie przeniesie.
4. Kod i testy. Liczby ekonomii tylko przez model (`web-game/packages/economy-model`, `npm run econ:docs`).

Etykiety w dokumentach: USTALENIE / FAKT / PROPOZYCJA / PYTANIE. Nie zamieniaj PROPOZYCJI w USTALENIE.

## Bramka jakości (jedna komenda)

```
node tools/gate.mjs                 # typy + testy jednostkowe + rust fmt/clippy/test + econ:check
node tools/gate.mjs --area=rust     # tylko server/
node tools/gate.mjs --area=web      # tylko web-game/
node tools/gate.mjs --full          # + ng test, build, e2e (wolne)
```

Zadanie jest skończone dopiero, gdy bramka dla zmienionego obszaru jest **zielona**, a przy zmianach klienta/serwera na granicy etapu — `--full`. Wynik: `docs/reports/gate-last.json`. Nie osłabiaj ani nie usuwaj istniejących testów, by uzyskać zieleń; zmiana testu wymaga uzasadnienia w raporcie zadania.

## Zasady twarde

- **R-2 (plan 02 §3):** TS `web-game/packages/domain/src/sim/` jest zamrożony; nowe reguły gry tylko w Rust (`server/crates/game-core`), z parytetem i złotymi powtórkami (`server/conformance`). Nie wykonuj `cargo update` bez potrzeby: `Cargo.lock` przypina wersje (R-17, pierwotnie pod `windows-gnu` bez MinGW), a zmiana zależności może zmienić bajty wyników i wzorce.
- **Nie zgadujesz.** Niejasność wymagań, sprzeczność ustaleń albo brak decyzji → zapisz pytanie w raporcie zadania (opcje + rekomendacja), oznacz zadanie jako zablokowane i weź następne niezależne. Nie wymyślaj mechaniki.
- Nie zmieniasz `docs/DECISIONS.md`, kontraktów protokołu (`game-protocol`, `GameApi`) ani liczb ekonomii bez zadania, które tego wprost wymaga; wtedy opisz zmianę w raporcie.
- Zero zmian poza zakresem zadania; zero refaktorów „przy okazji”.
- Brak PvP w MVP (WIZ-6, S-8); PvP to osobny, późniejszy etap.

## Git

- Przed commitem: `git branch --show-current`. Równoległe sesje dzielą drzewo — stage'uj tylko własne pliki (`git add <ścieżki>`, nigdy `git add -A` poza własnym worktree).
- Praca autonomiczna: jeden worktree i jedna gałąź na zadanie (`git worktree add ../space-game-<zadanie> -b auto/<etap>/<zadanie> <baza>`). Bez `force push`, bez zmian na `main`, bez `--no-verify`.
- Commit po każdym zielonym kroku; komunikat: co i dlaczego (po polsku, jak w historii repo).

## Środowisko

### Zasady na każdej maszynie

- **Porty:** użytkownik trzyma własny `ng serve` na **4420**, a PoC wnętrz na **4430** — nigdy ich nie używaj. Bramka bierze port e2e z puli 4441–4449 (albo `E2E_PORT`), `npm run perf` — `PERF_PORT` (domyślnie 4435). Przed startem serwera **sprawdź port** (`Get-NetTCPConnection -LocalPort <port>`). Nie zabijaj cudzych procesów; zatrzymuj tylko własne (także zawieszony `ng serve` po przerwanym Playwright).
- Nie uruchamiaj `cargo build/test` równolegle z e2e, `ng test` ani `npm run perf` (obciążenie daje fałszywe porażki e2e). e2e: `--workers=1` lub `2`, jeśli przy domyślnej liczbie wątków przekraczają czas.
- vitest połyka `console.log`; pomiary zapisuj do pliku.
- `npm run perf`: FPS jest ograniczony vsync monitora; sygnałem budżetu są trójkąty i draw calls. Pomiary przed/po porównuj na tym samym GPU.
- Świeży worktree: `npm ci` w `web-game/` przed bramką (`econ:check` wymaga `tsx`). `git worktree remove --force` zostawia `web-game/node_modules` (dowiązania workspace): resztę usuń `cmd /c rmdir /s /q <katalog>` (nie wchodzi w cele dowiązań).
- Nie instaluj narzędzi spoza rustup/npm bez zgody użytkownika.

### Ta maszyna (Windows, od 2026-11-26)

- Rust z rustup, toolchain **`stable-x86_64-pc-windows-msvc`** (Visual Studio Build Tools), `cargo` na PATH; target `wasm32-unknown-unknown` potrzebny do `npm run wasm:build` (`rustup target add wasm32-unknown-unknown`). Przypięcia `Cargo.lock` z R-17 (pod `windows-gnu`) działają też tu — nie zmieniaj ich bez zadania; aktualizacja R-17 to decyzja człowieka.
- Playwright z własnym Chromium (`npx playwright install chromium`). Bramka domyślnie ustawia `E2E_CHANNEL=chrome` (zainstalowany Chrome); żeby użyć Chromium Playwrighta, uruchom ją z pustym `E2E_CHANNEL=`.
- Docker działa i jest lokalny PostgreSQL: testy adaptera bazy z `TEST_DATABASE_URL=postgres://…` (lokalna baza testowa albo kontener, `docs/HANDOFF.md` §5), uruchomienie `deploy/` przez `docker compose` (`server/README.md`, B4).
- Git Bash przerabia argumenty wyglądające na ścieżki: prefiks `MSYS_NO_PATHCONV=1` (np. adresy `#/...`); bramka ustawia to sama.

Notatki o poprzedniej maszynie (`windows-gnu` bez MinGW, `cargo` poza PATH, brak Chromium Playwrighta, ekran 120 Hz): `docs/HANDOFF.md` §5.

## Definicja ukończenia zadania

1. Kryteria akceptacji z zadania spełnione i sprawdzone testem (nowy lub istniejący).
2. `node tools/gate.mjs` zielona dla zmienionych obszarów.
3. Raport zadania w `docs/reports/tasks/<id>.md`: co zrobiono, decyzje, wynik bramki, pytania do człowieka, ryzyka.
4. Dokumentacja dotykanego obszaru zaktualizowana (README crate'a, `docs/`).

## Praca wieloagentowa

Koordynator planuje i nie koduje; wykonawca pracuje w swoim worktree; **weryfikator** to osobny agent, który nie widzi rozumowania wykonawcy: uruchamia bramkę, czyta diff pod kątem zakresu, osłabionych testów i sprzeczności z `DECISIONS.md`. Wykonawca nie zatwierdza własnej pracy. Limity: najwyżej 3 iteracje poprawek na zadanie, potem „zablokowane”.

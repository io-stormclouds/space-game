# CLAUDE.md — zasady pracy agenta w tym repozytorium

Gra ekonomiczno-strategiczna w kosmosie: klient Angular 22 + Three.js (`web-game/`), serwer Rust (`server/`), PoC (`poc/`, tylko do odczytu), dokumenty (`docs/`). Język dokumentów i tekstów UI: polski; kod, identyfikatory i komentarze: angielski.

## Źródła prawdy (czytaj przed pracą)

1. `docs/DECISIONS.md` — rejestr decyzji (ID R-, W-, M-, A-, G-, S-, U-). **Obowiązuje**, dopóki człowiek go nie zmieni.
2. `docs/plan/` — plan (00 INIT, 01 WORKFLOW, 02 BACKEND, 03 PIPELINE-3D, 05 SOCIAL, 06 PANEL).
3. `docs/analysis/2026-11-11-dziennik-pomyslow.md` — dziennik pomysłów #1–#33, rejestr pytań i **ustalenia z listopada 2026** (sekcja C rejestru). Ustalenia z sesji nadpisują rekomendacje agentów, ale **nie** wpisy w `DECISIONS.md`, dopóki człowiek ich tam nie przeniesie (zob. mapa drogowa).
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

- **R-2 (plan 02 §3):** TS `web-game/packages/domain/src/sim/` jest zamrożony; nowe reguły gry tylko w Rust (`server/crates/game-core`), z parytetem i złotymi powtórkami (`server/conformance`). Nie wykonuj `cargo update` bez potrzeby (`Cargo.lock` przypina wersje pod toolchain `windows-gnu`).
- **Nie zgadujesz.** Niejasność wymagań, sprzeczność ustaleń albo brak decyzji → zapisz pytanie w raporcie zadania (opcje + rekomendacja), oznacz zadanie jako zablokowane i weź następne niezależne. Nie wymyślaj mechaniki.
- Nie zmieniasz `docs/DECISIONS.md`, kontraktów protokołu (`game-protocol`, `GameApi`) ani liczb ekonomii bez zadania, które tego wprost wymaga; wtedy opisz zmianę w raporcie.
- Zero zmian poza zakresem zadania; zero refaktorów „przy okazji”.
- Brak PvP w MVP (WIZ-6, S-8); PvP to osobny, późniejszy etap.

## Git

- Przed commitem: `git branch --show-current`. Równoległe sesje dzielą drzewo — stage'uj tylko własne pliki (`git add <ścieżki>`, nigdy `git add -A` poza własnym worktree).
- Praca autonomiczna: jeden worktree i jedna gałąź na zadanie (`git worktree add ../space-game-<zadanie> -b auto/<etap>/<zadanie> <baza>`). Bez `force push`, bez zmian na `main`, bez `--no-verify`.
- Commit po każdym zielonym kroku; komunikat: co i dlaczego (po polsku, jak w historii repo).

## Środowisko (ta maszyna, Windows)

- `cargo` nie jest na PATH: `export PATH="$USERPROFILE/.cargo/bin:$PATH"` (bramka robi to sama). Toolchain `stable-x86_64-pc-windows-gnu`; bez MSVC, bez PostgreSQL, Docker wyłączony.
- Pobieranie obcych binariów jest blokowane — nie próbuj instalować narzędzi spoza rustup/npm.
- Playwright: bez wbudowanego Chromium; użyj `E2E_CHANNEL=chrome`. Wybierz wolny `E2E_PORT` i **sprawdź port** (`Get-NetTCPConnection -LocalPort <port>`) — użytkownik trzyma własny `ng serve` na 4420, a PoC wnętrz na 4430. Nie zabijaj jego procesów; zatrzymuj tylko własne.
- Nie uruchamiaj `cargo build/test` równolegle z e2e ani `ng test`. e2e: `--workers=1` lub `2`.
- Git Bash przerabia argumenty wyglądające na ścieżki: prefiks `MSYS_NO_PATHCONV=1` (np. adresy `#/...`).
- vitest połyka `console.log`; pomiary zapisuj do pliku.
- `npm run perf` jest ograniczony vsync (120 Hz); sygnałem budżetu są trójkąty i draw calls.

## Definicja ukończenia zadania

1. Kryteria akceptacji z zadania spełnione i sprawdzone testem (nowy lub istniejący).
2. `node tools/gate.mjs` zielona dla zmienionych obszarów.
3. Raport zadania w `docs/reports/tasks/<id>.md`: co zrobiono, decyzje, wynik bramki, pytania do człowieka, ryzyka.
4. Dokumentacja dotykanego obszaru zaktualizowana (README crate'a, `docs/`).

## Praca wieloagentowa

Koordynator planuje i nie koduje; wykonawca pracuje w swoim worktree; **weryfikator** to osobny agent, który nie widzi rozumowania wykonawcy: uruchamia bramkę, czyta diff pod kątem zakresu, osłabionych testów i sprzeczności z `DECISIONS.md`. Wykonawca nie zatwierdza własnej pracy. Limity: najwyżej 3 iteracje poprawek na zadanie, potem „zablokowane”.

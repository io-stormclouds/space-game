# Rejestr decyzji projektu

Jeden rejestr dla całego projektu (plan `docs/plan/01-WORKFLOW.md` §7, `04-DOKUMENTACJA-I-PODGLAD.md` §2.1). Decyzje web-game z faz F0–F6 (W01–W18, Z1–Z6, P1–P6, D1–D36, A1–A14, S1–S7, G1–G8) pozostają w `web-game/docs/UNIFICATION.md`; tu trafiają decyzje od E0.

Oznaczenia ID: W workflow, R Rust, M modele 3D, D dokumentacja, S social, U użytkownik, P pytanie otwarte, A Atanor, G galaktyka. Status: **obowiązuje**, **wg rekomendacji** (podjęta przez agenta na polecenie rozpoczęcia prac; użytkownik może ją zmienić), **otwarte**, **zmieniona przez …**.

| ID | Data | Pytanie | Opcje | Wybór | Źródło | Status |
|---|---|---|---|---|---|---|
| R-0 | 2026-11-08 | Język serwera | Rust / Java / hybryda | **Rust** | polecenie użytkownika „Rozpocznij prace nad backend w rust”; `init.md` preferował Rust | obowiązuje |
| W-1 | 2026-11-08 | Gdzie żyje kod serwera | monorepo (`server/`) / osobne repo | **monorepo**, workspace Cargo w `server/` | plan 01 §2; rozpoczęcie prac | wg rekomendacji |
| R-1 | 2026-11-08 | Zakres Rust | A całość serwera / B hybryda z Node dla social | **A**: modularny monolit | plan 02 §12 | wg rekomendacji |
| R-2 | 2026-11-08 | Współdzielenie logiki TS ↔ Rust | A dwie implementacje + złote powtórki / B rdzeń w Rust → WASM w kliencie | **B z A jako siatką**: `game-core` + `game-wasm`; TS `domain` pozostaje źródłem wzorców do parytetu | plan 02 §12; B0–B1 wykonane | wg rekomendacji |
| R-6 | 2026-11-08 | Źródło katalogu ekonomii w okresie przejściowym | TOML w Rust / JSON eksportowany z TS | **JSON z TS** (`npm run conformance:catalog`) do parytetu; TOML po przejściu klienta na WASM | `server/README.md` | wg rekomendacji (tymczasowo) |
| R-8 | 2026-11-08 | Tolerancja porównań TS ↔ Rust | bitowo wszystko / tolerancja dla liczb niecałkowitych | liczby całkowite, teksty i kolejność **dokładnie**; inne liczby **1e-9** względnie i bezwzględnie; `Math.hypot`, `Math.round`, `toFixed`, `imul` odtworzone bitowo | plan 02 §2.2 RR3 | wg rekomendacji |
| R-9 | 2026-11-08 | Z której wersji TS nagrywać wzorce | drzewo robocze / zacommitowana rewizja | **zacommitowana rewizja** (eksport `git archive` + `tsconfig` z `paths`), rewizja zapisana w `expected.json` | `web-game/tools/conformance/README.md` | wg rekomendacji |
| R-10 | 2026-11-08 | Funkcje trygonometryczne w decyzjach dyskretnych silnika Atanora (próbkowanie trajektorii: kolizje, pole, wyjście poza planszę) | `sin`/`cos` biblioteki systemowej / port fdlibm | **crate `libm`** (port musl, ten sam algorytm fdlibm co `Math.sin`/`Math.cos` w V8): wynik bitowo zgodny, bez tolerancji | `server/crates/game-core/src/atanor/trajectory.rs` | wg rekomendacji |
| R-11 | 2026-11-08 | Gdzie żyją światy mocka `fabryka` i `load-s/m/l` | tylko w narzędziach testowych / w `game-core` | **w `game-core/sim/scenarios`** (`factory.rs`, `load.rs` z Mulberry32), bo serwer Rust musi startować te same światy co mock; TS zostawia je w `mock-server` | `server/README.md` | wg rekomendacji |
| R-3 | — | Protokół klient ↔ serwer | WebSocket + MessagePack / WebTransport / WebSocket + JSON | — | plan 02 §12 | otwarte |
| R-4 | — | Krok serwera w tempie ×1 | 1 s / 0,5 s / 1/60 s | — | plan 02 §12 | otwarte |
| R-5 | — | Limit postępu offline | brak / magazyn / magazyn + 12 h | — | plan 02 §12 | otwarte |
| R-7 | — | `GalaxySim` jako NPC na serwerze | tylko `dev` / produkcja jako frakcje NPC | — | plan 02 §12 | otwarte |

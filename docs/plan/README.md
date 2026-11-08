# Plan inicjalizacji projektu — indeks

> **Status:** propozycja do akceptacji (etap 3 stage-gate z `init.md`: analiza PoC, architektura, dokumentacja; użytkownik: „faza testowania PoC i planowania”).
> **Data:** 2026-11-07
> **Źródło prawdy o stanie obecnym:** `web-game/` (kod, `web-game/docs/UNIFICATION.md`, `web-game/docs/PERF-REPORT.md`). Dokumenty projektowe: `docs/game-mechanics-analysis.md`, `docs/game-design-questions.md`, `docs/economy-expansion-design.md`, `docs/atanor-expansion-design.md` (równoległa sesja, plan AT1–AT6).
> **Zasada nadrzędna** (bez zmian): zero kodu produkcyjnego przed akceptacją planu. Ten katalog jest planem, nie kodem.

Oznaczenia w całym katalogu: **FAKT** wynika z kodu lub dokumentów (z odnośnikiem), **PROPOZYCJA** to mój projekt, **PYTANIE** czeka na decyzję użytkownika i ma opcje z rekomendacją.

## Dokumenty

| Nr | Plik | Treść | Dla kogo |
|---|---|---|---|
| 00 | [00-INIT-v2.md](00-INIT-v2.md) | Zredagowane polecenie inicjalizacji projektu: rola, stan zastany, cel (workflow), zasady, artefakty do wytworzenia. Zastępuje urwany `init.md`. | prompt startowy kolejnych sesji |
| 01 | [01-WORKFLOW.md](01-WORKFLOW.md) | Workflow budowania, rozwijania, dokumentowania i śledzenia: układ repozytorium, GitLab (issues, board, MR) zgodny ze skillami `/gl-*`, gałęzie, CI, rejestr decyzji, definicja „done”, skille Claude Code, paczka E0. | zespół, agent |
| 02 | [02-BACKEND-RUST.md](02-BACKEND-RUST.md) | Serwer w Rust dla gry czasu rzeczywistego: uzasadnienie i ryzyka, modularny monolit, model czasu (krok 1 s, uśpienie, nadrabianie), protokół, zgodność logiki TS ↔ Rust przez złote powtórki i WASM, persystencja, fazy B0–B6. | architekt, backend |
| 03 | [03-PIPELINE-3D.md](03-PIPELINE-3D.md) | Praca nad modelami 3D: Blender 5.2 + MCP, konwencje (siatka 2 j., paleta w wierzchołkach, węzły `anim_*`), manifest i generowany rejestr, walidacja budżetów, LOD, kolejność produkcji. | grafik, agent |
| 04 | [04-DOKUMENTACJA-I-PODGLAD.md](04-DOKUMENTACJA-I-PODGLAD.md) | Docs-as-code, rejestr decyzji i ADR-y, przeglądarka assetów (`#/katalog`), symulacja ekonomii headless i migawka balansu w CI, GitLab Pages. | wszyscy |
| 05 | [05-SOCIAL.md](05-SOCIAL.md) | Handel (huby, księga zleceń, przesyłki, kontrakty), frakcje NPC, gildie (korporacje), sojusze, rankingi i sezony, komunikacja; fazy S0–S4; pytania SOC-1…6. | projektant, backend |
| 06 | [06-PANEL-UZYTKOWNIKA.md](06-PANEL-UZYTKOWNIKA.md) | Konto i logowanie, panel użytkownika, personalizacja: kolor gracza zgodny z DS, awatar generowany, kompozytor flagi; fazy U0–U3. | projektant, frontend |

## Stan realizacji

| Data | Co | Gdzie |
|---|---|---|
| 2026-11-08 | **B0 i B1 wykonane**: workspace `server/`, crate `game-core` (port domeny bez Atanora i gwiazd), `game-wasm` (566 kB, 176 kB gzip), narzędzie `conformance`; 16 sekcji wektorów liczbowych i 5 złotych powtórek zgodnych z TS; decyzje R-0, W-1, R-1, R-2, R-6, R-8, R-9 wg rekomendacji | `server/README.md`, `docs/DECISIONS.md`, `web-game/tools/conformance/README.md` |
| 2026-11-08 | **B2 wykonane**: silnik Atanora (AT1–AT5) i produkcja maszyn gracza (AT4) w `game-core`, rejestr gwiazd, scenariusze `fabryka` i `load-s/m/l`; 18 sekcji wektorów i 8 złotych powtórek zgodnych z TS (rewizja `1dca6be`); krok świata L ≈ 1,0 ms po tabeli specyfikacji (brama E1 „≤ 1 ms” na granicy, dalsze gorące miejsca opisane); WASM 818 kB / 239 kB gzip; decyzje R-10, R-11 wg rekomendacji | `server/README.md`, `docs/DECISIONS.md` |

## Mapa drogowa (PROPOZYCJA)

Numeracja etapów pasuje do milestone'ów GitLab z konwencji (`E<n> – nazwa`). Fazy z poszczególnych planów (B, S, U, AT, pipeline 3D) są przypisane do etapów.

| Etap | Nazwa | Co wchodzi | Brama (gate) |
|---|---|---|---|
| E0 | Fundamenty workflow | zdalne repo (P4), `CLAUDE.md`, `/gl-setup`, CI dla `web-game` i `design-system`, `DECISIONS.md`, ADR-0001…0006, szablony issue, skille `/sg-check` i `/sg-decision`, spike B0 (Rust) i M-1 (Blender MCP) | `npm run check` zielone w CI; board działa; plany 00–06 zaakceptowane; raporty spike'ów |
| E1 | Zgodność i Rust-core | B1–B3: crate `game-core`, złote powtórki TS ↔ Rust, WASM w workerze obok mocka; U0 (profil mock); AT1–AT3 (Atanor jako widok budynku, edytor, statystyki) na mocku; `sim-cli` | 100% powtórek identycznych; krok L ≤ 1 ms w Rust; e2e zielone na `wasm` |
| E2 | Serwer czasu rzeczywistego | B4–B5: `game-server` (Axum, WebSocket), konta i sesje (U1), światy, persystencja, Docker Compose „single-box”; S0 (huby NPC, przesyłki); AT4 (produkcja Atanora w silniku, przez WASM i serwer) | gra z kanwy od rejestracji do wydobycia przez prawdziwy serwer; e2e `remote`; odtworzenie świata z bazy = powtórka |
| E3 | Treść 3D | pipeline (manifest, eksport, walidacja), modele priorytetu 1–4, animacje A1–A2, LOD i odcinanie wg P8, przeglądarka assetów, Pages | budżety z `PERF-REPORT.md` trzymane; każdy model ma wpis w manifeście i test |
| E4 | Social MVP | S1–S2 (zlecenia gracz–gracz, kontrakty NPC, reputacja, korporacje), U2 (flagi, paleta, powiadomienia), B6, AT5 (receptury T3/T4) | 2+ graczy handluje przez hub; korporacja z 3 kont |
| E5 | Beta zamknięta | S3 (megaprojekty, sojusze, rankingi, sezony), U3, AT6 (biblioteka projektów), telemetria ekonomii | 50–200 graczy (MP-3 A) przez 2 tygodnie bez resetu |

Kolejność E1 → E2 wynika z zasady „serwer autorytatywny od pierwszego dnia” (analiza §11.4): bez portu domeny serwer w Rust nie ma czego liczyć. E3 może iść równolegle z E1–E2 (inne narzędzia). AT1–AT3 są pracą kliencką na mocku i nie czekają na Rust.

## Pytania do decyzji przed startem E0

Zebrane ze wszystkich planów. Opcje, uzasadnienia i rekomendacje są w danym dokumencie.

| ID | Pytanie | Rekomendacja | Dokument |
|---|---|---|---|
| P4 | Adres zdalnego repozytorium (GitLab, grupa) | gitlab.com, nowa grupa; monorepo | 01 §12 |
| I-1 | `init.md` zostaje archiwum, `00-INIT-v2.md` poleceniem startowym? | tak; `init.md` bez zmian | 00 |
| W-1…W-4 | monorepo z `server/`; runner GPU dla `perf`; self-merge; widoczność repo | monorepo; własny runner ręcznie; self-merge po `/code-review`; prywatne | 01 §12 |
| R-1…R-7 | zakres Rust; WASM vs dwie implementacje; protokół; krok serwera; limit offline; katalog TOML; `GalaxySim` jako NPC | A; B; WS + MessagePack; 1 s; magazyn + 12 h; TOML; NPC | 02 §12 |
| M-1…M-7 | serwer MCP Blendera; `.blend` w LFS; tekstury; LOD1 od razu; przeznaczenie `resources/kaykit`; licencja modeli; akceptacja assetów | `blender-mcp` + skrypty; LFS; bez tekstur; tak; odniesienie techniczne; zastrzeżona; człowiek | 03 §11 |
| D-1…D-5 | przeglądarka assetów; Pages; generator docs; format skryptów symulacji; silnik `sim-cli` | trasa `#/katalog`; tak; GitLab Markdown; JSON; TS teraz | 04 §7 |
| S-1…S-11 | SOC-1…6, waluta, PvP, huby, czas dostawy, sojusze | A+NPC; małe; NPC; publiczne; rankingi+sezony; korporacja i hub; kredyty; brak PvP; Epsilon Eridani i Procyon; 2 h/ly; E5 | 05 §11 |
| U-1…U-8 | logowanie; awatar; kolor a DS; flaga 3D; callsign; język; e-mail; trasa panelu | e-mail+hasło; generowany; tylko świat i mapa; maszt dwu-tonowy; unikalny; PL; usługa e-mail; trasa | 06 §9 |
| P7–P9 | otwarte z `UNIFICATION.md` §6 (liczby Atanora do dokumentu; budowle na ciało; kolory do DS) | P7 po AT4; P8 decyduje o LOD w E3; P9 razem z paletą graczy | — |

Jeśli użytkownik przekaże „decyzje wg rekomendacji” dla wybranych dokumentów, rozstrzygnięcia trafią do `docs/DECISIONS.md` (po jego utworzeniu w E0) z adnotacją „wg rekomendacji”, jak w `UNIFICATION.md` §5.

## Co się zmienia względem `init.md`

- `init.md` jest urwany w pół zdania (tabela „Wpływ wymogu Single-Node”, wiersz „Szybkość prototypowania POC”). Treść do tego miejsca jest zachowana w `00-INIT-v2.md` w skróconej formie, z aktualnym stanem zastanym.
- Dylemat Java vs Rust jest rozstrzygnięty na korzyść Rust (polecenie użytkownika z 2026-11-07); `02-BACKEND-RUST.md` zawiera uzasadnienie i ryzyka, jak wymagał `init.md`. Argument „brak GC w pętli 60 Hz” nie dotyczy tej gry; decyzja opiera się na jednym węźle, tysiącach małych światów, determinizmie i WASM.
- Etap 2 stage-gate (PoC) jest zakończony: trzy PoC i `web-game` jako ich ujednolicenie. Jesteśmy w etapie 3.
- Nowe wymagania z 2026-11-07: gra w czasie rzeczywistym, Blender z MCP, przeglądarka assetów, symulacja ekonomii, warstwa społecznościowa, panel użytkownika z personalizacją.
- `ARCHITECTURE-DISCOVERY.md` z `init.md` nie powstaje jako osobny plik: jego treść (stan zastany, ryzyka, Rust vs Java, pipeline 3D) jest rozłożona na 02 i 03 oraz istniejącą analizę w `docs/game-mechanics-analysis.md`.

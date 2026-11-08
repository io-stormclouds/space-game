# Dokumentacja, podgląd assetów i symulacja ekonomii

> **Status:** PROPOZYCJA do akceptacji.
> **Data:** 2026-11-07

## 1. Stan zastany (FAKT)

| Element | Stan | Źródło |
|---|---|---|
| Dokumenty projektowe | `docs/game-mechanics-analysis.md` (554 linie), `docs/game-design-questions.md` (851; 61 pytań, część z decyzjami), `docs/economy-expansion-design.md` (1073; generowany), `docs/atanor-expansion-design.md` (nowy, równoległa sesja; plan AT1–AT6, 11 pytań) | `docs/` |
| Generowanie | `npm run econ:docs` składa dokument ekonomii z `template.md` i modelu (`{{GEN: …}}`); `econ:check` pilnuje zgodności bajt w bajt | `web-game/tools/economy-model/README.md` |
| Rejestr web-game | `UNIFICATION.md`: decyzje, rozbieżności, wykonane fazy, zmiany wyników, znane problemy, pytania | `web-game/docs/` |
| Pomiary | `PERF-REPORT.md` generowany przez `npm run perf` (sprzęt, tabela scenariusz × metryka × budżet, zadania) | `web-game/docs/` |
| Archiwum kanwy | 9 plansz `.dc.html` + zrzuty 1440×900; plansze wymagają środowiska Design | `web-game/docs/canvas/` |
| README pakietów | `render/src/system`, `render/src/galaxy`, `render/src/atanor`, `domain/src/atanor`, `tools/economy-model` | `web-game/packages/*/README.md` |
| Panel projektanta (F6) | zakładki Parametry, Tabele, Przepływy, Dziennik, Atanor, Plik; porównanie dokumentu z pomiarem; zapis i powtórka | `UNIFICATION.md` §3d |
| Podgląd assetów | brak; modele widać tylko w grze; harness `render/harness/system` (Vite, port 4431) pokazuje scenę testową | `render/src/system/README.md` |
| Słowniki | teksty UI w `apps/game/src/app/i18n/pl.ts` i `HUD_TEXT` | W16 |

## 2. Docs-as-code: zasady

1. **Język i oznaczenia:** po polsku; **FAKT** (z odnośnikiem do pliku i linii), **PROPOZYCJA**, **PYTANIE** (opcje + rekomendacja + pole Decyzja). Jak w istniejących dokumentach.
2. **Jedno źródło liczb:** tabele z modelu, rejestru modeli, protokołu i pomiarów są generowane; sekcje generowane oznaczone `{{GEN: …}}` (wzór `template.md`); CI sprawdza `git diff --exit-code` po regeneracji.
3. **Jeden rejestr decyzji:** `docs/DECISIONS.md` (od E0); `UNIFICATION.md` zamrożony jako historia web-game; `game-design-questions.md` dostaje w polu Decyzja odsyłacz do ID z rejestru.
4. **Każdy pakiet ma README** z: po co jest, jak uruchomić, publiczne API, zmiany względem źródła (PoC lub dokument), znane luki, pytania. Wzór: `render/src/system/README.md`.
5. **Raport fazy** zamyka milestone (`docs/reports/E<n>-raport.md`), struktura jak `UNIFICATION.md` §3.
6. **Diagramy** w Mermaid w Markdownie (GitLab renderuje natywnie); zrzuty ekranu 1440×900 jako PNG w `docs/img/` (LFS, jeśli > 200 kB).
7. **Linki** sprawdzane skryptem (`npm run docs:links`: względne ścieżki istnieją; kotwice nagłówków istnieją).

### 2.1 Format `docs/DECISIONS.md`

| ID | Data | Pytanie | Opcje | Wybór | Źródło | Status |
|---|---|---|---|---|---|---|
| W01 | 2026-11-07 | Framework interfejsu | Angular / React / Svelte | A · Angular 22 | plan web-game v1 | obowiązuje |
| R-1 | — | Zakres Rust | A całość / B hybryda | — | `docs/plan/02` §12 | otwarte |

ID: prefiks obszaru (W web-game, Z założenie, D rozstrzygnięcie, R Rust, M modele, S social, U użytkownik, P pytanie otwarte, A Atanor, G galaktyka), numer. Zmiana decyzji = nowy wiersz z „zmienia X”, a stary dostaje status „zmieniona przez Y”.

### 2.2 Szablon ADR (`docs/adr/ADR-NNNN-slug.md`)

```markdown
# ADR-0001: Rust jako język serwera
- Status: proponowany | przyjęty | zastąpiony przez ADR-…
- Data: 2026-11-07
- Decyzja: R-1 w DECISIONS.md
## Kontekst
## Opcje rozważane (z kompromisami)
## Decyzja
## Konsekwencje (pozytywne, negatywne, ryzyka)
## Powiązania (issues, dokumenty, pomiary)
```

Pierwsze ADR-y (E0): 0001 Rust, 0002 model czasu (krok 1 s, uśpienie, nadrabianie), 0003 współdzielenie logiki przez WASM i złote powtórki, 0004 protokół WebSocket + MessagePack, 0005 pipeline assetów (kolor w wierzchołkach, manifest), 0006 persystencja (dziennik rozkazów + migawki).

## 3. Przeglądarka assetów

**PROPOZYCJA (D-1):** trasa `#/katalog` w `web-game` (zamiast osobnej aplikacji), bo ma już `RenderHost`, `ModelLibrary`, paletę DS i komponenty UI. Trasa ładowana leniwie; w buildzie produkcyjnym gry ukryta za flagą `catalog` (albo zawsze dostępna: to projekt testowy).

| Sekcja | Treść | Źródło danych |
|---|---|---|
| Modele | lista z `manifest.json`: rodzaj, poziom, trójkąty LOD0/LOD1, budżet, części `anim_*`, licencja; podgląd 3D na obrotnicy w scenie DS (ten sam materiał i paleta co w grze), przełącznik LOD, przełącznik animacji, przełącznik stanu (budowa, brak mocy), tło siatki 1 kafelka dla skali | `assets/manifest.json`, GLB |
| Mapowanie | rodzaj z katalogu → części i poziomy; brakujące modele podświetlone (dziś `structure_tall`) | `model-registry.generated.ts` |
| Materiały i budynki | katalog ekonomii: materiały (kod, nazwa, tier, klasa, wartość V), budynki (koszty L1–L5, czas, moc, załoga, magazyn), receptury jako graf przepływu (Mermaid lub prosty SVG) | `GameApi.catalog()`, `economyReport()` |
| Gwiazdy | 41 gwiazd z pozycjami, zasięgi Mk I/II, huby | `GameApi.catalog().stars` |
| Ikony i tokeny | ikony DS, paleta kolorów (w tym kolory graczy z 06), tokeny | `design-system` core |
| Słownik | teksty UI z kluczami (szukaj, brakujące klucze) | `pl.ts` |

Podgląd 3D: jedna scena Three.js (osobny `RenderHost`, więc gra i katalog nie są otwarte naraz: jeden kontekst WebGL, W13). Zrzut PNG z obrotnicy to też podgląd do `assets/previews/` (ten sam renderer, więc wygląd zgodny z grą; Blender renderuje podglądy tylko do MR).

**Publikacja (D-2):** job GitLab Pages z `main` publikuje `dist/game` (gra na mocku + katalog) pod adresem Pages projektu. Daje link do podglądu bez instalowania czegokolwiek; działa na gitlab.com Free.

## 4. Symulacja ekonomii

Cel: projektant zmienia parametry i widzi skutki w minutach, nie w godzinach gry. Trzy narzędzia uzupełniające się:

### 4.1 Panel projektanta (F6, istnieje)

Rozszerzenia (po decyzjach P7, AT4):
- porównanie dwóch zapisów (A/B) na jednym wykresie przepływów;
- „Cele er” jako dane (dziś cele misji z kanwy): czas do E1, E2 z zapisu;
- eksport wykresów i tabel do Markdown (wklejalne do `docs/`).

### 4.2 Symulacja headless (nowe: `web-game/tools/sim-cli`)

```bash
npm run sim -- --scenario tau-ceti --script scripts/kolonia-e1.json --minutes 4320 --out out/kolonia-e1
```

- **Wejście:** scenariusz, skrypt rozkazów (lista `{ atMinute | when: warunek, command }`, np. „gdy FER ≥ 30, zbuduj MIN na najbliższym złożu”), parametry ekonomii (jak Załącznik A), opcjonalnie harmonogram kroków (1 s jak serwer lub 1/60 s jak mock).
- **Wyjście:** `report.md` (czas osiągnięcia celów, wąskie gardła: minuty w deficycie mocy, minuty z pełnym magazynem, rozkazy odrzucone z powodami), `series.csv` (moc, załoga, magazyn per materiał co minutę), `events.jsonl`, `save.json` (do wczytania w panelu F6 i jako kandydat na złotą powtórkę).
- **Silnik:** dziś `packages/domain` (TS); po B3 to samo przez `game-wasm` albo `cargo run -p game-core --example sim` (szybsze przebiegi masowe).
- **Przemiatanie parametrów:** `--sweep params.json` (siatka wartości) → `sweep.csv` z metrykami per kombinacja; wykres w dokumencie (`dataviz`, paleta D26).

### 4.3 Migawka balansu w CI (raport, nie brama)

Job `balance:report` na `main`: uruchamia 3–5 skryptów referencyjnych (kolonia E0→E1 wg kanwy, kolonia z deficytem mocy, kolonia z pełnym magazynem, Atanor A_NAD) i zapisuje tabelę „czas do celu” do `docs/reports/balance/<data>.md`. Zmiana w katalogu ekonomii pokazuje różnicę względem poprzedniego przebiegu w MR. To ta sama infrastruktura co złote powtórki (02 §5), więc koszt jest mały.

### 4.4 Model rynku (05)

Symulacja hubów (`GalaxySim`) dostaje tryb headless w `sim-cli`: N graczy NPC z profilami produkcji, ceny w czasie, wolumeny; sprawdzamy inflację i stabilność wzoru z dok. 4.6 przed włączeniem graczy.

## 5. Generowane dokumenty i komendy (po wdrożeniu)

| Dokument | Komenda | Sprawdzenie w CI |
|---|---|---|
| `docs/economy-expansion-design.md` | `npm run econ:docs` | `econ:check` |
| `packages/render/src/system/model-registry.generated.ts` | `npm run assets:build` | `assets:check` |
| `packages/api/src/generated/*.ts` (typy protokołu) | `cargo run -p game-protocol --bin gen-ts` | `git diff --exit-code` |
| `web-game/docs/PERF-REPORT.md` | `npm run perf` (runner GPU) | porównanie budżetów (uwaga / przekroczenie) |
| `docs/reports/balance/*.md` | `npm run sim -- --suite` | raport w MR |
| `assets/palette.json` | `npm run tokens` w DS + skrypt | `assets:check` |
| `docs/DECISIONS.md` | ręcznie lub `/sg-decision` | unikalność ID (skrypt `docs:check`) |

## 6. Publikacja i czytanie

| Etap | Jak czytać dokumentację |
|---|---|
| E0–E2 | GitLab renderuje Markdown i Mermaid w repo; `docs/plan/README.md` jako strona startowa; Pages z grą i katalogiem |
| E3+ (D-3, jeśli potrzebne) | MkDocs Material (Python jest) z `docs/` → Pages; nawigacja, wyszukiwanie; bez zmian w plikach |

## 7. Pytania (PYTANIE)

| ID | Pytanie | Opcje | Rekomendacja |
|---|---|---|---|
| D-1 | Przeglądarka assetów | trasa `#/katalog` w web-game; osobna aplikacja Vite w `tools/`; tylko Storybook-podobny harness | trasa w web-game (współdzieli renderer, paletę, UI) |
| D-2 | GitLab Pages z `main` | tak (gra na mocku + katalog); nie | tak |
| D-3 | Generator strony dokumentacji | GitLab Markdown (nic); MkDocs Material | GitLab Markdown do E3, potem decyzja |
| D-4 | Skrypty rozkazów do symulacji headless: format | JSON z warunkami; TypeScript (funkcje) | JSON (czytelny dla projektanta, powtarzalny, serializowalny do złotych powtórek) |
| D-5 | Czy `sim-cli` ma działać na TS do B3, czy od razu na Rust | TS teraz, Rust po B3; czekać na Rust | TS teraz (projektant nie czeka na port) |

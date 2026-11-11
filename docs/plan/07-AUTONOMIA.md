# Autonomiczna implementacja wieloagentowa: protokół, prompt startowy, pilotaż

> **Status:** PROPOZYCJA do akceptacji.
> **Data:** 2026-11-11
> **Cel:** uruchomić wieloetapową implementację, w której agenci samodzielnie budują i testują grę; człowiek decyduje na granicach etapów i w kolejce pytań.
> **Warunek wstępny (FAKT):** `CLAUDE.md`, `tools/gate.mjs` (bramka zielona na `server-b6` 2026-11-11: typecheck, vitest, `cargo fmt/clippy/test`, `econ:check`), dziennik ustaleń `docs/analysis/`.

## 1. Role

| Rola | Zadanie | Czego nie robi |
|---|---|---|
| Koordynator | rozbija etap na zadania, ustala zależności i kolejność, przydziela, zbiera raporty | nie koduje, nie zatwierdza |
| Wykonawca | realizuje jedno zadanie w osobnym worktree i na osobnej gałęzi | nie ocenia własnej pracy |
| Weryfikator | osobny agent: uruchamia bramkę, czyta diff pod kątem zakresu, osłabionych testów i sprzeczności z `DECISIONS.md`; wynik: PASS / FAIL z powodami | nie poprawia kodu wykonawcy |
| Człowiek | akceptuje mapę drogową, rozstrzyga kolejkę pytań, zatwierdza granice etapów | — |

## 2. Pętla zadania

```
zadanie (kryteria akceptacji = testy) → wykonawca (worktree) → bramka → weryfikator
   PASS → merge do gałęzi etapu (auto/<etap>), raport w docs/reports/tasks/
   FAIL → poprawki wykonawcy (max 3 iteracje) → inaczej status "zablokowane" + pytanie do człowieka
```

Granica etapu: gałąź etapu przechodzi `node tools/gate.mjs --full`, koordynator pisze raport etapu (`docs/reports/E<n>.md`), człowiek akceptuje merge do gałęzi głównej.

## 3. Bezpieczniki

- Niejasność = pytanie w raporcie + zadanie zablokowane + następne niezależne zadanie. Zero zgadywania mechaniki.
- Zakazane bez zgody: zmiany `docs/DECISIONS.md`, kontraktów protokołu, liczb ekonomii, historii gita (`force push`, rebase publicznych gałęzi), `main`.
- Limity: 3 iteracje poprawek na zadanie; budżet czasu i kosztu na etap ustala człowiek przed startem (do zmierzenia w pilotażu); twardy stop po 2 zablokowanych zadaniach z rzędu w jednym etapie.
- Testy są prawdą: zakaz osłabiania istniejących testów bez uzasadnienia; weryfikator sprawdza to wprost.
- Jeden właściciel pliku na etap dla plików współdzielonych (typy protokołu, katalog ekonomii): koordynator nie przydziela ich dwóm wykonawcom naraz.
- Zasoby maszyny: nie uruchamiaj równolegle cargo i e2e/`ng test`; porty e2e z puli zarezerwowanej dla agentów (koordynator przydziela), nie 4420 ani 4430.

## 4. Krok 1 — audyt i mapa drogowa (prompt startowy dla Fable 5.2)

Tryb: **tylko odczyt kodu, zapis dokumentów w `docs/`**. Nie zmienia `DECISIONS.md` ani kodu.

```text
Jesteś koordynatorem technicznym projektu gry kosmicznej (repo: C:\my-projects\space-game). Zacznij od przeczytania CLAUDE.md i docs/plan/07-AUTONOMIA.md.

CEL: przygotować mapę drogową autonomicznej implementacji. Nie piszesz kodu produkcyjnego i nie zmieniasz docs/DECISIONS.md.

WEJŚCIE (przeczytaj w tej kolejności):
1. docs/DECISIONS.md, docs/plan/*.md, web-game/docs/UNIFICATION.md
2. docs/analysis/2026-11-11-ustalenia-sesji.md oraz sekcja C rejestru w docs/analysis/2026-11-11-dziennik-pomyslow.md (ustalenia użytkownika; dziennik pomysłów #1–#33 i kolejka W1–W112)
3. server/README.md, server/crates/*, web-game/packages/*, docs/economy-expansion-design.md (punktowo)
4. stan testów: node tools/gate.mjs

ZADANIA:
A. Audyt rozbieżności: tabela "ustalenie ↔ plan/kod/decyzja", z oceną (zgodne / do zmiany / konflikt) i skutkiem w pracy. Zacznij od tabeli konfliktów w docs/analysis/2026-11-11-ustalenia-sesji.md i uzupełnij ją o to, co znajdziesz w kodzie.
B. Propozycja wpisów do docs/DECISIONS.md (jako PROPOZYCJA w osobnym pliku docs/analysis/propozycje-decyzji.md), po jednym wpisie na ustalenie, z ID zgodnym z konwencją.
C. Mapa drogowa: etapy (E1…), w każdym zadania z: identyfikatorem, opisem, kryteriami akceptacji WYRAŻONYMI JAKO TESTY (które pliki testów, jakie asercje), zależnościami, obszarem (client/server/domain/assets/docs), szacunkiem rozmiaru (S/M/L), ryzykiem i właścicielem plików współdzielonych. Zapisz w docs/plan/08-MAPA-DROGOWA.md oraz jako graf zależności (mermaid).
D. Kolejka pytań do człowieka: wszystko, czego nie da się rozstrzygnąć z dokumentów (opcje + rekomendacja + co blokuje). Zapisz w docs/analysis/kolejka-pytan.md. Nie zgaduj.
E. Rekomendacja pierwszego etapu do wykonania i oceny ryzyka pilotażu (docs/plan/07-AUTONOMIA.md §5).

ZASADY: etykiety USTALENIE/FAKT/PROPOZYCJA/PYTANIE; nie zmieniaj istniejących plików poza tworzeniem nowych dokumentów wymienionych wyżej; po zakończeniu uruchom node tools/gate.mjs i podaj wynik. Zakończ krótkim podsumowaniem: liczba zadań, liczba pytań blokujących, największe ryzyka.
```

Kryterium zakończenia kroku 1: człowiek akceptuje `08-MAPA-DROGOWA.md` i odpowiada na pytania blokujące etap pilotażowy; wtedy wybrane propozycje trafiają do `DECISIONS.md` (poleceniem człowieka).

## 5. Krok 2 — pilotaż: generator galaktyki w Rust (Q40 a, #33)

**Dlaczego to zadanie:** ograniczone, deterministyczne, testowalne bez UI (testy zgodności i własności), dotyka rdzenia (`game-core`), nie wymaga decyzji o grafice, a odpowiada na realną potrzebę (Q4′ — 3–5 gwiazd w zasięgu wymaga generatora planet).

**Zakres (do potwierdzenia po kroku 1, bo zależy od kolejki pytań):**
- czysta funkcja `generate_system(galaxy_seed, coords) -> SystemSpec` w `game-core` (bez I/O, bez losowości poza ziarnem), kompatybilna z istniejącym katalogiem gwiazd (41 gwiazd rzeczywistych) i `Body`/`insolation`;
- umieszczanie nowego konta: wybór gwiazdy startowej tak, by gracze dzieliło „kilka gwiazd” (#11) — parametry (odległość, ile gwiazd) jako konfiguracja z domyślnymi do potwierdzenia;
- strefa życia z jasności (#32) jako czyste obliczenie; bez wpływu na istniejące biomy dopóki nie zapadnie decyzja (Q39 a: tylko opis).

**Poza zakresem:** UI, protokół WS, teleskopy i skan (#13, #25), cywilizacje tubylcze (#26), zmiana istniejących światów.

**Kryteria akceptacji (jako testy):**
1. Determinizm: to samo ziarno i współrzędne → identyczny wynik (bajt w bajt po serializacji), także po restarcie i na `wasm32`.
2. Niezależność od kolejności: wygenerowanie układów A, B, C w dowolnej kolejności daje te same układy.
3. Własności fizyczne: orbity rosnące, `insolation` zgodna z `luminosity × (900/r)²`, brak ciał o ujemnych/zerowych parametrach, rozkład typów układów w granicach (test statystyczny na 10 000 układów, stałe ziarno).
4. Placement: dla N symulowanych kont odległość najbliższych sąsiadów mieści się w zadanym przedziale; żaden start nie leży w zajętym układzie.
5. Bramka `node tools/gate.mjs --area=rust,docs` zielona; brak zmian w złotych powtórkach istniejących światów.

**Porównanie z modelem odniesienia:** to samo zadanie (ten sam opis i testy akceptacyjne, napisane przez człowieka lub koordynatora **przed** startem) wykonuje drugi zespół agentów na dotychczasowym modelu. Ocena (tabela w raporcie pilotażu):

| Miara | Jak mierzyć |
|---|---|
| Poprawność | liczba testów akceptacyjnych zielonych od pierwszej iteracji; liczba iteracji do zieleni |
| Zakres | rozmiar diffu; pliki poza zakresem; zmiany istniejących testów |
| Jakość | liczba i waga znalezisk niezależnego przeglądu (`/code-review` na gałęzi) |
| Samodzielność | liczba pytań do człowieka, w tym nietrafionych; liczba zablokowań |
| Koszt i czas | tokeny/koszt, czas zegarowy |

**Decyzja po pilotażu:** jeśli Fable 5.2 nie jest gorszy w poprawności i zakresie, a koszt i czas są akceptowalne — wchodzi autonomia etapowa wg §2 na kolejnych etapach mapy drogowej. W przeciwnym razie zawęzić rolę modelu (np. tylko koordynator/weryfikator).

## 6. Otwarte pytania do człowieka (przed startem)

- PYTANIE: budżet kosztu i czasu na pilotaż (twardy limit)?
- PYTANIE: czy pilotaż ma iść równolegle na dwóch modelach (porównanie), czy kolejno?
- PYTANIE: gałąź bazowa dla autonomii — `server-b6` (stan na dziś) czy najpierw porządek z `main`/`terrain`? (Repo ma gałęzie `server-b3-b4`, `server-b4`, `terrain`, worktree `galaxy-b6`; w tej sesji nic nie scalałem.)

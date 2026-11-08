# Konto, panel użytkownika i personalizacja (kolor, awatar, flaga)

> **Status:** PROPOZYCJA do akceptacji.
> **Data:** 2026-11-07

## 1. Stan zastany (FAKT)

| Element | Stan | Źródło |
|---|---|---|
| Logowanie | plansza 2 kanwy „Logowanie dowódcy”; mock przyjmuje dowolny identyfikator i kod; pola: identyfikator, kod, „zapamiętaj”, odsyłacz do resetu; panel „brief” misji | `apps/game/src/app/pages/login-page.ts`, W15 C |
| Tożsamość gracza | brak konta i profilu; symulowani gracze mają `name` („Dowódca …”), `corporation`, `homeStar`, `colonies`, `score` | `api/contract.ts` `SimulatedPlayer`, `galaxy-sim.ts` |
| Design system | jeden kolor sygnałowy (bursztyn, wariant cyjan przez `data-hud-signal`), czerwień tylko dla stanów krytycznych, JetBrains Mono, promień 0, bez cieni; `textFaint` dekoracyjny; ikony obrysowe w `icon-paths.ts`; kolory wykresów D26 sprawdzone walidatorem palety | `design-system/README.md`, D26, G8, P9 |
| Kolory w świecie | paleta scen z tokenów DS; tinty złóż według materiału (`DEPOSIT_TINTS`), nigdy sygnał ani alarm | `render/src/system/palette.ts` |
| Mapa galaktyki | jedna warstwa punktów; warstwy (G1) i przesunięcie kamery (G3) odłożone | `UNIFICATION.md` §5 |
| Język | polski ze słownikiem kluczy; desktop | W16, W17 |
| Panel projektanta | szuflada F2 na ekranie gry (wzór „panelu” w DS: zakładki, formularze, tabele) | §3d |

## 2. Konto i logowanie (U-1)

| Element | Propozycja |
|---|---|
| Rejestracja | e-mail + hasło (argon2id) + znak wywoławczy (callsign); potwierdzenie e-mail przed handlem (ogranicza multikonta) |
| Logowanie | e-mail lub callsign + hasło; „zapamiętaj” = sesja 30 dni; token WS jednorazowy przy wejściu do gry (02 §8) |
| Reset hasła | link e-mail (wymaga dostawcy SMTP: **U-7**) |
| OAuth (Google, Discord) | później (U-1 C), gdy będzie publiczna beta |
| RODO | minimalne dane (e-mail, hash, profil gry); eksport JSON i usunięcie konta z panelu; e-mail nigdy w logach ani w protokole gry |
| Tryb demo | zostaje: „Zagraj bez konta” uruchamia mock lokalnie (jak dziś), bez galaktyki |

Ekran logowania z kanwy zostaje; dochodzi zakładka „Rejestracja” i stany błędów (DS: czerwony powód jak w `RTSButton`).

## 3. Panel użytkownika (trasa `#/dowodca`)

Szuflada jak panel projektanta (D21) albo osobna trasa? **Rekomendacja:** osobna trasa z pasekiem serwisu (`site-bar`), bo panel dotyczy konta, nie bieżącej gry; wejście z paska górnego (ikona profilu) i ze strony głównej.

| Zakładka | Treść | Dane |
|---|---|---|
| Profil | callsign, flaga, kolor, awatar, korporacja i rola, motto (≤ 80 znaków, filtr), data dołączenia; podgląd „jak widzą mnie inni” (karta gracza) | `profiles`, `corp_members` |
| Personalizacja | wybór koloru (§4.1), awatar (§4.2), kompozytor flagi (§4.3), podgląd na mapie galaktyki i na karcie | `profiles` |
| Światy | lista układów gracza: gwiazda, era, status (aktywny / uśpiony / nadrabia), ostatnia aktywność, „Wejdź”; po gwiazdolocie kolejne wpisy | `worlds` |
| Statystyki | wartość netto, wolumen handlu, reputacja per frakcja, liczba projektów Atanora i najlepsze metryki, pozycje w rankingach | galaxy |
| Powiadomienia | lista (przesyłki, kontrakty, korporacja), oznaczanie jako przeczytane, ustawienia (w grze / e-mail) | galaxy |
| Ustawienia | tempo domyślne (tylko dev), nakładka wydajności, ograniczony ruch (`prefers-reduced-motion` nadpisanie), skróty klawiszowe (podgląd mapy klawiszy P1/D12, bez zmiany w MVP), język (PL; EN później) | `profiles.settings` (jsonb) |
| Bezpieczeństwo | zmiana hasła, aktywne sesje z wylogowaniem, eksport danych, usunięcie konta (potwierdzenie hasłem) | `accounts`, `sessions` |

Układ: komponenty DS (`HudFrame`, `RtsButton`, `ResourcePanel` dla statystyk, tabele `tabular-nums`). Kanwa: 2 nowe plansze (`type::design`: Panel dowódcy, Kompozytor flagi).

## 4. Personalizacja

### 4.1 Kolor gracza (U-3)

**Zasada:** kolor gracza **nigdy nie jest kolorem interfejsu**. Bursztyn zostaje jedynym sygnałem HUD. Kolor gracza pojawia się tylko w świecie i na mapie: znacznik kolonii na mapie galaktyki, romby i etykiety statków gracza w widoku układu (dziś `marker` = `text`), pierścień zaznaczenia własnych budowli w widoku obserwacji cudzej kolonii, pole flagi, karta gracza.

| Element | Propozycja |
|---|---|
| Paleta | 12 kolorów stonowanych (jak tinty złóż: nasycenie średnie, jasność dobrana do tła `hull`), **żaden** bliski bursztynowi `#FFB000`, cyjanowi `#4FFFB0` ani czerwieni `#FF5A4A`; generowana skryptem i sprawdzana walidatorem z D26 (rozróżnialność, w tym przy zaburzeniach widzenia barw, kontrast ≥ 3:1 na `hull`) |
| Nazwy | kody jak materiały: `KOB` (kobalt), `OCH` (ochra), `JAD` (jadeit)…; w UI pokazujemy próbkę + kod |
| Niezależność od koloru | tożsamość gracza nigdy tylko kolorem: zawsze kolor + symbol flagi (§4.3) albo tag |
| Kolizje | kolor nie jest unikalny (12 kolorów, tysiące graczy); unikalność daje callsign i flaga; w korporacji oficer może ustalić kolor korporacji, który nadpisuje kolor członków na mapie (przełącznik warstwy G1) |
| Gdzie w kodzie | tokeny `--wg-player-1…12` w `web-game` (nie w DS, bo to kolory danych, jak D26); docelowo do DS razem z P9 |

### 4.2 Awatar (U-2)

| Opcja | Opis | Ocena |
|---|---|---|
| A. Zestaw wbudowany | 24–48 portretów lub emblematów narysowanych w stylu DS | wymaga pracy grafika; mało kombinacji |
| B. Generowany z ziarna | sigil geometryczny w stylu DS: matryca 8×8 kropek (`.hud-dots`) z symetrią, 2 tony (tekst, kolor gracza) w ściętej ramce; ziarno = hash(callsign, konto); „losuj ponownie” do 10 razy; SVG renderowany w kliencie | zero treści do moderacji, spójne z DS, ~10^9 kombinacji, deterministyczne (ten sam SVG na serwerze do podglądów) |
| C. Upload obrazu | własny plik | moderacja, RODO, skalowanie, niezgodne z DS |

**Rekomendacja: B.** Awatar to komponent `HudAvatar { seed, color, size }` w `packages/ui` (Angular) i w DS (React, podgląd). Rozmiary 24 / 48 / 96 px.

### 4.3 Flaga (kompozytor)

| Element | Propozycja |
|---|---|
| Składniki | pole: kolor gracza; układ: 6 wzorów (pełne, pas poziomy, pas skośny, szewron, dysk, kanton); drugi kolor z tej samej palety 12; symbol: 1 z 24–32 ikon obrysowych w stylu `icon-paths.ts` (gwiazda, orbita, kryształ, wiertło, atom, antena, heks, sonda…) w kolorze `text` lub `void` (auto wg kontrastu) |
| Kombinacje | 12 × 6 × 12 × 32 ≈ 27 tys.; unikalność nie wymagana (callsign jest unikalny) |
| Format | definicja `{ layout, color1, color2, symbol }` w `profiles.flag` (jsonb); SVG składany w kliencie i na serwerze (podglądy, karty); proporcje 3:2 |
| Użycie 2D | karta gracza, lista korporacji, mapa galaktyki (znacznik kolonii = mała flaga 12×8 px przy przybliżeniu, kropka w kolorze dalej), czat |
| Użycie 3D (**U-4**) | maszt z flagą przy porcie kosmicznym kolonii: siatka dwu-tonowa z kolorami w wierzchołkach (układ bez symbolu), bo W14 C nie używa tekstur; symbol tylko w 2D. Alternatywa: tekstura KTX2 flagi (M-3), 1 draw call na flagę; odłożona |
| Korporacje i sojusze | ten sam kompozytor; flaga korporacji nad flagą gracza na mapie przy warstwie „korporacje” |
| Moderacja | brak uploadów i brak tekstu na fladze ⇒ nic do moderacji poza callsign i mottem |

### 4.4 Callsign i teksty

- 3–16 znaków, litery (w tym polskie), cyfry, spacja, myślnik; unikalny bez rozróżniania wielkości i diakrytyków; filtr słów (lista + zgłoszenia); zmiana raz na 30 dni (historia w `profiles.previous_callsigns`).
- Motto ≤ 80 znaków, ten sam filtr; korporacja: nazwa 3–32, tag 3–4 wielkie litery.

## 5. Model danych (uzupełnienie 02 §7)

```sql
profiles (
  account_id      uuid primary key,
  callsign        text unique,            -- znormalizowany w callsign_key
  callsign_key    text unique,
  motto           text,
  color_id        smallint,               -- 1..12
  avatar_seed     bigint,
  avatar_rerolls  smallint default 0,
  flag            jsonb,                  -- { layout, color1, color2, symbol }
  settings        jsonb,                  -- UI: perf overlay, reduced motion, language, notifications
  created_at      timestamptz, updated_at timestamptz
);
sessions ( id, account_id, created_at, last_seen_at, user_agent, revoked_at );
notifications ( id, account_id, kind, payload jsonb, created_at, read_at );
```

Korporacje: pole `flag jsonb` i `color_id` w `corporations` (05 §5).

## 6. Miejsce w kliencie

| Element | Gdzie |
|---|---|
| Strony | `apps/game/src/app/pages/profile-page.ts` (zakładki jak panel projektanta), rozbudowa `login-page.ts` (rejestracja, błędy) |
| Komponenty UI | `packages/ui`: `HudAvatar`, `HudFlag`, `HudSwatchPicker` (siatka 12 próbek z kodami, klawiatura, `aria-pressed`), `HudPlayerCard` |
| Design system | ikony symboli flag do `icon-paths.ts` (jak P3); paleta graczy do tokenów z P9; podgląd w `preview/` DS |
| Render | kolor gracza i korporacji w `galaxy-view` (warstwy G1: gracze, korporacje, sojusze), romby statków gracza w `units-layer`; maszt z flagą w `structure-layer` (U-4) |
| Słownik | teksty panelu w `pl.ts`; nazwy kolorów i symboli jako klucze |
| API | `GameApi`/HTTP: `profile.get/update`, `avatar.reroll`, `flag.preview` (SVG z serwera do karty), `sessions.list/revoke`, `account.export/delete`; w mocku: profil w `localStorage`, żeby ekrany działały bez serwera |

## 7. Fazy (epic::user-panel)

| Faza | Zakres | Etap | Brama |
|---|---|---|---|
| U0 | Mock profilu w `localStorage`: callsign, kolor, awatar generowany; karta gracza; kolor na mapie galaktyki | E1 | e2e: zmiana koloru widoczna na mapie; awatar deterministyczny (test snapshot SVG) |
| U1 | Prawdziwe konta na serwerze: rejestracja, logowanie, sesje, reset hasła; panel: Profil, Bezpieczeństwo | E2 | e2e `remote`: rejestracja → gra → wylogowanie; testy argon2 i sesji |
| U2 | Kompozytor flagi; paleta 12 kolorów z walidacją; Światy; Powiadomienia; flagi korporacji (z S2) | E4 | walidator palety zielony; flaga w karcie, na mapie i w panelu korporacji |
| U3 | Ustawienia synchronizowane, Statystyki, eksport i usunięcie konta, maszt z flagą 3D (U-4), OAuth (U-1 C) | E5 | RODO: eksport i usunięcie działają; perf bez zmian po masztach |

## 8. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Kolor gracza rozmywa zasadę jednego sygnału DS | reguła §4.1 (tylko świat i mapa), tokeny `--wg-player-*` poza DS, review designu (`type::design`) |
| Obraźliwe callsigny i motta | filtr, zgłoszenia z panelu, moderator, zmiana wymuszona |
| Dostępność: identyfikacja tylko kolorem | zawsze kolor + symbol/tag; walidator rozróżnialności |
| E-maile i RODO | minimalne dane, eksport/usunięcie od U1, dostawca SMTP z umową powierzenia |
| Flaga 3D kosztuje draw calls | jeden `InstancedMesh` masztów na ciało z kolorami w atrybucie instancji; symbol tylko w 2D |

## 9. Pytania (PYTANIE)

| ID | Pytanie | Opcje | Rekomendacja |
|---|---|---|---|
| U-1 | Metoda logowania | A e-mail + hasło; B OAuth; C oba | **A** w MVP, C w U3 |
| U-2 | Awatar | A zestaw; B generowany; C upload | **B** |
| U-3 | Kolor gracza a DS | tylko świat i mapa; także akcenty HUD gracza | **tylko świat i mapa** |
| U-4 | Flaga w 3D | maszt dwu-tonowy bez symbolu; tekstura KTX2; brak flagi w 3D | **maszt dwu-tonowy** w U3; KTX2 odłożone (M-3) |
| U-5 | Callsign | unikalny globalnie, zmiana co 30 dni; nieunikalny + tag | **unikalny**, zmiana co 30 dni |
| U-6 | Język interfejsu | PL; PL + EN | PL w MVP; słownik gotowy na EN (W16) |
| U-7 | Dostawca e-mail (reset hasła, potwierdzenie) | SMTP własny; usługa (np. Postmark, Resend); bez e-maili w MVP (reset przez kod odzyskiwania) | usługa z planem darmowym; do E2 kod odzyskiwania |
| U-8 | Gdzie panel: trasa czy szuflada | trasa `#/dowodca`; szuflada w grze | **trasa**; w grze tylko karta gracza (podgląd) |

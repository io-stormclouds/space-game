# HUD Design System — taktyczny terminal RTS

Tokeny projektowe i podstawowe komponenty interfejsu gry: przyciski akcji, pasek surowców, karta rozkazów. Klimat to wojskowy terminal taktyczny i brutalistyczny kokpit: matowa czerń, siatka 1px, jeden kolor sygnałowy, ostre krawędzie.

```bash
npm install
npm run dev            # podgląd na http://localhost:4410
npm run tokens         # design-tokens.ts → src/tokens/tokens.generated.css
npm run build          # tokens:check + tsc + vite build
```

## Zasady stylu

| Obowiązuje | Zakazane |
|---|---|
| Tło `#0B0C10` / `#111419`, powierzchnie `#1F2833` | gradienty tła, rozmyte poświaty, `box-shadow` |
| **Jeden** kolor sygnałowy: bursztyn `#FFB000` (wariant `cyan` `#4FFFB0`) — tylko ważne dane, ramki, interakcja | kilka akcentów, kolor dla dekoracji |
| Czerwień `#FF5A4A` wyłącznie dla stanów krytycznych | czerwień jako „drugi akcent” |
| JetBrains Mono, wersaliki w nagłówkach i etykietach, liczby `tabular-nums` | Inter i inne kroje „SaaS” |
| `border-radius: 0`, ścięte narożniki przez `clip-path` | promień > 0, „puszyste” karty |
| Linie 1px, wskaźniki narożne, metki seryjne, matryca kropek | cienie jako głębia |
| Zmiana stanu natychmiast (0 ms), wciśnięcie = odwrócenie kontrastu | przejścia 150–300 ms |

`.hud-root` wymusza część reguł dla całego poddrzewa: `border-radius: 0`, `box-shadow: none` i `transition: none`.

## Struktura

```
src/
├─ tokens/design-tokens.ts        źródło prawdy (kolory, krój, skala, odstępy, kształt, ruch)
├─ tokens/tokens.generated.css    zmienne --hud-* (generowane — nie edytować)
├─ styles/base.css                .hud-root, .hud-gridfield, .hud-dots, .hud-label/.hud-micro/.hud-title, .hud-blink
├─ components/HudFrame/           kontener z narożnikami, zakładką [ ETYKIETA ] i metką seryjną
├─ components/RTSButton/          przycisk akcji
├─ components/ResourcePanel/      górny pasek surowców
├─ components/CommandCard/        siatka rozkazów z inspektorem i skrótami klawiszowymi
├─ icons/Icons.tsx                ikony obrysowe z ostrymi końcami linii
├─ icons/icon-paths.ts            ścieżki tych ikon (bez Reacta)
├─ core/                          część bez Reacta: odczyty surowców, typy kosztów i przycisków; core/index.ts zbiera tokeny, format i ikony
├─ utils/                         format liczb pl-PL, cx()
├─ preview/                       plac zabaw z działającym stanem (nie wchodzi do biblioteki)
└─ index.ts                       publiczny eksport (React)
```

`package.json` wystawia wejścia pakietu:

- `.` to komponenty Reacta;
- `./core` to część bez frameworka;
- `./css/tokens.css`, `./css/base.css` i `./css/<komponent>.css` to style.

Kolejność stylów u konsumenta: `tokens.generated.css`, potem `styles/base.css`. Komponenty importują własny CSS.

## Tokeny

- **Kolory:** `void`, `hull`, `graphite`, `graphiteHi`, `metal`, `line`, `lineFaint`, `text`, `textDim`, `textFaint`, `signal`, `signalDim`, `signalTint`, `signalInk`, `alert`, `alertDim`.
  - `textFaint` służy tylko do dekoracji (metki, linijki): celowo nie spełnia kontrastu tekstu, więc takie elementy mają `aria-hidden`.
  - `signalTint` to kryjąca wersja `signalDim` dla wypełnień zaznaczonych przycisków. Półprzezroczyste wypełnienie przepuszczałoby kolor krawędzi z warstwy pod spodem.
- **Skala mikro-typografii:** `micro 10` · `label 11` · `body 12` · `value 14` · `title 16` · `display 22` px. Nic poniżej 10 px.
- **Odstępy:** 2 · 4 · 6 · 8 · 12 · 16 · 24 px.
- **Kształt i rozmiary:**
  - promień 0, ścięcie 6 px (przyciski) i 4 px (komórki);
  - minimalny cel dotyku 44 px;
  - komórka rozkazu 96×72 px.
- **Ruch:** `instant 0ms`, `flash 70ms` (czas odwrócenia przy aktywacji klawiszem), `blink 1000ms` (skokowy, wyłączany przy `prefers-reduced-motion`).
- **Wariant sygnału:** `data-hud-signal="cyan"` na dowolnym przodku podmienia `signal`, `signalDim` i `signalTint`.

W TypeScripcie: `import { color, cssVar } from './tokens/design-tokens'`. `cssVar.color.signal` daje `'var(--hud-color-signal)'`.

## Komponenty

### `RTSButton`

```tsx
<RTSButton
  label="Wytwórz jednostkę" hotkey="Q" icon={<IconProduce />}
  cost={[{ code: 'MET', amount: 150 }, { code: 'KRY', amount: 50, missing: true }]}
  disabledReason="BRAK: KRYSZTAŁ −40"
  onActivate={produce}
/>
```

- **Stany:**
  - spoczynek: krawędź metalowa;
  - najechanie: krawędź sygnałowa i jaśniejsze wypełnienie;
  - **wciśnięcie: całość staje się blokiem w kolorze sygnału z czarnym tekstem** („kliknięcie”);
  - `selected` (`aria-pressed`);
  - `progress` 0..1: pasek 2 px u dołu;
  - zablokowany: kreskowanie, czerwony powód, a po najechaniu czerwona krawędź.
- **Warianty i układy:** `variant` `default | primary | danger`; `layout` `wide` (samodzielny, z kosztem i powodem) lub `cell` (komórka karty rozkazów).
- **Dostępność:** zablokowany przycisk ma `aria-disabled`, a nie `disabled`, więc nadal można na nim ustawić fokus i odczytać powód (`aria-describedby`). Fokus to przerywana ramka wewnątrz, bo zewnętrzny obrys obciąłby `clip-path`.
- **Uchwyt (ref):** `activate()` naciska przycisk programowo, z błyskiem 70 ms; używają go skróty klawiszowe. Do tego `focus()`.

### `ResourcePanel`

```tsx
<ResourcePanel designation="KOL · TAU-CETI/E" subline="T+01:19:40" readouts={[
  { id: 'metal', code: 'MET', label: 'Metal', value: 1240, rate: 6.4, lowBelow: 300, criticalBelow: 100 },
  { id: 'energy', code: 'ENE', label: 'Energia', kind: 'load', value: 21.5, max: 28, unit: 'MW' },
  { id: 'pop', code: 'POP', label: 'Populacja', kind: 'load', value: 38, max: 45 },
]} />
```

- **Budowa readoutu:** etykieta mikro (kod, nazwa, tempo na minutę) nad wartością, opcjonalnie 10-segmentowy miernik.
- **Stany:**
  - `kind: 'stock'`: niski i krytyczny wg progów `lowBelow` / `criticalBelow`;
  - `kind: 'load'`: niski od 90% limitu, krytyczny od 100%.
- **Wygląd stanów:** niski = wartość w kolorze sygnału; krytyczny = czerwień i migająca dioda.
- **Semantyka:** `<dl>`. Stan jest też podany tekstem dla czytników ekranu.

### `CommandCard`

```tsx
<CommandCard title="CMD" context="Koszary-02 · poz. 2" status="BEZCZYNNE" serial="CC-04 · R2"
  columns={4} rows={3} slots={[ { id: 'unit', label: 'Wytwórz jednostkę', hotkey: 'Q', … }, null, … ]} />
```

- **Siatka:** stała, z liniami podziału 1px (odstęp 1px na tle w kolorze linii). Puste sloty to matryca kropek z numerem.
- **Inspektor** pod siatką pokazuje najechany lub wybrany rozkaz: nazwę, klawisz, koszt i powód blokady.
- **Skróty:** gdy `hotkeys`, karta nasłuchuje klawiszy w oknie. Pomija pola tekstowe i modyfikatory, a naciśnięcie miga komórką i wykonuje rozkaz.

## Przeniesienie do Angulara

Wszystkie PoC są w Angularze 22. Warstwa CSS (tokeny, `base.css` i pliki CSS komponentów z klasami `hud-*` / `rts-btn*`) nie zależy od Reacta. Komponenty Angulara mogą renderować te same klasy i atrybuty (`aria-disabled`, `aria-pressed`, `data-flash`, `data-state`). Do przepisania zostaje tylko logika: błysk przy aktywacji, skróty klawiszowe i stan inspektora.

Port istnieje w `web-game/packages/ui`. Zależy od tego pakietu przez `file:`. Ładuje CSS z wejść `./css/*`, a tokeny, formatowanie, `resourceState` i ścieżki ikon bierze z `./core`, bez kopii. Zmiana w DS wymaga więc sprawdzenia obu stron: `npm run build` tutaj i `npm run check` w `web-game/`.

## Weryfikacja

`npm run build` sprawdza zgodność wygenerowanego CSS z tokenami, typy i build. Podgląd sprawdzono w Chromium przy 1440×900 i 400 px: bez błędów konsoli i bez poziomego przewijania strony.

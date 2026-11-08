# Spike: kafelki KayKit Medieval Hexagon na siatce Goldberga

Materiał pomocniczy do `docs/planet-terrain-design.md`. To **nie jest kod produkcyjny**: strona Three.js renderowana w headless Chromium (Playwright z `web-game/`), która sprawdza, czy regularne heksy z paczki da się bez szwów położyć na siatce Goldberga GP(n,0), i mierzy koszt (trójkąty, draw calls).

## Uruchomienie

Wszystko z katalogu `web-game/` (stamtąd biorą się `three`, `esbuild` i `playwright`):

```bash
cd web-game
npx esbuild ../docs/analysis/planet-terrain-spike/entry.ts --bundle --format=esm --platform=neutral --outfile=../docs/analysis/planet-terrain-spike/domain.js
node ../docs/analysis/planet-terrain-spike/run.mjs                      # wszystkie ujęcia -> shots/*.png + shots/stats.json
node ../docs/analysis/planet-terrain-spike/run.mjs medieval-warp-zoom   # jedno ujęcie
node ../docs/analysis/planet-terrain-spike/fit.mjs                      # dopasowanie regularnego heksa do kafelków GP(3..8,0)
node ../docs/analysis/planet-terrain-spike/edges.mjs                    # maski wyjść dróg, brzegów i przejść
node ../docs/analysis/planet-terrain-spike/palette.mjs                  # stonowane barwy materiałów KayKit
node ../docs/analysis/planet-terrain-spike/glb-info.js <plik.glb>...    # trójkąty, materiały, wymiary z nagłówka GLB
```

Ujęcia: `catalog` (wszystkie 44 kafelki rodziny forest + water), `<preset>-<tryb>[-zoom|-far]`, gdzie preset ∈ `mixed | winter | dry | medieval`, tryb ∈ `warp | flat`. Parametry strony: `?preset=…&mode=…&n=8&zoom=2.3`.

## Pliki

| Plik | Rola |
|---|---|
| `index.html`, `main.js` | strona: siatka z domeny, klasy terenu z szumu, wybór wariantu kafelka, odkształcenie (warp), dekor instancjonowany, statystyki w `window.spikeStats` |
| `entry.ts` → `domain.js` | re-eksport `buildGoldbergGrid`, `tileWidth`, `hash3`, `fbm` z `web-game/packages/domain` (bundlowane esbuildem, bez zmian w domenie) |
| `run.mjs` | Playwright: serwuje pliki z repo przez `page.route`, robi zrzuty 1440×900, zapisuje `stats.json` |
| `fit.mjs` | pomiar nieregularności kafelków Goldberga i szczelin między płaskimi kafelkami |
| `edges.mjs` | które krawędzie heksa dotyka droga, woda, podniesiona połowa przejścia |
| `palette.mjs` | barwy materiałów KayKit po stonowaniu wzorem z `palette.ts` (`muteBodyColor`) |
| `glb-info.js` | inspekcja GLB bez zależności |
| `stats.json` | wynik ostatniego przebiegu (2026-11-07), liczby cytowane w dokumencie |

Zrzuty z tego przebiegu są w `docs/img/planet-terrain/`.

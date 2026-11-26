# E1-rng-seed · Ziarno galaktyki mieszane przed współrzędnymi

## 1. Status

**gotowe do weryfikacji.** Gałąź `auto/domkniecie-rng` (baza `8b1b376`), commit implementacji `5f7ca88`; raport w następnym commicie tej samej gałęzi.

Podstawa: decyzja człowieka z 2026-11-26 („wg rekomendacji”) w sprawie pytań 6 i 1 z `docs/reports/E1.md` §4.

## 2. Co zrobiono

| Plik | Zmiana |
|---|---|
| `server/crates/game-core/src/galaxy/generator/rng.rs` | blok CONTRACT: `state(key) = absorb(absorb(absorb(absorb(mix(seed + GAMMA), x), y), z), stream)`; zdanie z uzasadnieniem i odnośnikiem do decyzji; `Rng::for_cell` zaczyna od `mix(seed.wrapping_add(GAMMA))` |
| `server/crates/game-core/src/galaxy/generator/mod.rs` | reguła zmiennoprzecinkowa w nagłówku: dokładne w IEEE 754 metody `f64` (`floor`, `ceil`, `trunc`, `abs`, `min`, `max`) dozwolone jak `sqrt`; pozostałe funkcje nadal z `libm`. Kod bez zmian (`libm::floor` w `cell_of` zostaje) |
| `server/crates/game-core/tests/galaxy_gen.rs` | nowe wartości w `rng_matches_recorded_values` (sekcja 3) z komentarzem o pochodzeniu; nowy test `seeds_differing_in_low_bits_give_different_galaxies` |
| `server/conformance/vectors/galaxy-gen.json` | nagrany ponownie: `cargo run -p conformance -- galaxy-record conformance/vectors/galaxy-gen.json` (w `server/`) |
| `docs/reports/tasks/E1-rng-seed.md` | ten raport |

`server/README.md` nie opisuje kontraktu `Rng`, więc zostaje bez zmian (kryterium 8). Starsze raporty (`E1-01`, `E1-03`, `E1-05`, `E1-brief`, `E1.md`) cytują stary kontrakt jako zapis historyczny; nie są ruszane.

## 3. Zmiana istniejących asercji: `rng_matches_recorded_values`

USTALENIE (decyzja 2026-11-26): kontrakt `Rng` się zmienia, więc liczby zapisane z poprzedniego kontraktu muszą się zmienić. To jedyna zmieniona istniejąca asercja; reszta pliku testów bez zmian poza nowym testem.

**Skąd nowe wartości.** Niezależny program w Node.js na `BigInt`, napisany od zera z opisu kontraktu (nie z kodu Rust), w katalogu tymczasowym poza repozytorium. Sprawdzenia programu:
- krok SplitMix64 dla ziarna 1234567 daje opublikowaną pierwszą liczbę 6457827717110365317;
- ten sam program w trybie starego kontraktu (bez `mix(seed + GAMMA)`) daje **wszystkie** dotychczas zapisane wartości testu (10 liczb, 4 wzorce bitowe `f64`, liczbę 0.455329560010751, klucz zerowy i brzegowy).

Treść programu:

```js
const M = (1n << 64n) - 1n;
const GAMMA = 0x9E3779B97F4A7C15n;
const mix = (z) => {
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M;
  return z ^ (z >> 31n);
};
const absorb = (h, v) => mix(((h ^ v) + GAMMA) & M);
const coord = (v) => BigInt.asUintN(32, BigInt(v));
function state(seed, x, y, z, stream, mixSeed) {
  let h = mixSeed ? mix((seed + GAMMA) & M) : seed;
  h = absorb(h, coord(x)); h = absorb(h, coord(y)); h = absorb(h, coord(z));
  return absorb(h, stream);
}
function draws(seed, x, y, z, stream, mixSeed, n) {
  let s = state(seed, x, y, z, stream, mixSeed); const out = [];
  for (let i = 0; i < n; i++) { s = (s + GAMMA) & M; out.push(mix(s)); }
  return out;
}
// next_f64 = Number(u >> 11n) / 2 ** 53, bity przez DataView.setFloat64
```

| Klucz | Stare (kontrakt `seed ^ x`) | Nowe (kontrakt `mix(seed + GAMMA)`) |
|---|---|---|
| `(0x5eed_cafe_f00d_0001, (-3, 7, 12), 5)`, 10 × `next_u64` | `0x7490_7a61_25f3_62fe` … `0x0eaa_225b_414f_5f0b` | `0x83ca_c558_0859_c96b`, `0x8397_9f53_6f2c_0b1b`, `0xa9f1_4b97_c2b8_3fd9`, `0x54f1_0462_8edf_614a`, `0x5702_0780_aee8_68b6`, `0x66a5_be53_76bd_0ace`, `0xd98a_cd2c_f6ba_0129`, `0xcd74_cbe0_2aa9_a250`, `0x9bdf_916d_3871_5485`, `0xa32d_9211_4b20_72cc` |
| ten sam klucz, 4 × `next_f64` (bity) | `0x3fdd_241e_9849_7cd8` … | `0x3fe0_7958_ab01_0b39`, `0x3fe0_72f3_ea6d_e581`, `0x3fe5_3e29_72f8_5707`, `0x3fd5_3c41_18a3_b7d8` |
| ten sam klucz, pierwsze `next_f64` | 0.455329560010751 | 0.5148127880023373 |
| klucz zerowy, 2 × `next_u64` | `0x78ae_5a9a_6b5f_d45e`, `0xb989_5a2b_6859_2df1` | `0xcbd3_7ad2_9b93_b094`, `0x2994_69dd_535a_ceff` |
| `(u64::MAX, (i32::MIN, i32::MAX, -1), 0xffff_ffff)`, 2 × `next_u64` | `0x255c_773c_7bf3_9178`, `0x0b35_c49b_8d82_87a5` | `0x027f_13e7_7da8_6e41`, `0x3897_1932_4921_1c03` |

## 4. Nowy test `seeds_differing_in_low_bits_give_different_galaxies`

1. Ziarna 1, 2, 3 (parami różnią się o d = 3, 1, 2): liczby gwiazd w 10 000 dalekich komórkach (`far_cell(0..10 000)`, x = 2000 ..= 2099). Dla każdej pary: (a) co najmniej jedna komórka różna; (b) różne histogramy liczności (ile komórek ma 0, 1, 2, … gwiazd). Zakres x zaczyna się od wielokrotności 4 i ma 100 wartości, więc jest zamknięty na x ^ d dla d < 4: przestawienie komórek wzdłuż x nie zmienia histogramu, a więc (b) wykrywa dokładnie opisaną wadę. Samo (a) wady nie wykrywa.
2. Pięć par: komórka (x, 0, 0) przy ziarnie s i komórka (x ^ d, 0, 0) przy ziarnie s ^ d, strumienie 0 i 2^32, trzy pierwsze `next_u64` muszą się różnić. Pary: `(1, 3, 0)`, `(SEED, 1, 5)`, `(SEED, 0xffff_ffff, FAR_X)`, `(0x5eed_cafe_f00d_0001, 0x8000_0000, -3)`, `(0, 7, 100)`.

**Wynik na starym kodzie (przed zmianą `rng.rs`) — czerwony, FAKT:**

```
test seeds_differing_in_low_bits_give_different_galaxies ... FAILED
assertion `left != right` failed: seeds 1 and 2: the same counts of stars, only in other cells
  left: [519, 1433, 2284, 2299, 1669, 991, 498, 184, 87, 26, 7, 2, 1]
 right: [519, 1433, 2284, 2299, 1669, 991, 498, 184, 87, 26, 7, 2, 1]
```

Część 2 sprawdzona osobno na starym kodzie (część 1 tymczasowo wyłączona, plik potem przywrócony bez zmian) — też czerwona:

```
assertion `left != right` failed: cell (0, 0, 0) of the seed 1 and cell (3, 0, 0) of the seed 2 draw the same (stream 0)
  left: [3786468572763441381, 16737827521453657339, 16822398780866489238]
 right: [3786468572763441381, 16737827521453657339, 16822398780866489238]
```

Asercja (a) przeszła na starym kodzie dla ziaren 1 i 2 (zgodnie z oczekiwaniem: inna komórka, ta sama liczba w innym miejscu).

Po zmianie: zielony.

## 5. Wyniki

`cargo test -p game-core --test galaxy_gen`: **27 passed, 0 failed, 0 ignored** — w tym wszystkie testy statystyczne (`density_matches_the_parameter`, `spectral_distribution_within_bounds`, `system_type_distribution_within_bounds`, `nearest_neighbour_distance_within_bounds`, `rocky_moon_share_within_bounds`, `neighbouring_cells_are_uncorrelated` …). Żaden próg nie był ruszany.

Plik wzorcowy po ponownym nagraniu:
```
recorded conformance/vectors/galaxy-gen.json: 50 cells with 154 stars, 200 systems of the cells x = 2000 ..= 2069, 678252 bytes
OK   galaxy-gen (50 cells with 154 stars, 200 systems of the cells x = 2000 ..= 2069, 678252 bytes: the same text)
```
(poprzednio 152 gwiazdy, x = 2000 ..= 2067, 666 054 bajty). SHA-256 nowego pliku: `c7eb8ba3d95971ae8e5099e5aa628dff3671970696f3e0778963a96bcf4c71cd`.

- `cargo test -p conformance --test golden galaxy_generator_matches_its_recorded_vectors`: ok.
- `git diff --stat HEAD -- server/conformance/replays server/conformance/vectors/vectors.json`: puste (istniejące światy nietknięte).
- `npx vitest run packages/wasm-host/src/galaxy-gen.spec.ts --reporter=verbose` (po `npm ci` i `wasm:build`): 2 passed, test nie jest pomijany — moduł `wasm32` daje bajty nagrane natywnie.

Bramki:
```
node tools/gate.mjs --area=rust
> rust:fmt ... ok (0.4 s)
> rust:clippy ... ok (21.1 s)
> rust:test ... ok (67.2 s)
BRAMKA: ZIELONA

node tools/gate.mjs --area=web
> web:typecheck ... ok (4.8 s)
> web:wasm-build ... ok (27.8 s)
> web:unit (vitest) ... ok (11.5 s)
BRAMKA: ZIELONA
```
Pierwszy przebieg bramki rust był czerwony na `rust:fmt` (zbyt długi wiersz w nowym teście); poprawione `cargo fmt -p game-core`, bez zmian treści. `--full`, e2e i `ng test` nie były uruchamiane (zgodnie z zadaniem).

## 6. Decyzje wykonawcy

- Odporność na przestawienie komórek sprawdza histogram liczności, a nie lista posortowana: ten sam sens, a komunikat porażki ma 13 liczb zamiast 10 000.
- Komentarz przy `rng_matches_recorded_values` zachowuje pierwotne zdanie i dopisuje, że wartości przeliczono po decyzji 2026-11-26 nowym programem BigInt, który w trybie starego kontraktu odtwarza stare wartości.

## 7. Pytania do człowieka

Brak.

## 8. Ryzyka

- Każde zapisane gdzieś ziarno galaktyki daje teraz inną galaktykę niż przed zmianą. FAKT: generator nie jest jeszcze podłączony do zapisanych światów (`replays`, `vectors.json` bez zmian), więc nic istniejącego się nie zmienia; plik wzorcowy E1-09 nagrano ponownie.
- Raporty historyczne E1 (`E1-01`, `E1-03`, `E1-05`, `E1-brief`, `E1.md`) opisują stary kontrakt `state(key)`; źródłem prawdy jest blok CONTRACT w `rng.rs`.

# Model ekonomii

Parametryczny model, z którego pochodzą wszystkie tabele w `docs/economy-expansion-design.md`.
Wcześniej leżał tylko w katalogu tymczasowym sesji; od F0 jest w repozytorium.

| Plik | Rola |
|---|---|
| `econ-model.ts` | materiały, receptury, budynki, pojazdy, gwiazdolot; liczy sekcje `GEN: …` |
| `template.md` | treść dokumentu z miejscami `{{GEN: …}}` na tabele |
| `build-doc.mjs` | uruchamia model i składa dokument |

```bash
npm run econ:check   # z web-game/: czy dokument zgadza się z modelem
npm run econ:docs    # z web-game/: zapisuje dokument od nowa
```

## Zasady

- Liczb w tabelach dokumentu nie poprawia się ręcznie. Zmienia się parametry w `econ-model.ts`, a tekst w `template.md`, i generuje dokument.
- Dane gwiazd model czyta z `poc/space-galaxy-poc/star-map/src/app/data/stars.data.ts` (bez zmian w PoC). Po F1 źródłem będzie katalog gwiazd w `packages/domain`.
- Jednostka czasu modelu to 1 minuta (założenie Z6, potwierdzone 2026-11-07).

## Zmiana przy przeniesieniu (F0)

W dokumencie dwie linie przy gwiazdolocie poprawiono ręcznie już po wygenerowaniu: pogrubione etykiety, lista i dopisek o Platynicie i Kwantycie. Generator pisze je teraz w tej samej postaci, więc `econ:check` przechodzi bez zmiany dokumentu. Liczby były zgodne.

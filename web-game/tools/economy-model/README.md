# Model ekonomii

Generator dokumentu `docs/economy-expansion-design.md`. Od F1 dane i obliczenia mieszkają w domenie gry (`packages/domain/src/economy`), a tutaj zostało tylko formatowanie tabel. Gra, dokument i panel projektanta (F6) mają więc jedno źródło.

| Plik | Rola |
|---|---|
| `packages/domain/src/economy/catalog-data.ts` | materiały, receptury, magazyny, budynki, pojazdy, moduły gwiazdolotu |
| `packages/domain/src/economy/economy-model.ts` | `computeEconomy(params)`: wartości materiałów, mnożniki ery, koszty, czasy, moc i załoga poziomów |
| `packages/domain/src/galaxy/stars.ts` | 41 gwiazd (tabela zasięgu gwiazdolotu) |
| `econ-model.ts` | formatuje sekcje `GEN: …` |
| `template.md` | treść dokumentu z miejscami `{{GEN: …}}` |
| `build-doc.mjs` | uruchamia model i składa dokument |

```bash
npm run econ:check   # z web-game/: czy dokument zgadza się z modelem
npm run econ:docs    # z web-game/: zapisuje dokument od nowa
```

## Zasady

- Liczb w tabelach dokumentu nie poprawia się ręcznie. Dane zmienia się w `catalog-data.ts`, parametry w `DEFAULT_ECONOMY_PARAMS`, tekst w `template.md`, a potem generuje dokument.
- Jednostka czasu modelu to 1 minuta (założenie Z6, potwierdzone 2026-11-07).

## Historia

- **F0:** skrypt przeniesiony z katalogu tymczasowego sesji. Dwie linie przy gwiazdolocie, poprawione kiedyś ręcznie w dokumencie, generator pisze teraz w tej samej postaci.
- **F1:** dane i obliczenia przeniesione do domeny; gwiazdy z domeny (pole `distance` bez zmian). Dokument wyszedł bajt w bajt taki sam.

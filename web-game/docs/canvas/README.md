# Archiwum kanwy „Interfejs gry — kolonizacja układu”

Kopia plansz z kanwy Claude Design: https://claude.ai/artifact/SQbAmErJqmPLwCYGSV6DHB

- **Stan:** wersja przerobiona pod `design-system/`, skopiowana 2026-11-07. Rozmiary wszystkich 10 plików zgadzają się z opublikowaną wersją.
- **Źródło prawdy:** plansze edytuje się w kanwie, a po zmianach trzeba odświeżyć tę kopię. Tutaj służą jako wzorzec dla F3: porównanie zrzutów 1440×900 i dane przykładowe.

| Plansza | Plik | Zrzut |
|---|---|---|
| 1 · Strona główna — znany wszechświat | `boards/Main.dc.html` | `screenshots/Main.png` |
| 2 · Logowanie dowódcy | `boards/Login.dc.html` | `screenshots/Login.png` |
| 3 · Przybycie statku-matki | `boards/Arrival.dc.html` | `screenshots/Arrival.png` |
| 4 · Skanowanie i wybór planety | `boards/Scan.dc.html` | `screenshots/Scan.png` |
| 5 · Budowa portu kosmicznego | `boards/Spaceport.dc.html` | `screenshots/Spaceport.png` |
| 6 · Rozbudowa kolonii — zaznaczanie | `boards/Colony.dc.html` | `screenshots/Colony.png` |
| 7 · Widok układu — statki i planety | `boards/System.dc.html` | `screenshots/System.png` |
| 8 · Mapa znanych światów (w grze) | `boards/Galaxy.dc.html` | `screenshots/Galaxy.png` |
| 9 · Komponenty HUD | `boards/HudKit.dc.html` | `screenshots/HudKit.png` |

`boards/canvas.json` opisuje układ plansz i notatki kanwy, w tym przepływ Play i zasady RTS.

Plansze nie działają jako samodzielne strony. Potrzebują środowiska typu Design (`support.js`), którego nie ma w repozytorium. Do podglądu służy kanwa, a do porównań zrzuty.

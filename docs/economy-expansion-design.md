# Ekonomia i ekspansja w układzie słonecznym — projekt

> **Status:** propozycja do dyskusji (Etap 1 stage-gate). Liczby to pierwsza kalibracja do dalszej iteracji, nie ostateczny balans.
> **Data:** 2026-11-07
> **Powiązane:** [`game-mechanics-analysis.md`](game-mechanics-analysis.md) — fakty z PoC i warianty integracji; [`game-design-questions.md`](game-design-questions.md) — otwarte decyzje.
> **Zakres:** surowce i materiały; ekonomia kosztów (energia, czas, składowanie, handel); budynki i pojazdy z poziomami rozbudowy; modele 3D i animacje; logistyka w stylu Factorio; droga do gwiazdolotu i wyboru kolejnej gwiazdy.

## Jak czytać

- **[PoC]** oznacza fakt wynikający z kodu, z odnośnikiem do pliku. Wszystko bez tego oznaczenia to propozycja projektowa.
- Wszystkie tabele z liczbami (wartości materiałów, koszty poziomów, czasy zwrotu, łańcuchy produkcji, transport, gwiazdolot, gwiazdy) **pochodzą z jednego modelu obliczeniowego** o parametrach z Załącznika A. Zmiana parametru spójnie zmienia wszystkie tabele. Żadna z nich nie jest wpisana ręcznie.
- Nowe pytania mają identyfikatory `EXP-…` (rozdz. 12). Odwołania `EKO-…`, `WIZ-…` itd. prowadzą do istniejących pytań w `game-design-questions.md`.

### Założenia przyjęte ze zlecenia

Zlecenie de facto rozstrzyga kilka otwartych pytań. Traktuję te rozstrzygnięcia jako robocze założenia; trzeba je jeszcze potwierdzić w polach „Decyzja”.

| # | Założenie | Skąd | Pytanie |
|---|---|---|---|
| Z1 | Celem gry w układzie jest gwiazdolot i wybór kolejnej gwiazdy na mapie galaktyki | „budowy statku … pozwalającego wybrać następny układ słoneczny” | `WIZ-3` = A, `POC-1` = B + C |
| Z2 | Materiały T3/T4 powstają wyłącznie w Fabryce atanorowej; T1/T2 w zwykłych fabrykach | „późniejsze [poziomy] wymagają materiałów egzotycznych budowanych za pomocą space-atanor” | `WIZ-2` (hybryda A/B) |
| Z3 | Magazyny są lokalne (na ciele niebieskim), a materiały przemieszczają się fizycznie: pasami, rurami i pojazdami | „dostarczanie surowców … za pomocą pasów, rur … oraz pojazdów” | `EKO-3` = B, `EKO-8` |
| Z4 | Energia ogranicza produkcję w czasie: pobór jest ciągły, a deficyt obniża wydajność | „ekonomia oparta na kosztach (w tym mocy)” | `EKO-2` = B |
| Z5 | W obrębie układu gra jest jednoosobowa (kolonia gracza); handel odbywa się przez rynek | „rozbudowa cywilizacji i opanowanie układu” | `WIZ-1` = C, `SOC-1` |
| Z6 | **Skala czasu: jednostka modelu to 1 minuta czasu rzeczywistego.** PoC działa według tych samych reguł ×60 szybciej | uzasadnienie poniżej | `EKO-1`, `EXP-1` |

**Dlaczego Z6.** W PoC kopalnia kosztuje 15 Ferrytu i wydobywa 2 Ferrytu na sekundę [PoC `poc/space-3d-poc/src/app/game/models/structure.model.ts:27`], a panel słoneczny za 10 Silicytu daje 5 mocy. Każda inwestycja zwraca się więc po kilku sekundach. W pierwszej wersji tego modelu, liczonej w tym tempie, cała droga do gwiazdolotu zajmowała poniżej godziny pracy późnej kolonii. Zamiast zmieniać proporcje PoC, zostawiam te same reguły i spowalniam zegar:
- 2 Ferryty na minutę zamiast na sekundę;
- lot planeta → asteroida trwa 4–16 min zamiast zmierzonych w PoC 4–16 s;
- okres orbity planety to 4 h zamiast 240 s.

Geometria, zużycie paliwa i proporcje zostają bez zmian, a PoC może dalej służyć jako tryb testowy ×60.

## Spis treści

1. Streszczenie
2. Punkt wyjścia w PoC
3. Łuk progresji: od lądowania do gwiazdolotu
4. Ekonomia kosztów: materiały, energia, składowanie, załoga, handel
5. Budynki: zasady rozbudowy, katalog, koszty, modele i animacje
6. Pojazdy
7. Logistyka w stylu Factorio
8. Fabryka atanorowa w ekonomii
9. Gwiazdolot i wybór kolejnego układu
10. Modele 3D: zasady i pipeline
11. Ryzyka
12. Otwarte kwestie

Załącznik A — parametry modelu

---

## 1. Streszczenie

- **Progresja.** Sześć er, od E0 „Lądowanie” do E5 „Gwiazdolot”, przechodzonych przez kolejne poziomy Centrum dowodzenia (HQ). Docelowo ok. 4 tygodnie gry asynchronicznej. Kolejne ery wprowadzają nowe ciała: Księżyc, pas asteroid, gorącą planetę Pyros, gazowego olbrzyma Gigas z lodowym księżycem Glacją i kometę Kerys.
- **Materiały.** 37 pozycji w pięciu poziomach:
  - 12 surowców: 5 pospolitych, 6 rzadkich, 1 egzotyczny;
  - 12 materiałów przetworzonych (T1);
  - 7 komponentów (T2);
  - 3 materiały zaawansowane (T3, z Atanora);
  - 3 materiały egzotyczne (T4, z Atanora od L3 i z Akceleratora).
- **Wycena.** Wartość każdego materiału to suma wartości wejść, zużytej energii (MW·min × cena energii) i czasu pracy maszyny. Z tego wynikają ceny referencyjne rynku. Atanor daje marżę: projekt lepszy od referencyjnego oznacza koszt niższy od ceny.
- **Budowle.** 45 budynków w ośmiu kategoriach, do tego segmenty logistyczne i 10 pojazdów. Rozbudowa jak w grach RTS, od 1 do 5 poziomów. Na każdym poziomie koszt rośnie ×2, czas ×1,8, wydajność ×1,6, a pobór mocy ×1,45. L3 wymaga komponentów T2, L4 materiałów T3 z Atanora, L5 materiałów T4.
- **Logistyka.**
  - Na planecie: taśmy (15 / 30 / 60 j./min), rury (120 / 360 u/min), pompy, rozdzielacze i przepusty na kafelkach siatki Goldberga; ciężarówki i konwoje jeżdżą po kafelkach.
  - Między ciałami: promy, frachtowce, tankowce i wyrzutnia masy.
  - Porty Fabryki atanorowej odpowiadają glifom INPUT/OUTPUT z PoC.
- **Gwiazdolot.** Pięć modułów składanych na pięciu poziomach Doku gwiezdnego, napęd Mk I–IV o zasięgu 5–17 ly. W tym zasięgu leży 21 gwiazd z `stars.data.ts`. Odległość decyduje o ilości paliwa fuzyjnego (40 Kapsuł na rok świetlny), a jasność gwiazdy o energetyce nowej kolonii.
- **Modele 3D.** Z 70 modeli KayKit (żaden nie ma animacji) da się złożyć większość budowli mieszkalnych, magazynowych i transportowych na poziomach L1–L3. Przemysł, orbita i statki wymagają nowych modeli w tym samym stylu. Animacje wymagają zmiany pipeline'u, bo PoC spłaszcza każdy model do jednej geometrii.

## 2. Punkt wyjścia w PoC (fakty)

| Element | Stan w PoC | Co z tym robi ten projekt |
|---|---|---|
| Surowce | 3: Ferryt, Kriol, Silicyt [PoC `resource.model.ts:2`] | zostają jako T0; dochodzi 9 nowych surowców |
| Budowle | 8 (koszty, moc, wydobycie 2/s) [PoC `structure.model.ts:26-35`] | stają się poziomem L1 odpowiedników; koszty L1 budowli z ery E0 bez zmian |
| Moc | bilans per ciało, sprawdzany tylko przy budowie [PoC `economy/power.ts`] | pobór ciągły, deficyt obniża wydajność, priorytety odbiorców |
| Magazyn | globalny, bez limitu [PoC `reducer.ts:76-81`] | magazyny lokalne z klasami składowania i pulą ciała |
| Statek | Astraeus-1: paliwo 100, ładownia 50, 150 j./s; paliwo = dystans × 0,02 [PoC `initial-world.ts:78-91`, `game-constants.ts:20-29`] | Astraeus Mk I z tym samym bakiem i ładownią, 150 j./min |
| Rezerwa powrotu | lot odrzucany, jeśli zabraknie paliwa na najgorszy powrót [PoC `command.service.ts:73-79`] | naturalna bramka zasięgu: Gigas wymaga większego baku lub tankowania po drodze |
| Łazik | ścieżka BFS po kafelkach, blokowana przez budowle (poza lądowiskiem) [PoC `rover-system.ts:38-66`] | Łazik konstrukcyjny buduje i rozbudowuje; ta sama ścieżka |
| Siatka | Goldberg GP(n,0): planeta 642 kafelki, Księżyc 92; kafelek ma 5–6 sąsiadów i 6–8 j. szerokości [PoC `CLAUDE.md`] | na kafelkach powstaje warstwa logistyczna; budynki 1-, 3- i 7-kafelkowe |
| Asteroida | 500 Ferrytu, bryła kurczy się wraz z wydobyciem (`depletionScale`) [PoC `CLAUDE.md`] | pas asteroid typów M, C i S |
| Orbity | kołowe, stała prędkość kątowa [PoC `orbit-solver.ts:26-31`] | kometa wymaga orbity eliptycznej (rozszerzenie solvera) |
| Atanor | źródła nieograniczone, 16 slotów osi czasu, glify Bonder/Unbonder/Transmute, koszty ramion 20/+10/+20/+10 i glifów 10/10/20 [PoC `pipeline.ts:256-269`, `simulation.ts:12`, `arm.ts:35-41`, `glyph.ts:66-79`] | źródła i ujścia stają się portami budynku, punkty kosztu materiałami (rozdz. 8) |
| Modele | 70 modeli glTF KayKit (CC0), 0 animacji; ruchome części jako osobne węzły w 10 modelach; dwie tekstury palety (`spacebits_texture.png`, `spacebits_texture_alt.png`) [`poc/space-3d-poc/assets/KayKit_Space_Base_Bits_1.0_EXTRA`] | podstawa dla budowli L1–L3 i pojazdów (rozdz. 5.5, 6, 10) |
| Render | `ModelLibrary` spłaszcza każdy model do jednej geometrii; `StructureView` to jeden `InstancedMesh` na ciało [PoC `CLAUDE.md`] | animacje części wymagają zmiany tego podejścia (rozdz. 10) |
| Galaktyka | 41 gwiazd z klasą widmową, jasnością, liczbą planet i dystansem [PoC `stars.data.ts`] | cele gwiazdolotu i profil kolejnej kolonii (rozdz. 9) |

---

## 3. Łuk progresji: od lądowania do gwiazdolotu

### 3.1 Ery

| Era | Poziom HQ | Cel gracza | Nowe ciała | Kluczowe odblokowania | Wejście do następnej ery | Moc kolonii referencyjnej | Orientacyjny czas |
|---|---|---|---|---|---|---|---|
| **E0 Lądowanie** | L1 (start) | uruchomić wydobycie i energię | Planeta Matka | Kopalnia, Ekstraktor Kriolu, Wieża Silicytu, Panel, Turbina, Habitat, Magazyn, Składowisko, Lądowisko, Łazik konstrukcyjny | ok. 10 pierwszych budowli | ~10 MW | pierwsza sesja (~1 h) |
| **E1 Kolonia** | L1 → L2 | metalurgia, woda, żywność, pierwsze taśmy | — | Huta (Stal, Miedź), Betoniarnia, Topielnik lodu, Farma, Koparka regolitu, Rafineria krzemu, Garaż, Ciężarówka, Zbiornik płynów, Stacja załadunkowa, Taśmociąg L1 | HQ L2 | ~40 MW | dzień 1 |
| **E2 Industrializacja** | L2 → L3 | chemia, elektronika, paliwo, wyjście na orbitę | Księżyc (kolonia), orbita planety | Elektrolizer, Skraplacz paliwa, Zakład chemiczny, Montownia, Fabryka elektroniki, Zakład wzbogacania, Reaktor rozszczepienia, Kriomagazyn, Bunkier, Akumulator, rury i pompy, Konwój, Prom, Stacja orbitalna | HQ L3 + Stacja orbitalna L1 | ~150 MW | dni 2–4 |
| **E3 Orbita i asteroidy** | L3 → L4 | statki, asteroidy, pierwsze materiały atanorowe | pas asteroid, Pyros | Stocznia, Frachtowiec, Tankowiec, Górnik asteroidowy, Sonda, Dron, Fabryka atanorowa L1–L3 (Nadprzewodnik, Katalizator, Metamateriał), Huta L3 (Tytan, Stop), Satelita i Rektenna, Wyrzutnia masy, Separatory He-3 i deuteru, Terminal handlowy | HQ L4 | ~500 MW | dni 5–10 |
| **E4 Układ zewnętrzny** | L4 → L5 | paliwo fuzyjne, materiały egzotyczne | Gigas, Glacja, kometa Kerys | Platforma czerpalna, Reaktor fuzyjny, Pułapka magnetyczna, Akcelerator, Fabryka atanorowa L3–L5 (Kapsuła fuzyjna, Procesor kwantowy), Dok gwiezdny L1 | HQ L5 | ~1500 MW | dni 11–20 |
| **E5 Gwiazdolot** | L5 | zbudować i wysłać gwiazdolot | cel: wybrana gwiazda | Dok L2–L5, moduły, napędy Mk II–IV, sonda międzygwiezdna | start gwiazdolotu | ~3000 MW | dni 21–28+ |

**Tempo kamieni milowych (z modelu).** Koszt kamienia milowego wyrażam jako liczbę godzin pełnej produkcji kolonii referencyjnej z ery, w której jest budowany. Kolonia referencyjna to założona moc kolonii w danej erze, z której 60% idzie na produkcję. Docelowe wartości to: ~2 h w E1, ~6 h w E2, ~12 h w E3, ~24 h w E4 i 2–3 dni w E5, plus czasy budowy.

Kolonia referencyjna: moc E0 10 MW, E1 40 MW, E2 150 MW, E3 500 MW, E4 1500 MW, E5 3000 MW; 60% mocy na produkcję; ρ = 0,122 kr/MW·min.

| Kamień milowy | Budowany w erze | Wartość [kr] | Godziny produkcji kolonii referencyjnej | Czas budowy |
|---|---|---|---|---|
| HQ L2 (wejście w E1→E2) | E1 | 304 | 1,7 h | 30 min |
| HQ L3 (wejście w E3) | E2 | 4165 | 6,3 h | 2,0 h |
| Stacja orbitalna L1 | E2 | 1644 | 2,5 h | 2,0 h |
| HQ L4 (wejście w E4) | E3 | 26 556 | 12,1 h | 6,0 h |
| Fabryka atanorowa L1→L3 | E3 | 9368 | 4,3 h | 9,1 h |
| HQ L5 (wejście w E5) | E4 | 160 697 | 24,5 h | 16,0 h |
| Dok gwiezdny L1→L5 | E5 | 421 383 | 32,1 h | 3,7 d |
| Gwiazdolot — rdzeń | E5 | 180 021 | 13,7 h | wg wydajności Doku |
| Paliwo do Proximy (170 Kapsuł) | E5 | 28 975 | 2,2 h | wg wydajności Doku |

### 3.2 Rozszerzony układ słoneczny

PoC ma Słońce, Planetę Matkę, Księżyc i jedną asteroidę [PoC `initial-world.ts:19-76`]. Do opanowania układu potrzeba ciał o różnych profilach. Konfiguracja ciał to dane, więc rozbudowa sprowadza się do dopisania wpisów. Okresy orbit podaję w zegarze modelu (×60).

| Ciało | Typ | Orbita (okres) | Promień / siatka | Start promu z powierzchni | Atmosfera | Nasłonecznienie | Zasoby | Rola |
|---|---|---|---|---|---|---|---|---|
| Słońce | gwiazda | — | 60 | — | — | — | — | źródło energii |
| **Pyros** | gorąca planeta skalista | 450 (2 h) | 30 / GP(6,0) = 362 kafelki | 6 u paliwa | brak | ×4,0 | Kupryt, Tytanit, Uranit; Kriol topnieje | metale, energia (satelity na niskiej orbicie) |
| **Planeta Matka** [PoC] | planeta | 900 (4 h) | 50 / GP(8,0) = 642 | 10 u | jest (wiatr) | ×1,0 | Ferryt, Silicyt, Kriol, Karbonit, Regolit; rzadko Kupryt i Uranit | stolica |
| **Księżyc** [PoC] | księżyc | 160 wokół planety (40 min) | 15 / GP(3,0) = 92 | 2 u | brak | ×1,0 | Silicyt [PoC], Tytanit, Regolit (śladowo He-3), Kriol na biegunach | przemysł orbitalny, wyrzutnia masy |
| **Pas asteroid** [PoC: 1 asteroida] | 6–10 brył typów M, C, S | 1400–1600 (~10 h) | 8–14 / brak siatki | — | brak | ×0,36 | M: Ferryt + Platynit; C: Karbonit + Kriol; S: Silicyt | wyprawy górnicze |
| **Gigas** | gazowy olbrzym | 2600 (25 h) | 110 / brak siatki | — | gęsta | ×0,12 | Hel-3, Deuter (Platforma czerpalna) | paliwo fuzyjne |
| **Glacja** | lodowy księżyc Gigasa | 220 wokół Gigasa (1 h) | 18 / GP(4,0) = 162 | 3 u | brak | ×0,12 | dużo Kriolu, Karbonit | baza zewnętrzna, lokalne paliwo |
| **Kerys** | kometa | eliptyczna 700–3600 (~3 dni) | 5 / brak siatki | — | — | zmienne | Kwantyt, Kriol | materiały egzotyczne; okno dostępu ~12 h w pobliżu peryhelium |

Konsekwencje reguł PoC:
- **Prędkość ciał.** Test `orbit-solver.spec.ts` wymaga, by każde ciało poruszało się wolniej niż połowa prędkości przelotowej (75 j./min) [PoC `CLAUDE.md`]. Nowe ciała spełniają ten warunek: Pyros 23,6 j./min, Glacja razem z Gigasem ok. 34 j./min.
- **Zasięg.** Najgorszy przypadek odległości Planeta ↔ Glacja to ok. 3800 j., więc rezerwa powrotu wynosi ok. 76 u. Astraeus Mk I (bak 100) tam nie poleci. Trzeba Mk II (bak 150) albo tankowania na Glacji. Proponuję, by rezerwę liczyć do najbliższej stacji z Paliwem, a nie zawsze do bazy (→ `EXP-7`).
- **Kometa.** Wymaga orbity eliptycznej. Solver PoC liczy tylko okręgi (`localPosition` używa jednego promienia), mimo że plan PoC przewidywał elipsy (`POC-PLAN.md` §7).

### 3.3 Jak trzy mechaniki prowadzą do celu

```
wydobycie (kafelki, statki) ──► przetwórstwo T1 ──► komponenty T2 ──► Atanor: T3 / T4
     ▲                                                                   │
     │                                                                   ▼
nowe ciała ◄── statki i stacje (T2/T3) ◄── rozbudowa L3–L5 (wymaga T2/T3/T4)
     │
     └──► Gigas + Kerys ──► Kapsuły fuzyjne + Procesory ──► Dok gwiezdny ──► gwiazdolot ──► mapa galaktyki
```

---

## 4. Ekonomia kosztów

### 4.1 Model kosztu

```
V(m) = [ Σ q_wej·V(wej) + P·t·c_E + t·c_T − Σ q_ub·V(ub) ] / q_wyj
E(m) = energia wbudowana w jednostkę materiału   [MW·min/j.]
T(m) = czas maszyn wbudowany w jednostkę          [maszyno-min/j.]
c_E = 0,1 kr / MW·min (rozliczeniowa cena energii)
c_T = 0,1 kr / maszyno-min (amortyzacja zakładu); dla statków 1,0 kr / statko-min
```

- **Koprodukty** (elektroliza, Platforma czerpalna) dzielą koszt według stałych udziałów: Wodór/Tlen po 0,5, Hel-3/Deuter 0,75/0,25. **Produkty uboczne** (np. Tytan daje też Ferryt i Wodę) pomniejszają koszt produktu głównego.
- **Wartość bazowa** jest ceną referencyjną NPC na rynku. Za energię gracz nie płaci kredytami, tylko budową elektrowni i zajętymi kafelkami. Cena c_E służy wycenie i porównaniom, a dzięki niej towary energochłonne są droższe.
- **Receptury Atanora** wycenia się przy rozwiązaniu referencyjnym (rozdz. 8). Projekt gracza lepszy od referencyjnego daje niższy koszt od ceny bazowej, czyli marżę.
- **Energia wbudowana** pozwala porównywać procesy niezależnie od cen. Na przykład koszyk T1–T3 ma ρ ≈ 0,12 kr na MW·min. Z tego wskaźnika korzysta kontrola tempa w 3.1.

### 4.2 Surowce i materiały

| Materiał | Poziom | Źródło | Główne zastosowania |
|---|---|---|---|
| Ferryt [PoC] | T0 | Planeta, asteroidy M | Stal, wczesne budowle |
| Silicyt [PoC] | T0 | Planeta, Księżyc | Krzem, panele |
| Kriol [PoC] | T0 | Planeta, bieguny Księżyca, Glacja, kometa | Woda → Wodór, Tlen, Paliwo |
| Karbonit | T0 | Planeta, asteroidy C, Glacja | Stal, Polimer, Kompozyt, Żywność |
| Regolit | T0 | każdy kafelek bez złoża | Beton regolitowy, He-3 (Księżyc) |
| Kupryt | T0R (rzadki) | Planeta (rzadko), Pyros | Miedź |
| Tytanit | T0R | Księżyc, Pyros | Tytan |
| Uranit | T0R | Planeta (rzadko), Pyros | Pręty paliwowe |
| Platynit | T0R | asteroidy M (wyprawa górnicza) | Nadprzewodnik, Katalizator |
| Hel-3 | T0R | Gigas (czerpak), regolit Księżyca (śladowo) | Kapsuła fuzyjna |
| Deuter | T0R | Gigas (czerpak), woda (śladowo) | Kapsuła fuzyjna |
| Kwantyt | T0X (egzotyczny, fikcyjny) | jądro komety Kerys (wyprawa) | Procesor kwantowy, Antymateria |
| Stal, Miedź, Tytan, Krzem | T1 | Huta, Rafineria krzemu | konstrukcje, przewody, stopy, elektronika |
| Woda, Wodór, Tlen | T1 | Topielnik, Elektrolizer | życie, chemia, paliwo |
| Paliwo | T1 | Skraplacz paliwa | loty statków |
| Beton regolitowy, Polimer | T1 | Betoniarnia, Zakład chemiczny | fundamenty, osłony, izolacja |
| Pręt paliwowy | T1 | Zakład wzbogacania | Reaktor rozszczepienia |
| Żywność | T1 | Farma hydroponiczna | załoga, koloniści |
| Belka, Przewód, Silnik, Układ scalony, Ogniwo PV, Stop tytanowy, Kompozyt | T2 | Montownia, Fabryka elektroniki, Huta L3, Zakład chemiczny L2 | budowle L3, pojazdy, statki |
| Nadprzewodnik, Katalizator, Metamateriał osłonowy | T3 | **Fabryka atanorowa L1–L2** | budowle L4, napędy, fuzja, osłony |
| Kapsuła fuzyjna, Procesor kwantowy | T4 | **Fabryka atanorowa L3–L4** | budowle L5, paliwo i komputer gwiazdolotu |
| Antymateria | T4 | Akcelerator cząstek | napęd Mk IV |

**Procesy i wartości (z modelu):**

| Materiał | Poziom | Klasa składowania | Proces (budynek: wejście → wyjście; czas; moc) | Wartość bazowa [kr/j.] | Energia wbudowana [MW·min/j.] | Czas wbudowany [maszyno-min/j.] |
|---|---|---|---|---|---|---|
| **Ferryt** | T0 | sypkie | Kopalnia: 2 j. na min; 3 MW | 0,20 | 1,5 | 0,5 |
| **Silicyt** | T0 | sypkie | Wieża Silicytu: 2 j. na min; 3 MW | 0,20 | 1,5 | 0,5 |
| **Kriol** | T0 | sypkie | Ekstraktor Kriolu: 2 j. na min; 3 MW | 0,20 | 1,5 | 0,5 |
| **Karbonit** | T0 | sypkie | Kopalnia: 1,5 j. na min; 3 MW | 0,27 | 2,0 | 0,7 |
| **Regolit** | T0 | sypkie | Koparka regolitu: 3 j. na min; 2 MW | 0,10 | 0,7 | 0,3 |
| **Kupryt** | T0R | sypkie | Kopalnia: 1 j. na min; 3 MW | 0,40 | 3,0 | 1,0 |
| **Tytanit** | T0R | sypkie | Kopalnia: 1 j. na min; 3 MW | 0,40 | 3,0 | 1,0 |
| **Uranit** | T0R | radioaktywne | Kopalnia: 0,25 j. na min; 3 MW | 1,60 | 12,0 | 4,0 |
| **Platynit** | T0R | sypkie | Górnik asteroidowy — wyprawa na asteroidę M: 60 Paliwo → 5 Platynit (+ uboczne: 95 Ferryt); 75 min; 0 MW | 23,1 | 91,7 | 23,2 |
| **Hel-3** | T0R | kriogeniczne | Platforma czerpalna: 2 Hel-3 + 8 Deuter (koprodukty) na min; 40 MW | 15,4 | 150 | 3,8 |
| **Deuter** | T0R | kriogeniczne | Platforma czerpalna: 2 Hel-3 + 8 Deuter (koprodukty) na min; 40 MW | 1,28 | 12,5 | 0,3 |
| **Kwantyt** | T0X | egzotyczne | Górnik asteroidowy Mk III — wyprawa kometarna: 150 Paliwo → 5 Kwantyt (+ uboczne: 60 Kriol); 300 min; 0 MW | 87,3 | 260 | 87,6 |
| **Stal** | T1 | sztukowe | Huta: 4 Ferryt + 2 Karbonit → 2 Stal; 4 min; 6 MW | 2,07 | 17,0 | 3,7 |
| **Miedź** | T1 | sztukowe | Huta: 4 Kupryt → 2 Miedź; 4 min; 6 MW | 2,20 | 18,0 | 4,0 |
| **Tytan** | T1 | sztukowe | Huta L3: 4 Tytanit + 20 Wodór → 1 Tytan (+ uboczne: 2 Ferryt + 10 Woda); 8 min; 12 MW | 14,2 | 128 | 14,4 |
| **Krzem** | T1 | sztukowe | Rafineria krzemu: 4 Silicyt + 1 Karbonit → 2 Krzem; 5 min; 8 MW | 2,78 | 24,0 | 3,8 |
| **Woda** | T1 | płynne | Topielnik lodu: 2 Kriol → 20 Woda; 2 min; 4 MW | 0,07 | 0,6 | 0,1 |
| **Wodór** | T1 | gazowe | Elektrolizer: 20 Woda → 20 Wodór + 10 Tlen (koprodukty); 4 min; 12 MW | 0,17 | 1,5 | 0,2 |
| **Tlen** | T1 | gazowe | Elektrolizer: 20 Woda → 20 Wodór + 10 Tlen (koprodukty); 4 min; 12 MW | 0,33 | 3,0 | 0,3 |
| **Paliwo** | T1 | kriogeniczne | Skraplacz paliwa: 20 Wodór + 10 Tlen → 10 Paliwo; 3 min; 10 MW | 0,99 | 8,9 | 1,0 |
| **Beton regolitowy** | T1 | sztukowe | Betoniarnia: 6 Regolit + 10 Woda → 2 Beton regolitowy; 3 min; 4 MW | 1,40 | 10,8 | 3,3 |
| **Polimer** | T1 | sztukowe | Zakład chemiczny: 2 Karbonit + 20 Wodór → 2 Polimer; 5 min; 8 MW | 4,17 | 36,8 | 4,9 |
| **Pręt paliwowy** | T1 | radioaktywne | Zakład wzbogacania: 10 Uranit → 1 Pręt paliwowy; 20 min; 30 MW | 78,0 | 720 | 60,0 |
| **Żywność** | T1 | sztukowe | Farma hydroponiczna: 20 Woda + 1 Karbonit → 1 Żywność; 10 min; 6 MW | 8,67 | 73,0 | 13,7 |
| **Belka konstrukcyjna** | T2 | sztukowe | Montownia: 3 Stal → 2 Belka konstrukcyjna; 3 min; 5 MW | 4,00 | 33,0 | 7,0 |
| **Przewód** | T2 | sztukowe | Montownia: 1 Miedź → 3 Przewód; 2 min; 4 MW | 1,07 | 8,7 | 2,0 |
| **Silnik** | T2 | sztukowe | Montownia: 2 Stal + 4 Przewód → 1 Silnik; 6 min; 6 MW | 12,6 | 105 | 21,3 |
| **Układ scalony** | T2 | sztukowe | Fabryka elektroniki: 1 Krzem + 3 Przewód + 1 Polimer → 1 Układ scalony; 6 min; 10 MW | 16,8 | 147 | 20,8 |
| **Ogniwo PV** | T2 | sztukowe | Fabryka elektroniki: 2 Krzem + 2 Przewód → 1 Ogniwo PV; 5 min; 8 MW | 12,2 | 105 | 16,7 |
| **Stop tytanowy** | T2 | sztukowe | Huta L3: 1 Tytan + 2 Stal → 2 Stop tytanowy; 6 min; 14 MW | 13,7 | 123 | 13,9 |
| **Kompozyt węglowy** | T2 | sztukowe | Zakład chemiczny L2: 3 Karbonit + 2 Polimer → 1 Kompozyt węglowy; 8 min; 10 MW | 17,9 | 160 | 19,8 |
| **Nadprzewodnik** | T3 | kriogeniczne | Fabryka atanorowa L1: 2 Miedź + 1 Platynit + 10 Wodór → 1 Nadprzewodnik; 12 min; 12,5 MW | 45,3 | 292 | 44,9 |
| **Katalizator** | T3 | sztukowe | Fabryka atanorowa L2: 1 Platynit + 1 Krzem → 1 Katalizator; 9 min; 14,7 MW | 40,0 | 248 | 36,0 |
| **Metamateriał osłonowy** | T3 | sztukowe | Fabryka atanorowa L2: 1 Stop tytanowy + 1 Kompozyt węglowy + 2 Beton regolitowy → 1 Metamateriał osłonowy; 14,4 min; 18,7 MW | 62,8 | 573 | 54,6 |
| **Kapsuła fuzyjna** | T4 | kriogeniczne | Fabryka atanorowa L3: 5 Hel-3 + 10 Deuter + 1 Nadprzewodnik → 1 Kapsuła fuzyjna; 14,4 min; 23,6 MW | 170 | 1507 | 81,2 |
| **Procesor kwantowy** | T4 | sztukowe | Fabryka atanorowa L4: 1 Kwantyt + 2 Układ scalony + 1 Nadprzewodnik → 1 Procesor kwantowy; 16,8 min; 32,3 MW | 222 | 1388 | 191 |
| **Antymateria** | T4 | egzotyczne | Akcelerator cząstek: 50 Wodór + 1 Kwantyt → 1 Antymateria; 60 min; 200 MW | 1302 | 12 334 | 156 |

- X_HE3R → Hel-3: 25,0 kr/j. (×1,6 wartości z procesu podstawowego)
- X_DEUW → Deuter: 46,0 kr/j. (×35,9 wartości z procesu podstawowego)
- ρ (średnia wartość / energia wbudowana, koszyk T1–T3) = 0,122 kr na MW·min

Alternatywy pokazują, po co ekspansja. Hel-3 z regolitu Księżyca jest tylko ×1,6 droższy, więc umożliwia wczesne próby z fuzją. Deuter z wody kosztuje ×36 więcej niż z czerpaka na Gigasie, więc dopiero gazowy olbrzym czyni paliwo fuzyjne masowym.

**Drzewo receptur:**

```mermaid
flowchart LR
  subgraph T0["Surowce"]
    FER[Ferryt]; SIL[Silicyt]; KRI[Kriol]; KAR[Karbonit]; REG[Regolit]
    KUP[Kupryt]; TYT[Tytanit]; URA[Uranit]; PLA[Platynit]; HE3[Hel-3]; DEU[Deuter]; KWA[Kwantyt]
  end
  subgraph T1["T1 — przetworzone"]
    STA[Stal]; MIE[Miedź]; TIT[Tytan]; KRZ[Krzem]; WOD[Woda]; H2[Wodór]; O2[Tlen]
    PAL[Paliwo]; BET[Beton]; POL[Polimer]; PRE[Pręt paliwowy]; ZYW[Żywność]
  end
  subgraph T2["T2 — komponenty"]
    BEL[Belka]; PRZ[Przewód]; SLN[Silnik]; UKL[Układ scalony]; OPV[Ogniwo PV]; STP[Stop tytanowy]; KOM[Kompozyt]
  end
  subgraph T3["T3 — Atanor"]
    NAD[Nadprzewodnik]; KAT[Katalizator]; MET[Metamateriał]
  end
  subgraph T4["T4 — egzotyczne"]
    KAP[Kapsuła fuzyjna]; PRO[Procesor kwantowy]; ANT[Antymateria]
  end
  FER --> STA; KAR --> STA; KUP --> MIE; SIL --> KRZ; KAR --> KRZ; TYT --> TIT; H2 --> TIT
  KRI --> WOD; WOD --> H2; WOD --> O2; H2 --> PAL; O2 --> PAL; REG --> BET; WOD --> BET
  KAR --> POL; H2 --> POL; URA --> PRE; WOD --> ZYW; KAR --> ZYW
  PAL -.->|wyprawa| PLA; PAL -.->|wyprawa| KWA
  STA --> BEL; MIE --> PRZ; STA --> SLN; PRZ --> SLN; KRZ --> UKL; PRZ --> UKL; POL --> UKL
  KRZ --> OPV; PRZ --> OPV; TIT --> STP; STA --> STP; KAR --> KOM; POL --> KOM
  MIE --> NAD; PLA --> NAD; H2 --> NAD; PLA --> KAT; KRZ --> KAT; STP --> MET; KOM --> MET; BET --> MET
  HE3 --> KAP; DEU --> KAP; NAD --> KAP; KWA --> PRO; UKL --> PRO; NAD --> PRO; H2 --> ANT; KWA --> ANT
```

### 4.3 Energia

| Źródło | Ciało | L1 → Lmax | Paliwo / warunek | Uwagi |
|---|---|---|---|---|
| Panel słoneczny [PoC: +5] | dowolne z siatką | 5 → 8,5 → 14,5 → 24,6 → 41,8 MW × nasłonecznienie | brak | tani, ale zajmuje kafelki; na Gigasie i Glacji prawie bezużyteczny |
| Turbina wiatrowa [PoC: +10] | tylko z atmosferą (Planeta Matka) | 10 → 16 → 25,6 MW | brak | moc stała |
| Reaktor rozszczepienia | dowolne | 60 → 96 → 154 → 246 MW | 1 Pręt paliwowy / 120 min (×1,6 na poziom), chłodzenie 20 u Wody/min | wymaga Bunkra na pręty |
| Reaktor fuzyjny | dowolne | 400 → 640 → 1024 MW | 1 Kapsuła fuzyjna / 300 min (×1,6 na poziom) | 7 kafelków; energia późnej gry |
| Satelita energetyczny + Rektenna | orbita → dowolne ciało | 30 → 51 → 87 MW × nasłonecznienie orbity × 0,8 | brak | przesył energii między ciałami; satelita przy Pyrosie (×4) zasila zewnętrzne kolonie |
| Akumulator | dowolne | 50 → 90 → 162 → 292 → 525 MW·h; oddawanie 20 → 131 MW | — | wygładza szczyty, osłania priorytety przy awarii |

Nasłonecznienie ciał (z modelu):

- Pyros (orbita 450): ×4,00 → Panel L1 20,0 MW, L5 167 MW
- Planeta Matka i Księżyc (orbita 900): ×1,00 → Panel L1 5,0 MW, L5 41,8 MW
- Pas asteroid (orbita 1500): ×0,36 → Panel L1 1,8 MW, L5 15,0 MW
- Gigas i Glacja (orbita 2600): ×0,12 → Panel L1 0,6 MW, L5 5,0 MW

**Zasady sieci energetycznej:**
- **Sieć per ciało**, jak w PoC. Przesył między ciałami tylko przez satelity i rektenny.
- **Priorytety odbiorców.** P1: życie, kriogenika i pułapki magnetyczne. P2: produkcja. P3: logistyka (taśmy, pompy).
- **Deficyt.** P2 i P3 dostają moc proporcjonalnie: przy 80% zasilania pracują z 80% wydajności. P1 jest chronione, dopóki starcza mocy i akumulatorów; jeśli zabraknie zasilania nawet dla P1, uruchamiają się straty składowania (4.4).
- **Energochłonność.** Paliwo to „energia w zbiorniku”. Łańcuch 3000 u Paliwa/h potrzebuje ok. 740 MW (4.7), więc rozbudowa floty wymusza rozbudowę energetyki.

### 4.4 Składowanie

| Klasa | Budynek (L1) | Pojemność L1 | Moc bazowa | Moc na 1000 j. zapełnienia | Pełny magazyn L1 | Parytet składowania* | Straty bez zasilania |
|---|---|---|---|---|---|---|---|
| sypkie | Składowisko | 20 000 j. | 0 MW | 0 MW | 0,0 MW | Ferryt: ∞; Regolit: ∞ | brak (na Pyrosie Kriol topnieje 5%/h bez zadaszenia) |
| sztukowe | Magazyn | 5000 j. | 0,5 MW | 0 MW | 0,5 MW | Stal: ∞; Układ scalony: ∞ | brak; bez mocy stoi automatyka wydawania |
| płynne | Zbiornik płynów | 10 000 u | 0,2 MW | 0,02 MW | 0,4 MW | Woda: 19,1 d | na ciałach bez atmosfery woda zamarza → zbiornik zablokowany do ogrzania |
| gazowe | Zbiornik ciśnieniowy | 10 000 u | 0,5 MW | 0,1 MW | 1,5 MW | Wodór: 10,2 d; Tlen: 20,5 d | 0,5%/h ulatnia się |
| kriogeniczne | Kriomagazyn | 20 000 u / j. | 1 MW | 0,15 MW | 4,0 MW | Paliwo: 41,2 d; Hel-3: 694,4 d; Nadprzewodnik: 1353,9 d; Kapsuła fuzyjna: 6978,2 d | 2%/h odparowania; Nadprzewodnik traci 1%/h |
| radioaktywne | Bunkier osłonowy | 500 j. | 1 MW | 2 MW | 2,0 MW | Uranit: 4,2 d; Pręt paliwowy: 250,0 d | brak; poza bunkrem składowanie zabronione |
| egzotyczne | Pułapka magnetyczna | 10 j. | 2 MW | 5000 MW | 52,0 MW | Antymateria: 41,1 h; Kwantyt: 52 min | Antymateria: anihilacja zawartości i zniszczenie budynku; Kwantyt: rozpad 1%/h |

\* **Parytet składowania** to czas, po którym energia zużyta na przechowanie jednej jednostki (przy pełnym magazynie) równa się energii jej wytworzenia. Dla większości towarów jest bardzo długi, więc trzymanie zapasów jest tanie, a prawdziwym kosztem jest stały pobór mocy, zajęte kafelki i ryzyko strat przy awarii zasilania. Wyjątki są celowe:
- **Antymateria** osiąga parytet po ok. 41 h, a przy braku zasilania anihiluje i niszczy budynek. Trzeba ją zużywać na bieżąco.
- **Kwantyt** osiąga parytet po ok. godzinie. Nie warto go gromadzić; lepiej od razu przerabiać na Procesory.

**Zasady:**
- **Pula ciała.** Wszystkie magazyny na danym ciele tworzą wspólną pulę dla budowy (materiały dowozi Łazik konstrukcyjny) i dla rynku. Produkcja pobiera materiały wyłącznie fizycznie, z portów połączonych taśmą, rurą lub trasą pojazdu (rozdz. 7).
- **Klasa składowania decyduje o magazynie.** Uranit i Pręty tylko w Bunkrze, Antymateria tylko w Pułapce magnetycznej, materiały kriogeniczne w Kriomagazynie. Wodę i gazy można trzymać w zbiornikach, ale na ciałach bez atmosfery woda zamarza bez ogrzewania.
- **Bufory budynków.** Każdy budynek produkcyjny ma bufor wejścia (2 partie) i wyjścia (5 partii). Pełny bufor wyjścia zatrzymuje produkcję, tak jak w Factorio.
- **Postęp offline.** Produkcja trwa, dopóki są miejsce w magazynach i surowce (zgodnie z rekomendacją `MP-5` = B). Pojemność magazynów wyznacza więc, jak długo kolonia pracuje bez gracza.
- **Rozbudowa magazynów.** Pojemność ×1,8 na poziom, moc ×1,45, więc na wyższym poziomie koszt składowania jednostki spada.

### 4.5 Załoga i potrzeby życiowe

- **Załoga działa jak druga moc:** każdy budynek wymaga jej określonej liczby (kolumna „Załoga L1” w 5.4, ×1,3 na poziom). HQ zapewnia 5 osób, Habitat 10 → 17 → 29 → 49 → 84.
- **Potrzeby na 10 osób na godzinę:** 20 u Wody, 10 u Tlenu, 1 Żywność. Jedna Farma L1 (6 Żywności/h) wyżywi 60 osób, jeden Topielnik L1 (600 u/h) napoi 300. Potrzeby załogi to stałe, umiarkowane ujście surowców.
- **Niedobór** obniża wydajność wszystkich budynków na ciele do 50% i wstrzymuje przyrost.
- **Przyrost:** +1 osoba na 10 min, jeśli w habitatach jest miejsce i potrzeby są pokryte.
- **Koloniści.** Gwiazdolot zabiera 200 osób (rozdz. 9) i trwale zmniejsza załogę układu, dopóki habitaty jej nie odbudują.

### 4.6 Handel

**Ceny:**
- Rynek NPC (Terminal handlowy) kupuje od gracza po 0,8 × V i sprzedaje po 1,25 × V. Opłata terminalu wynosi 5% / 3,5% / 2% zależnie od poziomu Terminalu.
- Cena dynamiczna: `P = V · clamp((popyt/podaż)^0,3; 0,5; 3)`. Nadpodaż obniża cenę najwyżej do połowy wartości bazowej, niedobór podnosi ją najwyżej trzykrotnie.

**Fizyczna dostawa:**
- Towar musi dotrzeć do Terminalu na Stacji orbitalnej: promem, wyrzutnią masy albo frachtowcem.
- Na rynku galaktycznym, czyli z innymi graczami (`SOC-1`), dostawa trwa 1–4 h (kurier NPC).

**Transport między ciałami (z modelu)** — paliwo i czas statku podzielone przez ładownię. Model przyjmuje, że załadowany statek zużywa 1,5 × paliwa:

| Trasa (średni dystans) | Statek | Paliwo w obie strony | Czas w obie strony | Koszt transportu [kr/j.] | Narzut na Stal | Narzut na Nadprzewodnik |
|---|---|---|---|---|---|---|
| Planeta ↔ Księżyc (160 j.) | Astraeus Mk I | 10 u | 2 min | 0,233 | 11,3% | 0,51% |
| Planeta ↔ Księżyc (160 j.) | Frachtowiec Mk I | 10 u | 3 min | 0,031 | 1,5% | 0,07% |
| Planeta ↔ Księżyc (160 j.) | Frachtowiec Mk III | 10 u | 2 min | 0,007 | 0,4% | 0,02% |
| Planeta ↔ Pyros (957 j.) | Astraeus Mk I | 57,4 u | 13 min | 1,392 | 67,4% | 3,07% |
| Planeta ↔ Pyros (957 j.) | Frachtowiec Mk I | 57,4 u | 17 min | 0,186 | 9,0% | 0,41% |
| Planeta ↔ Pyros (957 j.) | Frachtowiec Mk III | 57,4 u | 15 min | 0,045 | 2,2% | 0,10% |
| Planeta ↔ Pas asteroid (1638 j.) | Astraeus Mk I | 98,3 u | 22 min | 2,383 | 115% | 5,26% |
| Planeta ↔ Pas asteroid (1638 j.) | Frachtowiec Mk I | 98,3 u | 30 min | 0,318 | 15,4% | 0,70% |
| Planeta ↔ Pas asteroid (1638 j.) | Frachtowiec Mk III | 98,3 u | 25 min | 0,077 | 3,7% | 0,17% |
| Planeta ↔ Gigas/Glacja (2678 j.) | Astraeus Mk I | 161 u | 36 min | 3,896 | 189% | 8,60% |
| Planeta ↔ Gigas/Glacja (2678 j.) | Frachtowiec Mk I | 161 u | 49 min | 0,520 | 25,1% | 1,15% |
| Planeta ↔ Gigas/Glacja (2678 j.) | Frachtowiec Mk III | 161 u | 41 min | 0,125 | 6,1% | 0,28% |

**Wnioski:**
1. Tanich towarów masowych nie opłaca się wozić małym statkiem. Astraeus podnosi koszt Stali dowiezionej z pasa asteroid o 115%, Frachtowiec Mk III tylko o 3,7%. Klasa statku decyduje o tym, co się opłaca przewozić.
2. Materiały T3/T4 można wozić wszędzie, bo narzut to ułamki procenta wartości. Fabryki atanorowe da się więc stawiać tam, gdzie są energia i kafelki, a nie przy złożach.
3. Różnice między ciałami tworzą arbitraż: Kupryt na Pyrosie, Hel-3 na Gigasie, tytan na Księżycu. Wyrzutnia masy na Księżycu wysyła towary na orbitę bez paliwa (koszt w MW), więc Księżyc staje się naturalną bazą przemysłu orbitalnego.

**Kontrakty.** Frakcje NPC (`SOC-3`) zamawiają konkretne materiały z terminem i premią. Dają krótkoterminowe cele i płynność rynku na starcie.

### 4.7 Przykładowe łańcuchy produkcji (z modelu, budynki L1)

| Proces | Budynek | Budynki L1 (dokładnie) | Moc [MW] | Przepływ |
|---|---|---|---|---|
| R_STA | Huta | 20,0 | 120 | Stal 600/h (10,0/min) |
| X_FER | Kopalnia | 10,0 | 30,0 | Ferryt 1200/h (20,0/min) |
| X_KAR | Kopalnia | 6,67 | 20,0 | Karbonit 600/h (10,0/min) |
| **Razem** | | | **170** | |

| Proces | Budynek | Budynki L1 (dokładnie) | Moc [MW] | Przepływ |
|---|---|---|---|---|
| R_PAL | Skraplacz paliwa | 15,0 | 150 | Paliwo 3000/h (50,0/min) |
| R_ELE | Elektrolizer | 40,0 | 480 | Wodór 6000/h (100/min) |
| R_WOD | Topielnik lodu | 20,0 | 80,0 | Woda 12 000/h (200/min) |
| X_KRI | Ekstraktor Kriolu | 10,0 | 30,0 | Kriol 1200/h (20,0/min) |
| **Razem** | | | **740** | |

| Proces | Budynek | Budynki L1 (dokładnie) | Moc [MW] | Przepływ |
|---|---|---|---|---|
| A_NAD | Fabryka atanorowa L1 | 4,00 | 50,0 | Nadprzewodnik 20,0/h (0,33/min) |
| R_MIE | Huta | 1,33 | 8,0 | Miedź 40,0/h (0,67/min) |
| X_KUP | Kopalnia | 1,33 | 4,0 | Kupryt 80,0/h (1,33/min) |
| X_PLA | Górnik asteroidowy — wyprawa na asteroidę M | 5,00 | 0,0 | Platynit 20,0/h (0,33/min) |
| R_PAL | Skraplacz paliwa | 1,20 | 12,0 | Paliwo 240/h (4,00/min) |
| R_ELE | Elektrolizer | 3,87 | 46,4 | Wodór 680/h (11,3/min) |
| R_WOD | Topielnik lodu | 1,93 | 7,7 | Woda 1160/h (19,3/min) |
| X_KRI | Ekstraktor Kriolu | 0,97 | 2,9 | Kriol 116/h (1,93/min) |
| **Razem** | | | **131** | |

**Wnioski:**
- **Stal jest „ziemskim” wąskim gardłem.** 600 Stali na godzinę wymaga 20 Hut L1 (60 kafelków) albo ok. 3 Hut L5. Ponieważ kafelki są ograniczone, rozbudowa staje się koniecznością.
- **Paliwo jest wąskim gardłem energetycznym.** 3000 u/h pochłania ok. 740 MW.
- **Nadprzewodnik wymaga logistyki kosmicznej:** 20 sztuk na godzinę to stale 5 wypraw górniczych po Platynit i 4 Fabryki atanorowe z rozwiązaniem referencyjnym. Dwa razy lepszy projekt gracza zmniejsza tę liczbę do 2.

---

## 5. Budynki

### 5.1 Zasady rozbudowy (klasyczny model RTS)

1. **HQ wyznacza sufit.** Żaden budynek nie może mieć wyższego poziomu niż Centrum dowodzenia. Poziom HQ wyznacza też erę i limit Łazików konstrukcyjnych.
2. **Budowę wykonuje Łazik konstrukcyjny.** Dojeżdża na kafelek (ścieżka BFS jak w PoC), przywozi materiały z puli ciała i buduje przez czas budowy. Liczba łazików oznacza liczbę równoległych budów. Moduły orbitalne montują drony Stacji orbitalnej z materiałów dostarczonych do magazynu stacji.
3. **Rozbudowa odbywa się w miejscu.** W trakcie budynek pracuje z 50% wydajności (magazyny ze 100%). Anulowanie zwraca 75% materiałów, rozbiórka 50%.
4. **Koszt rośnie wykładniczo.** `Koszt(L) = k_era · [ C₁ · 2^(L−1) + Σ_{j=2..L} D_j · 2^(L−j) ]`, gdzie D_j to materiały dochodzące na poziomie j; raz dodane rosną dalej ×2 na poziom. Pozostałe parametry: czas ×1,8, wydajność ×1,6, pobór mocy ×1,45, załoga ×1,3 na poziom. Wydajność na 1 MW rośnie więc o ok. 10% na poziom, a koszt dwukrotnie: rozbudowa opłaca się głównie wtedy, gdy brakuje kafelków lub złóż.
5. **Materiały poziomów:**
   - L1–L2: surowce i T1;
   - L3: komponenty T2;
   - **L4: materiał T3 z Fabryki atanorowej;**
   - **L5: materiał T4** (Procesor kwantowy, Kapsuła fuzyjna, Antymateria).
6. **Mnożnik ery k** koryguje koszt bazowy tak, by budynek produkcyjny L1 zwracał się w docelowym czasie danej ery. Nie jest to „inflacja” rosnąca z erą: budynki z E3 mają z natury drogie receptury, więc ich korekta jest mała.

| Era | Docelowy czas zwrotu budynku produkcyjnego L1 | Mediana bez mnożnika | Mnożnik kosztu k |
|---|---|---|---|
| E0 Lądowanie | 8 min | 8 min | ×1 |
| E1 Kolonia | 30 min | 7 min | ×4 |
| E2 Industrializacja | 2,0 h | 50 min | ×2 |
| E3 Orbita i asteroidy | 4,0 h | 3,1 h | ×1,5 |
| E4 Układ zewnętrzny | 8,0 h | 4,0 h | ×2 |

**Czas zwrotu budynków produkcyjnych (z modelu).** Zwrot to koszt podzielony przez wartość produkcji brutto. Rozbudowa do L5 zwraca się w ciągu doby lub dwóch:

| Budynek | Era | Wartość produkcji L1 [kr/min] | Koszt L1 [kr] | Zwrot L1 | Przyrost produkcji L4→L5 [kr/min] | Koszt L5 [kr] | Zwrot rozbudowy do L5 |
|---|---|---|---|---|---|---|---|
| Farma hydroponiczna | E1 | 0,87 | 24,0 | 28 min | 1,33 (L3→L4) | 1336 (L4) | 16,7 h |
| Panel słoneczny | E0 | 0,50 | 2,00 | 4 min | 1,72 (L4→L5) | 840 (L5) | 8,1 h |
| Turbina wiatrowa | E0 | 1,00 | 5,00 | 5 min | 0,96 (L2→L3) | 183 (L3) | 3,2 h |
| Reaktor rozszczepienia | E2 | 5,35 | 472 | 88 min | 8,22 (L3→L4) | 6177 (L4) | 12,5 h |
| Reaktor fuzyjny | E4 | 39,4 | 4480 | 114 min | 37,9 (L2→L3) | 22 207 (L3) | 9,8 h |
| Kopalnia | E0 | 0,40 | 3,00 | 8 min | 0,98 (L4→L5) | 667 (L5) | 11,3 h |
| Ekstraktor Kriolu | E0 | 0,40 | 3,00 | 8 min | 0,98 (L4→L5) | 667 (L5) | 11,3 h |
| Wieża Silicytu | E0 | 0,40 | 4,00 | 10 min | 0,98 (L4→L5) | 683 (L5) | 11,6 h |
| Koparka regolitu | E1 | 0,30 | 8,00 | 27 min | 0,29 (L2→L3) | 215 (L3) | 12,5 h |
| Separator He-3 | E3 | 1,54 | 208 | 2,2 h | 1,48 (L2→L3) | 1251 (L3) | 14,1 h |
| Huta | E1 | 1,03 | 48,0 | 46 min | 2,54 (L4→L5) | 5643 (L5) | 37,0 h |
| Rafineria krzemu | E1 | 1,11 | 57,3 | 51 min | 2,74 (L4→L5) | 4258 (L5) | 25,9 h |
| Topielnik lodu | E1 | 0,70 | 16,0 | 23 min | 1,08 (L3→L4) | 842 (L4) | 13,0 h |
| Elektrolizer | E2 | 1,65 | 168 | 102 min | 4,06 (L4→L5) | 4159 (L5) | 17,1 h |
| Skraplacz paliwa | E2 | 3,30 | 207 | 63 min | 5,07 (L3→L4) | 2889 (L4) | 9,5 h |
| Betoniarnia | E1 | 0,93 | 24,0 | 26 min | 1,43 (L3→L4) | 975 (L4) | 11,3 h |
| Zakład chemiczny | E2 | 1,67 | 180 | 108 min | 4,10 (L4→L5) | 5001 (L5) | 20,4 h |
| Zakład wzbogacania | E2 | 3,90 | 617 | 2,6 h | 3,74 (L2→L3) | 3377 (L3) | 15,0 h |
| Montownia | E2 | 2,67 | 180 | 67 min | 6,55 (L4→L5) | 4529 (L5) | 11,5 h |
| Fabryka elektroniki | E2 | 2,79 | 278 | 100 min | 6,86 (L4→L5) | 6907 (L5) | 16,8 h |
| Fabryka atanorowa | E3 | 3,78 | 1066 | 4,7 h | 9,28 (L4→L5) | 26 863 (L5) | 2,0 d |
| Akcelerator cząstek | E4 | 21,7 | 10 496 | 8,1 h | 20,8 (L2→L3) | 47 315 (L3) | 37,9 h |
| Satelita energetyczny | E3 | 2,40 | 1088 | 7,6 h | 2,86 (L2→L3) | 5339 (L3) | 31,2 h |
| Platforma czerpalna | E4 | 4,10 | 3410 | 13,9 h | 3,94 (L2→L3) | 15 207 (L3) | 2,7 d |

### 5.2 Katalog budynków

Sposób wytworzenia, jeśli nie podano inaczej:
- **budowle powierzchniowe** buduje Łazik konstrukcyjny na kafelku (budynki 3- i 7-kafelkowe zajmują kafelek i sąsiadów, rozdz. 7.3);
- **budowle orbitalne** montują drony Stacji orbitalnej.

Koszty są w 5.3, a moc, czas budowy i załoga w 5.4.

#### A. Infrastruktura

| Budynek | Cel / opis | Kafelki | Wymagania | Efekt L1 → Lmax |
|---|---|---|---|---|
| **Centrum dowodzenia (HQ)** | serce kolonii; wyznacza erę i sufit poziomów; magazyn wbudowany; generator własny | 3 | na starcie (L1) | sufit poziomów = poziom HQ; limit Łazików konstrukcyjnych 2 / 3 / 4 / 6 / 8; magazyn wbudowany 2000 j. ×1,8; moc +5 ×1,6; załoga +5 |
| **Lądowisko** [PoC] | punkt dokowania statków na kafelku (w PoC przesuwa punkt dokowania [PoC `world.ts:62-73`]) | 1 | — | statków naraz 1 / 2 / 4; tankowanie 20 / 36 / 65 u/min; od L2 produkcja Promu i Astraeusa |
| **Habitat** [PoC: bez efektu] | mieszkania załogi | 1 | — | załoga 10 → 17 → 29 → 49 → 84 |
| **Farma hydroponiczna** | żywność | 1 | Topielnik lodu | Żywność 6 → 9,6 → 15,4 → 24,6 /h |
| **Garaż pojazdów** | produkcja i serwis pojazdów naziemnych | 1 | HQ L1 | kolejka 1 / 2 / 3; maksymalny Mk pojazdu = poziom Garażu |

#### B. Magazyny

| Budynek | Klasa | Kafelki | Wymagania | Pojemność L1 → Lmax |
|---|---|---|---|---|
| **Magazyn** [PoC: bez efektu] | sztukowe | 1 | — | 5000 → 9000 → 16 200 → 29 160 → 52 488 j. |
| **Składowisko** | sypkie | 1 | — | 20 000 → 36 000 → 64 800 → 116 640 → 209 952 j. |
| **Zbiornik płynów** | płynne | 1 | Topielnik lodu | 10 000 → 18 000 → 32 400 → 58 320 u |
| **Zbiornik ciśnieniowy** | gazowe | 1 | Elektrolizer | 10 000 → 18 000 → 32 400 → 58 320 u |
| **Kriomagazyn** | kriogeniczne | 1 | Skraplacz paliwa | 20 000 → 36 000 → 64 800 → 116 640 u / j. |
| **Bunkier osłonowy** | radioaktywne | 1 | Betoniarnia, HQ L2 | 500 → 900 → 1620 j. |
| **Pułapka magnetyczna** | egzotyczne | 1 | Fabryka atanorowa L1, HQ L4 | 10 → 18 → 32 j. |
| **Akumulator** | energia | 1 | Fabryka elektroniki | 50 → 90 → 162 → 292 → 525 MW·h |

#### C. Energia

Parametry są w tabeli 4.3. Wymagania:
- **Panel słoneczny** [PoC] i **Turbina wiatrowa** [PoC]: brak.
- **Reaktor rozszczepienia** (3 kafelki): Zakład wzbogacania, Bunkier osłonowy.
- **Reaktor fuzyjny** (7 kafelków): Fabryka atanorowa L3, HQ L4.
- **Rektenna** (3 kafelki): Stacja orbitalna, Satelita energetyczny.

#### D. Wydobycie

| Budynek | Cel | Kafelki | Wymagania | Wydobycie L1 → L5 [j./min] |
|---|---|---|---|---|
| **Kopalnia** [PoC] | rudy stałe ze złoża na kafelku (Ferryt, Karbonit, Kupryt, Tytanit, Uranit) | 1 | złoże | Ferryt 2 → 3,2 → 5,1 → 8,2 → 13,1; Karbonit 1,5 → 9,8; Kupryt i Tytanit 1 → 6,6; Uranit 0,25 → 1,6 |
| **Ekstraktor Kriolu** [PoC] | lód ze złoża | 1 | złoże Kriolu | 2 → 3,2 → 5,1 → 8,2 → 13,1 |
| **Wieża Silicytu** [PoC] | kryształy Silicytu | 1 | złoże Silicytu | 2 → 3,2 → 5,1 → 8,2 → 13,1 |
| **Koparka regolitu** | regolit z dowolnego kafelka bez złoża | 1 | HQ L1 | 3 → 4,8 → 7,7 |
| **Separator He-3** | śladowy Hel-3 z regolitu (Księżyc) | 3 | Fabryka elektroniki, Kriomagazyn | 0,1 → 0,16 → 0,26 u/min |

#### E. Przetwórstwo (T1)

Każdy poziom przyspiesza produkcję ×1,6. Receptury są w tabeli 4.2.

| Budynek | Receptury | Kafelki | Wymagania |
|---|---|---|---|
| **Huta** | Stal, Miedź; od L3 Tytan i Stop tytanowy | 3 | HQ L1 |
| **Rafineria krzemu** | Krzem | 3 | Huta |
| **Topielnik lodu** | Woda | 1 | Ekstraktor Kriolu |
| **Elektrolizer** | Wodór + Tlen | 3 | Topielnik, HQ L2 |
| **Skraplacz paliwa** | Paliwo | 3 | Elektrolizer, Zbiornik ciśnieniowy |
| **Betoniarnia** | Beton regolitowy | 1 | Koparka regolitu, Topielnik |
| **Zakład chemiczny** | Polimer; od L2 Kompozyt węglowy | 3 | Elektrolizer |
| **Zakład wzbogacania** | Pręty paliwowe | 3 | Fabryka elektroniki, Bunkier |
| **Separator deuteru** | śladowy Deuter z wody (droga alternatywa przed Gigasem) | 3 | Elektrolizer, HQ L3 |

#### F. Produkcja (T2–T4)

| Budynek | Receptury | Kafelki | Wymagania |
|---|---|---|---|
| **Montownia** | Belka, Przewód, Silnik | 3 | Huta, HQ L2 |
| **Fabryka elektroniki** | Układ scalony, Ogniwo PV | 3 | Rafineria krzemu, Zakład chemiczny |
| **Fabryka atanorowa** | Nadprzewodnik (L1); Katalizator, Metamateriał (L2); Kapsuła fuzyjna (L3); Procesor kwantowy (L4); druga linia produkcyjna (L5) | 7 | Fabryka elektroniki, Stacja orbitalna, HQ L3 |
| **Akcelerator cząstek** | Antymateria | 7 | Fabryka atanorowa L4, Pułapka magnetyczna |

#### G. Logistyka (budynki)

Segmenty logistyczne (taśmy, rury, rozdzielacze, przepusty) opisuje rozdział 7.

| Budynek | Cel | Kafelki | Wymagania | Efekt L1 → Lmax |
|---|---|---|---|---|
| **Pompa** | utrzymuje ciśnienie w sieci rur | 1 | Montownia | zasięg 12 → 20 → 30 kafelków rury |
| **Stacja załadunkowa** | przeładunek między taśmą a pojazdem; przystanek tras cyklicznych | 1 | Garaż | przeładunek 10 → 18 → 32 j./min; stanowiska 1 / 2 / 3 |
| **Wyrzutnia masy** | wystrzeliwuje ładunek na orbitę bez paliwa (tylko ciała o niskiej grawitacji: Księżyc, Glacja) | 7 | Fabryka atanorowa L1, Stacja orbitalna | 2 → 3,6 → 6,5 j./min (salwy po 20 j.) |

#### H. Orbita

| Budowla | Cel | Wymagania | Efekt L1 → Lmax |
|---|---|---|---|
| **Stacja orbitalna** | hub orbitalny ciała: doki, magazyn, tankowanie, przeładunek | Montownia, HQ L2 | doki 2 / 3 / 4 / 6 / 8; magazyn stacji 5000 j. ×1,8; od L2 tankownia, od L3 przeładunek między statkami, od L4 osłony i port dalekiego zasięgu |
| **Stocznia orbitalna** | budowa statków | Stacja orbitalna L2, HQ L3 | L1: Frachtowiec, Górnik, Sonda; L2: Tankowiec i Mk II; L3: Mk III; L4: 2 sloty i sonda międzygwiezdna; tempo budowy ×1,5 na poziom |
| **Terminal handlowy** | moduł stacji; rynek NPC i galaktyczny | Stacja orbitalna L2 | opłata 5% / 3,5% / 2%; aktywne zlecenia 5 / 10 / 20 |
| **Satelita energetyczny** | zbiera energię na orbicie i wysyła ją do rektenny | Fabryka elektroniki, Stocznia | 30 → 51 → 87 MW × nasłonecznienie × 0,8 |
| **Platforma czerpalna** | czerpie Hel-3 i Deuter z atmosfery Gigasa; własne zasilanie z reaktora (na orbicie Gigasa słońce daje ×0,12) | Stocznia L2, HQ L4 | Hel-3 0,2 + Deuter 0,8 u/min → ×1,6 na poziom |
| **Dok gwiezdny** | montaż gwiazdolotu; poziom n odblokowuje moduł n (rozdz. 9) | Stocznia L3, HQ L4 | L1 kadłub; L2 napęd; L3 osłona; L4 komputer nawigacyjny; L5 habitat hibernacyjny i start |

### 5.3 Koszty poziomów (z modelu, z mnożnikiem ery)

| Nazwa | Era (k) | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|---|
| Centrum dowodzenia | E0 (×—) | na starcie | 600 Ferryt + 300 Silicyt + 60 Stal | 2400 Ferryt + 1200 Silicyt + 600 Stal + 300 Belka konstrukcyjna + 60 Układ scalony | 3000 Stal + 1500 Belka konstrukcyjna + 300 Układ scalony + 300 Stop tytanowy + 60 Nadprzewodnik + 40 Metamateriał osłonowy | 15 000 Stal + 7000 Belka konstrukcyjna + 1500 Układ scalony + 1500 Stop tytanowy + 400 Nadprzewodnik + 300 Metamateriał osłonowy + 40 Procesor kwantowy + 60 Kapsuła fuzyjna |
| Lądowisko | E0 (×1) | 30 Ferryt + 10 Kriol | 60 Ferryt + 20 Kriol + 20 Stal | 120 Ferryt + 40 Kriol + 40 Stal + 10 Belka konstrukcyjna + 4 Silnik | — | — |
| Habitat | E0 (×1) | 20 Ferryt + 10 Silicyt | 40 Ferryt + 20 Silicyt + 10 Stal + 10 Beton regolitowy | 80 Ferryt + 40 Silicyt + 20 Stal + 20 Beton regolitowy + 20 Polimer + 4 Układ scalony | 160 Ferryt + 80 Silicyt + 40 Stal + 40 Beton regolitowy + 40 Polimer + 8 Układ scalony + 4 Metamateriał osłonowy | 320 Ferryt + 160 Silicyt + 80 Stal + 80 Beton regolitowy + 80 Polimer + 16 Układ scalony + 8 Metamateriał osłonowy + 1 Procesor kwantowy |
| Farma hydroponiczna | E1 (×4) | 60 Ferryt + 60 Silicyt | 120 Ferryt + 120 Silicyt + 20 Krzem | 240 Ferryt + 240 Silicyt + 40 Krzem + 40 Polimer + 8 Układ scalony | 480 Ferryt + 480 Silicyt + 80 Krzem + 80 Polimer + 16 Układ scalony + 8 Katalizator | — |
| Garaż pojazdów | E1 (×4) | 120 Ferryt + 40 Silicyt | 240 Ferryt + 80 Silicyt + 80 Stal | 480 Ferryt + 160 Silicyt + 160 Stal + 24 Silnik + 16 Układ scalony | — | — |
| Magazyn | E0 (×1) | 15 Ferryt + 5 Kriol | 30 Ferryt + 10 Kriol + 10 Stal | 60 Ferryt + 20 Kriol + 20 Stal + 10 Belka konstrukcyjna | 120 Ferryt + 40 Kriol + 40 Stal + 20 Belka konstrukcyjna + 2 Metamateriał osłonowy | 240 Ferryt + 80 Kriol + 80 Stal + 40 Belka konstrukcyjna + 4 Metamateriał osłonowy + 1 Procesor kwantowy |
| Składowisko | E0 (×1) | 10 Ferryt | 20 Ferryt + 10 Beton regolitowy | 40 Ferryt + 20 Beton regolitowy + 8 Belka konstrukcyjna | 80 Ferryt + 40 Beton regolitowy + 16 Belka konstrukcyjna + 2 Metamateriał osłonowy | 160 Ferryt + 80 Beton regolitowy + 32 Belka konstrukcyjna + 4 Metamateriał osłonowy + 1 Procesor kwantowy |
| Zbiornik płynów | E1 (×4) | 80 Ferryt | 160 Ferryt + 40 Stal | 320 Ferryt + 80 Stal + 40 Polimer + 8 Silnik | 640 Ferryt + 160 Stal + 80 Polimer + 16 Silnik + 40 Kompozyt węglowy + 4 Nadprzewodnik | — |
| Zbiornik ciśnieniowy | E2 (×2) | 30 Stal | 60 Stal + 10 Polimer | 120 Stal + 20 Polimer + 6 Silnik | 240 Stal + 40 Polimer + 12 Silnik + 20 Kompozyt węglowy + 2 Nadprzewodnik | — |
| Kriomagazyn | E2 (×2) | 40 Stal + 20 Polimer | 80 Stal + 40 Polimer + 20 Krzem | 160 Stal + 80 Polimer + 40 Krzem + 8 Układ scalony + 10 Kompozyt węglowy | 320 Stal + 160 Polimer + 80 Krzem + 16 Układ scalony + 20 Kompozyt węglowy + 8 Nadprzewodnik | — |
| Bunkier osłonowy | E2 (×2) | 80 Beton regolitowy + 20 Stal | 200 Beton regolitowy + 40 Stal | 400 Beton regolitowy + 80 Stal + 8 Metamateriał osłonowy | — | — |
| Pułapka magnetyczna | E4 (×2) | 20 Nadprzewodnik + 20 Układ scalony + 20 Stop tytanowy | 40 Nadprzewodnik + 40 Układ scalony + 40 Stop tytanowy + 2 Procesor kwantowy | 80 Nadprzewodnik + 80 Układ scalony + 80 Stop tytanowy + 6 Procesor kwantowy | — | — |
| Akumulator | E2 (×2) | 20 Miedź + 10 Krzem | 40 Miedź + 20 Krzem + 20 Przewód | 80 Miedź + 40 Krzem + 40 Przewód + 8 Układ scalony | 160 Miedź + 80 Krzem + 80 Przewód + 16 Układ scalony + 4 Nadprzewodnik | 320 Miedź + 160 Krzem + 160 Przewód + 32 Układ scalony + 8 Nadprzewodnik + 2 Procesor kwantowy |
| Panel słoneczny | E0 (×1) | 10 Silicyt | 20 Silicyt + 5 Krzem | 40 Silicyt + 10 Krzem + 6 Ogniwo PV | 80 Silicyt + 20 Krzem + 12 Ogniwo PV + 2 Nadprzewodnik | 160 Silicyt + 40 Krzem + 24 Ogniwo PV + 4 Nadprzewodnik + 1 Procesor kwantowy |
| Turbina wiatrowa | E0 (×1) | 15 Ferryt + 10 Silicyt | 30 Ferryt + 20 Silicyt + 10 Stal | 60 Ferryt + 40 Silicyt + 20 Stal + 4 Silnik + 4 Kompozyt węglowy | — | — |
| Reaktor rozszczepienia | E2 (×2) | 120 Stal + 160 Beton regolitowy | 240 Stal + 320 Beton regolitowy + 40 Belka konstrukcyjna | 480 Stal + 640 Beton regolitowy + 80 Belka konstrukcyjna + 20 Układ scalony + 20 Stop tytanowy | 960 Stal + 1280 Beton regolitowy + 160 Belka konstrukcyjna + 40 Układ scalony + 40 Stop tytanowy + 12 Nadprzewodnik | — |
| Reaktor fuzyjny | E4 (×2) | 160 Stop tytanowy + 40 Nadprzewodnik + 120 Belka konstrukcyjna | 320 Stop tytanowy + 80 Nadprzewodnik + 240 Belka konstrukcyjna + 20 Metamateriał osłonowy | 640 Stop tytanowy + 160 Nadprzewodnik + 480 Belka konstrukcyjna + 40 Metamateriał osłonowy + 8 Procesor kwantowy | — | — |
| Rektenna | E3 (×1,5) | 45 Stal + 60 Przewód | 90 Stal + 120 Przewód + 9 Układ scalony | 180 Stal + 240 Przewód + 18 Układ scalony + 6 Nadprzewodnik | — | — |
| Kopalnia | E0 (×1) | 15 Ferryt | 30 Ferryt + 10 Stal | 60 Ferryt + 20 Stal + 3 Silnik | 120 Ferryt + 40 Stal + 6 Silnik + 1 Katalizator | 240 Ferryt + 80 Stal + 12 Silnik + 2 Katalizator + 1 Procesor kwantowy |
| Ekstraktor Kriolu | E0 (×1) | 15 Ferryt | 30 Ferryt + 10 Stal | 60 Ferryt + 20 Stal + 3 Silnik | 120 Ferryt + 40 Stal + 6 Silnik + 1 Katalizator | 240 Ferryt + 80 Stal + 12 Silnik + 2 Katalizator + 1 Procesor kwantowy |
| Wieża Silicytu | E0 (×1) | 15 Ferryt + 5 Kriol | 30 Ferryt + 10 Kriol + 10 Stal | 60 Ferryt + 20 Kriol + 20 Stal + 3 Silnik | 120 Ferryt + 40 Kriol + 40 Stal + 6 Silnik + 1 Katalizator | 240 Ferryt + 80 Kriol + 80 Stal + 12 Silnik + 2 Katalizator + 1 Procesor kwantowy |
| Koparka regolitu | E1 (×4) | 40 Ferryt | 80 Ferryt + 20 Stal | 160 Ferryt + 40 Stal + 8 Silnik | — | — |
| Separator He-3 | E3 (×1,5) | 60 Stal + 30 Krzem | 120 Stal + 60 Krzem + 9 Układ scalony | 240 Stal + 120 Krzem + 18 Układ scalony + 3 Katalizator | — | — |
| Huta | E1 (×4) | 160 Ferryt + 80 Silicyt | 320 Ferryt + 160 Silicyt + 80 Beton regolitowy | 640 Ferryt + 320 Silicyt + 160 Beton regolitowy + 40 Belka konstrukcyjna + 16 Silnik | 1280 Ferryt + 640 Silicyt + 320 Beton regolitowy + 80 Belka konstrukcyjna + 32 Silnik + 8 Katalizator + 8 Metamateriał osłonowy | 2560 Ferryt + 1280 Silicyt + 640 Beton regolitowy + 160 Belka konstrukcyjna + 64 Silnik + 16 Katalizator + 16 Metamateriał osłonowy + 4 Procesor kwantowy |
| Rafineria krzemu | E1 (×4) | 20 Stal + 80 Silicyt | 40 Stal + 160 Silicyt + 60 Beton regolitowy | 80 Stal + 320 Silicyt + 120 Beton regolitowy + 12 Silnik + 8 Układ scalony | 160 Stal + 640 Silicyt + 240 Beton regolitowy + 24 Silnik + 16 Układ scalony + 8 Katalizator | 320 Stal + 1280 Silicyt + 480 Beton regolitowy + 48 Silnik + 32 Układ scalony + 16 Katalizator + 4 Procesor kwantowy |
| Topielnik lodu | E1 (×4) | 80 Ferryt | 160 Ferryt + 40 Stal | 320 Ferryt + 80 Stal + 8 Silnik | 640 Ferryt + 160 Stal + 16 Silnik + 4 Nadprzewodnik | — |
| Elektrolizer | E2 (×2) | 60 Stal + 20 Miedź | 120 Stal + 40 Miedź + 20 Przewód | 240 Stal + 80 Miedź + 40 Przewód + 8 Układ scalony | 480 Stal + 160 Miedź + 80 Przewód + 16 Układ scalony + 4 Katalizator | 960 Stal + 320 Miedź + 160 Przewód + 32 Układ scalony + 8 Katalizator + 2 Procesor kwantowy |
| Skraplacz paliwa | E2 (×2) | 60 Stal + 20 Polimer | 120 Stal + 40 Polimer + 8 Silnik | 240 Stal + 80 Polimer + 16 Silnik + 8 Układ scalony + 8 Kompozyt węglowy | 480 Stal + 160 Polimer + 32 Silnik + 16 Układ scalony + 16 Kompozyt węglowy + 6 Nadprzewodnik | — |
| Betoniarnia | E1 (×4) | 80 Ferryt + 40 Silicyt | 160 Ferryt + 80 Silicyt + 40 Stal | 320 Ferryt + 160 Silicyt + 80 Stal + 8 Silnik | 640 Ferryt + 320 Silicyt + 160 Stal + 16 Silnik + 4 Metamateriał osłonowy | — |
| Zakład chemiczny | E2 (×2) | 60 Stal + 20 Krzem | 120 Stal + 40 Krzem + 20 Polimer | 240 Stal + 80 Krzem + 40 Polimer + 8 Układ scalony | 480 Stal + 160 Krzem + 80 Polimer + 16 Układ scalony + 6 Katalizator | 960 Stal + 320 Krzem + 160 Polimer + 32 Układ scalony + 12 Katalizator + 2 Procesor kwantowy |
| Zakład wzbogacania | E2 (×2) | 120 Stal + 120 Beton regolitowy + 12 Układ scalony | 240 Stal + 240 Beton regolitowy + 24 Układ scalony + 20 Stop tytanowy | 480 Stal + 480 Beton regolitowy + 48 Układ scalony + 40 Stop tytanowy + 8 Nadprzewodnik | — | — |
| Separator deuteru | E3 (×1,5) | 60 Stal + 6 Układ scalony | 120 Stal + 12 Układ scalony + 3 Katalizator | 240 Stal + 24 Układ scalony + 6 Katalizator + 3 Nadprzewodnik | — | — |
| Montownia | E2 (×2) | 60 Stal + 40 Beton regolitowy | 120 Stal + 80 Beton regolitowy + 20 Przewód | 240 Stal + 160 Beton regolitowy + 40 Przewód + 8 Silnik + 4 Układ scalony | 480 Stal + 320 Beton regolitowy + 80 Przewód + 16 Silnik + 8 Układ scalony + 4 Nadprzewodnik | 960 Stal + 640 Beton regolitowy + 160 Przewód + 32 Silnik + 16 Układ scalony + 8 Nadprzewodnik + 2 Procesor kwantowy |
| Fabryka elektroniki | E2 (×2) | 60 Stal + 40 Krzem + 40 Przewód | 120 Stal + 80 Krzem + 80 Przewód + 20 Polimer | 240 Stal + 160 Krzem + 160 Przewód + 40 Polimer + 12 Układ scalony | 480 Stal + 320 Krzem + 320 Przewód + 80 Polimer + 24 Układ scalony + 6 Nadprzewodnik | 960 Stal + 640 Krzem + 640 Przewód + 160 Polimer + 48 Układ scalony + 12 Nadprzewodnik + 2 Procesor kwantowy |
| Fabryka atanorowa | E3 (×1,5) | 120 Stal + 90 Beton regolitowy + 30 Układ scalony + 15 Silnik | 240 Stal + 180 Beton regolitowy + 60 Układ scalony + 30 Silnik + 30 Stop tytanowy | 480 Stal + 360 Beton regolitowy + 120 Układ scalony + 60 Silnik + 60 Stop tytanowy + 15 Nadprzewodnik | 960 Stal + 720 Beton regolitowy + 240 Układ scalony + 120 Silnik + 120 Stop tytanowy + 30 Nadprzewodnik + 15 Metamateriał osłonowy + 8 Katalizator | 1920 Stal + 1440 Beton regolitowy + 480 Układ scalony + 240 Silnik + 240 Stop tytanowy + 60 Nadprzewodnik + 30 Metamateriał osłonowy + 15 Katalizator + 6 Procesor kwantowy |
| Akcelerator cząstek | E4 (×2) | 240 Stop tytanowy + 120 Nadprzewodnik + 8 Procesor kwantowy | 480 Stop tytanowy + 240 Nadprzewodnik + 24 Procesor kwantowy | 960 Stop tytanowy + 480 Nadprzewodnik + 56 Procesor kwantowy | — | — |
| Pompa | E2 (×2) | 8 Stal + 2 Silnik | 16 Stal + 4 Silnik + 4 Polimer | 32 Stal + 8 Silnik + 8 Polimer + 2 Układ scalony | — | — |
| Stacja załadunkowa | E1 (×4) | 60 Stal + 80 Ferryt | 120 Stal + 160 Ferryt + 8 Silnik | 240 Stal + 320 Ferryt + 16 Silnik + 8 Układ scalony | — | — |
| Wyrzutnia masy | E3 (×1,5) | 90 Stop tytanowy + 15 Nadprzewodnik + 90 Belka konstrukcyjna | 180 Stop tytanowy + 30 Nadprzewodnik + 180 Belka konstrukcyjna + 9 Metamateriał osłonowy | 360 Stop tytanowy + 60 Nadprzewodnik + 360 Belka konstrukcyjna + 18 Metamateriał osłonowy + 3 Procesor kwantowy | — | — |
| Stacja orbitalna | E2 (×2) | 240 Stal + 120 Belka konstrukcyjna + 20 Układ scalony + 80 Polimer | 480 Stal + 240 Belka konstrukcyjna + 40 Układ scalony + 160 Polimer + 20 Silnik | 960 Stal + 480 Belka konstrukcyjna + 80 Układ scalony + 320 Polimer + 40 Silnik + 80 Stop tytanowy | 1920 Stal + 960 Belka konstrukcyjna + 160 Układ scalony + 640 Polimer + 80 Silnik + 160 Stop tytanowy + 20 Metamateriał osłonowy + 12 Nadprzewodnik | 3840 Stal + 1920 Belka konstrukcyjna + 320 Układ scalony + 1280 Polimer + 160 Silnik + 320 Stop tytanowy + 40 Metamateriał osłonowy + 24 Nadprzewodnik + 6 Procesor kwantowy |
| Stocznia orbitalna | E3 (×1,5) | 300 Stal + 180 Belka konstrukcyjna + 30 Silnik + 30 Układ scalony | 600 Stal + 360 Belka konstrukcyjna + 60 Silnik + 60 Układ scalony + 90 Stop tytanowy | 1200 Stal + 720 Belka konstrukcyjna + 120 Silnik + 120 Układ scalony + 180 Stop tytanowy + 15 Nadprzewodnik + 60 Kompozyt węglowy | 2400 Stal + 1440 Belka konstrukcyjna + 240 Silnik + 240 Układ scalony + 360 Stop tytanowy + 30 Nadprzewodnik + 120 Kompozyt węglowy + 30 Metamateriał osłonowy + 3 Procesor kwantowy | — |
| Terminal handlowy | E3 (×1,5) | 60 Stal + 15 Układ scalony | 120 Stal + 30 Układ scalony + 15 Kompozyt węglowy | 240 Stal + 60 Układ scalony + 30 Kompozyt węglowy + 2 Procesor kwantowy | — | — |
| Satelita energetyczny | E3 (×1,5) | 60 Ogniwo PV + 15 Stop tytanowy + 9 Układ scalony | 120 Ogniwo PV + 30 Stop tytanowy + 18 Układ scalony + 6 Nadprzewodnik | 240 Ogniwo PV + 60 Stop tytanowy + 36 Układ scalony + 12 Nadprzewodnik + 2 Procesor kwantowy | — | — |
| Platforma czerpalna | E4 (×2) | 120 Stop tytanowy + 80 Kompozyt węglowy + 20 Układ scalony | 240 Stop tytanowy + 160 Kompozyt węglowy + 40 Układ scalony + 12 Nadprzewodnik | 480 Stop tytanowy + 320 Kompozyt węglowy + 80 Układ scalony + 24 Nadprzewodnik + 12 Katalizator | — | — |
| Dok gwiezdny | E4 (×2) | 800 Belka konstrukcyjna + 400 Stop tytanowy + 80 Układ scalony | 1600 Belka konstrukcyjna + 800 Stop tytanowy + 160 Układ scalony + 80 Nadprzewodnik | 3200 Belka konstrukcyjna + 1600 Stop tytanowy + 320 Układ scalony + 160 Nadprzewodnik + 80 Metamateriał osłonowy | 6400 Belka konstrukcyjna + 3200 Stop tytanowy + 640 Układ scalony + 320 Nadprzewodnik + 160 Metamateriał osłonowy + 12 Procesor kwantowy | 12 800 Belka konstrukcyjna + 6400 Stop tytanowy + 1280 Układ scalony + 640 Nadprzewodnik + 320 Metamateriał osłonowy + 24 Procesor kwantowy + 80 Kapsuła fuzyjna |

### 5.4 Wartość poziomu, czas budowy, moc, załoga (z modelu)

Moc ujemna oznacza pobór, dodatnia produkcję. Dla magazynów kriogenicznych, gazowych, radioaktywnych i egzotycznych dochodzi pobór zależny od zapełnienia (4.4).

| Nazwa | Kafelki | Wartość poziomu L1 → Lmax [kr] | Czas budowy L1 → Lmax | Moc L1 → Lmax [MW] | Załoga L1 |
|---|---|---|---|---|---|
| Centrum dowodzenia | 3 | — → 304 → 4165 → 26 556 → 160 697 | — → 30 min → 2,0 h → 6,0 h → 16,0 h | +5,0 → +8,0 → +12,8 → +20,5 → +32,8 | zapewnia 5 |
| Lądowisko | 1 | 8 → 57,3 → 205 | 5 min → 9 min → 16 min | -2,0 → -2,9 → -4,2 | 2 |
| Habitat | 1 | 6 → 46,7 → 244 → 738 → 1699 | 3 min → 5 min → 10 min → 17 min → 31 min | -2,0 → -2,9 → -4,2 → -6,1 → -8,8 | zapewnia 10 |
| Farma hydroponiczna | 1 | 24,0 → 104 → 508 → 1336 | 5 min → 9 min → 16 min → 29 min | -6,0 → -8,7 → -12,6 → -18,3 | 2 |
| Garaż pojazdów | 1 | 32,0 → 229 → 1029 | 8 min → 14 min → 26 min | -2,0 → -2,9 → -4,2 | 3 |
| Magazyn | 1 | 4 → 28,7 → 97,3 → 320 → 862 | 2 min → 4 min → 6 min → 12 min → 21 min | -0,5 → -0,7 → -1,1 → -1,5 → -2,2 | 1 |
| Składowisko | 1 | 2 → 18,0 → 68,0 → 262 → 745 | 2 min → 4 min → 6 min → 12 min → 21 min | 0,0 → 0,0 → 0,0 → 0,0 → 0,0 | 0 |
| Zbiornik płynów | 1 | 16,0 → 115 → 497 → 1892 | 3 min → 5 min → 10 min → 17 min | -0,2 → -0,3 → -0,4 → -0,6 | 0 |
| Zbiornik ciśnieniowy | 1 | 62,0 → 166 → 407 → 1263 | 5 min → 9 min → 16 min → 29 min | -0,5 → -0,7 → -1,1 → -1,5 | 0 |
| Kriomagazyn | 1 | 166 → 388 → 1089 → 2540 | 15 min → 27 min → 49 min → 87 min | -1,0 → -1,4 → -2,1 → -3,0 | 1 |
| Bunkier osłonowy | 1 | 153 → 363 → 1227 | 15 min → 27 min → 49 min | -1,0 → -1,4 → -2,1 | 1 |
| Pułapka magnetyczna | 1 | 1515 → 3474 → 7392 | 60 min → 108 min → 3,2 h | -2,0 → -2,9 → -4,2 | 2 |
| Akumulator | 1 | 71,8 → 165 → 464 → 1109 → 2663 | 5 min → 9 min → 16 min → 29 min → 52 min | 0,0 → 0,0 → 0,0 → 0,0 → 0,0 | 0 |
| Panel słoneczny | 1 | 2 → 17,9 → 109 → 309 → 840 | 1 min → 2 min → 3 min → 6 min → 10 min | +5,0 → +8,5 → +14,4 → +24,6 → +41,8 | 0 |
| Turbina wiatrowa | 1 | 5 → 30,7 → 183 | 2 min → 4 min → 6 min | +10,0 → +16,0 → +25,6 | 0 |
| Reaktor rozszczepienia | 3 | 472 → 1104 → 2816 → 6177 | 45 min → 81 min → 2,4 h → 4,4 h | +60,0 → +96,0 → +154 → +246 | 8 |
| Reaktor fuzyjny | 7 | 4480 → 10 215 → 22 207 | 3,0 h → 5,4 h → 9,7 h | +400 → +640 → +1024 | 12 |
| Rektenna | 3 | 157 → 465 → 1201 | 30 min → 54 min → 97 min | 0,0 → 0,0 → 0,0 | 2 |
| Kopalnia | 1 | 3 → 26,7 → 91,1 → 222 → 667 | 2 min → 4 min → 6 min → 12 min → 21 min | -3,0 → -4,3 → -6,3 → -9,1 → -13,3 | 2 |
| Ekstraktor Kriolu | 1 | 3 → 26,7 → 91,1 → 222 → 667 | 2 min → 4 min → 6 min → 12 min → 21 min | -3,0 → -4,3 → -6,3 → -9,1 → -13,3 | 2 |
| Wieża Silicytu | 1 | 4 → 28,7 → 95,1 → 230 → 683 | 2 min → 4 min → 6 min → 12 min → 21 min | -3,0 → -4,3 → -6,3 → -9,1 → -13,3 | 2 |
| Koparka regolitu | 1 | 8 → 57,3 → 215 | 1 min → 2 min → 3 min | -2,0 → -2,9 → -4,2 | 1 |
| Separator He-3 | 3 | 208 → 566 → 1251 | 45 min → 81 min → 2,4 h | -20,0 → -29,0 → -42,0 | 3 |
| Huta | 3 | 48,0 → 208 → 778 → 2377 → 5643 | 10 min → 18 min → 32 min → 58 min → 105 min | -6,0 → -8,7 → -12,6 → -18,3 → -26,5 | 4 |
| Rafineria krzemu | 3 | 57,3 → 199 → 683 → 1685 → 4258 | 15 min → 27 min → 49 min → 87 min → 2,6 h | -8,0 → -11,6 → -16,8 → -24,4 → -35,4 | 4 |
| Topielnik lodu | 1 | 16,0 → 115 → 330 → 842 | 3 min → 5 min → 10 min → 17 min | -4,0 → -5,8 → -8,4 → -12,2 | 1 |
| Elektrolizer | 3 | 168 → 357 → 849 → 1857 → 4159 | 15 min → 27 min → 49 min → 87 min → 2,6 h | -12,0 → -17,4 → -25,2 → -36,6 → -53,0 | 3 |
| Skraplacz paliwa | 3 | 207 → 515 → 1308 → 2889 | 15 min → 27 min → 49 min → 87 min | -10,0 → -14,5 → -21,0 → -30,5 | 3 |
| Betoniarnia | 1 | 24,0 → 131 → 362 → 975 | 5 min → 9 min → 16 min → 29 min | -4,0 → -5,8 → -8,4 → -12,2 | 2 |
| Zakład chemiczny | 3 | 180 → 443 → 1019 → 2279 → 5001 | 15 min → 27 min → 49 min → 87 min → 2,6 h | -8,0 → -11,6 → -16,8 → -24,4 → -35,4 | 4 |
| Zakład wzbogacania | 3 | 617 → 1507 → 3377 | 45 min → 81 min → 2,4 h | -30,0 → -43,5 → -63,1 | 6 |
| Separator deuteru | 3 | 225 → 569 → 1274 | 45 min → 81 min → 2,4 h | -15,0 → -21,8 → -31,5 | 3 |
| Montownia | 3 | 180 → 381 → 930 → 2042 → 4529 | 15 min → 27 min → 49 min → 87 min → 2,6 h | -5,0 → -7,3 → -10,5 → -15,2 → -22,1 | 5 |
| Fabryka elektroniki | 3 | 278 → 639 → 1480 → 3231 → 6907 | 20 min → 36 min → 65 min → 117 min → 3,5 h | -10,0 → -14,5 → -21,0 → -30,5 → -44,2 | 6 |
| Fabryka atanorowa | 7 | 1066 → 2541 → 5762 → 12 785 → 26 863 | 90 min → 2,7 h → 4,9 h → 8,7 h → 15,7 h | -6,0 → -8,7 → -12,6 → -18,3 → -26,5 | 10 |
| Akcelerator cząstek | 7 | 10 496 → 22 769 → 47 315 | 4,0 h → 7,2 h → 13,0 h | -200 → -290 → -421 | 15 |
| Pompa | 1 | 41,7 → 100 → 234 | 1 min → 2 min → 3 min | -1,0 → -1,4 → -2,1 | 0 |
| Stacja załadunkowa | 1 | 140 → 381 → 896 | 5 min → 9 min → 16 min | -1,0 → -1,4 → -2,1 | 1 |
| Wyrzutnia masy | 7 | 2270 → 5105 → 10 876 | 3,0 h → 5,4 h → 9,7 h | -80,0 → -116 → -168 | 8 |
| Stacja orbitalna | orbita | 1644 → 3541 → 8175 → 18 149 → 37 630 | 2,0 h → 3,6 h → 6,5 h → 11,7 h → 21,0 h | -10,0 → -14,5 → -21,0 → -30,5 → -44,2 | 10 |
| Stocznia orbitalna | orbita | 2221 → 5671 → 13 098 → 28 745 | 3,0 h → 5,4 h → 9,7 h → 17,5 h | -20,0 → -29,0 → -42,0 → -61,0 | 15 |
| Terminal handlowy | moduł stacji | 375 → 1020 → 2483 | 45 min → 81 min → 2,4 h | -5,0 → -7,3 → -10,5 | 3 |
| Satelita energetyczny | orbita | 1088 → 2447 → 5339 | 60 min → 108 min → 3,2 h | +30,0 → +51,0 → +86,7 | 0 |
| Platforma czerpalna | orbita Gigasa | 3410 → 7363 → 15 207 | 4,0 h → 7,2 h → 13,0 h | -40,0 → -58,0 → -84,1 | 8 |
| Dok gwiezdny | orbita | 10 007 → 23 640 → 52 301 → 107 267 → 228 169 | 4,0 h → 7,2 h → 13,0 h → 23,3 h → 42,0 h | -60,0 → -87,0 → -126 → -183 → -265 | 30 |

### 5.5 Modele 3D i animacje budynków

Oznaczenia: `nazwa` to istniejący model KayKit; **nowy** to model do wykonania w stylu KayKit; *alt* to druga tekstura palety (`spacebits_texture_alt.png`, akcenty niebieskie zamiast pomarańczowych). Proponuję, by *alt* od L4 wyróżniała technologię atanorową. Techniki animacji (węzeł, shader, cząsteczki, klip) opisuje rozdział 10.

| Budynek | L1 | L2 | L3 | L4 | L5 | Animacje |
|---|---|---|---|---|---|---|
| Centrum dowodzenia | `basemodule_C` + `roofmodule_base` | + `basemodule_B` połączony `tunnel_straight_A` | + `dome`, `lights` | *alt* + **nowa** antena | + **nowy** emiter pola | obrót anteny (węzeł); migające światła (shader); pulsowanie pola (shader) |
| Lądowisko | `landingpad_small` [PoC] | `landingpad_large` | + `lights` + **nowy** rękaw tankowania | — | — | sekwencja świateł przy podejściu statku (shader); otwarcie drzwi `dropship` (węzły `dropship_door_left/right`) |
| Habitat | `basemodule_A` [PoC] | + `roofmodule_base` | drugie piętro (`basemodule_A` na wierzchu) | + `dome` *alt* | + `eco_module` | światła okien (shader) |
| Farma hydroponiczna | `space_farm_small` | `space_farm_large` | `space_farm_large_sprinkler` | `eco_module` *alt* | — | obrót zraszacza (węzeł `sprinkler`); rośliny rosnące w cyklu zbioru (skala instancji) |
| Garaż pojazdów | `basemodule_garage` | + `roofmodule_cargo_A` | + **nowy** dźwig serwisowy | — | — | brama przy wyjeździe pojazdu (węzeł `basemodule_garage_door`) |
| Magazyn | `cargodepot_A` [PoC] | `cargodepot_B` | `cargodepot_C` | + `roofmodule_cargo_B` *alt* | + `containers_D` | stos `cargo_A` rośnie z zapełnieniem (instancje); **nowa** suwnica (węzeł) |
| Składowisko | `containers_A` | `containers_B` | `containers_C` | `containers_D` | 2 × `containers_D` + **nowy** lej | hałda `rocks_A` w kolorze surowca, skalowana z zapełnieniem |
| Zbiornik płynów | `water_storage` | 2 × `water_storage` | **nowy** zbiornik wysoki | *alt* | — | wskaźnik poziomu (shader) |
| Zbiornik ciśnieniowy | **nowy** (1 sfera) | 2 sfery | 3 sfery | *alt* | — | puszczanie zaworów (cząsteczki) |
| Kriomagazyn | **nowy** cylinder | wyższy | + izolacja | *alt* + cewki | — | szron i opary (shader + cząsteczki); przy braku mocy szron topnieje |
| Bunkier osłonowy | `structure_low` + **nowa** pokrywa | grubsza pokrywa | panele Metamateriału *alt* | — | — | obrotowe światło ostrzegawcze (węzeł) |
| Pułapka magnetyczna | **nowy** torus z rdzeniem | drugi pierścień | trzeci pierścień | — | — | obrót pierścieni (węzły); blask rdzenia zależny od zapełnienia (shader); alarm przy braku mocy |
| Akumulator | **nowy** blok ogniw | 2 bloki | 3 bloki | *alt* | + cewki | pasek naładowania (shader) |
| Panel słoneczny | `solarpanel` | `roofmodule_solarpanels` [PoC] | **nowa** matryca nadążna | + cewki *alt* | rozbudowana matryca | obrót matrycy za Słońcem (węzeł; kierunek do Słońca znany z solvera orbit) |
| Turbina wiatrowa | `windturbine_low` | `windturbine_tall` [PoC] | `windturbine_tall` *alt* | — | — | obrót śmigła z prędkością zależną od mocy (węzły `windturbine_*_fan`) |
| Reaktor rozszczepienia | **nowy** reaktor + `dome` | + chłodnia kominowa | + druga chłodnia | *alt* | — | para z chłodni (cząsteczki); przepływ w rurach (shader) |
| Reaktor fuzyjny | **nowy** tokamak | + cewki | *alt* + rozbudowa | — | — | wirująca plazma (przewijanie UV); pulsowanie cewek (shader) |
| Rektenna | **nowa** siatka anten | większa | *alt* | — | — | promień od satelity (shader linii) |
| Kopalnia | `drill_structure` [PoC] | + `cargo_A` | + `structure_tall` (głowica podajnika) | **nowe** wiertło laserowe *alt* | rozbudowa | obrót i ruch pionowy wiertła (węzeł `drill_module`); pył (cząsteczki); kurczenie skał złoża |
| Ekstraktor Kriolu | `water_storage` [PoC] | + `roofmodule_base` | + **nowa** wiertnica | *alt* | rozbudowa | para (cząsteczki) |
| Wieża Silicytu | `structure_tall` [PoC] | + `roofmodule_cargo_A` | + **nowy** podajnik | *alt* | rozbudowa | blask kryształów (shader) |
| Koparka regolitu | **nowa** koparka kołowa | większa | podwójna | — | — | obrót koła czerpakowego (węzeł) |
| Separator He-3 | **nowy** zakład | + wirówki | *alt* | — | — | wirujące bębny (węzły) |
| Huta | **nowa** hala z kominem | + piec | + piec próżniowy (Tytan) | *alt* + katalizatory | rozbudowa | żar (pulsujące światło); dym i iskry (cząsteczki) |
| Rafineria krzemu | **nowe** kolumny | +1 kolumna | +2 kolumny | *alt* | rozbudowa | świecący tygiel (shader) |
| Topielnik lodu | **nowy** (zbiornik z grzałką) | większy | podwójny | *alt* | — | para (cząsteczki) |
| Elektrolizer | **nowe** ogniwa i zbiorniczki gazu | + ogniwa | + ogniwa | *alt* | rozbudowa | bąbelki (shader); zawory (cząsteczki) |
| Skraplacz paliwa | **nowe** kolumny kriogeniczne | + kolumna | + kolumna | *alt* | — | szron i opary (shader + cząsteczki) |
| Betoniarnia | **nowa** betoniarka | większa | podwójna | *alt* | — | obrót bębna (węzeł) |
| Zakład chemiczny | **nowe** zbiorniki i rury | + reaktor (Kompozyt) | + reaktor | *alt* | rozbudowa | opary (cząsteczki); przepływ (shader) |
| Zakład wzbogacania | **nowa** hala kaskady | + hala | *alt* | — | — | wirówki widoczne przez szczeliny (węzły); światło ostrzegawcze |
| Separator deuteru | **nowy** | + kolumna | *alt* | — | — | przepływ (shader) |
| Montownia | **nowa** hala z ramieniem robota | + linia | + linia | *alt* | rozbudowa | ruch ramienia (klip) |
| Fabryka elektroniki | **nowa** hala czysta | + moduł | + moduł | *alt* | rozbudowa | migające diody (shader) |
| Fabryka atanorowa | **nowa** heksagonalna hala ze szklanym dachem | większa kopuła | + wieże ramion | *alt* | podwójna hala | wnętrze: plansza i ramiona odtwarzające program gracza (instancje, tylko z bliska); z daleka pulsujący blask |
| Akcelerator cząstek | **nowy** pierścień (7 kafelków) | + detektor | *alt* | — | — | smuga cząstek wzdłuż pierścienia (przewijanie UV) |
| Pompa | **nowa** | większa | *alt* | — | — | wirnik (węzeł) |
| Stacja załadunkowa | **nowa** zatoka z dźwigiem | 2 stanowiska | 3 stanowiska | — | — | dźwig przenosi `cargo_A` między pojazdem a taśmą (węzeł) |
| Wyrzutnia masy | **nowa** rampa z cewkami | dłuższa | *alt* | — | — | błysk cewek; kapsuła po rampie i smuga na orbitę (klip + cząsteczki) |
| Stacja orbitalna | moduły `basemodule_E` + `tunnel_straight_*` w przestrzeni | + skrzydła `solarpanel` | + pierścień | *alt* + osłony | port dalekiego zasięgu | powolny obrót pierścienia (węzeł); światła doków (shader); skrzydła nadążne |
| Stocznia orbitalna | **nowa** kratownica | większa | + dźwigi | *alt* | — | budowany kadłub odsłaniany wraz z postępem (shader); iskry spawania (cząsteczki) |
| Terminal handlowy | `roofmodule_cargo_*` + `containers_*` na stacji | + doki | *alt* | — | — | przewóz kontenerów (węzeł) |
| Satelita energetyczny | **nowy** (skrzydła PV i antena) | większe skrzydła | *alt* | — | — | antena śledzi rektennę (węzeł); promień (shader) |
| Platforma czerpalna | **nowa** z linią czerpaka | + zbiorniki | *alt* | — | — | kołysanie linii; blask wlotu (shader) |
| Dok gwiezdny | **nowa** rama + kadłub | + napęd | + osłona | + komputer *alt* | + habitat | kolejne moduły gwiazdolotu pojawiają się na kolejnych poziomach; drony montażowe (instancje); iskry |

---

## 6. Pojazdy

Wszystkie pojazdy mają trzy wersje (Mk I–III). Koszty modernizacji rosną wykładniczo, według tego samego wzoru co budynki (6.3). Pojazdy naziemne powstają w Garażu (Astraeus i Prom na Lądowisku L2+), statki w Stoczni orbitalnej.

### 6.1 Pojazdy naziemne

| Pojazd | Rola | Mk I → Mk III | Modele | Animacje |
|---|---|---|---|---|
| **Łazik konstrukcyjny** [PoC: łazik R-1, 12 j./s] | budowa i rozbudowa; od Mk III także zwiad złóż (odsłania złoża na kafelkach, `POC-10`) | ładunek 10 / 20 / 40 j.; prędkość 12 / 14 / 18 j./min | `spacetruck` [PoC] → + `cargo_A` → + **nowe** ramię dźwigu i skaner | obrót kół (węzły `spacetruck_wheel_*`); ramię przy budowie (klip); obrót skanera (węzeł) |
| **Ciężarówka** | trasy cykliczne między Stacjami załadunkowymi | 40 / 80 / 120 j. (0 / 1 / 2 przyczepy); 10 / 9 / 8 j./min; wariant cysterna 400 u | `spacetruck_large` + 0–2 × `spacetruck_trailer`; cysterna: `water_storage` na przyczepie | koła (węzły); ładunek `cargo_A_stacked` widoczny proporcjonalnie do zapełnienia |
| **Konwój ciężki** | masowy transport na duże odległości po planecie | 200 / 400 / 600 j.; 6 j./min | `mobile_base_command` + `mobile_base_carriage` + 1–3 × `mobile_base_cargo` na `mobile_base_frame` | 6 kół (węzły `mobile_base_frame_wheel_*`); wagony podążają za ścieżką |
| **Dron logistyczny** | elastyczne dostawy na krótkim dystansie (jak roboty w Factorio) | 2 / 4 j.; 30 j./min; zasięg 8 kafelków od Stacji załadunkowej L3 | **nowy** quadkopter + `cargo_A_packed` | wirniki (węzły) |

### 6.2 Statki

| Statek | Rola | Mk I → Mk III | Modele | Animacje |
|---|---|---|---|---|
| **Prom orbitalny** | powierzchnia ↔ Stacja orbitalna | 30 / 50 / 80 j.; start z powierzchni kosztuje 10 u (Planeta), 6 u (Pyros), 3 u (Glacja), 2 u (Księżyc) | `lander_A` → `lander_B` → `lander_B` *alt*; płyta `lander_base` | płomień silnika (cząsteczki); lot pionowy |
| **Astraeus** [PoC: paliwo 100, ładownia 50] | uniwersalny, mały | ładownia 50 / 80 / 120; bak 100 / 150 / 200; 150 / 165 / 180 j./min | `dropship` [PoC] → `dropship_packed` → *alt* + **nowe** silniki | drzwi przy lądowaniu (węzły `dropship_door_*`); blask silników (shader) |
| **Frachtowiec** | masowy transport między ciałami | 400 / 800 / 1600 j.; bak 250 / 300 / 400; 110 / 120 / 130 j./min | **nowa** kratownica z kontenerami `cargo_A_stacked` (4 / 8 / 16) | dokowanie i odczepianie kontenerów (węzły) |
| **Tankowiec** | płyny, gazy, kriogenika | 2000 / 4000 / 8000 u; od Mk II izolacja kriogeniczna | **nowy** kręgosłup ze zbiornikami sferycznymi (1 / 2 / 4) | szron na zbiornikach z kriogeniką (shader) |
| **Górnik asteroidowy** [PoC: wydobycie 10/s statkiem] | wyprawy na asteroidy M/C/S; Mk III także na kometę | wydobycie 10 / 20 / 40 j./min; ładownia 100 / 200 / 400 | **nowy** kadłub + `drill_module` (z `drill_structure`) | obrót wiertła i odłamki (węzeł + cząsteczki); asteroida kurczy się (`depletionScale` z PoC) |
| **Sonda** | odsłania złoża ciał (Mk I: układ wewnętrzny; Mk II: Gigas i Kerys); Mk III: sonda międzygwiezdna (rozdz. 9.4) | zasięg: wewnętrzny / zewnętrzny / 17 ly | **nowa** mała sonda | rozkładanie skrzydeł PV (klip) |

### 6.3 Koszty i parametry pojazdów (z modelu)

| Nazwa | Era (k) | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|---|
| Łazik konstrukcyjny | E0 (×1) | 20 Ferryt + 5 Silicyt | 40 Ferryt + 10 Silicyt + 10 Stal + 1 Silnik | 80 Ferryt + 20 Silicyt + 20 Stal + 2 Silnik + 2 Układ scalony | — | — |
| Ciężarówka | E1 (×4) | 80 Stal + 80 Ferryt | 160 Stal + 160 Ferryt + 8 Silnik | 320 Stal + 320 Ferryt + 16 Silnik + 8 Układ scalony | — | — |
| Konwój ciężki | E2 (×2) | 120 Stal + 12 Silnik + 8 Układ scalony | 240 Stal + 24 Silnik + 16 Układ scalony + 40 Belka konstrukcyjna | 480 Stal + 48 Silnik + 32 Układ scalony + 80 Belka konstrukcyjna + 20 Kompozyt węglowy | — | — |
| Dron logistyczny | E3 (×1,5) | 3 Kompozyt węglowy + 2 Silnik + 2 Układ scalony | 6 Kompozyt węglowy + 3 Silnik + 3 Układ scalony + 2 Nadprzewodnik | — | — | — |
| Prom orbitalny | E2 (×2) | 60 Stal + 8 Silnik + 20 Polimer | 120 Stal + 16 Silnik + 40 Polimer + 20 Kompozyt węglowy | 240 Stal + 32 Silnik + 80 Polimer + 40 Kompozyt węglowy + 8 Układ scalony | — | — |
| Statek transportowy Astraeus | E0 (×1) | 40 Stal + 6 Silnik + 4 Układ scalony | 80 Stal + 12 Silnik + 8 Układ scalony + 20 Kompozyt węglowy | 160 Stal + 24 Silnik + 16 Układ scalony + 40 Kompozyt węglowy + 20 Stop tytanowy + 2 Nadprzewodnik | — | — |
| Frachtowiec | E3 (×1,5) | 120 Belka konstrukcyjna + 30 Stop tytanowy + 15 Silnik + 9 Układ scalony | 240 Belka konstrukcyjna + 90 Stop tytanowy + 30 Silnik + 18 Układ scalony | 480 Belka konstrukcyjna + 180 Stop tytanowy + 60 Silnik + 36 Układ scalony + 9 Nadprzewodnik | — | — |
| Tankowiec | E3 (×1,5) | 90 Belka konstrukcyjna + 45 Stop tytanowy + 30 Kompozyt węglowy + 9 Układ scalony | 180 Belka konstrukcyjna + 90 Stop tytanowy + 60 Kompozyt węglowy + 18 Układ scalony + 60 Polimer | 360 Belka konstrukcyjna + 180 Stop tytanowy + 120 Kompozyt węglowy + 36 Układ scalony + 120 Polimer + 9 Nadprzewodnik | — | — |
| Górnik asteroidowy | E3 (×1,5) | 60 Belka konstrukcyjna + 60 Stal + 12 Silnik + 6 Układ scalony | 120 Belka konstrukcyjna + 120 Stal + 24 Silnik + 12 Układ scalony + 30 Stop tytanowy + 2 Katalizator | 240 Belka konstrukcyjna + 240 Stal + 48 Silnik + 24 Układ scalony + 60 Stop tytanowy + 3 Katalizator + 6 Nadprzewodnik | — | — |
| Sonda | E3 (×1,5) | 15 Kompozyt węglowy + 9 Układ scalony + 6 Ogniwo PV | 30 Kompozyt węglowy + 18 Układ scalony + 12 Ogniwo PV + 2 Nadprzewodnik | 60 Kompozyt węglowy + 36 Układ scalony + 24 Ogniwo PV + 3 Nadprzewodnik + 2 Procesor kwantowy + 15 Kapsuła fuzyjna | — | — |

| Nazwa | Kafelki | Wartość poziomu L1 → Lmax [kr] | Czas budowy L1 → Lmax | Moc L1 → Lmax [MW] | Załoga L1 |
|---|---|---|---|---|---|
| Łazik konstrukcyjny | — | 5 → 43,3 → 120 | 3 min → 5 min → 10 min | -0,5 → -0,7 → -1,1 | 1 |
| Ciężarówka | — | 181 → 463 → 1061 | 5 min → 9 min → 16 min | -1,0 → -1,4 → -2,1 | 1 |
| Konwój ciężki | — | 533 → 1226 → 2811 | 20 min → 36 min → 65 min | -3,0 → -4,3 → -6,3 | 2 |
| Dron logistyczny | — | 113 → 286 | 5 min → 9 min | -0,3 → -0,4 | 0 |
| Prom orbitalny | — | 308 → 975 → 2084 | 30 min → 54 min → 97 min | 0,0 → 0,0 → 0,0 | 2 |
| Statek transportowy Astraeus | — | 225 → 809 → 1982 | 60 min → 108 min → 3,2 h | 0,0 → 0,0 → 0,0 | 3 |
| Frachtowiec | — | 1230 → 2870 → 6147 | 2,0 h → 3,6 h → 6,5 h | 0,0 → 0,0 → 0,0 | 5 |
| Tankowiec | — | 1664 → 3578 → 7563 | 2,0 h → 3,6 h → 6,5 h | 0,0 → 0,0 → 0,0 | 5 |
| Górnik asteroidowy | — | 616 → 1721 → 3675 | 90 min → 2,7 h → 4,9 h | 0,0 → 0,0 → 0,0 | 4 |
| Sonda | — | 493 → 1077 → 5109 | 45 min → 81 min → 2,4 h | 0,0 → 0,0 → 0,0 | 0 |

---

## 7. Logistyka w stylu Factorio

### 7.1 Warstwa transportowa na siatce Goldberga

- **Fakty z PoC.** Kafelek ma 5 lub 6 sąsiadów (12 pięciokątów na każdym ciele) i szerokość 6–8 j. Budowla zajmuje jeden kafelek. Łazik szuka drogi BFS i omija budowle poza lądowiskiem [PoC `CLAUDE.md`, `rover-system.ts:38-66`].
- **Propozycja.** Każdy kafelek ma dwie warstwy: **budowlę** albo **segmenty transportu**. Na jednym kafelku mieści się jeden segment taśmy i jeden segment rury (rura pod taśmą). Budowla wyklucza oba, chyba że w tym miejscu stoi przepust.
- **Taśma** łączy krawędź wejściową z wyjściową. Na sześciokącie są trzy kształty segmentu: prosty (krawędzie naprzeciwległe, 180°), łuk łagodny (120°) i łuk ostry (60°). **Pięciokąty** nie przyjmują taśm ani rur; dopuszczam na nich tylko budowle 1-kafelkowe (→ `EXP-2`).
- **Pojazdy** przejeżdżają przez kafelki z taśmami i rurami, ale nie przez budowle. To rozszerzenie reguły PoC, w której lądowisko nie blokuje łazika.

### 7.2 Elementy logistyczne

| Element | Przepustowość | Koszt na kafelek | Moc na kafelek | Model | Animacja |
|---|---|---|---|---|---|
| Taśmociąg L1 | 15 j./min | 2 Ferryt | 0,05 MW | **nowy**: 3 kształty, pomarańczowy | przewijanie UV taśmy; skrzynki `cargo_A_packed` jako instancje (1 skrzynka = 1 j.) |
| Taśmociąg L2 | 30 j./min | 2 Stal + 1 Przewód | 0,1 MW | **nowy**, biały | jw., szybciej |
| Taśmociąg L3 (magnetyczny) | 60 j./min | 1 Stop tytanowy + 1 Nadprzewodnik | 0,2 MW | **nowy**, *alt* | lewitujące skrzynki, poświata (shader) |
| Rura L1 | 120 u/min | 2 Ferryt | 0 | **nowa**: prosta, łuk, trójnik | pulsowanie przepływu w kolorze płynu (shader) |
| Rura L2 (ciśnieniowa) | 360 u/min | 2 Stal + 1 Polimer | 0 | **nowa** | jw. |
| Rura L3 (kriogeniczna) | 360 u/min | 1 Stop + 1 Kompozyt + 1 Polimer | 0,1 MW | `tunnel_straight_A/B`, `tunnel_diagonal_*` (izolowana rura) | szron (shader) |
| Pompa | sieć rur w zasięgu 12 / 20 / 30 kafelków | zob. 5.3 | 1 MW | **nowa** | wirnik (węzeł) |
| Rozdzielacz / Scalacz | 1 → 2–3 wyjścia po równo / 2–3 → 1 | 4 Stal + 2 Przewód | 0,2 MW | **nowy** | — |
| Filtr | kieruje wybrany materiał na wyjście boczne | rozdzielacz + 1 Układ | 0,2 MW | **nowy** | lampka filtra (shader) |
| Przepust | taśma lub rura przechodzi pod 1–4 kafelkami (pod budowlą albo inną taśmą) | 6 Stal + 4 Beton | 0 | `tunnel_straight_A/B` | — |

Zasady:
- **Sieć rur** przenosi jeden płyn. Mieszanie płynów jest zabronione.
- **Zasięg sieci.** Poza zasięgiem pompy przepustowość spada o połowę.
- **Płyny i gazy** płyną tylko rurami. Taśmy przenoszą materiały sypkie i sztukowe w skrzynkach.

### 7.3 Budynki wielokafelkowe i porty

- **Rozmiary:**
  - **1 kafelek:** budynki małe;
  - **3 kafelki:** trzy kafelki stykające się w jednym wierzchołku;
  - **7 kafelków:** kafelek i sześciu sąsiadów.

  Budynki 3- i 7-kafelkowe nie mogą obejmować pięciokąta.
- **Porty.** Każdy budynek ma porty wejścia i wyjścia na zewnętrznych krawędziach, oznaczone strzałkami. Taśma lub rura dochodząca do portu wejścia podaje materiał; z portu wyjścia odbiera. Budynek obraca się w 6 krokach (ten sam mechanizm co obrót podglądu w Atanorze [PoC `build-toolbar.component.ts:34-39`]).
- **Magazyn jest węzłem sieci.** Ma porty z filtrem materiału, a jego zawartość zasila pulę ciała (4.4).
- **Fabryka atanorowa:** każde źródło (INPUT) na planszy atanora to port wejściowy budynku, a każde ujście (OUTPUT) to port wyjściowy (rozdz. 8).

### 7.4 Przykład: linia Stali i Silników

```
[Kopalnia Fe L3 ×2] ─►─┐                               ┌─►─ [Magazyn] (pula ciała)
                        ├─ taśma L1 (15 j./min) ─►─ [Huta L2] ─►─┤
[Kopalnia C  L3 ×1] ─►─┘                               └─►─ [Montownia L1] ◄─ taśma ◄─ [Huta: Miedź]
                                                                │
                                                                └─►─ Silniki ─► [Stacja załadunkowa] ─► Ciężarówka ─► Lądowisko
```

Bilans:
- 2 Kopalnie Ferrytu L3 dają 10,2 Fe/min, a Kopalnia Karbonitu L3 3,8 C/min.
- Huta L2 zużywa 1,6 Fe i 0,8 C na minutę. Linia może więc obsłużyć ok. 4–6 Hut L2, a taśma L1 (15 j./min) zostaje jeszcze w zapasie.

### 7.5 Który transport kiedy

| Środek | Kiedy | Plusy | Minusy |
|---|---|---|---|
| Taśma | stałe przepływy między sąsiednimi budynkami | największa przepustowość na kafelek, zero obsługi | zajmuje kafelki, sztywna |
| Rura | płyny i gazy | duża przepustowość | jeden płyn na sieć, pompy |
| Ciężarówka / Konwój | odległe skupiska na tym samym ciele, zmienne trasy | elastyczne, nie zajmują kafelków | mała przepustowość, wymagają Stacji załadunkowych |
| Dron | krótkie, rzadkie dostawy (np. części do rozbudowy) | najwygodniejsze | bardzo mała ładowność, pobór mocy |
| Prom / Wyrzutnia masy | powierzchnia ↔ orbita | Wyrzutnia działa bez paliwa | Wyrzutnia: duży pobór mocy, tylko ciała o niskiej grawitacji |
| Frachtowiec / Tankowiec | między ciałami | skala (koszt transportu z 4.6) | czas lotu, paliwo, okna transferowe |

Trasy cykliczne (`EKO-8` = B): pojazd krąży między przystankami (Stacje załadunkowe, Lądowiska, Stacje orbitalne) z warunkami typu „jedź, gdy ładownia pełna” albo „czekaj na okno transferowe tańsze niż X paliwa”.

### 7.6 Jak to policzy serwer i narysuje klient

- **Serwer nie symuluje pojedynczych skrzynek.** Sieć taśm i rur to graf przepływu. Przy każdej zmianie topologii (budowa, rozbudowa, zmiana filtra) serwer liczy ustalone tempa przepływu z ograniczeniami przepustowości i buforów. Między zmianami bufory napełniają się i opróżniają liniowo, więc stan da się liczyć leniwie i zdarzeniowo. To zgodne z modelem zdarzeniowym z `TECH-1` = A.
- **Klient animuje skrzynki** jako instancje (`cargo_A_packed`) z prędkością wynikającą z tempa. Obowiązuje limit widocznych skrzynek (np. 2000), a animacja działa tylko na ciele, na które patrzy kamera.
- **Pojazdy i statki** przekazują plany tras z czasami przyjazdu, wyliczanymi raz przy rozkazie. Wymaga to zmiany modelu transferu z PoC, w którym cel lotu jest korygowany w każdej klatce (`game-mechanics-analysis.md` §3.8).

---

## 8. Fabryka atanorowa w ekonomii

### 8.1 Poziomy budynku = możliwości maszyny

| Poziom | Maks. obszar planszy | Maks. ramion | Dostępne elementy | Takt [min/cykl] | Moc bazowa [MW] | Receptury |
|---|---|---|---|---|---|---|
| L1 | 19 heksów (promień 2) | 3 | ramiona L1–L2, tłok, Bonder, Unbonder | 1,0 | 6,0 | Nadprzewodnik |
| L2 | 37 (promień 3) | 4 | + glif transmutacji | 0,9 | 8,7 | + Katalizator, Metamateriał |
| L3 | 61 (promień 4) | 6 | + szyny, ramię L3 | 0,8 | 12,6 | + Kapsuła fuzyjna |
| L4 | 91 (promień 5) | 8 | + ramiona wieloramienne | 0,7 | 18,3 | + Procesor kwantowy |
| L5 | 127 (promień 6) | 10 | + druga plansza (2 programy równolegle) | 0,6 | 26,5 | wszystkie, dwie linie |

**Pobór mocy maszyny** = moc bazowa + 0,5 MW na każdy heks obszaru + 1 MW na każde ramię. Metryka „obszar” z PoC przekłada się więc wprost na koszt energii.

### 8.2 Koszt maszyny w materiałach

Punkty kosztu z PoC [PoC `arm.ts:35-41`, `glyph.ts:66-79`] zamieniam na materiały. Wychodzi, że 1 punkt ≈ 1 kr.

| Element | Punkty PoC | Materiały |
|---|---|---|
| Ramię L1 | 20 | 4 Stal + 1 Silnik |
| + długość L2 / L3 | +10 / +20 | +2 Stal / +4 Stal + 1 Stop tytanowy |
| + tłok | +10 | +1 Silnik |
| Bonder / Unbonder | 10 / 10 | 2 Przewód + 1 Układ scalony |
| Transmutacja | 20 | 1 Nadprzewodnik + 1 Układ scalony |
| Szyna (na heks) | 0 w PoC | 1 Stal (proponowana zmiana: szyny mają koszt) |

### 8.3 Receptury T3/T4

Atom to porcja materiału z portu wejściowego. Wzorce cząsteczek docelowych to propozycja; rozwiązania referencyjne trzeba dopiero zaprojektować i zweryfikować w edytorze (→ `EXP-6`).

| Produkt | Atomy (porcje wejść) | Cząsteczka docelowa | Rozwiązanie referencyjne: cykle / obszar / ramiona | Poziom |
|---|---|---|---|---|
| Nadprzewodnik | Cu, Cu (Miedź ×2), Pt (Platynit), H (10 u Wodoru) | łańcuch Cu–Pt–Cu z H przy Pt (3 wiązania) | 12 / 9 / 2 | L1 |
| Katalizator | Pt, Si (Krzem) | Pt*–Si; Pt przechodzi w Pt* na glifie transmutacji | 10 / 8 / 2 | L2 |
| Metamateriał osłonowy | Ti (Stop), C (Kompozyt), Be, Be (Beton ×2) | pierścień 4 atomów (4 wiązania) | 16 / 14 / 3 | L2 |
| Kapsuła fuzyjna | He (5 u Helu-3), D, D (po 5 u Deuteru), S (Nadprzewodnik) | gwiazda: S w środku, He, D, D wokół | 18 / 16 / 3 | L3 |
| Procesor kwantowy | Q (Kwantyt), U, U (Układ ×2), S (Nadprzewodnik) | Q* (transmutacja) w środku, U, U, S wokół | 24 / 20 / 4 | L4 |

### 8.4 Przepustowość i marża

- **Przepustowość** wynosi `1 / (cykle na sztukę × takt)`. Nadprzewodnik z rozwiązaniem referencyjnym na L1: 1 sztuka na 12 min, czyli 5/h.
- **Przykład marży.** Gracz zaprojektował maszynę 2× szybszą (6 cykli) i ciaśniejszą (obszar 7). Jej moc to 6 + 3,5 + 2 = 11,5 MW przy 6 min na sztukę. Koszt Nadprzewodnika spada z 45,3 kr (wartość bazowa z modelu) do ok. 36,7 kr, czyli o ok. 19%, a przepustowość rośnie 2×. Lepsza inżynieria to wprost niższy koszt i więcej towaru na sprzedaż.
- **Ranking.** Metryki rozwiązania (cykle, koszt, obszar) trafiają do rankingów receptur (`SOC-4`), a serwer weryfikuje je, odtwarzając powtórkę.

### 8.5 Wymagane zmiany w silniku Atanora (z PoC)

1. **Źródła ze skończonym zapasem.** Atom pojawia się tylko wtedy, gdy bufor portu zawiera porcję materiału. Przy pustym wejściu cała maszyna czeka (tick się nie wykonuje), więc program pozostaje deterministyczny, a przepustowość = min(projekt, dostawy). Dziś źródła są nieograniczone [PoC `pipeline.ts:256-269`].
2. **Nowe typy atomów** (Cu, Pt, H, Si, Ti, C, Be, He, D, S, Q, U) zamiast alchemicznych [PoC `molecule.ts:3`] i transmutacje Pt → Pt*, Q → Q* (`POC-7`).
3. **Metryki** (`POC-5`):
   - cykle na sztukę w stanie ustalonym (dziś UI pokazuje pozycję głowicy osi czasu);
   - koszt szyn;
   - obszar liczony z przebytej drogi.
4. **Kolizje trajektorii** i kolizje ramion (`POC-6`).
5. **Edytor:** glif transmutacji, szyny, ramię L3 i limity zależne od poziomu budynku (dziś pasek budowy ich nie ma [PoC `build-toolbar.component.ts:152-160`]).
6. **Naprawa poziomu L2**, którego domyślne rozwiązanie kończy się kolizją (`POC-4`).

---

## 9. Gwiazdolot i wybór kolejnego układu

### 9.1 Moduły i zestawienie materiałów (z modelu)

| Moduł | Materiały | Wartość [kr] | Energia wbudowana [MW·h] | Czas wbudowany [maszyno-h] |
|---|---|---|---|---|
| Kadłub | 1600 Belka konstrukcyjna + 1200 Stop tytanowy + 800 Kompozyt węglowy | 37 147 | 5463 | 728 |
| Osłona radiacyjna | 480 Metamateriał osłonowy + 3200 Beton regolitowy | 34 609 | 5158 | 610 |
| Habitat hibernacyjny | 600 Układ scalony + 1200 Polimer + 3000 Żywność | 41 050 | 5853 | 989 |
| Napęd fuzyjny Mk I (5 ly) | 600 Nadprzewodnik + 800 Stop tytanowy + 400 Silnik + 240 Układ scalony | 47 191 | 5847 | 859 |
| Komputer nawigacyjny | 60 Procesor kwantowy + 400 Układ scalony | 20 024 | 2367 | 329 |
| **Rdzeń razem** | | **180 021** | **24 687** | **3516** |
| Napęd Mk II (9 ly) | 400 Nadprzewodnik + 400 Stop tytanowy | 23 599 | 2768 | 392 |
| Napęd Mk III (12,5 ly) | 400 Nadprzewodnik + 24 Procesor kwantowy | 23 462 | 2505 | 376 |
| Napęd Mk IV — antymateria (17 ly) | 60 Antymateria + 400 Nadprzewodnik + 24 Procesor kwantowy | 101 555 | 14 839 | 532 |
| Paliwo na 1 ly | 40 Kapsuła fuzyjna | 6818 | 1005 | 54,1 |

- **Surowce rdzenia rozwinięte do T0** (Platynit i Kwantyt z wypraw są tu ujęte jako zużyte na nie paliwo, czyli Kriol): Karbonit 18 320, Kriol 13 831, Regolit 12 480, Ferryt 11 360, Kupryt 6427, Tytanit 4603, Silicyt 2720
- **Surowce paliwa na 1 ly:** Deuter 400, Hel-3 200, Kupryt 160, Kriol 102
- Nadprzewodnik do rdzenia: 600 × 12 min = 5,0 d pracy jednej Fabryki atanorowej (rozwiązanie referencyjne, L1)
- Procesor kwantowy: 60 × 16,8 min = 16,8 h; Kwantyt 60 j. = 12 wypraw kometarnych po 5 h
- Kapsuły do Proximy: 170 × 14,4 min = 40,8 h; Hel-3 850 u = 3,0 d pracy Platformy L1

**Wąskie gardła finału** to Nadprzewodnik (5 dni pracy jednej Fabryki atanorowej z rozwiązaniem referencyjnym, ok. 1 doba przy czterech na L3), wyprawy po Kwantyt (12 wypraw po 5 h, czyli kilka Górników Mk III naraz w oknie komety) i Hel-3 (3 dni Platformy L1, ok. 1 doba na L3). Każde z nich wymaga innej mechaniki: projektowania atanora, logistyki kosmicznej i energetyki zewnętrznego układu.

### 9.2 Napęd, zasięg, paliwo

| Napęd | Zasięg | Dodatkowe materiały | Czas podróży (propozycja) |
|---|---|---|---|
| Mk I (fuzyjny) | 5 ly | w rdzeniu | 12 h / ly |
| Mk II | 9 ly | 400 Nadprzewodnik + 400 Stop tytanowy | 9 h / ly |
| Mk III | 12,5 ly | 400 Nadprzewodnik + 24 Procesor kwantowy | 7 h / ly |
| Mk IV (antymateria) | 17 ly | 60 Antymateria + 400 Nadprzewodnik + 24 Procesor kwantowy | 4 h / ly |

Paliwo: **40 Kapsuł fuzyjnych na rok świetlny** (Proxima: 170, Tau Ceti: 477). Wybór dalszej gwiazdy kosztuje więc wprost Hel-3 i Deuter z Gigasa. Antymateria (Mk IV) przechowywana w Pułapce magnetycznej osiąga parytet składowania po ok. 41 h, więc trzeba ją wyprodukować tuż przed startem.

### 9.3 Cele w zasięgu (dane z `stars.data.ts`)

Mnożnik paneli to jasność gwiazdy w L☉, ograniczona do przedziału ×0,05–×8.

| Gwiazda | Dystans [ly] | Klasa | Jasność [L☉] | Znane planety | Wymagany napęd | Kapsuły fuzyjne | Mnożnik paneli |
|---|---|---|---|---|---|---|---|
| Proxima Centauri | 4,24 | M5.5Ve | 0,0017 | 2 | Mk I | 170 | ×0,05 |
| Alpha Centauri A | 4,37 | G2V | 1,519 | 0 | Mk I | 175 | ×1,52 |
| Alpha Centauri B | 4,37 | K1V | 0,5 | 0 | Mk I | 175 | ×0,50 |
| Barnard's Star | 5,96 | M4Ve | 0,0035 | 1 | Mk II | 239 | ×0,05 |
| Luhman 16 | 6,52 | L7.5/T0.5 | 0,00004 | 0 | Mk II | 261 | ×0,05 |
| WISE 0855−0714 | 7,27 | Y4 | 1e-7 | 0 | Mk II | 291 | ×0,05 |
| Wolf 359 | 7,78 | M6Ve | 0,001 | 0 | Mk II | 312 | ×0,05 |
| Lalande 21185 | 8,31 | M2V | 0,021 | 0 | Mk II | 333 | ×0,05 |
| Sirius A | 8,6 | A1V | 25,4 | 0 | Mk II | 344 | ×8,00 |
| Sirius B | 8,6 | DA2 | 0,056 | 0 | Mk II | 344 | ×0,06 |
| BL Ceti | 8,73 | M5.5V | 0,0009 | 0 | Mk II | 350 | ×0,05 |
| Epsilon Eridani | 10,52 | K2V | 0,34 | 1 | Mk III | 421 | ×0,34 |
| Lacaille 9352 | 10,74 | M1.5Ve | 0,033 | 0 | Mk III | 430 | ×0,05 |
| EZ Aquarii | 11,27 | M5Ve | 0,001 | 0 | Mk III | 451 | ×0,05 |
| 61 Cygni A | 11,4 | K5V | 0,085 | 0 | Mk III | 456 | ×0,09 |
| Procyon A | 11,46 | F5IV-V | 6,93 | 0 | Mk III | 459 | ×6,93 |
| Tau Ceti | 11,91 | G8.5V | 0,52 | 5 | Mk III | 477 | ×0,52 |
| GJ 1061 | 11,98 | M5.5V | 0,0015 | 3 | Mk III | 480 | ×0,05 |
| YZ Ceti | 12,13 | M4.5V | 0,0017 | 3 | Mk III | 486 | ×0,05 |
| Kapteyn's Star | 12,78 | M1.5V | 0,012 | 2 | Mk IV | 512 | ×0,05 |
| Altair | 16,73 | A7Vn | 10,6 | 0 | Mk IV | 670 | ×8,00 |

**Profil ekonomiczny według typu gwiazdy (propozycja):**

| Typ | Przykłady w zasięgu | Energia słoneczna | Profil złóż | Wyzwanie / atut |
|---|---|---|---|---|
| M (czerwony karzeł) | Proxima, Barnard, Wolf 359, GJ 1061, YZ Ceti | ×0,05 — praktycznie brak | dużo Kriolu i Karbonitu, mało metali; rozbłyski | energię trzeba przywieźć (Pręty lub Kapsuły w ładowni); najtańsze w paliwie (Proxima najbliżej) |
| K (pomarańczowy karzeł) | α Cen B, ε Eri, 61 Cyg A | ×0,09–0,5 | zrównoważony | umiarkowany start |
| G (jak Słońce) | α Cen A, Tau Ceti | ×0,5–1,5 | jak układ macierzysty | najłatwiejszy start; Tau Ceti ma 5 znanych planet |
| A/F (gorące) | Syriusz A, Procyon A, Altair | ×7–8 | dużo metali ciężkich i Platynitu; silne promieniowanie | energia prawie darmowa, ale budowle wymagają osłon z Metamateriału |
| Brązowe karły (L/T/Y) | Luhman 16, WISE 0855 | ×0,05 | bogate w Deuter i Hel-3 | brak światła; wymarzone dla fuzji |
| Biały karzeł | Syriusz B | ×0,06 | rzadki Kwantyt | układ podwójny z Syriuszem A |

Pole „Znane planety” w danych to podpowiedź, nie pełny opis układu. Ciała układu docelowego generuje gra (hybryda z `WIZ-4` = C). Gwiazdy o 0 znanych planet dostają pasy asteroid i małe ciała. Część danych w `stars.data.ts` jest niespójna (`POC-3`), więc przed użyciem dystansów jako czasów lotu warto je zweryfikować z katalogiem.

### 9.4 Sonda międzygwiezdna

Sonda Mk III (Stocznia L4) leci 2 h na rok świetlny, więc do Proximy dotrze w ok. 8,5 h. Odsłania profil układu docelowego: liczbę i typy ciał, profil złóż i obecność komet. Gracz wybiera więc cel na podstawie wiedzy, a nie samych danych katalogowych. Na mapie galaktyki zbadane gwiazdy dostają ikonę i kartę profilu, co rozszerza dialog gwiazdy z PoC [PoC `star-dialog.component.ts`].

### 9.5 Co przechodzi do nowego układu (propozycja)

- **Koloniści:** 200 osób. Nowa kolonia startuje z HQ L2 i Habitatem.
- **Ładownia startowa:** 2000 j. materiałów wybranych przez gracza. To decyzja strategiczna, np. Pręty paliwowe dla układu wokół czerwonego karła.
- **Wiedza:** odblokowane ery (receptury i budowle do poziomu HQ L2) oraz biblioteka projektów atanorów.
- **Układ macierzysty** pozostaje aktywny i może wysyłać kolejne statki. Zakres zarządzania wieloma układami to otwarta decyzja (→ `EXP-8`).

### 9.6 Model i animacja gwiazdolotu

- **Model:** **nowy** model główny (≤ 20 tys. trójkątów z LOD). Sekcje odpowiadają modułom: kręgosłup kadłuba, tarcza osłony z przodu, obracający się pierścień habitatu, silniki fuzyjne, macierz sensorów. Każdy poziom Doku dokłada widoczną sekcję. Napędy Mk II–IV zmieniają sekcję silników (Mk IV: pierścienie pułapki antymaterii).
- **Sekwencja startu (klip):** odcumowanie, zapłon silników (smuga plazmy z przewijaniem UV), przyspieszenie poza układ. Kamera przechodzi płynnie z widoku układu do mapy galaktyki, gdzie lot po linii do wybranej gwiazdy pokazuje postęp podróży.

---

## 10. Modele 3D: zasady i pipeline

**Fakty:**
- Paczka KayKit Space Base Bits 1.0 EXTRA ma 70 modeli glTF i 2 tekstury palety, licencja CC0.
- Żaden model nie zawiera animacji. Ruchome części są osobnymi węzłami w 10 modelach: `basemodule_garage`, `drill_structure`, `dropship`, `mobile_base_frame`, `spacetruck`, `spacetruck_large`, `spacetruck_trailer`, `space_farm_large_sprinkler`, `windturbine_low`, `windturbine_tall`.
- Modele są modelowane na siatce 2 jednostek, oś Y w górę. Rejestr modeli przechowuje wymiary i liczbę trójkątów (88–1198), a test `model-library.spec.ts` sprawdza je względem plików [PoC `engine/model-registry.ts`].
- Do `public/assets/kaykit/` skopiowano dziś 14 modeli. `ModelLibrary` spłaszcza każdy model do jednej geometrii, a `StructureView` to jeden `InstancedMesh` na ciało [PoC `CLAUDE.md`].

**Zasady dla nowych modeli (propozycja):**
1. **Styl KayKit:** low-poly, jedna wspólna tekstura palety (atlas kolorów). Dzięki niej jeden materiał wystarcza dla wielu modeli, co sprzyja instancingowi. Siatka 2 j., oś Y w górę, pivot u podstawy.
2. **Budżety:**
   - budynek 300–2000 trójkątów;
   - pojazd 500–1500;
   - statek 1500–4000;
   - obiekt orbitalny 3000–6000;
   - gwiazdolot do 20 tys. z LOD.

   Scena musi mieścić się w budżecie z `init.md`: 100–150 draw calls i 200–400 tys. trójkątów.
3. **Poziomy przez składanie modułów.** Wyższy poziom to bazowy model plus moduły dodatkowe (dachy, piętra, zbiorniki, cewki), jak w zestawach KayKit. Od L4 używamy tekstury *alt*. To ogranicza liczbę unikatowych modeli.
4. **Każdy model ma wpis w rejestrze i test,** na wzór `model-registry.ts` i `model-library.spec.ts`.
5. **Pipeline:** konwersja do `.glb` z meshopt i KTX2 w buildzie (`TECH-7`).

**Techniki animacji:**

| Technika | Do czego | Koszt i uwagi |
|---|---|---|
| **Węzeł** (ruch osobnej części: obrót lub przesunięcie) | śmigła, wiertła, koła, drzwi, zraszacze, anteny, suwnice | wymaga, by `ModelLibrary` **nie spłaszczała** nazwanych węzłów; każda ruchoma część to osobny `InstancedMesh` z macierzami instancji (+1 draw call na część i ciało) |
| **Shader** (przewijanie UV, emisja, poziom wypełnienia) | taśmy, przepływ w rurach, plazma, światła, wskaźniki, szron | prawie darmowe przy instancingu; stan przez atrybut instancji (np. praca / bezczynność / brak mocy) |
| **Cząsteczki** (instancjonowane sprite'y z pulą) | para, dym, iskry, pył, płomienie silników | budżet 2–5 tys. cząsteczek na scenę |
| **Klip glTF** (`AnimationMixer`) | złożone, rzadkie: ramię montowni, rampa wyrzutni, start gwiazdolotu, sonda | tylko dla kilku obiektów naraz |
| **Stany** | budowa (rusztowanie i efekt rozpuszczania), rozbudowa (rusztowanie i podmiana modelu z efektem skalowania), brak mocy (przygaszone światła, animacje spowolnione proporcjonalnie do zasilania) | wspólne dla wszystkich budynków |

Wydajność: animacje odtwarzamy tylko dla ciała, na które patrzy kamera, i z bliska. Pozostałe ciała pokazują stan statycznie (jak dziś etykiety odświeżane co 100 ms w PoC).

**Szacunek nowych modeli:** ok. 45 budynków i elementów logistycznych oraz 10 statków i pojazdów, w tym ok. 15 modułów dodatkowych dla poziomów. Z paczki KayKit pochodzi całość lub większość modeli L1–L3 dla infrastruktury, magazynów, wydobycia, pojazdów naziemnych, promów i Astraeusa.

---

## 11. Ryzyka

| Ryzyko | Skutek | Mitygacja |
|---|---|---|
| Zakres: 37 materiałów, 45 budynków, 10 pojazdów, nowe ciała | długi czas produkcji treści i balansu | MVP z podzbiorem: E0–E3, ok. 20 budynków, ok. 15 materiałów (Ferryt, Silicyt, Kriol, Karbonit, Regolit, Kupryt, Platynit; Stal, Miedź, Krzem, Woda, Wodór, Paliwo, Beton, Polimer; Belka, Przewód, Układ; Nadprzewodnik), Atanor L1–L2 (zgodnie z `MVP-4` = B) |
| Za mało kafelków na logistykę w stylu Factorio (planeta 642, Księżyc 92) | zatłoczenie, frustracja | rozbudowa zamiast nowych budynków (zaprojektowana); większe n siatki na nowych ciałach (`EXP-5`) |
| Kalibracja oparta na założonych koloniach referencyjnych | tempo w praktyce inne niż w modelu | symulacja headless realnej kolejności budowy na warstwie `game/` z PoC; playtesty |
| Animacje kosztują draw calls | spadek fps przy wielu ruchomych częściach | animacje tylko dla ciała w kadrze i z bliska; shadery zamiast węzłów, gdzie się da |
| Serwer liczy przepływy | błędy w grafie przepływu, trudne przypadki brzegowe | rozwiązanie ustalonych przepływów przy zmianie topologii + testy właściwości |
| Rozwiązania referencyjne atanora nie istnieją | liczby z 8.3 mogą być niewykonalne | zaprojektować je w edytorze przed balansem (`EXP-6`) |
| Długie czasy (dni) a retencja | gracze odpadają przed E5 | krótkie cele pośrednie (kontrakty, sondy, rankingi projektów), wydarzenia (okno komety) |

## 12. Otwarte kwestie

| ID | Pytanie | Rekomendacja | Powiązane |
|---|---|---|---|
| EXP-1 | Czy przyjmujemy skalę czasu „1 jednostka modelu = 1 min” (PoC ×60)? | Tak. Daje tempo dni–tygodni bez zmiany proporcji PoC; PoC zostaje trybem testowym | `EKO-1` |
| EXP-2 | Co z 12 pięciokątami na każdym ciele w logistyce? | Zakaz taśm i rur; tylko budowle 1-kafelkowe. Opcjonalnie: pięciokąty jako miejsca specjalnych złóż | `TECH-8` |
| EXP-3 | Czy załoga jako „pojemność” (jak moc) wystarczy, czy potrzebna jest pełna symulacja populacji? | Pojemność + potrzeby życiowe (4.5); pełna symulacja poza zakresem | `WIZ-7` |
| EXP-4 | Czy pula ciała (wspólna dla budowy) nie odbiera sensu logistyce? | Nie: produkcja pobiera fizycznie, a budowa dowozi przez łazik (czas dojazdu); obserwować w playtestach | `EKO-3` |
| EXP-5 | Czy 642 kafelki planety wystarczą? | Najpierw prototyp linii z 7.4 na obecnej siatce; ewentualnie GP(10,0) = 1002 kafelki przy większym promieniu (test szerokości kafelka 6–8 j.) | `TECH-8` |
| EXP-6 | Kto i kiedy projektuje rozwiązania referencyjne receptur T3/T4? | Projektant ekonomii w edytorze Atanora przed balansem; liczby z 8.3 są tymczasowe | `POC-4`, `POC-5` |
| EXP-7 | Rezerwa paliwa do najbliższej stacji z Paliwem zamiast do bazy? | Tak; bez tego Gigas i kometa wymagają nieproporcjonalnie dużych baków | — |
| EXP-8 | Czy po starcie gwiazdolotu gracz zarządza dwoma układami naraz? | Tak, ale układ macierzysty z automatyzacją tras; to zbliża grę do wariantu A | `WIZ-1`, `MP-2` |
| EXP-9 | Czy akceptujemy zmianę pipeline'u modeli (koniec spłaszczania) na potrzeby animacji? | Tak, dla nazwanych węzłów ruchomych; reszta jak dziś | `TECH-5`, `TECH-7` |
| EXP-10 | Czy gwiazdy-cele mają mieć dane katalogowe zamiast obecnych przybliżeń? | Tak, przed użyciem dystansów jako czasów lotu i ilości paliwa | `POC-3`, `WIZ-4` |

---

## Załącznik A — parametry modelu

Model to deterministyczny skrypt: dane materiałów, receptur, budynków i pojazdów wchodzą, wszystkie tabele z tego dokumentu wychodzą. Parametry:

| Parametr | Wartość | Uwagi |
|---|---|---|
| Jednostka czasu | 1 min | PoC = ×60 |
| Cena energii c_E | 0,1 kr / MW·min | wycena i porównania |
| Koszt czasu maszyny c_T | 0,1 kr / maszyno-min; statki 1,0 | amortyzacja |
| Wzrost na poziom | materiały ×2; czas ×1,8; wydajność ×1,6 (panel ×1,7); pobór mocy ×1,45; załoga ×1,3; pojemność magazynów ×1,8 | rozdz. 5.1 |
| Docelowy zwrot budynku produkcyjnego L1 | E0 8 min; E1 30 min; E2 2 h; E3 4 h; E4 8 h | z tego wynika mnożnik ery k (mediana budynków ery, zaokrąglona) |
| Kolonie referencyjne | E0 10, E1 40, E2 150, E3 500, E4 1500, E5 3000 MW; 60% mocy na produkcję; ρ ≈ 0,12 kr / MW·min | kontrola tempa kamieni milowych |
| Koszty HQ | ustalone wprost (nie wzorem) | HQ jest bramą ery |
| Atanor | takt 1,0 / 0,9 / 0,8 / 0,7 / 0,6 min; moc bazowa 6 × 1,45^(L−1) + 0,5 MW/heks + 1 MW/ramię | rozdz. 8 |
| Transport | paliwo = 2 × dystans × 0,02 × 1,5 (załadowany); średni dystans po fazach orbit | rozdz. 4.6 |
| Gwiazdolot | rdzeń: 5 modułów; paliwo 40 Kapsuł / ly | rozdz. 9 |

Zmiana dowolnego parametru i ponowne uruchomienie modelu aktualizuje spójnie wszystkie tabele. Pierwsza kalibracja: Rafineria krzemu miała zbyt długi zwrot (2,7 h w E1), więc obniżyłem jej koszt L1; koszt paliwa wyprawy po Platynit dopasowałem do średniego lotu na asteroidę zmierzonego w PoC.

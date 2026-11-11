# Ustalenia z sesji „note-and-analize” (10–11 listopada 2026)

> **Status:** USTALENIA użytkownika (odpowiedzi w artefaktach „Doprecyzowanie pomysłów” i „Rozstrzygnięcia”). **Nie** są jeszcze wpisami w `docs/DECISIONS.md` — przeniesienie wymaga polecenia człowieka (patrz `docs/plan/07-AUTONOMIA.md`, krok 1). Pełny dziennik z uzasadnieniami: `2026-11-11-dziennik-pomyslow.md` (sekcja „REJESTR PYTAŃ”, C „Zamknięte”). Identyfikatory Q/K/#N pochodzą z dziennika.

## Konflikty z istniejącym planem (do rozstrzygnięcia w audycie)

| Ustalenie | Koliduje z |
|---|---|
| Start = jeden najtańszy statek międzygwiezdny (75% paliwa, materiały, załoga, morale 75%); Arka-1 odpada (Q5) | plan ekonomii (Arka-1 2000 j., 2 łaziki, prom, sonda); port L1 = 210 j. |
| Handel NPC dopiero po „wielkiej handlowej stacji” na obrzeżach układu (Q6 b) | wczesny Terminal handlowy (dni 5–10), abstrakcyjne przesyłki z B6 |
| Materiały stoczni z puli planety (Q17 b), stacje budowane na orbicie planety, przenoszalne (Q32 c) | dok. ekonomii §5.1 (drony stacji z magazynu stacji) |
| Morale = trudny cel (<50% słabo, 70% ok, 85% super, 95–100% odblokowuje technologie) (Q30 b, K3) | kalibracja ekonomii §3.1 (zakłada pełną wydajność) |
| Wyłączność planety, nie układu; kilku graczy w układzie (Q19 b, K2) | WIZ-1=C (kolonie instancjonowane) — kompromis: rejestr zajętości planet w galaktyce, światy osobne |
| Brak PvP w MVP, PvP w następnym etapie (Q27 c, K1) | zgodne z WIZ-6/S-8 na teraz |
| Komunikaty z dialogami i wyborami (Q38 c) | brak systemu zdarzeń z wyborami w Rust |

## Lista ustaleń

- **Start (Q5, #4, Q4′):** jeden statek najniższej klasy, zatankowany na 75%, materiały na start kolonii, załoga z morale 75%. Skok startowy płacony z tej samej puli paliwa co loty lokalne (Q4′ a); zasięg startowy 3–5 gwiazd.
- **Generator (#33, Q40 a, #11):** serwer generuje gwiazdy, planety i układy deterministycznie (ziarno + współrzędne), leniwie, przy skanie teleskopem i przy zakładaniu konta; zapis po odkryciu; gracze oddaleni o „kilka gwiazd”. Teleskopy na statkach i jako osobne satelity (#13).
- **Odkrywanie (Q35 b, Q18 a, #31):** skan tranzytowy to szacunek z niepewnością (może pominąć planety); pierwszy skan pokazuje kilka opcji i pozwala wskazać tylko tę w zasięgu; po przylocie na obrzeża układu — odprawa ze znanymi danymi i skan potwierdzający.
- **Handel (Q6 b):** przewoźnik NPC dopiero po wielkiej stacji handlowej (droga budowla, oferty sprzedaży/kupna, wędrowni handlowcy NPC; inni gracze mogą cumować).
- **Statki (Q7, Q8 b, Q21 c, Q34 c, #2, #6):** 4 klasy (frachtowiec, tankowiec, okręt kolonizacyjny, sonda); większa klasa = więcej pokładów i powierzchni; prędkość FTL z mocy silnika i paliwa; napęd daje maksymalny warp, gracz wybiera niższy przy każdym locie; plan = schemat w bibliotece gracza (wymienialny, sprzedawalny) + projekt wnętrza z edytora jako plan wykonawczy; ładunek = powierzchnia przeznaczona na ładunek w planie.
- **Ludzie (Q9 a, Q12 a, Q13 a, #8):** jedna pula ludzi rozbudowywana habitatami (per planeta/statek/stacja); typy kosmetyczne; załoga = pojemność; szkolenia niewymagane; badania (Q24 a) z ogólnej puli + laboratoria (K4 a).
- **Materiały i stocznie (Q16 a, Q17 b, Q32 c):** Stocznia orbitalna; pule materiałów mają planety, statki, stacje; trzy typy magazynów (stałe/kompozyty, gazowe/ciekłe, metamateriały); budowa na orbicie planety z puli planety.
- **Galaktyka (Q19 b, Q20 c, Q23 c, Q29 c):** wyłączność per planeta; odbiorca wiadomości może odpowiedzieć; gazowe olbrzymy tylko w niektórych typach układów, bez lądowania; zależność między układami: kilka kluczowych rzadkich materiałów wymaga wymiany.
- **Konflikt i frakcje (Q26 c, Q27, K1):** frakcje = synonim korporacji i sojuszy; MVP bez PvP.
- **Morale (Q30 b, Q33 c, K3):** skala jak wyżej; liczy się powierzchnia zagospodarowana funkcjami (na osobę), wyposażenie, oświetlenie, kompletność załogi; zadanie: przeliczyć kalibrację ekonomii.
- **UI i treści (Q25 → A hybrydowy, Q36 a, Q37 c, Q38 c, Q39 a):** ikony treści w pixel-art 12×12 z ograniczoną paletą na obrysowym kafelku, chrom UI obrysowy; cywilizacja tubylcza (ok. 1% układów) na razie jako tło; kolor cywilizacji domyślnie świat/mapa + opcjonalny motyw UI; komunikaty RPG z wyborami; parametry gwiazd na razie opisowe.
- **Odroczone:** lot ku gwieździe (Q10/Q11: załoga odmawia, bez zniszczeń); PoC pasa asteroid (Q22 b); model stacji (Q31 c, otwarty).

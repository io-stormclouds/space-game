# Plan Implementacji POC — Prototyp Symulatora Cywilizacji Międzyplanetarnej

Dokument techniczny opracowany na podstawie `staff.md.txt` (specyfikacja wiążąca) oraz `planetary.md.txt` (analiza referencyjna modelu *Planetary Annihilation*). Zakres: architektura, kontrakty TypeScript, sekwencja wdrożenia, ryzyka i kryteria odbioru. Bez kodu produkcyjnego.

---

## 0. Streszczenie analizy wymagań

| Obszar | Wymaganie ze specyfikacji | Decyzja architektoniczna |
|---|---|---|
| Framework | Angular 17/18+, standalone, Signals | Angular 18, **aplikacja zoneless** (`provideExperimentalZonelessChangeDetection`) — eliminuje koszt Zone.js w pętli 60 FPS; fallback: `NgZone.runOutsideAngular` jeśli zoneless okaże się niestabilny z użytą wersją (ryzyko R12) |
| Rendering | Three.js, `logarithmicDepthBuffer: true` | Jeden `WebGLRenderer`, jeden `<canvas>`, scena jako hierarchia `Group` odzwierciedlająca SOI |
| Fizyka | Deterministyczna, kinematyczna, bez n-body | Pozycje ciał to czysta funkcja czasu gry `t`; brak całkowania → brak dryfu numerycznego, trywialny pause/przyspieszenie |
| Tranzyt | Bézier + wyprzedzenie ruchomego celu, paliwo płatne z góry | `TransferSystem` (czysty TS, testowalny) + per-frame korekta punktu końcowego |
| Stan gry | Signals: paliwo, ładownia, surowce | `GameStateService` jako jedyne źródło prawdy; silnik 3D **nie** trzyma stanu domenowego |
| UI | HUD overlay, paski postępu, panel kontekstowy | Komponenty standalone czytające `computed()`; `pointer-events: none` na nakładce |
| Otwarte pytanie ze spec. | Pauza taktyczna vs. czas rzeczywisty | **Rekomendacja:** czas rzeczywisty + globalny `timeScale` (0 = pauza na spacji). Orbity nie zatrzymują się przy wskazywaniu celu — to jest sens mechaniki *lead interception* |

Kluczowa zasada projektu: **cztery warstwy, jeden kierunek zależności** — `ui → state → game ← engine`. Warstwa `game` (logika domenowa + matematyka) nie importuje ani Angulara, ani Three.js poza typem wektorowym (patrz ryzyko R6).

---

## 1. Architektura i Separacja Warstw

### 1.1 Warstwy

```
┌─────────────────────────────────────────────────────────────┐
│  ui/        Komponenty HUD (standalone). Czytają Signals.    │
│             Emitują intencje użytkownika (np. "wróć do bazy")│
├─────────────────────────────────────────────────────────────┤
│  state/     GameStateService (Signals), CommandService,      │
│             GameLoopService. Walidacja rozkazów, mutacje.    │
├─────────────────────────────────────────────────────────────┤
│  game/      Czysty TS: GameClock, OrbitSolver,               │
│             TransferSystem, MiningSystem, modele.            │
│             Zero zależności od Angular/DOM.                  │
├─────────────────────────────────────────────────────────────┤
│  engine/    Three.js: SceneManager, EntityViewRegistry,      │
│             PickingService, RenderLoop. Odczytuje snapshot,  │
│             rysuje; zgłasza zdarzenia wejścia.               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Pętla gry i granica Angular ⇄ Three.js

Jedna pętla `requestAnimationFrame` prowadzona przez `GameLoopService`, uruchamiana **poza strefą Angulara** (lub w aplikacji zoneless). Kolejność w każdej klatce:

1. `GameClock.advance(rafDelta, timeScale)` → nowe `t` (sekundy gry), delta ograniczona do 0.1 s.
2. **Symulacja (game):** `OrbitSolver` wylicza pozycje ciał dla `t`; `TransferSystem` przesuwa statki `IN_TRANSIT` po krzywych i wykrywa dotarcie; `MiningSystem` akumuluje ładunek (tick 1 Hz); `DockingSystem` rozładowuje i tankuje.
3. **Zapis do stanu (state):** zmiany **dyskretne** (zmiana `state`, paliwo po starcie, cargo +10, dokowanie) → `signal.set/update` przez `GameStateService.apply(events)`. Zmiany **ciągłe** (pozycja statku w locie, progress 0..1) → **nie** trafiają do Signals per klatka, tylko do `FrameSnapshot` (zwykły obiekt mutowalny); HUD czyta ETA/progress z sygnału odświeżanego z throttlingiem ~10 Hz.
4. **Rendering (engine):** `SceneManager.sync(snapshot)` kopiuje pozycje/rotacje do `Object3D`, aktualizuje linię trajektorii, `renderer.render()`.

```
 Mysz (pointerdown/up, contextmenu)        requestAnimationFrame
        │                                          │
        ▼                                          ▼
 PickingService ──PickResult──▶ CommandService   GameLoopService
 (engine)                      (state)              │
                                  │  validate fuel  │ advance(t)
                                  ▼                 ▼
                           GameStateService ◀── game/* systems (czysty TS)
                           (Signals)   apply(events)│
                                  │                 │ FrameSnapshot
                                  ▼                 ▼
                           ui/* (computed)     SceneManager.sync()
                                                    │
                                                    ▼
                                             renderer.render()
```

**Zasady mostu:**
- Silnik nigdy nie wywołuje metod komponentów; komunikuje się wyłącznie przez `CommandService` (wejście użytkownika) i `FrameSnapshot` (dane do renderu).
- Signals piszemy wyłącznie z warstwy `state`. Systemy w `game/` zwracają **zdarzenia domenowe** (`DomainEvent[]`), które `GameLoopService` aplikuje do stanu — dzięki temu `game/` jest testowalne jednostkowo bez Angulara.
- Odczyt stanu w pętli: `untracked(() => state.spacecraft())` — unikamy tworzenia zależności reaktywnych wewnątrz RAF.
- Kierunek odwrotny (state → engine) dla zmian rzadkich (zaznaczenie, highlight) realizuje `effect()` w `GameCanvasComponent`, który wywołuje `SceneManager.setHighlighted(shipId)`.

### 1.3 Zdarzenia domenowe (kontrakt game → state)

```ts
export type DomainEvent =
  | { type: 'TRANSFER_STARTED';  shipId: ShipId; targetBodyId: BodyId; fuelCost: number; etaSec: number }
  | { type: 'TRANSFER_ARRIVED';  shipId: ShipId; bodyId: BodyId }
  | { type: 'MINING_TICK';       shipId: ShipId; bodyId: BodyId; amount: number }
  | { type: 'CARGO_FULL';        shipId: ShipId }
  | { type: 'CARGO_UNLOADED';    shipId: ShipId; amount: number }
  | { type: 'REFUELED';          shipId: ShipId }
  | { type: 'COMMAND_REJECTED';  shipId: ShipId; reason: 'NO_FUEL' | 'ALREADY_THERE' | 'IN_TRANSIT'; detail?: string };
```

### 1.4 Cykl życia i unikanie wycieków pamięci

| Zasób | Właściciel | Tworzenie | Zwalnianie |
|---|---|---|---|
| `WebGLRenderer`, `Scene`, `Camera` | `SceneManager` | `init(canvas)` w `afterNextRender` komponentu `GameCanvasComponent` | `dispose()`: `renderer.dispose()`, `renderer.forceContextLoss()`, `scene.traverse` → `geometry.dispose()`, `material.dispose()` (także tablice materiałów), tekstury |
| Pętla RAF | `GameLoopService` | `start()` | `stop()` → `cancelAnimationFrame(handle)`; flaga `running` zabezpiecza przed podwójnym startem po HMR |
| Nasłuchiwacze `pointerdown/up/move`, `contextmenu`, `wheel`, `keydown` | `PickingService`, `CameraController`, `GameLoopService` | `attach(canvas)` | `AbortController` — wszystkie `addEventListener(..., { signal })`, jeden `abort()` w `detach()` |
| `ResizeObserver` canvasu | `SceneManager` | `init` | `observer.disconnect()` |
| Linie orbit (`LineLoop`) i trajektorii (`Line` + `LineDashedMaterial`) | `EntityViewRegistry` | lazy, przy pierwszym rysowaniu | Przy usunięciu encji: `parent.remove`, `geometry.dispose`, `material.dispose` |
| Geometrie współdzielone (sfera, stożek statku, hit-proxy) | `AssetCache` | pierwszy dostęp | `disposeAll()` wywołane z `SceneManager.dispose()` |

Punkt wejścia zwalniania: `GameCanvasComponent` wstrzykuje `DestroyRef` i rejestruje `destroyRef.onDestroy(() => { loop.stop(); picking.detach(); camera.detach(); scene.dispose(); })`. `effect()` tworzone w komponentach są sprzątane automatycznie przez Angulara; `effect()` w serwisach `providedIn: 'root'` żyją tak długo jak aplikacja i **nie są tworzone wewnątrz pętli RAF**.

---

## 2. Struktura Katalogów i Modułów

```
space-3d-poc/
├── CLAUDE.md
├── POC-PLAN.md
├── angular.json
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── src/
    ├── main.ts                         # bootstrapApplication + provideExperimentalZonelessChangeDetection
    ├── styles.css                      # @tailwind base/components/utilities; html,body,canvas 100%
    ├── index.html
    └── app/
        ├── app.component.ts            # <app-game-canvas/> + <app-hud/> (overlay)
        ├── app.config.ts
        │
        ├── game/                       # CZYSTY TS — bez Angulara, bez DOM
        │   ├── models/
        │   │   ├── celestial-body.model.ts
        │   │   ├── spacecraft.model.ts
        │   │   ├── transfer.model.ts
        │   │   └── domain-event.model.ts
        │   ├── config/
        │   │   ├── game-constants.ts   # FUEL_RATE, MINING_RATE, CRUISE_SPEED, CAPTURE_RADIUS, TIME_CLAMP
        │   │   └── initial-world.ts    # Słońce, Planeta Matka, Księżyc, Asteroida, statek
        │   ├── math/
        │   │   ├── vec3.ts             # typ Vec3 {x,y,z} + helpery (add, sub, len, lerp)
        │   │   ├── orbit-solver.ts     # pozycja ciała w czasie t (z hierarchią rodziców)
        │   │   ├── lead-intercept.ts   # Δt punktu przechwycenia (iteracja stałopunktowa)
        │   │   └── bezier-path.ts      # budowa i próbkowanie krzywej, długość, styczna
        │   ├── systems/
        │   │   ├── game-clock.ts
        │   │   ├── transfer-system.ts  # koszt paliwa, plan lotu, aktualizacja, detekcja dotarcia
        │   │   ├── mining-system.ts    # tick 1 Hz, +10 minerałów do maxCargo
        │   │   └── docking-system.ts   # rozładunek, tankowanie na Planecie Matce
        │   └── frame-snapshot.ts       # mutowalny bufor pozycji dla renderu
        │
        ├── state/                      # Angular Signals — jedyne źródło prawdy
        │   ├── game-state.service.ts   # bodies, spacecraft, globalMinerals, credits, selectedShipId, timeScale
        │   ├── command.service.ts      # select(), orderTransfer(), returnToBase(); walidacja paliwa
        │   ├── notification.service.ts # toasty: COMMAND_REJECTED itp.
        │   └── game-loop.service.ts    # RAF, orkiestracja: systems → events → state → snapshot → render
        │
        ├── engine/                     # Three.js — rysuje snapshot, zgłasza wejście
        │   ├── scene-manager.ts        # renderer, scena, kamera, światła, resize, dispose, sync(snapshot)
        │   ├── entity-view-registry.ts # entityId → Object3D; meshe, orbity, trajektoria, hit-proxy
        │   ├── scene-graph.builder.ts  # hierarchia OrbitAnchor/Group/OrbitalUnitsGroup z initial-world
        │   ├── picking.service.ts      # Raycaster, LPM/PPM, próg drag, emisja PickResult
        │   ├── camera-controller.ts    # OrbitControls wokół celu (POC), zoom
        │   ├── asset-cache.ts          # współdzielone geometrie/materiały
        │   └── render-loop.ts          # cienki wrapper RAF z pomiarem delta
        │
        ├── ui/                         # Komponenty standalone, HUD
        │   ├── hud/hud.component.ts                # kontener overlay (pointer-events: none)
        │   ├── top-bar/top-bar.component.ts        # kredyty, minerały, liczba statków, timeScale
        │   ├── ship-panel/ship-panel.component.ts  # paliwo, ładownia, status, ETA, "Wróć do bazy"
        │   ├── body-labels/body-labels.component.ts# etykiety ciał rzutowane na ekran
        │   ├── progress-bar/progress-bar.component.ts
        │   └── toast/toast.component.ts
        │
        └── shared/
            └── ids.ts                  # typy brandowane BodyId/ShipId
```

Testy jednostkowe (`*.spec.ts`) przy plikach w `game/` — tam jest cała logika wymagająca weryfikacji numerycznej. Komponenty `ui/` w POC testowane manualnie.

---

## 3. Kluczowe Kontrakty (TypeScript)

### 3.1 Modele

```ts
// shared/ids.ts
export type BodyId = string & { readonly __brand: 'BodyId' };
export type ShipId = string & { readonly __brand: 'ShipId' };

// game/models/celestial-body.model.ts
export interface CelestialBody {
  id: BodyId;
  name: string;
  kind: 'STAR' | 'PLANET' | 'MOON' | 'ASTEROID';
  radius: number;
  parentId: BodyId | null;       // null = centrum układu
  orbitRadius: number;           // promień orbity względem rodzica (0 dla centrum)
  orbitSpeed: number;            // ω [rad/s], stała
  initialAngle: number;          // φ
  orbitalAltitudeFactor: number; // 1.25 → wysokość dokowania = radius * 1.25
  isHomeBase: boolean;           // rozładunek + tankowanie
  resources?: { minerals: number };
}

// game/models/spacecraft.model.ts
export type ShipState = 'DOCKED' | 'IN_TRANSIT' | 'MINING';

export interface Spacecraft {
  id: ShipId;
  name: string;
  fuel: number;
  maxFuel: number;
  cargo: number;
  maxCargo: number;
  state: ShipState;
  currentBodyId: BodyId | null;  // null gdy IN_TRANSIT
  targetBodyId: BodyId | null;
  transfer: TransferPlan | null;
}

// game/models/transfer.model.ts
export interface TransferPlan {
  shipId: ShipId;
  fromBodyId: BodyId;
  toBodyId: BodyId;
  startTime: number;             // t gry w chwili startu
  startPos: Vec3;                // world
  controlPos: Vec3;              // punkt kontrolny (wzniesienie poza ekliptykę)
  leadPos: Vec3;                 // przewidywany punkt przechwycenia (aktualizowany per klatka)
  cruiseSpeed: number;
  estimatedDuration: number;
  progress: number;              // 0..1 (parametr krzywej)
}
```

### 3.2 Matematyka

```ts
// game/math/orbit-solver.ts
export class OrbitSolver {
  constructor(bodies: ReadonlyArray<CelestialBody>) {}
  /** Pozycja ciała w układzie rodzica dla czasu t: (r·cos(ωt+φ), 0, r·sin(ωt+φ)). */
  localPosition(bodyId: BodyId, t: number, out: Vec3): Vec3;
  /** Pozycja w układzie heliocentrycznym — rekurencja po parentId. */
  worldPosition(bodyId: BodyId, t: number, out: Vec3): Vec3;
  /** Punkt dokowania: worldPosition + radius·altitudeFactor w kierunku +Y. */
  dockingPosition(bodyId: BodyId, t: number, out: Vec3): Vec3;
  /** Maksymalna prędkość liniowa ciała (Σ ω·r po łańcuchu rodziców) — do walidacji konfiguracji. */
  maxLinearSpeed(bodyId: BodyId): number;
}

// game/math/lead-intercept.ts
export interface LeadResult { leadPos: Vec3; flightTime: number; iterations: number }
/**
 * Iteracja stałopunktowa:
 *   Δt₀   = |target(t) − start| / v
 *   Δtₙ₊₁ = |target(t + Δtₙ) − start| / v
 * stop gdy |Δtₙ₊₁ − Δtₙ| < eps lub n = maxIter.
 * Zbieżne, bo maxLinearSpeed(target) << cruiseSpeed (walidowane w teście konfiguracji).
 */
export function solveLeadIntercept(
  start: Vec3, targetId: BodyId, t: number, cruiseSpeed: number,
  solver: OrbitSolver, opts?: { maxIter?: number; eps?: number }
): LeadResult;

// game/math/bezier-path.ts
export class BezierPath {
  constructor(p0: Vec3, p1: Vec3, p2: Vec3) {}
  setEnd(p2: Vec3): void;              // per-frame korekta celu
  pointAt(u: number, out: Vec3): Vec3;
  tangentAt(u: number, out: Vec3): Vec3;
  approxLength(segments?: number): number;
  sample(count: number, out: Vec3[]): void; // do linii trajektorii
}
```

### 3.3 Systemy

```ts
// game/systems/game-clock.ts
export class GameClock {
  readonly time: number;               // sekundy gry
  /** Zwraca gameDelta = min(realDelta, TIME_CLAMP) · timeScale i przesuwa time. */
  advance(realDeltaSec: number, timeScale: number): number;
}

// game/systems/transfer-system.ts
export class TransferSystem {
  constructor(solver: OrbitSolver, cfg: GameConstants) {}
  fuelCost(from: BodyId, to: BodyId, t: number): number;   // dystans dokowań × FUEL_RATE
  plan(ship: Spacecraft, to: BodyId, t: number): TransferPlan;
  /** Przesuwa statki IN_TRANSIT, zapisuje pozycje do snapshotu, zwraca TRANSFER_ARRIVED. */
  update(ships: ReadonlyArray<Spacecraft>, t: number, dt: number, snap: FrameSnapshot): DomainEvent[];
}

// game/systems/mining-system.ts
export class MiningSystem {
  update(ships: ReadonlyArray<Spacecraft>, bodies: ReadonlyArray<CelestialBody>, dt: number): DomainEvent[];
}

// game/systems/docking-system.ts
export class DockingSystem {
  /** Dla statków, które właśnie dotarły (TRANSFER_ARRIVED) na isHomeBase: CARGO_UNLOADED, REFUELED. */
  onArrival(ship: Spacecraft, body: CelestialBody): DomainEvent[];
}

// game/frame-snapshot.ts
export interface FrameSnapshot {
  time: number;
  bodyLocalPos: Map<BodyId, Vec3>;       // do ustawienia Group.position w układzie rodzica
  shipWorldPos: Map<ShipId, Vec3>;       // tylko statki IN_TRANSIT
  shipOrientation: Map<ShipId, Quat>;
  transitProgress: Map<ShipId, number>;
  trajectory: { shipId: ShipId; points: Vec3[] } | null;
}
```

### 3.4 Stan i komendy

```ts
// state/game-state.service.ts
@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly bodies = signal<ReadonlyArray<CelestialBody>>(INITIAL_BODIES);
  readonly spacecraft = signal<ReadonlyArray<Spacecraft>>(INITIAL_SHIPS);
  readonly globalMinerals = signal(0);
  readonly credits = signal(1000);
  readonly selectedShipId = signal<ShipId | null>(null);
  readonly timeScale = signal(1);          // 0 = pauza
  readonly gameTime = signal(0);           // odświeżany ~10 Hz, nie per klatka
  readonly selectedTransitProgress = signal(0); // ~10 Hz

  readonly selectedShip = computed(() => this.spacecraft().find(s => s.id === this.selectedShipId()) ?? null);
  readonly activeShipCount = computed(() => this.spacecraft().filter(s => s.state !== 'DOCKED').length);
  readonly homeBase = computed(() => this.bodies().find(b => b.isHomeBase)!);

  apply(events: DomainEvent[]): void;      // jedyny punkt mutacji z pętli gry
  updateShip(id: ShipId, patch: Partial<Spacecraft>): void;
}

// state/command.service.ts
@Injectable({ providedIn: 'root' })
export class CommandService {
  select(shipId: ShipId | null): void;
  /** Walidacja: stan DOCKED|MINING, cel ≠ obecne ciało, fuel ≥ cost. Odrzucenie → NotificationService. */
  orderTransfer(shipId: ShipId, targetBodyId: BodyId): boolean;
  returnToBase(shipId: ShipId): boolean;   // = orderTransfer(shipId, homeBase.id)
}

// engine/picking.service.ts
export type PickResult =
  | { kind: 'SHIP'; shipId: ShipId }
  | { kind: 'BODY'; bodyId: BodyId }
  | { kind: 'EMPTY' };

export class PickingService {
  attach(canvas: HTMLCanvasElement, camera: THREE.Camera, registry: EntityViewRegistry,
         handlers: { onPrimary: (r: PickResult) => void; onSecondary: (r: PickResult) => void }): void;
  detach(): void;                           // AbortController.abort()
}

// engine/scene-manager.ts
export class SceneManager {
  init(canvas: HTMLCanvasElement): void;
  buildWorld(bodies: ReadonlyArray<CelestialBody>, ships: ReadonlyArray<Spacecraft>): void;
  sync(snapshot: FrameSnapshot): void;
  /** Reparent z zachowaniem transformu światowego (Object3D.attach). */
  moveShipToTransit(shipId: ShipId): void;
  moveShipToOrbit(shipId: ShipId, bodyId: BodyId, localDockingPos: Vec3): void;
  setHighlighted(shipId: ShipId | null): void;
  render(): void;
  dispose(): void;
}
```

### 3.5 Konfiguracja świata POC

| Encja | Rodzic | radius | orbitRadius | okres T | ω·r [u/s] | Uwagi |
|---|---|---|---|---|---|---|
| Słońce | — | 60 | 0 | — | 0 | wizualnie + `PointLight` w (0,0,0) |
| Planeta Matka | Słońce | 50 | 900 | 240 s | 23.6 | `isHomeBase`, start statku |
| Księżyc | Planeta Matka | 15 | 160 | 40 s | 25.1 + 23.6 | w lokalnym układzie planety |
| Asteroida | Słońce | 12 | 1800 | 600 s | 18.8 | `resources.minerals = 500` |

Stałe: `CRUISE_SPEED = 150 u/s`, `MINING_RATE = 10/s`, `CAPTURE_RADIUS = radius · 1.5`, `TIME_CLAMP = 0.1 s`, `FUEL_RATE` skalibrowane tak, by trasa Planeta→Księżyc kosztowała ≈ 20, a Księżyc→Asteroida i Asteroida→Planeta ≈ 30 (koszt jest funkcją dystansu, więc wartości ze specyfikacji traktujemy jako kalibrację, nie stałe; przy średnim dystansie ~1000 u do Asteroidy daje to `FUEL_RATE ≈ 0.03`).

Warunek poprawności *lead intercept*: `maxLinearSpeed(cel) < 0.5 · CRUISE_SPEED`. Najszybszy cel (Księżyc, ~49 u/s) spełnia go z zapasem przy 150 u/s — iteracja zbiega w 2–3 krokach.

---

## 4. Fazy Wdrożenia POC

### Faza 0 — Scaffold

| # | Zadanie | Wynik |
|---|---|---|
| 0.1 | `ng new space-3d-poc --standalone --style=css --ssr=false --routing=false` w bieżącym katalogu | czysty projekt |
| 0.2 | `npm i three`, `npm i -D @types/three`; Tailwind wg oficjalnej instrukcji Angular | zależności |
| 0.3 | `provideExperimentalZonelessChangeDetection()` w `app.config.ts`; usunięcie `zone.js` z `polyfills` w `angular.json` | zoneless |
| 0.4 | Struktura katalogów z sekcji 2, pliki z kontraktami z sekcji 3 (sygnatury, `throw new Error('TODO')`) | szkielet |
| 0.5 | Uzupełnienie `CLAUDE.md` o komendy (`ng serve`, `ng test`, `ng test --include='**/orbit-solver.spec.ts'`) | dokumentacja |

### Faza 1 — Fundament i Scena

| # | Zadanie | Kryterium |
|---|---|---|
| 1.1 | `GameCanvasComponent`: `<canvas>` na pełny viewport, `afterNextRender` → `SceneManager.init` | czarny canvas bez błędów konsoli |
| 1.2 | `SceneManager`: `WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })`, `PerspectiveCamera(50, aspect, 0.5, 20000)`, `AmbientLight(0.15)` + `PointLight` w (0,0,0) | — |
| 1.3 | `ResizeObserver` → `setSize` + `updateProjectionMatrix`; `setPixelRatio(Math.min(devicePixelRatio, 2))` | poprawny resize |
| 1.4 | `RenderLoop` z deltą; `GameLoopService.start()` poza strefą; `stop()` w `DestroyRef` | 60 FPS, brak CD Angulara w profilerze w klatkach bez zdarzeń |
| 1.5 | `CameraController`: `OrbitControls` z `three/examples/jsm/controls/OrbitControls.js`, target = Planeta Matka (aktualizowany per klatka, bo planeta się porusza) | obrót/zoom myszą |
| 1.6 | `dispose()` kompletny; test manualny: zniszczenie komponentu → `renderer.info.memory.geometries === 0` | brak wycieku |

### Faza 2 — Hierarchia Ciał Niebieskich

| # | Zadanie | Kryterium |
|---|---|---|
| 2.1 | `initial-world.ts` wg tabeli 3.5 | — |
| 2.2 | `OrbitSolver` + testy: `worldPosition(moon) === worldPosition(planet) + localPosition(moon)`; okresowość `pos(t) ≈ pos(t+T)`; `maxLinearSpeed` | spec zielone |
| 2.3 | `SceneGraphBuilder`: dla każdego ciała `Group` jako dziecko grupy rodzica; wewnątrz `BodyMesh`, `OrbitalUnitsGroup`; osobno `InterplanetaryTransitGroup` w scenie | hierarchia jak w `planetary.md.txt` |
| 2.4 | `SceneManager.sync`: `Group.position` ← `snapshot.bodyLocalPos` (lokalne względem rodzica — Three.js składa transformy) | Księżyc krąży wokół poruszającej się planety |
| 2.5 | `LineLoop` orbit: 128 segmentów, dodany do grupy **rodzica** (orbita Księżyca podąża za planetą) | orbity zgodne z torami |
| 2.6 | Statek (`ConeGeometry`) w `OrbitalUnitsGroup` Planety Matki na `(0, radius·1.25, 0)` | statek „jedzie” z planetą bez kodu |
| 2.7 | `timeScale` sterowane spacją (0↔1) i klawiszami `1/2/3` (1×/3×/10×) | pauza działa |

### Faza 3 — Raycasting i Selekcja

| # | Zadanie | Kryterium |
|---|---|---|
| 3.1 | `EntityViewRegistry`: `Object3D.userData = { entityId, kind }`; listy `pickableShips`, `pickableBodies` | — |
| 3.2 | `PickingService`: `pointerdown` zapisuje pozycję; `pointerup` z przesunięciem < 5 px = klik (odróżnienie od obrotu `OrbitControls`) | drag nie zaznacza |
| 3.3 | `button === 0` → raycast najpierw statki, potem ciała → `onPrimary`; `button === 2` → `onSecondary`; `contextmenu.preventDefault()` na canvasie | LPM/PPM rozróżnione |
| 3.4 | Normalizacja NDC z `canvas.getBoundingClientRect()` (nie `window`) | trafienia poprawne po resize |
| 3.5 | `CommandService.select` → `selectedShipId`; `effect()` w `GameCanvasComponent` → `SceneManager.setHighlighted` (emissive) | wizualne zaznaczenie |
| 3.6 | Niewidoczna sfera „hit-proxy” (`visible: false`, ale w liście raycastu) o promieniu ×3 na statku | klikalność na dużym oddaleniu |
| 3.7 | `onSecondary(BODY)` przy zaznaczonym statku → `CommandService.orderTransfer`; bez zaznaczenia — nic | rozkaz tylko z kontekstem |

### Faza 4 — Kinematyka Tranzytu

| # | Zadanie | Kryterium |
|---|---|---|
| 4.1 | `solveLeadIntercept` + testy: cel nieruchomy → `flightTime = d/v`; cel ruchomy → `|target(t+Δt) − leadPos| < 1 u` | spec zielone |
| 4.2 | `BezierPath` (kwadratowa; `P1 = (P0+P2)/2 + (0, 0.2·d, 0)`) + testy długości i stycznej | — |
| 4.3 | `TransferSystem.fuelCost` i `plan`; `CommandService.orderTransfer` — walidacja: stan `DOCKED`/`MINING`, cel ≠ obecny, `fuel ≥ cost`; odrzucenie → `COMMAND_REJECTED` → toast | rozkaz bez paliwa odrzucony z komunikatem, stan niezmieniony |
| 4.4 | Start: `fuel -= cost`, `state = IN_TRANSIT`, `currentBodyId = null`; silnik: `SceneManager.moveShipToTransit` (`Object3D.attach` zachowuje transform światowy) | statek odrywa się bez skoku |
| 4.5 | Per klatka: `leadPos` ← `dockingPosition(target, t + pozostały czas)`, `setEnd`, `progress += v·dt / approxLength`, pozycja + orientacja (`quaternion.setFromUnitVectors(+Z, tangent)`) → snapshot | łuk podąża za ruchomym celem |
| 4.6 | Dotarcie: `progress ≥ 1` **lub** `|shipPos − dockingPos(target)| < CAPTURE_RADIUS` → `TRANSFER_ARRIVED`; `moveShipToOrbit` z pozycją analityczną `(0, radius·1.25, 0)` w układzie celu | brak teleportacji przy dokowaniu |
| 4.7 | Trajektoria: `Line` + `LineDashedMaterial`, 32 próbki z `BezierPath.sample`, `computeLineDistances()` po każdej aktualizacji; widoczna od rozkazu do dotarcia | linia znika po dokowaniu |

### Faza 5 — Pętla Ekonomiczna

| # | Zadanie | Kryterium |
|---|---|---|
| 5.1 | Po `TRANSFER_ARRIVED`: ciało z `resources` → `state = MINING`; `isHomeBase` → `DockingSystem.onArrival`; inne → `DOCKED` | automatyczne przejścia |
| 5.2 | `MiningSystem`: akumulator `dt`, co 1 s `MINING_TICK` o `min(10, maxCargo − cargo, body.minerals)`; przy pełnej ładowni `CARGO_FULL` → `state = DOCKED` | cargo 0→50 w 5 s, minerały asteroidy maleją |
| 5.3 | `DockingSystem`: `CARGO_UNLOADED` (`globalMinerals += cargo`, `cargo = 0`), `REFUELED` (`fuel = maxFuel`) | licznik w top-barze rośnie |
| 5.4 | `returnToBase()` = `orderTransfer(ship, homeBase.id)` z tą samą walidacją | przycisk działa |
| 5.5 | Test integracyjny w `game/` (bez Angulara): symulacja pełnej pętli krokiem 1/60 s → `globalMinerals === 50`, `fuel === 100`, `state === 'DOCKED'` | zielony |

### Faza 6 — Interfejs RTS/HUD

| # | Zadanie | Kryterium |
|---|---|---|
| 6.1 | `HudComponent` absolutnie nad canvasem, `pointer-events: none`; panele `pointer-events: auto` | klik w pustą nakładkę trafia w scenę |
| 6.2 | `TopBarComponent`: `credits()`, `globalMinerals()`, `activeShipCount()`, wskaźnik `timeScale`/pauzy, `gameTime` | aktualizacja natychmiastowa |
| 6.3 | `ShipPanelComponent` (`@if (selectedShip(); as ship)`): nazwa, status, `ProgressBar` paliwa (niebieski > 30 %, żółty ≤ 30 %), `ProgressBar` ładowni (pomarańczowy), ETA z `selectedTransitProgress` (10 Hz), „Wróć do bazy” (`disabled` gdy `IN_TRANSIT` lub już w bazie) | panel reaguje na stan |
| 6.4 | `ToastComponent`: kolejka z `NotificationService`, auto-hide 3 s | odrzucony rozkaz widoczny |
| 6.5 | `BodyLabelsComponent`: nazwa + minerały, pozycja z `Vector3.project(camera)` → `left/top` w `%`, odświeżane 10 Hz | czytelne etykiety |
| 6.6 | Profil Chrome Performance: brak pracy Angulara w klatkach bez zdarzeń dyskretnych | profil czysty |

---

## 5. Analiza Ryzyk Technicznych i Mitygacje

| ID | Ryzyko | Objaw | Mitygacja |
|---|---|---|---|
| R1 | **Z-fighting / precyzja głębi** przy skali 1800 u orbity vs 1–2 u statku | migotanie, znikające krawędzie | `logarithmicDepthBuffer: true`; `near ≥ 0.5`, `far ≈ 20 000`; linie orbit/trajektorii z `depthTest: false` i `renderOrder` |
| R2 | **Chybienie ruchomego celu** — lot wyznaczony raz w chwili startu | statek dociera do pustego miejsca | dwustopniowo: (a) `solveLeadIntercept` na starcie (ETA, koszt), (b) per-frame `setEnd(dockingPos(target))`; warunek dotarcia także odległościowy (`CAPTURE_RADIUS`) |
| R3 | **Niezbieżność iteracji lead intercept** | oscylacja Δt | `maxIter = 8`; test konfiguracji: `maxLinearSpeed(każde ciało) < 0.5 · CRUISE_SPEED` |
| R4 | **Skok pozycji przy reparentowaniu** (grupa ↔ scena) | teleportacja statku przy starcie/dokowaniu | `Object3D.attach()` zamiast `remove`+`add` (zachowuje transform światowy); po dokowaniu pozycja nadpisana wartością analityczną w układzie lokalnym |
| R5 | **Synchronizacja UI / nadmiar detekcji zmian** | spadek FPS, ciągłe CD | zoneless + Signals; wartości ciągłe poza Signals (snapshot), throttling 10 Hz dla `gameTime`/`selectedTransitProgress`; `untracked` w pętli |
| R6 | **Przeciek Three.js do warstwy domenowej** | logika nietestowalna bez WebGL | `game/` używa własnego `Vec3 {x,y,z}`; konwersja do `THREE.Vector3` wyłącznie w `SceneManager.sync`; testy `game/` biegną w Karma/Jest bez canvasu |
| R7 | **Spiral of death** po powrocie z tła (RAF wstrzymany, ogromna delta) | statek przelatuje cel, mining skacze | `TIME_CLAMP = 0.1 s`; orbity są funkcją czasu, więc nie wymagają korekty; `progress` ograniczony do 1 |
| R8 | **Klik vs. drag kamery** | obrót kamery zaznacza / wydaje rozkazy | próg 5 px między `pointerdown` i `pointerup`; `contextmenu.preventDefault()` |
| R9 | **Wycieki geometrii/materiałów** przy HMR i nawigacji | rosnące `renderer.info.memory` | centralny `dispose()` + `AssetCache`; `AbortController` dla listenerów; manualna weryfikacja `renderer.info` |
| R10 | **Raycasting małych obiektów na dużym oddaleniu** | nie da się kliknąć statku | niewidoczny hit-proxy ×3 na statkach |
| R11 | **Dokowanie na Księżycu krążącym w lokalnym układzie** | błędna pozycja końcowa | `dockingPosition` liczony w świecie podczas lotu; po `attach` do `OrbitalUnitsGroup` celu pozycja ustawiona analitycznie na `(0, radius·1.25, 0)` |
| R12 | **Zoneless jako API eksperymentalne** | niestabilność w wybranej wersji Angulara | plan B: pozostawić Zone.js, pętla w `ngZone.runOutsideAngular`; Signals w szablonach `OnPush` oznaczają komponenty jako dirty bez `zone.run` (od v17), więc most pozostaje ten sam |
| R13 | **Kamera śledząca ruchomą planetę** | `OrbitControls.target` stały, planeta ucieka z kadru | per klatka: przesunięcie `camera.position` o deltę ruchu celu + `controls.target.copy(worldPos)` |

---

## 6. Kryteria Sukcesu (Definition of Done POC)

**Scena i wydajność**
- [ ] `ng serve` uruchamia aplikację bez błędów w konsoli; stabilne 60 FPS na laptopie z iGPU przy 4 ciałach i 1 statku.
- [ ] Brak Z-fightingu na krawędziach planet i statku w pełnym zakresie zoomu kamery.
- [ ] Zniszczenie komponentu canvasu zwalnia kontekst WebGL i zasoby (`renderer.info.memory.geometries === 0` po `dispose`).

**Ciała niebieskie**
- [ ] Planeta Matka i Asteroida krążą wokół Słońca ze stałą ω; Księżyc krąży wokół poruszającej się Planety.
- [ ] Linie orbit widoczne i zgodne z rzeczywistymi torami (również orbita Księżyca przesuwa się z planetą).
- [ ] Pauza (`timeScale = 0`) zatrzymuje ciała i tranzyty; przyspieszenie 10× nie łamie dokowania.

**Sterowanie**
- [ ] LPM na statku otwiera panel kontekstowy z `Paliwo 100/100`, `Ładunek 0/50`, `Status: DOCKED`.
- [ ] Obrót kamery (drag) nie zaznacza ani nie wydaje rozkazów.
- [ ] PPM na ciele przy zaznaczonym statku wydaje rozkaz; PPM bez zaznaczenia nic nie robi.

**Tranzyt**
- [ ] Rozkaz bez wystarczającego paliwa jest odrzucany z komunikatem w UI; stan statku nie zmienia się.
- [ ] Statek odrywa się bez skoku pozycji, leci po widocznym łuku z przerywaną linią trajektorii, nos zorientowany wzdłuż toru.
- [ ] Statek dociera **do ruchomego celu** (Księżyc, Asteroida), dokuje na wysokości `1.25·R` i porusza się dalej razem z ciałem.
- [ ] Paliwo pomniejszone o koszt w chwili startu (kalibracja ≈ 20 / 30 / 30 dla tras ze specyfikacji).

**Ekonomia**
- [ ] Po dotarciu na Asteroidę status zmienia się na `MINING`; ładownia rośnie o 10/s do 50; zasoby Asteroidy maleją.
- [ ] Po powrocie na Planetę Matkę: `GlobalMinerals += 50`, paliwo `100/100`, ładownia `0/50`, status `DOCKED`.
- [ ] Pełna pętla (Planeta → Księżyc → Asteroida → Planeta) wykonalna trzema kliknięciami PPM.

**Jakość**
- [ ] Testy jednostkowe `game/math/*` i `game/systems/*` zielone (`OrbitSolver`, `solveLeadIntercept`, `BezierPath`, `TransferSystem.fuelCost`, `MiningSystem`).
- [ ] Test integracyjny pełnej pętli w `game/` bez Angulara i Three.js.
- [ ] `game/` nie importuje nic z `@angular/*` ani `three`; `ui/` nie importuje nic z `three`.

---

## 7. Poza zakresem POC (do rozważenia później)

- Kamera „Infinite Zoom” (planetocentryczna ⇄ heliocentryczna) z `planetary.md.txt` — POC używa `OrbitControls` z celem na aktywnym ciele.
- Wiele statków, kolejkowanie rozkazów, budowa struktur na powierzchni.
- Orbity eliptyczne (`a ≠ b`) — model `OrbitSolver` to przewiduje, konfiguracja POC używa kołowych.
- Zapis/odczyt stanu — trywialny, bo stan to serializowalne Signals + `gameTime`.

---

## 8. Status realizacji (2026-11-01)

Wszystkie fazy 0–6 zaimplementowane. 35 testów jednostkowych zielonych (`npx ng test --watch=false`), build produkcyjny przechodzi, pełna pętla Planeta → Księżyc → Asteroida → Planeta zweryfikowana w przeglądarce (60 FPS, brak błędów w konsoli).

Odstępstwa od planu, które obowiązują w kodzie:

| Obszar | Plan | Kod |
|---|---|---|
| Angular | v18, `provideExperimentalZonelessChangeDetection` | v22 — zoneless jest domyślne, bez jawnego providera |
| Test runner | Karma/Jest | vitest + jsdom (domyślny w Angular 22) |
| Koszt paliwa | kalibracja ≈ 20 / 30 / 30 | `distance × 0.02` (Planeta→Księżyc ≈ 3, do Asteroidy 12–48) plus **rezerwa na powrót**: lot do ciała innego niż baza jest odrzucany, jeśli po nim nie zostanie paliwa na najgorszy przypadek powrotu (`TransferSystem.returnReserve`). Dzięki temu statek nigdy nie utknie; `transfer-system.spec.ts` dowodzi, że pełny bak zawsze wystarcza na Planeta → Asteroida → Planeta |
| Orbita Asteroidy | 1800 | 1500 — żeby powyższy warunek dało się spełnić przy `maxFuel = 100` |
| Zdarzenia | `TRANSFER_STARTED` z `fuelCost`, `etaSec` | niesie cały `TransferPlan`; `CARGO_FULL` → `MINING_STOPPED { reason }` |
| Etykiety ciał | — | `BodyLabels` nad canvasem, pozycje z `GameLoopService.labels` (10 Hz) |
| Pliki komponentów | `*.component.ts` | styl Angular 20+ bez sufiksów (`hud.ts`, klasa `Hud`) |
| Port dev-servera | 4200 | 4200 bywa zajęty na tej maszynie — `npx ng serve --port 4321` |

Poza zakresem (sekcja 7) bez zmian.

## 9. Siatka Goldberga, budowa na kafelkach, asteroida (2026-11-01)

Zakres i plan testów: dokument „Siatka Goldberga na planecie — zakres prac” (Claude Docs). Zrealizowano WP1–WP9; opcjonalny krater (WP8b) pominięty. Odstępstwa od tego dokumentu:

| Temat | W dokumencie | W kodzie | Dlaczego |
|---|---|---|---|
| Pole pięciokąta | „do ok. 30% mniejsze” | ok. 43% pola największego sześciokąta, sześciokąty ≥ 60% | Tak wychodzi geometria dualna z centroidami; test `goldberg-grid.spec.ts` pilnuje progów 0,4 / 0,6 |
| Wysokość dokowania przy asteroidzie | decyzja otwarta | stała (promień logiczny z konfiguracji) | Prostszy wariant; statek odsuwa się od bryły o maks. 7 j przy pełnym wyczerpaniu |
| Krater w miejscu wydobycia (WP8b) | opcja | nie zrealizowano | Czeka na decyzję |
| Kolor kafelków | jednolity kolor ciała | pięciokąty ciemniejsze (×0,78), sześciokąty w 7 odcieniach (×0,90–1,08), krawędzie jako `LineSegments` | Bez tego kafelki zlewają się w kulę |
| Hover | throttle ~30 Hz | 33 ms między raycastami, brak raycastu w trakcie przeciągania | j.w. |
| Zdarzenia dla silnika | `STRUCTURE_BUILT` przez pętlę | `CommandService` kolejkuje `STRUCTURE_BUILT` tak jak `TRANSFER_STARTED` (`drainStarted`) | Budowa dzieje się poza klatką |
| `COMMAND_REJECTED.shipId` | wymagane | opcjonalne | Odrzucenie budowy nie dotyczy statku |

Weryfikacja w przeglądarce (Chrome, localhost:4321): planeta i Księżyc jako wielościany z widocznymi pięciokątami, hover i zaznaczenie kafelka, dwie kopalnie na planecie i jedna na Księżycu (po jednym `InstancedMesh` na ciało, 12 draw calls łącznie), odrzucenia „Pole jest już zajęte” i „Za mało minerałów”, asteroida jako kanciasta bryła skurczona do 0,9655 po wydobyciu 50 minerałów, 0,4 przy zerze, Escape czyści oba zaznaczenia, zero błędów w konsoli. Uwaga: okno automatyzacji Chrome było dławione do ~2 klatek/s przez przeglądarkę (render 0,4 ms, GPU RTX 4060 Ti), więc licznik fps na HUD pokazywał 1; w zwykłym oknie wcześniej 60 fps.

## 10. Modele KayKit Space Base Bits (2026-11-01)

Analiza i plan: dokument „KayKit Space Base Bits w PoC — analiza i plan” (Claude Docs). Zrealizowano WP1–WP2 (pipeline + statek i kopalnia); WP3–WP7 czekają na akceptację.

- `public/assets/kaykit/`: 8 modeli glTF + atlas + `LICENSE-KayKit.txt` (296 KB). Źródło: `assets/KayKit_Space_Base_Bits_1.0_EXTRA` (CC0, Kay Lousberg).
- `engine/model-registry.ts` (dane + `fitScale`/`baseLift`, bez Three.js), `engine/model-library.ts` (`GLTFLoader`, spłaszczanie, cache, `parse` do testów), `StructureView.useModel`, `SceneManager.loadModels`.
- Wymiary w rejestrze to wymiary sceny po nałożeniu transformacji węzłów: dropship 3,0 × 1,3 × 2,3 (pivot u podstawy), drill 1,75 × 2,0. Surowe min/max akcesorów są inne i mylą.
- `@types/node` w `tsconfig.spec.json`, bo `model-library.spec.ts` czyta pliki z dysku i podaje je do `GLTFLoader.parse` jako data URI.

## 11. Space-RTS: surowce, złoża, moc, interfejs, lądowisko, łazik (2026-11-01)

Zrealizowano WP8–WP14 z dokumentu „KayKit Space Base Bits w PoC — analiza i plan”. Odstępstwa i decyzje wykonawcze:

| Temat | W dokumencie | W kodzie | Dlaczego |
|---|---|---|---|
| Nazwy typów budowli | ekstraktory ×3, habitat, panel, magazyn, lądowisko | `MINE`, `ICE_EXTRACTOR`, `SILICITE_EXTRACTOR`, `SOLAR`, `WIND`, `HABITAT`, `DEPOT`, `LANDING_PAD` | Turbina wiatrowa dodana, żeby dało się odblokować drugi ekstraktor bez Silicytu |
| Zaznaczenie | jeden `SelectionService` | trzy sygnały (`selectedShipId`, `selectedRoverId`, `selectedTile`) + `clearSelection()` | Mniejsza zmiana w istniejącym kodzie; wzajemne wykluczanie statek/łazik w `CommandService` |
| Duch budowli | aktualizacja z hover | `GameLoopService.refreshGhost()` z hovera, zmiany trybu i zmian stanu (effect w `GameCanvas`) | Kolor ducha musi reagować na zmianę surowców/mocy bez ruchu myszy |
| Podejście do lądowania | ostatnie 15% lotu wzdłuż normalnej | zwykła krzywa Béziera do punktu dokowania na kafelku; `captureRadiusFactor` 1,5 → 1,1 | Przy 1,5 statek „teleportował się” z 25 j nad płytą; przy 1,1 dolatuje do płyty |
| Łazik: wysokość i orientacja | — | pivot 0,5% R nad powierzchnią, orientacja `lookAt` po stycznej z „górą” po normalnej | Model `spacetruck` ma koła przy podstawie |
| Złoża | `rock_A/B` | jeden `InstancedMesh` `rocks_A` na ciało (`BodyView.decor`), znika po budowie; kafelek z tintem koloru surowca (45%) | Jeden model wystarcza |
| Asteroida | Ferryt | `resources: { FERRITE: 500 }`; `MiningSystem` wydobywa pierwszy niezerowy surowiec ciała | Gotowe na asteroidę kriolową |

Weryfikacja w przeglądarce: HUD z trzema surowcami i paskiem mocy 2/5 na starcie, lądowisko i panel na szczycie planety, 90 złóż na planecie z tintem i skałami, pasek budowy z 8 kartami (niedostępne szare z powodem), duch zielony/czerwony, budowa habitatu kliknięciem, odmowa `NO_POWER` (brakuje 3 mocy) i `NO_DEPOSIT`, turbina odblokowuje drugą kopalnię, kopalnia wydobywa 2 Ferrytu/s, łazik dojeżdża na sąsiedni kafelek, statek po pełnej pętli ląduje na płycie (pozycja = offset dokowania (0, 54, 0) w `OrbitalUnitsGroup`), 60 fps, 19 draw calli, zero błędów. 81 testów zielonych.

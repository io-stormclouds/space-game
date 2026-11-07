import { useEffect, useState } from 'react';
import { CommandCard, type CommandSlot } from '../components/CommandCard/CommandCard';
import { HudFrame } from '../components/HudFrame/HudFrame';
import { RTSButton } from '../components/RTSButton/RTSButton';
import { ResourcePanel, type ResourceReadout } from '../components/ResourcePanel/ResourcePanel';
import {
  IconBuild,
  IconCancel,
  IconHarvest,
  IconMove,
  IconProduce,
  IconRally,
  IconResearch,
  IconStop,
  IconUpgrade,
} from '../icons/Icons';
import { color, fontSize } from '../tokens/design-tokens';
import './Preview.css';

// Playground with mock state: producing a unit and researching spend resources and take time,
// so every button state (available, blocked by cost, running, toggled) appears naturally.

const UNIT = { metal: 150, crystal: 50, secs: 6 };
const TECH = { metal: 200, crystal: 150, secs: 8 };
const UPGRADE = { metal: 400, crystal: 300 };

type Job = { kind: 'unit' | 'tech'; left: number; total: number } | null;

export function Preview() {
  const [metal, setMetal] = useState(1240);
  const [crystal, setCrystal] = useState(380);
  const [pop, setPop] = useState(38);
  const [job, setJob] = useState<Job>(null);
  const [researched, setResearched] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [signal, setSignal] = useState<'amber' | 'cyan'>('amber');
  const [log, setLog] = useState<string[]>(['T+19:40 · SYSTEM GOTOWY']);
  const popCap = 45;
  const energy = { used: 21.5, max: 28 };

  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 5));

  // One tick per 100 ms; completion is handled here, outside the state updater (StrictMode-safe).
  useEffect(() => {
    if (!job) return;
    if (job.left <= 0) {
      if (job.kind === 'unit') {
        setPop((p) => p + 1);
        note('JEDNOSTKA GOTOWA · KOSZARY-02');
      } else {
        setResearched(true);
        note('TECHNOLOGIA ZBADANA · PANCERZ KOMPOZYTOWY');
      }
      setJob(null);
      return;
    }
    const id = window.setTimeout(() => setJob((j) => j && { ...j, left: Math.max(0, +(j.left - 0.1).toFixed(1)) }), 100);
    return () => window.clearTimeout(id);
  }, [job]);

  const lacks = (m: number, c: number) => {
    const parts: string[] = [];
    if (metal < m) parts.push(`METAL −${m - metal}`);
    if (crystal < c) parts.push(`KRYSZTAŁ −${c - crystal}`);
    return parts.length ? `BRAK: ${parts.join(' · ')}` : undefined;
  };

  const unitReason = job ? 'LINIA PRODUKCYJNA ZAJĘTA' : pop >= popCap ? 'LIMIT POPULACJI OSIĄGNIĘTY' : lacks(UNIT.metal, UNIT.crystal);
  const techReason = researched ? 'TECHNOLOGIA ZBADANA' : job ? 'LINIA PRODUKCYJNA ZAJĘTA' : lacks(TECH.metal, TECH.crystal);
  const upgradeReason = lacks(UPGRADE.metal, UPGRADE.crystal);

  const produce = () => {
    setMetal((m) => m - UNIT.metal);
    setCrystal((c) => c - UNIT.crystal);
    setJob({ kind: 'unit', left: UNIT.secs, total: UNIT.secs });
    note('ROZKAZ · WYTWÓRZ JEDNOSTKĘ');
  };
  const research = () => {
    setMetal((m) => m - TECH.metal);
    setCrystal((c) => c - TECH.crystal);
    setJob({ kind: 'tech', left: TECH.secs, total: TECH.secs });
    note('ROZKAZ · BADAJ TECHNOLOGIĘ');
  };
  const progressOf = (kind: 'unit' | 'tech') => (job?.kind === kind ? 1 - job.left / job.total : undefined);

  const readouts: ResourceReadout[] = [
    { id: 'metal', code: 'MET', label: 'Metal', value: metal, rate: 6.4, lowBelow: 300, criticalBelow: 100 },
    { id: 'crystal', code: 'KRY', label: 'Kryształ', value: crystal, rate: -0.5, lowBelow: 200, criticalBelow: 60 },
    { id: 'energy', code: 'ENE', label: 'Energia', kind: 'load', value: energy.used, max: energy.max, unit: 'MW' },
    { id: 'pop', code: 'POP', label: 'Populacja', kind: 'load', value: pop, max: popCap },
  ];

  const slots: Array<CommandSlot | null> = [
    {
      id: 'unit', label: 'Wytwórz jednostkę', hotkey: 'Q', icon: <IconProduce />, variant: 'primary',
      cost: [{ code: 'MET', amount: UNIT.metal, missing: metal < UNIT.metal }, { code: 'KRY', amount: UNIT.crystal, missing: crystal < UNIT.crystal }, { code: 'POP', amount: 1 }],
      description: `Szkoli jednostkę piechoty. ${UNIT.secs} s.`, disabledReason: unitReason, progress: progressOf('unit'), onActivate: produce,
    },
    {
      id: 'tech', label: 'Badaj technologię', hotkey: 'W', icon: <IconResearch />,
      cost: [{ code: 'MET', amount: TECH.metal, missing: metal < TECH.metal }, { code: 'KRY', amount: TECH.crystal, missing: crystal < TECH.crystal }],
      description: `Pancerz kompozytowy: +1 pancerza. ${TECH.secs} s.`, disabledReason: techReason, progress: progressOf('tech'), onActivate: research,
    },
    {
      id: 'build', label: 'Buduj', hotkey: 'B', icon: <IconBuild />, selected: placing,
      description: placing ? 'Tryb stawiania aktywny. Wskaż pole w widoku.' : 'Otwiera tryb stawiania budowli.',
      onActivate: () => { setPlacing((p) => !p); note(placing ? 'TRYB STAWIANIA · WYŁ.' : 'TRYB STAWIANIA · WŁ.'); },
    },
    {
      id: 'upgrade', label: 'Rozbuduj', hotkey: 'U', icon: <IconUpgrade />,
      cost: [{ code: 'MET', amount: UPGRADE.metal, missing: metal < UPGRADE.metal }, { code: 'KRY', amount: UPGRADE.crystal, missing: crystal < UPGRADE.crystal }],
      description: 'Koszary poz. 3: szybsze szkolenie.', disabledReason: upgradeReason,
      onActivate: () => { setMetal((m) => m - UPGRADE.metal); setCrystal((c) => c - UPGRADE.crystal); note('ROZBUDOWA · KOSZARY-02 → POZ. 3'); },
    },
    { id: 'move', label: 'Ruch', hotkey: 'M', icon: <IconMove />, description: 'Wskaż cel prawym przyciskiem.', onActivate: () => note('ROZKAZ · RUCH') },
    { id: 'stop', label: 'Stop', hotkey: 'S', icon: <IconStop />, description: 'Przerywa bieżący rozkaz.', onActivate: () => note('ROZKAZ · STOP') },
    { id: 'harvest', label: 'Wydobywaj', hotkey: 'H', icon: <IconHarvest />, description: 'Kieruje robotników do najbliższego złoża.', onActivate: () => note('ROZKAZ · WYDOBYCIE') },
    { id: 'rally', label: 'Punkt zbiórki', hotkey: 'Y', icon: <IconRally />, description: 'Nowe jednostki zbiorą się we wskazanym punkcie.', onActivate: () => note('PUNKT ZBIÓRKI · USTAWIONY') },
    null,
    null,
    null,
    {
      id: 'cancel', label: 'Anuluj', hotkey: 'X', icon: <IconCancel />, variant: 'danger',
      description: job ? 'Przerywa produkcję. Zwrot 75% kosztu.' : 'Brak zadania do przerwania.',
      disabledReason: job ? undefined : 'BRAK AKTYWNEGO ZADANIA',
      onActivate: () => {
        if (!job) return;
        const spec = job.kind === 'unit' ? UNIT : TECH;
        setMetal((m) => m + Math.floor(spec.metal * 0.75));
        setCrystal((c) => c + Math.floor(spec.crystal * 0.75));
        setJob(null);
        note('ZADANIE PRZERWANE · ZWROT 75%');
      },
    },
  ];

  const swatches = Object.entries(color).filter(([, v]) => v.startsWith('#'));

  return (
    <div className="hud-root pv" data-hud-signal={signal}>
      <ResourcePanel
        designation="KOL · TAU-CETI/E"
        subline="T+01:19:40 · SEKTOR 04"
        serial="RB-01 · FW 0.3.1"
        readouts={readouts}
        trailing={
          <>
            <RTSButton label="Sygnał amber" selected={signal === 'amber'} onActivate={() => setSignal('amber')} />
            <RTSButton label="Sygnał cyan" selected={signal === 'cyan'} onActivate={() => setSignal('cyan')} />
          </>
        }
      />

      <main className="pv__field hud-gridfield">
        <div className="pv__crosshair" aria-hidden="true">
          <span className="pv__cross-h" />
          <span className="pv__cross-v" />
          <span className="pv__coords hud-micro">X 0412 · Y 0187 · Z 0000</span>
        </div>

        <div className="pv__left">
          <HudFrame label="RTSButton" serial="BTN · 6 STANÓW" className="pv__panel">
            <div className="pv__states">
              <RTSButton label="Wytwórz jednostkę" hotkey="Q" icon={<IconProduce />} cost={[{ code: 'MET', amount: 150 }, { code: 'KRY', amount: 50 }]} />
              <RTSButton label="Badaj technologię" hotkey="W" icon={<IconResearch />} variant="primary" cost={[{ code: 'MET', amount: 200 }, { code: 'KRY', amount: 150 }]} />
              <RTSButton label="Tryb stawiania" hotkey="B" icon={<IconBuild />} selected />
              <RTSButton
                label="Rozbuduj koszary"
                hotkey="U"
                icon={<IconUpgrade />}
                cost={[{ code: 'MET', amount: 400 }, { code: 'KRY', amount: 300, missing: true }]}
                disabledReason="BRAK: KRYSZTAŁ −120"
              />
              <RTSButton label="Szkolenie w toku" hotkey="Q" icon={<IconProduce />} progress={0.42} />
              <RTSButton label="Rozbierz budowlę" hotkey="X" icon={<IconCancel />} variant="danger" />
            </div>
            <p className="pv__hint hud-micro">Najedź: ramka sygnałowa · wciśnij: odwrócenie kontrastu · zablokowany: kreskowanie i powód</p>
          </HudFrame>

          <HudFrame label="Tokeny" serial="TKN · v1" className="pv__panel">
            <dl className="pv__swatches">
              {swatches.map(([name, value]) => (
                <div key={name} className="pv__swatch">
                  <dt>
                    <span className="pv__chip" style={{ background: value }} aria-hidden="true" />
                    {name}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="pv__scale">
              {Object.entries(fontSize).map(([name, value]) => (
                <div key={name} className="pv__scale-row">
                  <span className="hud-micro">{name} · {value}</span>
                  <span style={{ fontSize: value }}>MET 1240 · ENERGIA</span>
                </div>
              ))}
            </div>
          </HudFrame>
        </div>

        <div className="pv__bottom">
          <HudFrame label="Dziennik" serial="LOG" className="pv__log">
            <ol>
              {log.map((l, i) => (
                <li key={`${l}-${i}`} className={i === 0 ? 'hud-signal' : undefined}>{l}</li>
              ))}
            </ol>
          </HudFrame>
          <CommandCard
            title="CMD"
            context="Koszary-02 · poz. 2"
            status={job ? `ZADANIE · ${job.left.toFixed(1)} S` : 'BEZCZYNNE'}
            serial="CC-04 · R2"
            slots={slots}
          />
        </div>
      </main>
    </div>
  );
}

import type { BodyId, GameSnapshot, ScenarioId } from '@space-game/api';
import type { CommandsService } from './commands';
import type { GameService } from './game.service';

/**
 * Entry points by address (W15 C): `#/scenariusz-<id>`. Each preset plays the canvas flow through
 * GameApi with the same commands a player would give, fast-forwarded while paused, so the game
 * state is genuine.
 */
export const PRESETS = ['przybycie', 'skan', 'port', 'kolonia', 'planeta-matka', 'obciazenie-s', 'obciazenie-m', 'obciazenie-l'] as const;

/** F5 load levels by address: #/scenariusz-obciazenie-m. */
const LOAD: Partial<Record<string, ScenarioId>> = { 'obciazenie-s': 'load-s', 'obciazenie-m': 'load-m', 'obciazenie-l': 'load-l' };
export type PresetId = (typeof PRESETS)[number];

export function isPreset(id: string): id is PresetId {
  return (PRESETS as readonly string[]).includes(id);
}

const STEPS = 60;
const MAX_ROUNDS = 400;

export async function runPreset(game: GameService, commands: CommandsService, id: PresetId): Promise<GameSnapshot> {
  const load = LOAD[id];
  if (load) return game.start(load);
  const scenario: ScenarioId = id === 'planeta-matka' ? 'planeta-matka' : 'tau-ceti';
  let snap = await game.start(scenario);
  if (id === 'przybycie' || id === 'planeta-matka') return snap;

  game.setTempo(600);
  game.togglePause(); // paused: the preset steps exactly
  const until = async (done: (s: GameSnapshot) => boolean) => {
    snap = game.snapshot() ?? snap; // commands push a fresh snapshot
    for (let i = 0; i < MAX_ROUNDS && !done(snap); i++) {
      await game.stepOnce(STEPS);
      snap = game.snapshot()!;
    }
    if (!done(snap)) throw new Error(`preset ${id}: condition not reached`);
  };
  const ark = () => snap.world.ships.find((s) => s.role === 'MOTHERSHIP')!;
  const site = 'tc-e' as BodyId;

  await game.command({ type: 'SCAN_SYSTEM', shipId: ark().id });
  await until((s) => s.world.scan.state === 'DONE');
  if (id === 'skan') return finish(game);

  await commands.chooseSite(site);
  await until(() => ark().state === 'DOCKED' && ark().currentBodyId === site);
  if (id === 'port') return finish(game);

  const port = await game.suggestTile(site, 'PORT');
  if (!port) throw new Error('no place for the port');
  await commands.place(site, 'PORT', port.tileIndex, port.rotation);
  await until((s) => s.world.colony.foundedAt !== null);
  await commands.callShuttle(snap.world);
  await until((s) => (s.colonies[site]?.storage['FER'] ?? 0) >= 80);
  const orders: Array<[string, string | undefined]> = [['WND', undefined], ['HAB', undefined], ['MIN', 'FER'], ['ICE', 'KRI'], ['SIT', 'SIL']];
  for (const [kind, material] of orders) {
    const tile = await game.suggestTile(site, kind, material);
    if (tile) await commands.place(site, kind, tile.tileIndex, tile.rotation);
  }
  await until((s) => s.world.structures.every((x) => x.state === 'ACTIVE'));
  return finish(game);
}

async function finish(game: GameService): Promise<GameSnapshot> {
  game.setTempo(60); // also resumes
  return (await game.snapshot()) ?? (game.snapshot() as unknown as GameSnapshot);
}

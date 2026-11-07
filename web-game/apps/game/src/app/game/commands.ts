import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Availability, BodyId, CatalogView, Structure, TileInfo, WorldState } from '@space-game/api';
import type { AtanorTool } from '@space-game/render';
import type { CommandSlot, IconName } from '@space-game/ui';
import { TEXT } from '../i18n/pl';
import { AtanorSession } from './atanor-session';
import { buildingName, costText, reasonText, tileIndexFromId } from './format';
import { GameService } from './game.service';
import { UiState } from './ui-state';

export interface CardModel {
  title: string;
  context: string;
  status: string;
  slots: Array<CommandSlot | null>;
}

/** Letters for the build catalog, in order (view keys 1–4 stay free). */
export const BUILD_KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V', 'T', 'Y', 'U', 'I', 'O', 'P', 'G', 'H', 'J', 'K', 'L', 'B', 'N', 'M'];

/** Order in which the shuttle loads the hold (proposal D3: 250 j. per trip). */
const SHUTTLE_ORDER: Array<[string, number]> = [
  ['FER', 100],
  ['SIL', 70],
  ['KRI', 40],
  ['STA', 30],
  ['BET', 10],
];

/**
 * The command card for the current context (canvas boards: Arka-1 CC-01, Skaner CC-02, port,
 * buildings, rovers, placement). Every command has a hotkey; a blocked one says why.
 */
@Injectable({ providedIn: 'root' })
export class CommandsService {
  private readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  private readonly ui = inject(UiState);
  private readonly atanorSession = inject(AtanorSession);
  /** Availability answers from the server, by kind (and "KIND@L" for upgrades). */
  readonly availability = signal<Record<string, Availability>>({});
  /** The selected surface tile as the server sees it (tile panel and card), refreshed with the snapshots. */
  readonly tile = signal<TileInfo | null>(null);

  constructor() {
    effect(() => {
      const snap = this.game.snapshot();
      const sel = this.ui.selection();
      if (!snap || sel.kind !== 'TILE') {
        untracked(() => this.tile.set(null));
        return;
      }
      untracked(() =>
        void this.game.tileInfo(sel.bodyId, sel.tileIndex).then((info) => {
          const cur = this.ui.selection();
          if (cur.kind === 'TILE' && cur.bodyId === sel.bodyId && cur.tileIndex === sel.tileIndex) this.tile.set(info);
        }),
      );
    });
    // Refresh availability when the world or the context changes (throttled by the snapshot rate).
    effect(() => {
      const snap = this.game.snapshot();
      const body = this.ui.focusBodyId();
      const sel = this.ui.selection();
      const catalog = this.game.catalog();
      if (!snap || !body || !catalog) return;
      const kinds = catalog.buildings.filter((b) => b.buildable).map((b) => b.id);
      if (sel.kind === 'STRUCTURE') {
        const s = snap.world.structures.find((x) => x.id === sel.structureId);
        if (s) kinds.push(`${s.kind}@${s.level + 1}`);
      }
      untracked(() => void this.game.availability(body, kinds).then((a) => this.availability.set(a)));
    });
  }

  readonly card = computed<CardModel>(() => {
    const t = this.t;
    const snap = this.game.snapshot();
    const world = snap?.world ?? null;
    const catalog = this.game.catalog();
    const sel = this.ui.selection();
    const placement = this.ui.placement();
    if (!world || !catalog) return { title: t.cmd.title, context: '—', status: '', slots: [] };

    if (this.ui.view() === 'atanor') return this.atanorCard();
    if (placement) return this.placementCard(placement.kind, world, catalog);
    if (this.ui.buildMenu()) return this.buildCard(world, catalog);
    if (sel.kind === 'STRUCTURE') {
      const s = world.structures.find((x) => x.id === sel.structureId);
      if (s) return s.kind === 'HQ' ? this.portCard(s, world, catalog) : this.structureCard(s, world, catalog);
    }
    if (sel.kind === 'ROVER') return this.roverCard(sel.roverId, world);
    if (sel.kind === 'SHIP') {
      const ship = world.ships.find((s) => s.id === sel.shipId);
      if (ship && ship.role !== 'MOTHERSHIP') return this.shipCard(ship, world);
    }
    if (sel.kind === 'TILE') {
      const body = world.bodies.find((b) => b.id === sel.bodyId);
      // after the scan stage (a site chosen, or a world that starts with a port like the PoC one)
      const settled = world.colony.siteBodyId !== null || world.structures.some((s) => s.kind === 'HQ');
      if (body?.surfaceGrid && body.revealed !== false && settled) return this.tileCard(sel.bodyId, sel.tileIndex, world, catalog);
    }
    if (sel.kind === 'BODY' || sel.kind === 'TILE') {
      const body = world.bodies.find((b) => b.id === sel.bodyId);
      if (body && body.kind !== 'STAR' && world.scan.state === 'DONE') return this.scannerCard(sel.bodyId, world);
    }
    return this.mothershipCard(world, catalog);
  });

  /** How many of the card's commands are blocked (inspector hint). */
  readonly blocked = computed(() => this.card().slots.filter((s) => s?.disabledReason).length);

  private slot(id: string, label: string, hotkey: string, icon: IconName | undefined, opts: Partial<CommandSlot> & { run?: () => void }): CommandSlot {
    const { run, ...rest } = opts;
    return { id, label, hotkey, ...(icon ? { icon } : {}), ...rest, ...(run ? { onActivate: run } : {}) };
  }

  private locked(id: string, label: string, hotkey: string, reason: string, icon?: IconName): CommandSlot {
    return this.slot(id, label, hotkey, icon, { disabledReason: reason });
  }

  /**
   * Atanor view (W08 A, AT1, AT2). Design: tools of the building level (§8.1), trial, back.
   * Trial: run, step, reset, tempo (PoC 0.5–4×), end of the trial. The machine of a building
   * follows the building's recipe; only the sandbox (designer F2) switches levels.
   */
  private atanorCard(): CardModel {
    const t = this.t;
    const c = t.commands;
    const ta = t.atanor;
    const a = this.ui.atanor();
    const r = this.ui.atanorReadout();
    const ed = this.atanorSession.state();
    const trial = this.atanorSession.trial();
    const site = this.ui.atanorBuilding();
    const world = this.game.world();
    const where = this.ui.planetAvailable() ? t.hud.views.planet : t.hud.views.system;
    // Esc drops the tool first, then ends the trial, then leaves the view
    const back = this.slot('back', c.atanorBack.label, 'Esc', 'cancel', { description: c.atanorBack.note(where), run: () => this.atanorSession.escape() });
    const place = site && world ? ta.site(this.bodyLabelOf(world, site.bodyId), Math.max(1, site.level)) : `${ta.sandbox}${r ? ' · ' + r.levelName : ''}`;
    const context = `${place} · ${trial ? ta.mode.trial : ta.mode.design}`;
    if (!a || !ed) return { title: t.cmd.title, context, status: '', slots: [back] };

    const levelSlot = (): CommandSlot | null => {
      if (site) return null;
      const levels = a.levels();
      const i = Math.max(0, levels.findIndex((l) => l.id === r?.levelId));
      const next = levels[(i + 1) % levels.length]!;
      return this.slot('level', c.atanorLevel.label, 'L', 'research', {
        description: c.atanorLevel.note(r?.levelName ?? '—'),
        run: () => {
          this.atanorSession.stopTrial();
          this.ui.atanorLevel.set(next.recipeId ?? next.id);
        },
      });
    };

    if (trial) {
      const speeds = [0.5, 1, 2, 4];
      const base = 1000 / 600; // PoC 1× = 600 ms per tick
      const speed = speeds.reduce((best, s) => (Math.abs(s * base - (r?.ticksPerSecond ?? base)) < Math.abs(best * base - (r?.ticksPerSecond ?? base)) ? s : best), 1);
      const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length]!;
      const slots: Array<CommandSlot | null> = [
        r?.playing
          ? this.slot('pause', c.atanorPause.label, 'P', 'stop', { description: c.atanorPause.note, selected: true, run: () => a.pause() })
          : this.slot('play', c.atanorPlay.label, 'P', 'produce', { variant: 'primary', description: c.atanorPlay.note, run: () => a.play() }),
        this.slot('step', c.atanorStep.label, 'K', 'move', { description: c.atanorStep.note, run: () => a.step() }),
        this.slot('reset', c.atanorReset.label, 'R', 'repeat', { description: c.atanorReset.note, run: () => a.reset() }),
        this.slot('speed', `${ta.speed.label} ×${speed}`, 'F', 'upgrade', { description: ta.speed.note(next), run: () => a.setTicksPerSecond(next * base) }),
        this.slot('endTrial', ta.endTrial.label, 'T', 'cancel', { selected: true, description: ta.endTrial.note, run: () => this.atanorSession.stopTrial() }),
        null,
        levelSlot(),
        back,
      ];
      return { title: t.cmd.title, context, status: 'ATN', slots };
    }

    const tool = (id: AtanorTool, key: string, icon: IconName, label: string, note: string): CommandSlot => {
      const lock = ed.locks[id];
      if (lock) return this.locked(id, label, key, 'level' in lock ? ta.lockLevel(lock.level) : ta.lockRecipe, icon);
      return this.slot(id, label, key, icon, { selected: ed.tool === id, description: note, run: () => this.atanorSession.setTool(id) });
    };
    const bond = ed.tool === 'UNBONDER' ? 'UNBONDER' : 'BONDER';
    const transmute = this.transmutation(r);
    const slots: Array<CommandSlot | null> = [
      tool('ARM', 'A', 'build', ed.tool === 'ARM' ? `${ta.tools['ARM']} L${ed.armLength}` : ta.tools['ARM']!, ta.toolNote.ARM(ed.armLength, ed.maxArmLength)),
      tool('PISTON', 'S', 'upgrade', ta.tools['PISTON']!, ta.toolNote.PISTON),
      tool(bond, 'D', 'rally', ta.tools[bond]!, bond === 'BONDER' ? ta.toolNote.BONDER : ta.toolNote.UNBONDER),
      tool('TRANSMUTE', 'G', 'research', ta.tools['TRANSMUTE']!, ta.toolNote.TRANSMUTE(transmute.from, transmute.to)),
      tool('TRACK', 'H', 'move', ta.tools['TRACK']!, ta.toolNote.TRACK),
      this.slot('DELETE', ta.tools['DELETE']!, 'X', 'cancel', { variant: 'danger', selected: ed.tool === 'DELETE', description: ta.toolNote.DELETE, run: () => this.atanorSession.setTool('DELETE') }),
      this.slot('trial', ta.trial.label, 'T', 'produce', { variant: 'primary', description: ta.trial.note, run: () => this.atanorSession.startTrial() }),
      levelSlot() ?? back,
    ];
    return { title: t.cmd.title, context, status: ed.issue ? ta.issues[ed.issue] ?? ed.issue : 'ATN', slots };
  }

  /** The recipe's transmutation for the tool note (e.g. PLA → PLA*). */
  private transmutation(r: { recipeId: string | null } | null): { from: string; to: string } {
    return r?.recipeId === 'A_KAT' ? { from: 'PLA', to: 'PLA*' } : r?.recipeId === 'A_PRO' ? { from: 'KWA', to: 'KWA*' } : { from: '—', to: '—' };
  }

  private bodyLabelOf(world: WorldState, bodyId: BodyId): string {
    return world.bodies.find((b) => b.id === bodyId)?.name ?? bodyId;
  }

  private mothershipCard(world: WorldState, catalog: CatalogView): CardModel {
    const t = this.t;
    const c = t.commands;
    const ark = world.ships.find((s) => s.role === 'MOTHERSHIP');
    if (!ark) return { title: t.cmd.title, context: t.selection.none, status: '', slots: [] };
    const scan = world.scan.state;
    const site = world.colony.siteBodyId;
    const founded = world.colony.foundedAt !== null;
    const atSite = ark.state === 'DOCKED' && ark.currentBodyId === site && site !== null;
    const portPlaced = world.structures.some((s) => s.kind === 'HQ');
    const used = Object.values(ark.cargo).reduce((s, q) => s + q, 0);
    const load = this.shuttleLoad(world);
    const slots: Array<CommandSlot | null> = [
      scan === 'NONE'
        ? this.slot('scan', c.scan.label, 'Q', 'research', { variant: 'primary', description: c.scan.note(catalog.colonization.scanMinutes), run: () => void this.game.command({ type: 'SCAN_SYSTEM', shipId: ark.id }) })
        : this.locked('scan', c.scan.label, 'Q', scan === 'RUNNING' ? t.reject.SCAN_RUNNING : t.status.choose.title, 'research'),
      this.locked('probe', c.probe.label, 'W', t.cmd.notYet),
      ark.state === 'DOCKED' && scan !== 'RUNNING'
        ? this.slot('fly', c.flyTo.label, 'E', 'move', { description: c.flyTo.note, selected: this.ui.targeting(), run: () => this.ui.targeting.set(!this.ui.targeting()) })
        : this.locked('fly', c.flyTo.label, 'E', scan === 'RUNNING' ? t.reject.SCAN_RUNNING : t.reject.IN_TRANSIT, 'move'),
      this.locked('stop', c.stop.label, 'S', t.cmd.notYet, 'stop'),
      this.slot('hold', c.hold.label, 'L', undefined, { description: c.hold.note(used, ark.maxCargo, Object.keys(ark.cargo).length), run: () => this.ui.select({ kind: 'SHIP', shipId: ark.id }) }),
      founded
        ? this.slot('shuttle', c.shuttle.label, 'T', undefined, { description: c.shuttle.note(costText(load)), run: () => void this.callShuttle(world) })
        : this.locked('shuttle', c.shuttle.label, 'T', site ? t.reject.NO_COLONY : t.reject.NO_COLONY_SITE),
      scan !== 'DONE'
        ? this.locked('colony', c.foundColony.label, 'C', t.reject.NOT_SCANNED, 'rally')
        : !site
          ? this.locked('colony', c.foundColony.label, 'C', t.reject.NO_COLONY_SITE, 'rally')
          : portPlaced
            ? this.locked('colony', c.foundColony.label, 'C', t.status.building.title, 'rally')
            : !atSite
              ? this.locked('colony', c.foundColony.label, 'C', `${t.reject.NO_SHIP}: ${ark.name} musi być na orbicie`, 'rally')
              : this.slot('colony', c.foundColony.label, 'C', 'rally', { variant: 'primary', description: c.foundColony.note, run: () => this.ui.startPlacement('PORT') }),
      this.locked('unload', c.unloadOrbit.label, 'R', c.unloadOrbit.note),
    ];
    return { title: t.cmd.title, context: ark.name, status: 'CC-01', slots };
  }

  private scannerCard(bodyId: BodyId, world: WorldState): CardModel {
    const t = this.t;
    const c = t.commands;
    const body = world.bodies.find((b) => b.id === bodyId)!;
    const canChoose = !world.colony.siteBodyId && !!body.profile && body.kind !== 'BELT';
    // infrastructure grows from the port: building is ordered on the body that has one
    const hasPort = world.structures.some((s) => s.kind === 'HQ' && s.bodyId === bodyId);
    const choose = canChoose
      ? this.slot('choose', t.scan.choose, 'Enter', 'rally', { variant: 'primary', description: t.scan.final, run: () => void this.chooseSite(bodyId) })
      : null;
    const build = body.surfaceGrid
      ? hasPort
        ? this.slot('build', c.build.label, 'B', 'build', { variant: 'primary', description: c.build.note, run: () => this.ui.buildMenu.set(true) })
        : this.locked('build', c.build.label, 'B', t.reject.NO_COLONY, 'build')
      : null;
    // the main action first: choosing the site during the scan, building once there is a port
    const slots: Array<CommandSlot | null> = [
      choose ?? build,
      this.slot('zoom', c.zoom.label, 'Z', 'research', { description: c.zoom.note, run: () => this.ui.view.set('planet') }),
      this.locked('probe', c.probe.label, 'W', t.cmd.notYet),
      this.locked('compare', c.compare.label, 'V', t.cmd.notYet),
      this.locked('mark', c.mark.label, 'M', t.cmd.notYet),
      choose ? build : null,
    ];
    return { title: t.cmd.title, context: `Skaner · ${body.name}`, status: 'CC-02', slots };
  }

  /**
   * A surface tile (3D PoC tile panel + build bar): build its extractor or a landing pad here at once,
   * open the catalog aimed at this tile, or send a rover. Reasons come from the server's check.
   */
  private tileCard(bodyId: BodyId, tileIndex: number, world: WorldState, catalog: CatalogView): CardModel {
    const t = this.t;
    const c = t.commands;
    const info = this.tile();
    const fresh = info && info.bodyId === bodyId && info.index === tileIndex ? info : null;
    const hasPort = world.structures.some((s) => s.kind === 'HQ' && s.bodyId === bodyId);
    const cost = (kind: string) => costText(catalog.buildings.find((b) => b.id === kind)?.levels[0]?.cost ?? {});
    /** Builds `kind` on this tile in one press (1-tile kinds), or says why not. */
    const quick = (id: string, kind: string, label: string, hotkey: string, icon: IconName, description: string): CommandSlot => {
      if (!hasPort) return this.locked(id, label, hotkey, t.reject.NO_COLONY, icon);
      const o = fresh?.options.find((x) => x.kind === kind);
      if (!o) return this.locked(id, label, hotkey, t.selection.checking, icon);
      if (!o.ok) return this.locked(id, label, hotkey, reasonText(t, o.reason, o.detail), icon);
      return this.slot(id, label, hotkey, icon, { variant: 'primary', description, run: () => void this.place(bodyId, kind, tileIndex, 0) });
    };
    // the extractor for this tile's deposit: the first buildable kind that takes its material
    const dep = fresh?.deposit;
    const extractor = dep ? fresh!.options.find((o) => o.extracts === dep.material) : undefined;
    const extractorName = extractor ? buildingName(catalog, extractor.kind) : '';
    const idle = world.rovers.find((r) => r.bodyId === bodyId && r.state === 'IDLE' && !r.job);
    const slots: Array<CommandSlot | null> = [
      extractor
        ? quick('extract', extractor.kind, c.extractHere.label(extractorName), 'Enter', 'harvest', c.extractHere.note(dep!.material, cost(extractor.kind)))
        : null,
      quick('pad', 'LAND', c.padHere.label, 'D', 'rally', c.padHere.note(cost('LAND'))),
      hasPort
        ? this.slot('buildHere', c.buildHere.label, 'B', 'build', { description: c.buildHere.note, run: () => this.ui.buildMenu.set(true) })
        : this.locked('buildHere', c.buildHere.label, 'B', t.reject.NO_COLONY, 'build'),
      idle
        ? this.slot('sendRover', c.sendRover.label, 'J', 'move', { description: c.sendRover.note(idle.name), run: () => void this.game.command({ type: 'MOVE_ROVER', roverId: idle.id, tileIndex }) })
        : this.locked('sendRover', c.sendRover.label, 'J', t.reject.NO_ROVER, 'move'),
    ];
    const kind = fresh ? t.selection.tileKind[fresh.kind] : '';
    return { title: t.cmd.title, context: `${t.selection.tile(tileIndex)}${kind ? ' · ' + kind : ''}`, status: bodyId.toUpperCase(), slots };
  }

  /** A transport ship (3D PoC ship panel): fly where you point, back to the base to unload and refuel. */
  private shipCard(ship: WorldState['ships'][number], world: WorldState): CardModel {
    const t = this.t;
    const c = t.commands;
    const home = world.bodies.find((b) => b.isHomeBase) ?? world.bodies.find((b) => b.id === world.colony.siteBodyId);
    const flying = ship.state === 'IN_TRANSIT';
    const slots: Array<CommandSlot | null> = [
      flying
        ? this.locked('fly', c.flyTo.label, 'E', t.reject.IN_TRANSIT, 'move')
        : this.slot('fly', c.flyTo.label, 'E', 'move', { description: c.flyTo.note, selected: this.ui.targeting(), run: () => this.ui.targeting.set(!this.ui.targeting()) }),
      !home
        ? this.locked('returnHome', c.returnHome.label, 'H', t.reject.NO_COLONY, 'rally')
        : flying
          ? this.locked('returnHome', c.returnHome.label, 'H', t.reject.IN_TRANSIT, 'rally')
          : ship.currentBodyId === home.id
            ? this.locked('returnHome', c.returnHome.label, 'H', t.reject.ALREADY_THERE, 'rally')
            : this.slot('returnHome', c.returnHome.label, 'H', 'rally', { variant: 'primary', description: c.returnHome.note(home.name), run: () => void this.game.command({ type: 'MOVE_SHIP', shipId: ship.id, to: home.id }) }),
      this.locked('stop', c.stop.label, 'S', t.cmd.notYet, 'stop'),
    ];
    return { title: t.cmd.title, context: ship.name, status: ship.id.toUpperCase(), slots };
  }

  private placementCard(kind: string, world: WorldState, catalog: CatalogView): CardModel {
    const t = this.t;
    const c = t.commands;
    const p = this.ui.placement()!;
    const isPort = kind === 'PORT';
    const name = isPort ? buildingName(catalog, 'HQ') : buildingName(catalog, kind);
    const cost = isPort ? catalog.colonization.portCost : (catalog.buildings.find((b) => b.id === kind)?.levels[0]?.cost ?? {});
    const minutes = isPort ? catalog.colonization.portBuildMinutes : (catalog.buildings.find((b) => b.id === kind)?.levels[0]?.buildTime ?? 0);
    const preview = p.preview;
    const reason = preview && !preview.valid ? reasonText(t, preview.reason as never, preview.detail) : '';
    const slots: Array<CommandSlot | null> = [
      this.slot('place', isPort ? c.placePort.label : name, 'Enter', 'build', {
        variant: 'primary',
        description: c.placePort.note(costText(cost), Math.round(minutes)),
        ...(reason ? { disabledReason: reason } : {}),
        run: () => void this.confirmPlacement(world),
      }),
      this.slot('rotate', c.rotate.label, 'R', 'repeat', { description: c.rotate.note, run: () => void this.rotatePlacement() }),
      this.slot('auto', c.autoPlace.label, 'A', 'rally', { description: c.autoPlace.note, run: () => void this.autoPlace(world) }),
      this.slot('cancel', c.cancel.label, 'Esc', 'cancel', { variant: 'danger', description: c.cancel.note, run: () => this.ui.placement.set(null) }),
    ];
    return { title: t.cmd.title, context: name, status: p.preview ? `POLE ${p.preview.tileIndex}` : '', slots };
  }

  private buildCard(world: WorldState, catalog: CatalogView): CardModel {
    const t = this.t;
    const back = this.slot('back', t.commands.back.label, 'Esc', 'cancel', { description: t.commands.back.note, run: () => this.ui.buildMenu.set(false) });
    return { title: t.cmd.title, context: t.catalog.title(this.bodyLabel(world)), status: '', slots: [back] };
  }

  private portCard(s: Structure, world: WorldState, catalog: CatalogView): CardModel {
    const t = this.t;
    const c = t.commands;
    const rover = catalog.rover;
    const avail = this.availability()[`HQ@${s.level + 1}`];
    const next = catalog.buildings.find((b) => b.id === 'HQ')?.levels[s.level];
    const load = this.shuttleLoad(world);
    const slots: Array<CommandSlot | null> = [
      this.slot('produce', c.produceRover.label, 'Q', 'produce', {
        variant: 'primary',
        cost: Object.entries(rover.cost).map(([code, amount]) => ({ code, amount })),
        description: c.produceRover.note(costText(rover.cost), rover.buildTime),
        run: () => void this.game.command({ type: 'PRODUCE_ROVER', bodyId: s.bodyId }),
      }),
      this.slot('call', c.callShuttle.label, 'T', 'move', { description: c.callShuttle.note(costText(load)), run: () => void this.callShuttle(world) }),
      this.upgradeSlot(s, next, avail),
      this.slot('build', c.build.label, 'B', 'build', { description: c.build.note, run: () => this.ui.buildMenu.set(true) }),
      this.locked('report', c.report.label, 'R', t.cmd.notYet),
      this.slot('hold', c.hold.label, 'L', undefined, { description: `${t.selection.hold} Arki-1`, run: () => this.selectArk(world) }),
    ];
    return { title: t.cmd.title, context: `${buildingName(catalog, 'HQ')} · poz. ${s.level || 1}`, status: s.id.split('@')[1] ?? '', slots };
  }

  private structureCard(s: Structure, world: WorldState, catalog: CatalogView): CardModel {
    const t = this.t;
    const c = t.commands;
    const def = catalog.buildings.find((b) => b.id === s.kind);
    const name = def?.name ?? s.kind;
    const slots: Array<CommandSlot | null> = [];
    if (s.state === 'ACTIVE') {
      slots.push(this.upgradeSlot(s, def?.levels[s.level], this.availability()[`${s.kind}@${s.level + 1}`]));
      if ((def?.recipes.length ?? 0) > 1) {
        const i = Math.max(0, def!.recipes.indexOf(s.recipe ?? ''));
        const nextRecipe = def!.recipes[(i + 1) % def!.recipes.length]!;
        slots.push(this.slot('recipe', c.recipe.label(nextRecipe), 'P', 'repeat', { description: c.recipe.note, run: () => void this.game.command({ type: 'SET_RECIPE', structureId: s.id, recipe: nextRecipe }) }));
      }
      if (s.kind === 'ATN') slots.push(this.slot('atanor', c.atanor.label, 'A', 'research', { variant: 'primary', description: c.atanor.note, run: () => this.ui.openAtanor(s.id) }));
      slots.push(this.slot('demolish', c.demolish.label, 'X', 'cancel', { variant: 'danger', description: c.demolish.note, run: () => void this.game.command({ type: 'DEMOLISH', structureId: s.id }) }));
    } else {
      const idle = world.rovers.find((r) => r.bodyId === s.bodyId && r.state === 'IDLE' && !r.job);
      slots.push(
        idle
          ? this.slot('addRover', c.addRover.label, 'A', 'harvest', { variant: 'primary', description: c.addRover.note, run: () => void this.game.command({ type: 'ASSIGN_ROVER', roverId: idle.id, structureId: s.id }) })
          : this.locked('addRover', c.addRover.label, 'A', t.reject.ROVER_MOVING, 'harvest'),
        this.slot('cancelBuild', c.cancelBuild.label, 'X', 'cancel', { variant: 'danger', description: c.cancelBuild.note, run: () => void this.game.command({ type: 'CANCEL_CONSTRUCTION', structureId: s.id }) }),
      );
    }
    return { title: t.cmd.title, context: `${name} · poz. ${Math.max(1, s.level)}`, status: s.id.split('@')[1] ?? '', slots };
  }

  private roverCard(roverId: string, world: WorldState): CardModel {
    const t = this.t;
    const c = t.commands;
    const r = world.rovers.find((x) => x.id === roverId);
    if (!r) return { title: t.cmd.title, context: '—', status: '', slots: [] };
    const port = world.structures.find((s) => s.kind === 'HQ' && s.bodyId === r.bodyId);
    const portTile = port ? tileIndexFromId(port.tileId) : null;
    const slots: Array<CommandSlot | null> = [
      this.slot('build', c.build.label, 'B', 'build', { variant: 'primary', description: c.build.note, run: () => this.ui.buildMenu.set(true) }),
      r.job
        ? this.locked('moveTo', c.moveTo.label, 'J', t.reject.ROVER_MOVING, 'move')
        : this.slot('moveTo', c.moveTo.label, 'J', 'move', {
            description: c.moveTo.note,
            selected: this.ui.driveRover() === r.id,
            run: () => this.ui.driveRover.set(this.ui.driveRover() === r.id ? null : r.id),
          }),
      portTile === null
        ? this.locked('home', c.home.label, 'H', t.reject.NO_COLONY, 'rally')
        : r.job
          ? this.locked('home', c.home.label, 'H', t.reject.ROVER_MOVING, 'rally')
          : this.slot('home', c.home.label, 'H', 'rally', { description: c.home.note, run: () => void this.game.command({ type: 'MOVE_ROVER', roverId: r.id, tileIndex: portTile }) }),
    ];
    return { title: t.cmd.title, context: r.name, status: r.id, slots };
  }

  private upgradeSlot(s: Structure, next: CatalogView['buildings'][number]['levels'][number] | undefined, avail: Availability | undefined): CommandSlot {
    const t = this.t;
    const c = t.commands;
    const L = s.level + 1;
    if (!next) return this.locked('upgrade', c.upgrade.label(L), 'U', t.reject.MAX_LEVEL, 'upgrade');
    const cost = Object.entries(next.cost).map(([code, amount]) => ({ code, amount }));
    return this.slot('upgrade', c.upgrade.label(L), 'U', 'upgrade', {
      cost,
      description: c.upgrade.note(costText(next.cost), t.units.min(next.buildTime)),
      ...(avail && !avail.ok ? { disabledReason: reasonText(t, avail.reason, avail.detail) } : {}),
      run: () => void this.game.command({ type: 'UPGRADE', structureId: s.id }),
    });
  }

  /** Build catalog rows (panel next to the card): every buildable kind with its availability. */
  readonly buildList = computed(() => {
    const catalog = this.game.catalog();
    const avail = this.availability();
    if (!catalog) return [];
    return catalog.buildings
      .filter((b) => b.buildable)
      .sort((a, b) => a.era - b.era)
      .map((b, i) => {
        const a = avail[b.id];
        const l1 = b.levels[0]!;
        return {
          id: b.id,
          name: b.name,
          era: b.era,
          footprint: b.footprint,
          hotkey: BUILD_KEYS[i] ?? '',
          cost: Object.entries(l1.cost).map(([code, amount]) => ({ code, amount, missing: a?.reason === 'NO_RESOURCES' })),
          power: l1.power,
          crew: l1.crew,
          minutes: l1.buildTime,
          reason: a && !a.ok ? reasonText(this.t, a.reason, a.detail) : '',
        };
      });
  });

  async chooseSite(bodyId: BodyId): Promise<void> {
    const res = await this.game.command({ type: 'CHOOSE_COLONY_SITE', bodyId });
    const ark = this.game.world()?.ships.find((s) => s.role === 'MOTHERSHIP');
    if (res.ok && ark && ark.currentBodyId !== bodyId) await this.game.command({ type: 'MOVE_SHIP', shipId: ark.id, to: bodyId });
  }

  /**
   * Placement mode for `kind`. With a tile selected (the catalog opened from a tile), the ghost starts
   * on that tile, so Enter builds there (3D PoC "Buduj tutaj"); the cursor can still move it.
   */
  startPlacement(kind: string): void {
    const sel = this.ui.selection();
    this.ui.startPlacement(kind);
    if (sel.kind === 'TILE') void this.previewAt(sel.bodyId, sel.tileIndex);
  }

  /** Rotates the ghost and checks it again on the same tile. */
  async rotatePlacement(): Promise<void> {
    const at = this.ui.placement()?.preview?.tileIndex;
    this.ui.rotate();
    const body = this.game.world() ? this.placementBody(this.game.world()!) : null;
    if (at !== undefined && body) await this.previewAt(body, at);
  }

  private async previewAt(bodyId: BodyId, tileIndex: number): Promise<void> {
    const p = this.ui.placement();
    if (!p) return;
    const r = await this.game.previewBuild(bodyId, tileIndex, p.kind, p.rotation);
    const cur = this.ui.placement();
    if (cur && cur.kind === p.kind && cur.rotation === p.rotation && !cur.preview) {
      this.ui.placement.set({ ...cur, preview: { kind: p.kind, tiles: r.tiles, valid: r.ok, tileIndex, ...(r.reason ? { reason: r.reason } : {}), ...(r.detail ? { detail: r.detail } : {}) } });
    }
  }

  /** Places the current placement on its previewed tile, or the suggested one. */
  async confirmPlacement(world: WorldState): Promise<void> {
    const p = this.ui.placement();
    const body = this.placementBody(world);
    if (!p || !body) return;
    const tile = p.preview?.tileIndex ?? (await this.game.suggestTile(body, p.kind))?.tileIndex;
    if (tile === undefined) return;
    await this.place(body, p.kind, tile, p.rotation);
  }

  /**
   * Nearest valid tile; for an extractor, preferably on a material the colony goal still misses
   * (a Kopalnia goes to Ferryt before Kupryt), else the nearest deposit it can work.
   */
  async autoPlace(world: WorldState): Promise<void> {
    const p = this.ui.placement();
    const body = this.placementBody(world);
    if (!p || !body) return;
    const extracts = this.game.catalog()?.buildings.find((b) => b.id === p.kind)?.extracts.map((e) => e.material) ?? [];
    const missing = this.game.snapshot()?.objectives.find((o) => o.id === 'extract')?.missing ?? [];
    const wanted = missing.find((m) => extracts.includes(m));
    const s = (wanted ? await this.game.suggestTile(body, p.kind, wanted) : null) ?? (await this.game.suggestTile(body, p.kind));
    if (s) await this.place(body, p.kind, s.tileIndex, s.rotation);
  }

  async place(bodyId: BodyId, kind: string, tileIndex: number, rotation: number): Promise<boolean> {
    const tileId = `${bodyId}:${tileIndex}` as never;
    const res =
      kind === 'PORT'
        ? await this.game.command({ type: 'PLACE_SPACEPORT', bodyId, tileId, rotation })
        : await this.game.command({ type: 'BUILD', bodyId, tileId, kind, rotation });
    if (res.ok) this.ui.placement.set(null);
    return res.ok;
  }

  placementBody(world: WorldState): BodyId | null {
    return this.ui.placement()?.kind === 'PORT' ? world.colony.siteBodyId : this.ui.focusBodyId();
  }

  async callShuttle(world: WorldState): Promise<void> {
    const body = world.colony.siteBodyId;
    if (body) await this.game.command({ type: 'CALL_SHUTTLE', bodyId: body, cargo: this.shuttleLoad(world) });
  }

  /** What the shuttle takes on its next trip: the order of SHUTTLE_ORDER, up to its capacity. */
  shuttleLoad(world: WorldState): Record<string, number> {
    const ark = world.ships.find((s) => s.role === 'MOTHERSHIP');
    const cap = this.game.catalog()?.colonization.shuttleCapacity ?? 250;
    const out: Record<string, number> = {};
    let left = cap;
    for (const [code, max] of SHUTTLE_ORDER) {
      const q = Math.min(max, ark?.cargo[code] ?? 0, left);
      if (q > 0) {
        out[code] = q;
        left -= q;
      }
    }
    return out;
  }

  private selectArk(world: WorldState): void {
    const ark = world.ships.find((s) => s.role === 'MOTHERSHIP');
    if (ark) this.ui.select({ kind: 'SHIP', shipId: ark.id });
  }

  private bodyLabel(world: WorldState): string {
    const id = this.ui.focusBodyId();
    return world.bodies.find((b) => b.id === id)?.name ?? '—';
  }
}

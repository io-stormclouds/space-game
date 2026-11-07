import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { HexCoord, hexAdd, hexDirection, hexDistance, hexKey, hexScale, hexToPixel, pixelToHex } from '../core/grid/hex';
import { Atom, Bond } from '../core/graph/molecule';
import { ArmState, Glyph, SimulationStepResult, TrackSegment } from '../core/engine/types';
import { getGripperPosition } from '../core/engine/arm';

export type BuildTool = 'SELECT' | 'ARM_1' | 'ARM_2' | 'PISTON' | 'BONDER' | 'UNBONDER' | 'DELETE';

export interface RendererOptions {
  hexRadius?: number;
  width?: number;
  height?: number;
}

export class PixiRenderer {
  private app: Application | null = null;
  private container: Container = new Container();
  private gridLayer: Container = new Container();
  private glyphLayer: Container = new Container();
  private trackLayer: Container = new Container();
  private armLayer: Container = new Container();
  private bondLayer: Container = new Container();
  private atomLayer: Container = new Container();
  private hoverLayer: Container = new Container();
  private fxLayer: Container = new Container();

  private hexRadius = 40;
  private origin = { x: 450, y: 320 };
  private zoom = 1.0;

  // Dragging / Panning
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private originStart = { x: 0, y: 0 };

  // Hover and selection state
  public hoveredHex: HexCoord | null = null;
  public selectedArmId: string | null = null;
  public activeBuildTool: BuildTool = 'SELECT';
  public previewRotation = 0; // 0..5

  // Callbacks
  public onHexClick?: (hex: HexCoord, button: number) => void;
  public onHexHover?: (hex: HexCoord | null) => void;

  // Interpolation state
  private prevState: SimulationStepResult | null = null;
  private currState: SimulationStepResult | null = null;
  private lerpProgress = 1.0;

  // Cached glyphs
  private glyphs: Glyph[] = [];
  private tracks: TrackSegment[] = [];

  constructor(options: RendererOptions = {}) {
    if (options.hexRadius) this.hexRadius = options.hexRadius;
  }

  public async init(canvas: HTMLCanvasElement): Promise<void> {
    // Guard against headless environments without canvas/WebGL (such as JSDOM in tests)
    if (typeof window === 'undefined' || !canvas || typeof canvas.getContext !== 'function') {
      return;
    }
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    try {
      this.app = new Application();
      await this.app.init({
        canvas,
        resizeTo: canvas.parentElement ?? window,
        backgroundColor: 0x0f1c1a,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
      });

      this.container.addChild(this.gridLayer);
      this.container.addChild(this.glyphLayer);
      this.container.addChild(this.trackLayer);
      this.container.addChild(this.armLayer);
      this.container.addChild(this.bondLayer);
      this.container.addChild(this.atomLayer);
      this.container.addChild(this.hoverLayer);
      this.container.addChild(this.fxLayer);

      this.app.stage.addChild(this.container);

      this.setupInteractivity(canvas);
      this.updateOriginToCenter();
      this.drawGrid();
    } catch {
      // In headless or mock environment where Pixi cannot initialize, degrade gracefully
      this.app = null;
    }
  }

  public updateOriginToCenter(): void {
    if (!this.app) return;
    this.origin = {
      x: this.app.screen.width * 0.56,
      y: this.app.screen.height / 2 - 15,
    };
    this.renderCurrent();
  }

  public setGlyphs(glyphs: Glyph[]): void {
    this.glyphs = glyphs;
    this.drawGlyphs();
  }

  public setTracks(tracks: TrackSegment[]): void {
    this.tracks = tracks;
    this.drawTracks();
  }

  public updateState(prev: SimulationStepResult | null, curr: SimulationStepResult, progress = 1.0): void {
    this.prevState = prev;
    this.currState = curr;
    this.lerpProgress = Math.max(0, Math.min(1, progress));
    this.renderCurrent();
  }

  public setProgress(progress: number): void {
    this.lerpProgress = Math.max(0, Math.min(1, progress));
    this.renderCurrent();
  }

  private setupInteractivity(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.originStart = { ...this.origin };
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const hex = pixelToHex({ x: mouseX, y: mouseY }, this.hexRadius * this.zoom, this.origin);

      if (!this.hoveredHex || this.hoveredHex.q !== hex.q || this.hoveredHex.r !== hex.r) {
        this.hoveredHex = hex;
        this.drawHoverAndPreview();
        this.onHexHover?.(hex);
      }

      if (this.isDragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 4) {
          this.origin = {
            x: this.originStart.x + dx,
            y: this.originStart.y + dy,
          };
          this.renderCurrent();
        }
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this.hoveredHex = null;
      this.drawHoverAndPreview();
      this.onHexHover?.(null);
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.isDragging = false;

        // If mouse didn't drag more than 4px, register as a clean hex click
        if (Math.hypot(dx, dy) <= 4) {
          const rect = canvas.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
            const hex = pixelToHex({ x: mouseX, y: mouseY }, this.hexRadius * this.zoom, this.origin);
            this.onHexClick?.(hex, e.button);
          }
        }
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.5, Math.min(2.5, this.zoom * zoomFactor));

      // Zoom towards mouse
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.origin.x = mouseX - (mouseX - this.origin.x) * (newZoom / this.zoom);
      this.origin.y = mouseY - (mouseY - this.origin.y) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.renderCurrent();
    }, { passive: false });
  }

  private hexToPx(hex: HexCoord): { x: number; y: number } {
    return hexToPixel(hex, this.hexRadius * this.zoom, this.origin);
  }

  public drawGrid(): void {
    this.gridLayer.removeChildren();
    const g = new Graphics();

    const range = 7;
    for (let q = -range; q <= range; q++) {
      for (let r = -range; r <= range; r++) {
        if (Math.abs(q + r) <= range) {
          const pt = this.hexToPx({ q, r });
          this.drawHexTile(g, pt.x, pt.y, this.hexRadius * this.zoom);
        }
      }
    }

    this.gridLayer.addChild(g);
  }

  private drawHexTile(g: Graphics, cx: number, cy: number, radius: number): void {
    // Pointy-topped hexagon vertices
    const points: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      points.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }

    // Hex background fill
    g.poly(points).fill({ color: 0x132724, alpha: 0.55 });
    // Hex subtle metallic border
    g.poly(points).stroke({ color: 0x274b43, width: 1.5, alpha: 0.45 });

    // Inner subtle alchemical center dot
    g.circle(cx, cy, 1.5).fill({ color: 0x366359, alpha: 0.4 });
  }

  private drawGlyphs(): void {
    this.glyphLayer.removeChildren();
    const g = new Graphics();

    for (const glyph of this.glyphs) {
      if (glyph.type === 'INPUT') {
        const pt = this.hexToPx(glyph.pos);
        const r = this.hexRadius * this.zoom * 0.75;

        // Outer brass well rim
        g.circle(pt.x, pt.y, r + 4).fill({ color: 0x2b3834 });
        g.circle(pt.x, pt.y, r + 2).stroke({ color: 0xbf953f, width: 2, alpha: 0.8 });

        // Glowing elemental well pool
        const wellColor = glyph.element === 'A' ? 0x661818 : 0x164654;
        g.circle(pt.x, pt.y, r).fill({ color: wellColor, alpha: 0.9 });
        g.circle(pt.x, pt.y, r * 0.5).fill({ color: glyph.element === 'A' ? 0xff4d4d : 0x4dd0e1, alpha: 0.35 });

        // Label
        const txt = new Text({
          text: `SRC:${glyph.element}`,
          style: new TextStyle({
            fontSize: 11 * this.zoom,
            fontFamily: 'monospace',
            fill: 0xe0d6be,
            fontWeight: 'bold',
          }),
        });
        txt.anchor.set(0.5);
        txt.position.set(pt.x, pt.y + r + 12 * this.zoom);
        this.glyphLayer.addChild(txt);
      } else if (glyph.type === 'OUTPUT') {
        const pt = this.hexToPx(glyph.pos);
        const r = this.hexRadius * this.zoom * 0.82;

        // Receptacle outer rim
        g.circle(pt.x, pt.y, r + 4).fill({ color: 0x221f1a });
        g.circle(pt.x, pt.y, r + 2).stroke({ color: 0xdaa520, width: 2.5, alpha: 0.85 });
        g.circle(pt.x, pt.y, r).fill({ color: 0x181410, alpha: 0.8 });

        // Golden targeting crosshair
        g.moveTo(pt.x - r * 0.6, pt.y).lineTo(pt.x + r * 0.6, pt.y).stroke({ color: 0xffd700, width: 1.5, alpha: 0.5 });
        g.moveTo(pt.x, pt.y - r * 0.6).lineTo(pt.x, pt.y + r * 0.6).stroke({ color: 0xffd700, width: 1.5, alpha: 0.5 });

        // Output Label
        const txt = new Text({
          text: `OUT: ${glyph.targetPattern.name}`,
          style: new TextStyle({
            fontSize: 11 * this.zoom,
            fontFamily: 'monospace',
            fill: 0xffd700,
            fontWeight: 'bold',
          }),
        });
        txt.anchor.set(0.5);
        txt.position.set(pt.x, pt.y + r + 12 * this.zoom);
        this.glyphLayer.addChild(txt);
      } else if (glyph.type === 'BONDER' || glyph.type === 'UNBONDER') {
        const pt1 = this.hexToPx(glyph.pos);
        const pt2 = this.hexToPx(glyph.pos2);
        const r = this.hexRadius * this.zoom * 0.45;
        const isUnbonder = glyph.type === 'UNBONDER';

        // Connection plate between hexes (brass for bonder, red for unbonder)
        const plateColor = isUnbonder ? 0x7a2b2b : 0x8c6d37;
        const coreColor = isUnbonder ? 0xff5252 : 0xd4af37;
        g.moveTo(pt1.x, pt1.y).lineTo(pt2.x, pt2.y).stroke({ color: plateColor, width: 16 * this.zoom, alpha: 0.75 });
        g.moveTo(pt1.x, pt1.y).lineTo(pt2.x, pt2.y).stroke({ color: coreColor, width: 4 * this.zoom, alpha: 0.9 });

        // Connection rings
        g.circle(pt1.x, pt1.y, r).fill({ color: 0x2b2416 }).stroke({ color: coreColor, width: 2 });
        g.circle(pt2.x, pt2.y, r).fill({ color: 0x2b2416 }).stroke({ color: coreColor, width: 2 });

        g.circle(pt1.x, pt1.y, r * 0.4).fill({ color: isUnbonder ? 0xff8a80 : 0xffe082, alpha: 0.8 });
        g.circle(pt2.x, pt2.y, r * 0.4).fill({ color: isUnbonder ? 0xff8a80 : 0xffe082, alpha: 0.8 });

        // Glyph type markers
        const marker = new Text({
          text: isUnbonder ? '✂' : '⛓',
          style: new TextStyle({ fontSize: 14 * this.zoom, fontFamily: 'serif', fill: coreColor, fontWeight: 'bold' }),
        });
        marker.anchor.set(0.5);
        marker.position.set((pt1.x + pt2.x) / 2, (pt1.y + pt2.y) / 2);
        this.glyphLayer.addChild(marker);
      } else if (glyph.type === 'TRANSMUTE') {
        const pt = this.hexToPx(glyph.pos);
        const r = this.hexRadius * this.zoom * 0.62;

        // Violet transmutation ring
        g.circle(pt.x, pt.y, r + 4).fill({ color: 0x1a1226, alpha: 0.9 });
        g.circle(pt.x, pt.y, r + 2).stroke({ color: 0xb388ff, width: 2.5, alpha: 0.9 });
        g.circle(pt.x, pt.y, r).fill({ color: 0x2a1d3d, alpha: 0.85 });

        // Rotational arrows hint
        g.moveTo(pt.x - r * 0.5, pt.y).lineTo(pt.x + r * 0.5, pt.y).stroke({ color: 0xd1c4e9, width: 1.5, alpha: 0.5 });

        const txt = new Text({
          text: `${glyph.fromElement}→${glyph.toElement}`,
          style: new TextStyle({ fontSize: 10 * this.zoom, fontFamily: 'monospace', fill: 0xe1bee7, fontWeight: 'bold' }),
        });
        txt.anchor.set(0.5);
        txt.position.set(pt.x, pt.y + r + 12 * this.zoom);
        this.glyphLayer.addChild(txt);
      }
    }

    this.glyphLayer.addChild(g);
  }

  public renderCurrent(): void {
    if (!this.app) return;

    this.drawGrid();
    this.drawTracks();
    this.drawGlyphs();
    this.drawArms();
    this.drawBondsAndAtoms();
    this.drawHoverAndPreview();
    this.drawEffects();
  }

  /**
   * Draw track segments as a continuous iron rail across their path hexes.
   */
  private drawTracks(): void {
    this.trackLayer.removeChildren();
    if (this.tracks.length === 0) return;

    const g = new Graphics();
    for (const track of this.tracks) {
      if (track.path.length === 0) continue;
      for (let i = 0; i < track.path.length - 1; i++) {
        const a = this.hexToPx(track.path[i]);
        const b = this.hexToPx(track.path[i + 1]);
        // Outer rail
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x2b2b2b, width: 12 * this.zoom, alpha: 0.8 });
        // Inner rail highlight
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x9e9e9e, width: 3 * this.zoom, alpha: 0.7 });
      }
      // Node caps
      for (const p of track.path) {
        const pt = this.hexToPx(p);
        g.circle(pt.x, pt.y, 5 * this.zoom).fill({ color: 0x616161 }).stroke({ color: 0xbdbdbd, width: 1.5 });
      }
    }
    this.trackLayer.addChild(g);
  }

  /**
   * Draws the hover highlight for the hex under the cursor and, when a build
   * tool that places an arm is active, a dashed preview of the arm at the
   * current previewRotation.
   */
  private drawHoverAndPreview(): void {
    this.hoverLayer.removeChildren();
    if (!this.app || !this.hoveredHex) return;

    const g = new Graphics();
    const isArmTool =
      this.activeBuildTool === 'ARM_1' ||
      this.activeBuildTool === 'ARM_2' ||
      this.activeBuildTool === 'PISTON';
    const isGlyphTool = this.activeBuildTool === 'BONDER' || this.activeBuildTool === 'UNBONDER';
    const isDelete = this.activeBuildTool === 'DELETE';

    const highlightColor = isDelete ? 0xff5252 : isGlyphTool ? 0xffe082 : 0xffd54f;
    const highlightAlpha = this.activeBuildTool === 'SELECT' ? 0.35 : 0.6;

    // 1. Highlight the hovered hex tile.
    const center = this.hexToPx(this.hoveredHex);
    const radius = this.hexRadius * this.zoom;
    const points: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      points.push(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle));
    }
    g.poly(points).fill({ color: highlightColor, alpha: highlightAlpha });
    g.poly(points).stroke({ color: highlightColor, width: 2.5, alpha: 0.9 });

    // 2. For arm tools, draw a ghost preview of the arm pointing in previewRotation.
    if (isArmTool) {
      const length = this.activeBuildTool === 'PISTON' ? 1 : this.activeBuildTool === 'ARM_2' ? 2 : 1;
      const angleRad = this.previewRotation * (Math.PI / 3);
      const armLength = length * this.hexRadius * Math.sqrt(3) * this.zoom;
      const gripX = center.x + armLength * Math.cos(angleRad);
      const gripY = center.y + armLength * Math.sin(angleRad);

      // Ghost beam
      g.moveTo(center.x, center.y).lineTo(gripX, gripY).stroke({
        color: 0xc49b45,
        width: 4 * this.zoom,
        alpha: 0.55,
      });
      // Ghost base
      g.circle(center.x, center.y, 12 * this.zoom).fill({ color: 0x8e24aa, alpha: 0.4 });
      // Ghost gripper
      g.circle(gripX, gripY, 6 * this.zoom).fill({ color: 0xffd54f, alpha: 0.5 });

      // Length indicator letters
      const txt = new Text({
        text: `L${length}@${this.previewRotation}`,
        style: new TextStyle({
          fontSize: 11 * this.zoom,
          fontFamily: 'monospace',
          fill: 0xffe082,
          stroke: { color: 0x000000, width: 3 },
        }),
      });
      txt.anchor.set(0.5);
      txt.position.set(gripX, gripY - 16 * this.zoom);
      this.hoverLayer.addChild(txt);
    }

    // 3. For glyph tools, preview the second hex (adjacent) that will be bonded/unbonded.
    if (isGlyphTool && this.currState) {
      // Preview the neighbor in the previewRotation direction.
      const neighbor = hexAdd(this.hoveredHex, hexDirection(this.previewRotation));
      const nb = this.hexToPx(neighbor);
      const nbPoints: number[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        nbPoints.push(nb.x + radius * Math.cos(angle), nb.y + radius * Math.sin(angle));
      }
      g.poly(nbPoints).stroke({ color: 0xffe082, width: 2, alpha: 0.7 });

      // Connecting line
      g.moveTo(center.x, center.y).lineTo(nb.x, nb.y).stroke({
        color: 0xffe082,
        width: 3,
        alpha: 0.5,
      });
    }

    this.hoverLayer.addChild(g);
  }

  /**
   * Set the active build tool. Updates preview bounds and redraws.
   */
  public setBuildTool(tool: BuildTool): void {
    this.activeBuildTool = tool;
    this.drawHoverAndPreview();
  }

  /**
   * Set the rotation used for arm / glyph placement previews (0..5).
   */
  public setPreviewRotation(rotation: number): void {
    this.previewRotation = ((rotation % 6) + 6) % 6;
    this.drawHoverAndPreview();
  }

  private drawArms(): void {
    this.armLayer.removeChildren();
    if (!this.currState) return;

    const g = new Graphics();
    const currArms = this.currState.arms;
    const prevArmsMap = new Map((this.prevState?.arms ?? []).map(a => [a.id, a]));

    for (const arm of currArms) {
      const prevArm = prevArmsMap.get(arm.id) ?? arm;

      // Base interpolation
      const basePx = this.hexToPx(arm.basePos);

      // Angle interpolation
      let angleDiff = (arm.rotation - prevArm.rotation) % 6;
      if (angleDiff > 3) angleDiff -= 6;
      if (angleDiff < -3) angleDiff += 6;

      const interpolatedDir = prevArm.rotation + angleDiff * this.lerpProgress;
      // In our grid, HEX_DIRECTIONS[0] is East (0 radians). Each step of 60 deg is Math.PI / 3
      const angleRad = interpolatedDir * (Math.PI / 3);

      // Length interpolation
      const armLength = (prevArm.length + (arm.length - prevArm.length) * this.lerpProgress) * this.hexRadius * Math.sqrt(3) * this.zoom;

      const gripperX = basePx.x + armLength * Math.cos(angleRad);
      const gripperY = basePx.y + armLength * Math.sin(angleRad);

      // 1. Draw arm beam / rails
      g.moveTo(basePx.x, basePx.y).lineTo(gripperX, gripperY).stroke({
        color: 0x3d352e,
        width: 10 * this.zoom,
      });
      g.moveTo(basePx.x, basePx.y).lineTo(gripperX, gripperY).stroke({
        color: 0xc49b45,
        width: 4 * this.zoom,
      });

      // 2. Draw mechanical base (Opus Magnum purple/brass pivot)
      g.circle(basePx.x, basePx.y, 16 * this.zoom).fill({ color: 0x2d2015 }).stroke({ color: 0xaa8238, width: 3 });
      g.circle(basePx.x, basePx.y, 9 * this.zoom).fill({ color: 0x8e24aa }); // Purple gem
      g.circle(basePx.x, basePx.y, 4 * this.zoom).fill({ color: 0xe1bee7 }); // Glint

      // 3. Draw gripper head
      const isHolding = this.lerpProgress > 0.5 ? arm.isHolding : prevArm.isHolding;
      const clawSpread = isHolding ? 0.35 : 0.7; // Tighter claw when gripping!
      const clawLen = 14 * this.zoom;

      // Claws
      const leftAngle = angleRad + Math.PI - clawSpread;
      const rightAngle = angleRad + Math.PI + clawSpread;

      g.moveTo(gripperX, gripperY)
        .lineTo(gripperX + clawLen * Math.cos(leftAngle), gripperY + clawLen * Math.sin(leftAngle))
        .stroke({ color: 0xaa8238, width: 3 * this.zoom });

      g.moveTo(gripperX, gripperY)
        .lineTo(gripperX + clawLen * Math.cos(rightAngle), gripperY + clawLen * Math.sin(rightAngle))
        .stroke({ color: 0xaa8238, width: 3 * this.zoom });

      // Gripper center hub
      g.circle(gripperX, gripperY, 6 * this.zoom).fill({ color: isHolding ? 0xffd54f : 0x424242 }).stroke({ color: 0xaa8238, width: 2 });
    }

    this.armLayer.addChild(g);
  }

  private drawBondsAndAtoms(): void {
    this.bondLayer.removeChildren();
    this.atomLayer.removeChildren();
    if (!this.currState) return;

    const gBonds = new Graphics();
    const gAtoms = new Graphics();

    // Map atoms for quick position retrieval
    const prevAtomsMap = new Map((this.prevState?.atoms ?? []).map(a => [a.id, a]));
    const atomPxMap = new Map<string, { x: number; y: number }>();

    for (const atom of this.currState.atoms) {
      const prevAtom = prevAtomsMap.get(atom.id) ?? atom;

      const p0 = this.hexToPx(prevAtom.pos);
      const p1 = this.hexToPx(atom.pos);

      // Lerp pixel position
      const px = p0.x + (p1.x - p0.x) * this.lerpProgress;
      const py = p0.y + (p1.y - p0.y) * this.lerpProgress;

      atomPxMap.set(atom.id, { x: px, y: py });
    }

    // 1. Draw Bonds
    for (const bond of this.currState.bonds) {
      const p1 = atomPxMap.get(bond.atom1Id);
      const p2 = atomPxMap.get(bond.atom2Id);
      if (p1 && p2) {
        // Outer golden rod
        gBonds.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({
          color: 0x8a6d3b,
          width: 8 * this.zoom,
        });
        // Inner glowing core
        gBonds.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({
          color: 0xffe082,
          width: 3 * this.zoom,
        });
      }
    }

    // 2. Draw Atoms
    const atomRadius = this.hexRadius * this.zoom * 0.44;

    for (const atom of this.currState.atoms) {
      const pos = atomPxMap.get(atom.id);
      if (!pos) continue;

      let color = 0x8d6e63;
      let rimColor = 0xbcaaa4;
      let symbol = atom.element as string;

      switch (atom.element) {
        case 'A':
        case 'FIRE':
          color = 0xd32f2f;      // Crimson / Cinnabar
          rimColor = 0xff8a80;
          symbol = atom.element === 'FIRE' ? '🜂' : 'A';
          break;
        case 'B':
        case 'QUICKSILVER':
          color = 0x00838f;      // Teal-blue / Mercury
          rimColor = 0x80deea;
          symbol = atom.element === 'QUICKSILVER' ? '☿' : 'B';
          break;
        case 'WATER':
          color = 0x1565c0;      // Deep blue / Water
          rimColor = 0x82b1ff;
          symbol = '🜄';
          break;
        case 'EARTH':
          color = 0x6d4c41;      // Brown / Earth
          rimColor = 0xbcaaa4;
          symbol = '🜃';
          break;
        case 'SALT':
          color = 0xe0e0e0;      // White Opal Salt
          rimColor = 0xffffff;
          symbol = '🜔';
          break;
        case 'LEAD':
          color = 0x546e7a;      // Lead grey
          rimColor = 0x90a4ae;
          symbol = 'Pb';
          break;
        case 'GOLD':
          color = 0xfbc02d;      // Gold
          rimColor = 0xfff59d;
          symbol = 'Au';
          break;
      }

      // Outer shadow
      gAtoms.circle(pos.x + 2, pos.y + 3, atomRadius).fill({ color: 0x000000, alpha: 0.35 });

      // Atom sphere body
      gAtoms.circle(pos.x, pos.y, atomRadius).fill({ color });
      gAtoms.circle(pos.x, pos.y, atomRadius).stroke({ color: rimColor, width: 2 * this.zoom });

      // Highlight glint (top-left)
      gAtoms.circle(pos.x - atomRadius * 0.3, pos.y - atomRadius * 0.3, atomRadius * 0.25).fill({
        color: 0xffffff,
        alpha: 0.4,
      });

      // Atom symbol / label
      const txt = new Text({
        text: symbol,
        style: new TextStyle({
          fontSize: 14 * this.zoom,
          fontFamily: 'serif',
          fontWeight: 'bold',
          fill: 0xffffff,
        }),
      });
      txt.anchor.set(0.5);
      txt.position.set(pos.x, pos.y);
      this.atomLayer.addChild(txt);
    }

    this.bondLayer.addChild(gBonds);
    this.atomLayer.addChild(gAtoms);
  }

  private drawEffects(): void {
    this.fxLayer.removeChildren();
    if (!this.currState) return;

    const g = new Graphics();

    // If collision happened: draw big red flashing 'X' as in screenshot!
    if (this.currState.collisionDetected) {
      // Find collision hex or draw on colliding atoms
      for (const atom of this.currState.atoms) {
        const pt = this.hexToPx(atom.pos);
        const sz = 22 * this.zoom;

        // Red cross
        g.moveTo(pt.x - sz, pt.y - sz).lineTo(pt.x + sz, pt.y + sz).stroke({ color: 0xff1744, width: 5 * this.zoom });
        g.moveTo(pt.x + sz, pt.y - sz).lineTo(pt.x - sz, pt.y + sz).stroke({ color: 0xff1744, width: 5 * this.zoom });
      }

      // Collision text
      const crashTxt = new Text({
        text: 'JAM / COLLISION DETECTED',
        style: new TextStyle({
          fontSize: 18 * this.zoom,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: 0xff5252,
          stroke: { color: 0x000000, width: 4 },
        }),
      });
      crashTxt.anchor.set(0.5);
      crashTxt.position.set(this.origin.x, this.origin.y - 180 * this.zoom);
      this.fxLayer.addChild(crashTxt);
    }

    this.fxLayer.addChild(g);
  }

  public destroy(): void {
    if (this.app) {
      try {
        this.app.destroy(true, { children: true });
      } catch {
        // Degrade cleanly in mock / headless environments
      }
      this.app = null;
    }
  }
}

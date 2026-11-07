import { SCENE, cssHex } from './palette';

interface Label {
  el: HTMLDivElement;
  text: string;
  x: number;
  y: number;
  visible: boolean;
  focus: boolean;
}

/**
 * Body names as DOM text over the canvas (DS mono, uppercase micro labels; no sprites, W14).
 * Writes the DOM only when a value changes. Everything it adds is removed by `dispose`.
 */
export class LabelLayer {
  readonly root: HTMLDivElement;
  private readonly labels = new Map<string, Label>();

  constructor(private readonly container: HTMLElement) {
    const doc = container.ownerDocument;
    this.root = doc.createElement('div');
    this.root.className = 'system-view__labels';
    this.root.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    container.appendChild(this.root);
  }

  /** Text shown for a body id (call when names or reveal state change). */
  set(id: string, text: string): void {
    const l = this.label(id);
    if (l.text !== text) {
      l.text = text;
      l.el.textContent = text;
    }
  }

  /** Places a label at a pixel position of the container; null hides it. */
  place(id: string, x: number | null, y: number, focus = false): void {
    const l = this.labels.get(id);
    if (!l) return;
    const visible = x !== null;
    if (visible !== l.visible) {
      l.visible = visible;
      l.el.style.display = visible ? 'block' : 'none';
    }
    if (!visible) return;
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== l.x || ry !== l.y) {
      l.x = rx;
      l.y = ry;
      l.el.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -100%)`;
    }
    if (focus !== l.focus) {
      l.focus = focus;
      l.el.style.color = cssHex(focus ? SCENE.labelFocus : SCENE.label);
    }
  }

  remove(id: string): void {
    this.labels.get(id)?.el.remove();
    this.labels.delete(id);
  }

  ids(): IterableIterator<string> {
    return this.labels.keys();
  }

  textOf(id: string): string | undefined {
    return this.labels.get(id)?.text;
  }

  dispose(): void {
    this.labels.clear();
    this.root.remove();
  }

  private label(id: string): Label {
    let l = this.labels.get(id);
    if (!l) {
      const el = this.root.ownerDocument.createElement('div');
      el.className = 'system-view__label';
      el.style.cssText =
        'position:absolute;left:0;top:0;display:none;white-space:nowrap;' +
        'font:500 10px/1.1 "JetBrains Mono","IBM Plex Mono",Consolas,monospace;letter-spacing:0.14em;text-transform:uppercase;' +
        `color:${cssHex(SCENE.label)};padding-bottom:4px;`;
      this.root.appendChild(el);
      l = { el, text: '', x: NaN, y: NaN, visible: false, focus: false };
      this.labels.set(id, l);
    }
    return l;
  }
}

import type { GalaxyPalette } from './galaxy-model';

// Lightweight DOM labels over the canvas (no textures, no draw calls). One absolutely positioned
// overlay inside the view container; pointer-events: none so the canvas keeps the input.

/** Texts drawn by the galaxy view (Polish defaults; the app may pass its dictionary entries). */
export interface GalaxyText {
  colony: string;
  hub: string;
  otherColony: string;
  /** Tag for a star with several simulated players. */
  otherColonies: (count: number) => string;
}

export const GALAXY_TEXT_PL: GalaxyText = {
  colony: 'Twoja kolonia',
  hub: 'Hub rynku',
  otherColony: 'Kolonia gracza',
  otherColonies: (n) => `Kolonie graczy · ${n}`,
};

export type LabelTone = 'normal' | 'signal' | 'dim';

interface LabelEl {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  tag: HTMLSpanElement;
  text: string;
  tagText: string;
  tone: LabelTone;
  tagTone: LabelTone;
  x: number;
  y: number;
  shown: boolean;
}

export class LabelOverlay {
  readonly root: HTMLDivElement;
  private readonly els = new Map<string, LabelEl>();

  constructor(
    container: HTMLElement,
    private readonly palette: GalaxyPalette,
  ) {
    const doc = container.ownerDocument;
    this.root = doc.createElement('div');
    this.root.className = 'galaxy-labels';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.cssText = [
      'position:absolute',
      'inset:0',
      'overflow:hidden',
      'pointer-events:none',
      'font-family:var(--hud-font-mono,"JetBrains Mono",Consolas,monospace)',
      'font-size:10px',
      'font-weight:700',
      'letter-spacing:0.1em',
      'text-transform:uppercase',
      'line-height:1',
      'white-space:nowrap',
      'user-select:none',
    ].join(';');
    container.appendChild(this.root);
  }

  private color(tone: LabelTone): string {
    return tone === 'signal' ? this.palette.signal : tone === 'dim' ? this.palette.textDim : this.palette.text;
  }

  private create(key: string): LabelEl {
    const doc = this.root.ownerDocument;
    const root = doc.createElement('div');
    root.style.cssText = 'position:absolute;left:0;top:0;display:none;flex-direction:column;align-items:flex-start;gap:3px;will-change:transform';
    const name = doc.createElement('span');
    const tag = doc.createElement('span');
    tag.style.cssText = `display:none;padding:2px 5px;border:1px solid currentColor;background:${this.palette.void};letter-spacing:0.14em`;
    root.append(name, tag);
    this.root.appendChild(root);
    const el: LabelEl = { root, name, tag, text: '', tagText: '', tone: 'normal', tagTone: 'normal', x: NaN, y: NaN, shown: false };
    this.els.set(key, el);
    return el;
  }

  /** Shows (or moves) a label with its top-left corner at (x, y) in container pixels. */
  show(key: string, text: string, tone: LabelTone, x: number, y: number, tag: string | null = null, tagTone: LabelTone = 'normal'): void {
    const el = this.els.get(key) ?? this.create(key);
    if (el.text !== text) {
      el.name.textContent = text;
      el.text = text;
    }
    if (el.tone !== tone) {
      el.name.style.color = this.color(tone);
      el.tone = tone;
    } else if (!el.name.style.color) {
      el.name.style.color = this.color(tone);
    }
    const tagText = tag ?? '';
    if (el.tagText !== tagText) {
      el.tag.textContent = tagText;
      el.tag.style.display = tagText ? 'inline-block' : 'none';
      el.tagText = tagText;
    }
    if (el.tagTone !== tagTone || !el.tag.style.color) {
      el.tag.style.color = this.color(tagTone);
      el.tagTone = tagTone;
    }
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== el.x || ry !== el.y) {
      el.root.style.transform = `translate(${rx}px,${ry}px)`;
      el.x = rx;
      el.y = ry;
    }
    if (!el.shown) {
      el.root.style.display = 'flex';
      el.shown = true;
    }
  }

  /** Hides every label whose key is not in `keep`. */
  hideExcept(keep: ReadonlySet<string>): void {
    for (const [key, el] of this.els) {
      if (el.shown && !keep.has(key)) {
        el.root.style.display = 'none';
        el.shown = false;
      }
    }
  }

  /** Keys of the labels currently shown (for tests and the harness). */
  visibleKeys(): string[] {
    return [...this.els].filter(([, el]) => el.shown).map(([k]) => k);
  }

  dispose(): void {
    this.els.clear();
    this.root.remove();
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorStore, type ToolId } from '../state/editor-store';

interface ToolButton {
  readonly id: ToolId | 'wall' | 'door';
  readonly label: string;
  readonly key: string;
  /** SVG path, 24×24 viewBox, stroked. */
  readonly icon: string;
  readonly hint: string;
}

const TOOLS: readonly ToolButton[] = [
  { id: 'select', label: 'Wybór', key: 'V', icon: 'M5 3l12 9-6 1 3 7-3 1-3-7-3 4z', hint: 'Klik: zaznacz · przeciągnij: przesuń · podłoga: pomieszczenie' },
  { id: 'room', label: 'Pomieszczenie', key: 'B', icon: 'M3 5h18v14H3zM3 5l4 4h10l4-4M7 9v10M17 9v10', hint: 'Przeciągnij prostokąt: podłoga + ściany' },
  { id: 'floor', label: 'Podłoga', key: 'F', icon: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z', hint: 'Przeciągnij: maluj · Ctrl: usuń' },
  { id: 'wall', label: 'Ściana', key: 'W', icon: 'M3 20V6l4-2v16M7 6h14v14H7M7 10h14M7 15h14', hint: 'Klik: krawędź · przeciągnij: linia · Ctrl: usuń · R: strona' },
  { id: 'door', label: 'Drzwi', key: 'D', icon: 'M5 21V3h14v18M9 21V8h6v13M13 14h1', hint: 'Klik na krawędzi: drzwi' },
  { id: 'object', label: 'Obiekt', key: 'O', icon: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8', hint: 'Klik: postaw · R: obróć' },
  { id: 'erase', label: 'Gumka', key: 'X', icon: 'M4 16l9-9 7 7-6 6H8zM13 20h8', hint: 'Klik: usuń element · przeciągnij: obszar' },
  { id: 'eyedropper', label: 'Pipeta', key: 'I', icon: 'M14 4l6 6-2 2-6-6zM12 8l-8 8v4h4l8-8', hint: 'Klik: weź element do narzędzia' },
];

@Component({
  selector: 'app-tool-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (t of tools; track t.id) {
      <button
        type="button"
        class="tool"
        [class.is-on]="isOn(t)"
        [attr.aria-pressed]="isOn(t)"
        [title]="t.label + ' (' + t.key + ') — ' + t.hint"
        (click)="pick(t)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="t.icon" /></svg>
        <span class="tool__label">{{ t.label }}</span>
        <kbd class="tool__key">{{ t.key }}</kbd>
      </button>
    }
  `,
  host: { class: 'tool-bar', role: 'toolbar', 'aria-label': 'Narzędzia', 'aria-orientation': 'vertical' },
})
export class ToolBarComponent {
  readonly store = inject(EditorStore);
  readonly tools = TOOLS;

  isOn(t: ToolButton): boolean {
    const tool = this.store.tool();
    if (t.id === 'wall') return tool === 'edge' && !this.store.edgeItem().startsWith('door/');
    if (t.id === 'door') return tool === 'edge' && this.store.edgeItem().startsWith('door/');
    return tool === t.id;
  }

  pick(t: ToolButton): void {
    if (t.id === 'wall') {
      this.store.selectItem(this.store.wallItem());
      this.store.setTool('edge');
    } else if (t.id === 'door') this.store.selectItem(this.store.edgeItem().startsWith('door/') ? this.store.edgeItem() : 'door/grey');
    else this.store.setTool(t.id);
  }
}

export const TOOL_HINTS = TOOLS;

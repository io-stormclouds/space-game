import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { connectorOf, resolveItem } from '../domain/catalog/catalog';
import { cellOf } from '../domain/grid';
import { EditorStore } from '../state/editor-store';
import { TOOL_HINTS } from './tool-bar';

const TOOL_NAME: Record<string, string> = {
  select: 'Wybór',
  room: 'Pomieszczenie',
  floor: 'Podłoga',
  edge: 'Krawędź',
  object: 'Obiekt',
  erase: 'Gumka',
  eyedropper: 'Pipeta',
};

@Component({
  selector: 'app-status-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status__tool hud-signal">{{ toolName() }}</span>
    <span class="status__hint">{{ hint() }}</span>
    <span class="status__spacer"></span>
    @if (cursor(); as c) {
      <span>X {{ c.x }} · Z {{ c.z }} · pole {{ c.cx }},{{ c.cz }}</span>
    }
    <span>Pokład {{ store.level() }}</span>
    <span>{{ store.perf().instances }} inst. · {{ store.perf().drawCalls }} wyw. · {{ store.perf().fps }} FPS</span>
    @if (store.toast(); as t) {
      <span class="status__toast" [class.hud-alert]="t.kind === 'error'" role="status">{{ t.text }}</span>
    }
  `,
  host: { class: 'status hud-micro' },
})
export class StatusBarComponent {
  readonly store = inject(EditorStore);
  readonly toolName = computed(() => {
    const t = this.store.tool();
    const item = this.store.activeItem();
    const label = item ? resolveItem(item) : undefined;
    return label ? `${TOOL_NAME[t]}: ${label.entry.label}` : TOOL_NAME[t];
  });
  readonly hint = computed(() => {
    const t = this.store.tool();
    const picked = t === 'floor' ? resolveItem(this.store.floorItem()) : undefined;
    const connector = picked ? connectorOf(picked) : undefined;
    if (connector === 'stairs') return 'Klik: schody w polu · R: obrót · drugie podświetlone pole = wejście, szczyt pokład wyżej po przeciwnej stronie';
    if (connector === 'lift') return 'Klik: przystanek windy · R: obrót · drugie podświetlone pole = drzwi · szyb przedłużysz w inspektorze';
    const id = t === 'edge' ? (this.store.edgeItem().startsWith('door/') ? 'door' : 'wall') : t;
    return TOOL_HINTS.find((x) => x.id === id)?.hint ?? '';
  });
  readonly cursor = computed(() => {
    const c = this.store.cursor();
    if (!c) return null;
    const cell = cellOf(c.x, c.z);
    return { x: c.x.toFixed(1), z: c.z.toFixed(1), cx: cell.x, cz: cell.z };
  });
}

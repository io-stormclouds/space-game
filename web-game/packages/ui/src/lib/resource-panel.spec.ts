import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ResourceReadout } from '@space-game/hud-design-system/core';
import { ResourcePanel } from './resource-panel';

@Component({
  imports: [ResourcePanel],
  template: `<header hudResourcePanel [readouts]="readouts()" designation="KOL · TEST" subline="T+00:01"></header>`,
})
class Host {
  readonly readouts = signal<ResourceReadout[]>([]);
}

function render(readouts: ResourceReadout[]): HTMLElement {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.readouts.set(readouts);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ResourcePanel', () => {
  it('renders the DS markup: code, name, signed rate and value', () => {
    const el = render([{ id: 'fer', code: 'FER', label: 'Ferryt', value: 12400, rate: -0.5 }]);
    const res = el.querySelector('.hud-res')!;
    expect(el.querySelector('header')!.getAttribute('aria-label')).toBe('Surowce');
    expect(res.querySelector('.hud-res__code')!.textContent).toBe('FER');
    expect(res.querySelector('.hud-res__name')!.textContent).toBe('Ferryt');
    expect(res.querySelector('.hud-res__rate')!.textContent).toBe('−0,5/min');
    expect(res.querySelector('.hud-res__rate')!.classList).toContain('is-negative');
    // pl-PL groups thousands with a non-breaking space.
    expect(res.querySelector('.hud-res__value')!.textContent!.replace(/\s/g, ' ')).toBe('12 400');
    expect(res.getAttribute('data-state')).toBe('nominal');
    expect(res.querySelector('.hud-res__meter')).toBeNull();
  });

  it('marks stocks below thresholds as low and critical', () => {
    const el = render([
      { id: 'a', code: 'AAA', label: 'A', value: 40, lowBelow: 50, criticalBelow: 10 },
      { id: 'b', code: 'BBB', label: 'B', value: 5, lowBelow: 50, criticalBelow: 10 },
    ]);
    const [low, critical] = Array.from(el.querySelectorAll('.hud-res'));
    expect(low!.getAttribute('data-state')).toBe('low');
    expect(low!.querySelector('.hud-visually-hidden')!.textContent).toBe(', niski poziom');
    expect(critical!.getAttribute('data-state')).toBe('critical');
    expect(critical!.querySelector('.hud-res__led')!.classList).toContain('hud-blink');
  });

  it('shows a load as value/max with a lit meter and goes critical at the limit', () => {
    const el = render([
      { id: 'ene', code: 'ENE', label: 'Energia', kind: 'load', value: 21.5, max: 28, unit: 'MW' },
      { id: 'pop', code: 'POP', label: 'Załoga', kind: 'load', value: 45, max: 45 },
    ]);
    const [ene, pop] = Array.from(el.querySelectorAll('.hud-res'));
    expect(ene!.querySelector('.hud-res__value')!.textContent).toBe('21,5/28MW');
    expect(ene!.querySelectorAll('.hud-res__seg')).toHaveLength(10);
    expect(ene!.querySelectorAll('.hud-res__seg.is-lit')).toHaveLength(8);
    expect(pop!.getAttribute('data-state')).toBe('critical');
  });
});

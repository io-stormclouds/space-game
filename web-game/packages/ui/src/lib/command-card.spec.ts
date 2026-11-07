import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CommandCard, type CommandSlot } from './command-card';

@Component({
  imports: [CommandCard],
  template: `<hud-command-card title="CMD" context="Port" [columns]="4" [rows]="2" [slots]="slots()" />
    <input id="field" />`,
})
class Host {
  readonly slots = signal<Array<CommandSlot | null>>([]);
}

function setup(slots: Array<CommandSlot | null>): { fixture: ComponentFixture<Host>; el: HTMLElement } {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.slots.set(slots);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

describe('CommandCard', () => {
  afterEach(() => vi.useRealTimers());

  it('fills the grid with commands and numbered empty cells', () => {
    const { el } = setup([{ id: 'a', label: 'Buduj', hotkey: 'B' }, null, { id: 'c', label: 'Stop' }]);
    expect(el.querySelectorAll('.hud-cmd__cell')).toHaveLength(8);
    expect(el.querySelectorAll('button.rts-btn--cell')).toHaveLength(2);
    const empty = Array.from(el.querySelectorAll('.hud-cmd__slot-no')).map((s) => s.textContent);
    expect(empty).toEqual(['02', '04', '05', '06', '07', '08']);
    expect(el.querySelector('section')!.getAttribute('aria-label')).toBe('CMD: Port');
    expect(el.querySelector('.hud-frame__label')!.textContent).toBe('CMD');
  });

  it('runs a command by hotkey, flashes it for 70 ms and shows it in the inspector', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const { fixture, el } = setup([{ id: 'a', label: 'Buduj', hotkey: 'B', description: 'Otwiera katalog', onActivate: run }]);

    const e = press('b');
    fixture.detectChanges();
    expect(run).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    expect(el.querySelector('button')!.hasAttribute('data-flash')).toBe(true);
    expect(el.querySelector('.hud-cmd__insp-title')!.textContent).toBe('Buduj');
    expect(el.querySelector('.hud-cmd__insp-desc')!.textContent).toBe('Otwiera katalog');

    vi.advanceTimersByTime(70);
    fixture.detectChanges();
    expect(el.querySelector('button')!.hasAttribute('data-flash')).toBe(false);
  });

  it('ignores hotkeys with modifiers, repeats and keys typed into a field', () => {
    const run = vi.fn();
    const { el } = setup([{ id: 'a', label: 'Buduj', hotkey: 'B', onActivate: run }]);
    press('b', { ctrlKey: true });
    press('b', { repeat: true });
    press('b', {}, el.querySelector('#field')!);
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps a blocked command focusable, explains why and does not run it', () => {
    const run = vi.fn();
    const { fixture, el } = setup([{ id: 'u', label: 'Rozbuduj', hotkey: 'U', disabledReason: 'BRAK: FER 40', onActivate: run }]);
    const button = el.querySelector('button')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    const reason = el.querySelector(`#${button.getAttribute('aria-describedby')}`)!;
    expect(reason.textContent).toBe('BRAK: FER 40');

    button.click();
    press('u');
    fixture.detectChanges();
    expect(run).not.toHaveBeenCalled();
    expect(el.querySelector('.hud-cmd__insp-reason')!.textContent).toBe('BRAK: FER 40');
  });
});

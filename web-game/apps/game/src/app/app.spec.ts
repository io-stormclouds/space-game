import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App shell', () => {
  it('shows the sample resource bar, the world view frame and the spaceport commands', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const codes = Array.from(el.querySelectorAll('.hud-res__code')).map((c) => c.textContent);
    expect(codes).toEqual(['FER', 'SIL', 'KRI', 'KAR', 'STA', 'BET', 'ENE', 'POP']);
    expect(el.querySelector('.hud-resbar__name')!.textContent).toBe('KOL · TAU-CETI/E');
    expect(el.querySelector('h1')!.textContent).toBe('Widok świata');
    expect(el.querySelectorAll('.hud-cmd button')).toHaveLength(6);
  });

  it('records the last command run from the card', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('.hud-cmd button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.shell__log-value')!.textContent).toBe('Produkuj łazik');
  });
});

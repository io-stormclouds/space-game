import type { CommandSlot, ResourceReadout } from '@space-game/ui';
import type { Dictionary } from '../i18n/pl';

// Static sample for the F0 shell, copied from the canvas board "Kolonia" with the spaceport
// selected. It goes away in F2, when the shell reads the same values from GameApi.

type Code = keyof Dictionary['resources'];

const READOUTS: ReadonlyArray<Omit<ResourceReadout, 'id' | 'label'> & { code: Code }> = [
  { code: 'FER', value: 312, rate: 6.4 },
  { code: 'SIL', value: 188, rate: 2 },
  { code: 'KRI', value: 240, rate: 2 },
  // The board shows Karbonit as low ("brak kopalni"); the threshold only reproduces that state.
  { code: 'KAR', value: 46, rate: 0, lowBelow: 50 },
  { code: 'STA', value: 455 },
  { code: 'BET', value: 96 },
  { code: 'ENE', kind: 'load', value: 21.5, max: 28, unit: 'MW' },
  { code: 'POP', kind: 'load', value: 38, max: 45 },
];

export function sampleReadouts(t: Dictionary): ResourceReadout[] {
  return READOUTS.map((r) => ({ ...r, id: r.code, label: t.resources[r.code] }));
}

/** The spaceport's six commands from the board; two cells of the 4×2 card stay empty. */
export function sampleCommands(t: Dictionary, run: (label: string) => void): Array<CommandSlot | null> {
  const c = t.sample.commands;
  return [
    {
      id: 'produce-rover',
      label: c.produceRover.label,
      hotkey: 'Q',
      icon: 'produce',
      variant: 'primary',
      cost: [
        { code: 'FER', amount: 20 },
        { code: 'SIL', amount: 5 },
      ],
      description: c.produceRover.description,
      onActivate: () => run(c.produceRover.label),
    },
    {
      id: 'call-shuttle',
      label: c.callShuttle.label,
      hotkey: 'T',
      icon: 'move',
      description: c.callShuttle.description,
      onActivate: () => run(c.callShuttle.label),
    },
    {
      id: 'upgrade',
      label: c.upgrade.label,
      hotkey: 'U',
      icon: 'upgrade',
      cost: [
        { code: 'FER', amount: 2400, missing: true },
        { code: 'SIL', amount: 1200, missing: true },
        { code: 'STA', amount: 600, missing: true },
      ],
      disabledReason: c.upgrade.reason,
      onActivate: () => run(c.upgrade.label),
    },
    {
      id: 'rally-point',
      label: c.rallyPoint.label,
      hotkey: 'Y',
      icon: 'rally',
      description: c.rallyPoint.description,
      onActivate: () => run(c.rallyPoint.label),
    },
    {
      id: 'colony-report',
      label: c.colonyReport.label,
      hotkey: 'R',
      description: c.colonyReport.description,
      onActivate: () => run(c.colonyReport.label),
    },
    {
      id: 'ark-hold',
      label: c.arkHold.label,
      hotkey: 'L',
      description: c.arkHold.description,
      onActivate: () => run(c.arkHold.label),
    },
  ];
}

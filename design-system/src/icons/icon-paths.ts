// Stroke icon paths on a 24px grid. Draw them with stroke-width 1.75, square caps and mitred joins.

export const iconPaths = {
  produce: 'M4 4h16v16H4z M12 8v8 M8 12h8',
  research: 'M9 3h6 M10 3v6L5 19h14L14 9V3 M7.5 14h9',
  build: 'M4 20V9l8-5 8 5v11 M3 20h18 M9 20v-6h6v6',
  upgrade: 'M6 13l6-6 6 6 M6 19l6-6 6 6',
  move: 'M4 12h15 M14 7l5 5-5 5',
  stop: 'M6 6h12v12H6z',
  rally: 'M6 21V4h11l-2 4 2 4H6',
  harvest: 'M4 20l9-9 M13 3l8 8-3 3-8-8z',
  repeat: 'M4 9h13l-3-3 M20 15H7l3 3',
  cancel: 'M6 6l12 12 M18 6L6 18',
} as const;

export type IconName = keyof typeof iconPaths;

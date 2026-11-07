import type { SVGProps } from 'react';

// Stroke icons drawn on a 24px grid with square caps and mitred joins — no rounded ends.

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function make(d: string) {
  return function HudIcon({ size = 20, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        <path d={d} />
      </svg>
    );
  };
}

export const IconProduce = make('M4 4h16v16H4z M12 8v8 M8 12h8');
export const IconResearch = make('M9 3h6 M10 3v6L5 19h14L14 9V3 M7.5 14h9');
export const IconBuild = make('M4 20V9l8-5 8 5v11 M3 20h18 M9 20v-6h6v6');
export const IconUpgrade = make('M6 13l6-6 6 6 M6 19l6-6 6 6');
export const IconMove = make('M4 12h15 M14 7l5 5-5 5');
export const IconStop = make('M6 6h12v12H6z');
export const IconRally = make('M6 21V4h11l-2 4 2 4H6');
export const IconHarvest = make('M4 20l9-9 M13 3l8 8-3 3-8-8z');
export const IconRepeat = make('M4 9h13l-3-3 M20 15H7l3 3');
export const IconCancel = make('M6 6l12 12 M18 6L6 18');

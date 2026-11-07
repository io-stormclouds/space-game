import type { SVGProps } from 'react';
import { iconPaths } from './icon-paths';

// Stroke icons drawn on a 24px grid with square caps and mitred joins — no rounded ends.
// Path data lives in icon-paths.ts so other frameworks draw the same icons.

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

export const IconProduce = make(iconPaths.produce);
export const IconResearch = make(iconPaths.research);
export const IconBuild = make(iconPaths.build);
export const IconUpgrade = make(iconPaths.upgrade);
export const IconMove = make(iconPaths.move);
export const IconStop = make(iconPaths.stop);
export const IconRally = make(iconPaths.rally);
export const IconHarvest = make(iconPaths.harvest);
export const IconRepeat = make(iconPaths.repeat);
export const IconCancel = make(iconPaths.cancel);

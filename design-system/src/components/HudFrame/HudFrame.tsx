import { createElement, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import './HudFrame.css';

export interface HudFrameProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'aside' | 'header' | 'nav';
  /** Tab label sitting on the top edge, e.g. "CMD". */
  label?: string;
  /** Serial / version tag in the bottom-right corner, e.g. "CC-04 · R2". */
  serial?: string;
  /** Signal-coloured angle ticks on the four corners. */
  ticks?: boolean;
  children?: ReactNode;
}

/** Bordered HUD container: 1px metal edge, corner ticks, label tab and serial tag. No shadows. */
export function HudFrame({ as = 'section', label, serial, ticks = true, className, children, ...rest }: HudFrameProps) {
  return createElement(
    as,
    { className: cx('hud-frame', className), ...rest },
    ticks && (
      <span className="hud-frame__ticks" aria-hidden="true">
        <span className="hud-frame__tick hud-frame__tick--tl" />
        <span className="hud-frame__tick hud-frame__tick--tr" />
        <span className="hud-frame__tick hud-frame__tick--bl" />
        <span className="hud-frame__tick hud-frame__tick--br" />
      </span>
    ),
    label && (
      <span className="hud-frame__label" aria-hidden="true">
        {label}
      </span>
    ),
    children,
    serial && (
      <span className="hud-frame__serial" aria-hidden="true">
        {serial}
      </span>
    ),
  );
}

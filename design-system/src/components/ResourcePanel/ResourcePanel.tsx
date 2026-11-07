import type { ReactNode } from 'react';
import {
  RESOURCE_METER_SEGMENTS,
  resourceRatio,
  resourceState,
  type ResourceReadout,
  type ResourceState,
} from '../../core/resources';
import { cx } from '../../utils/cx';
import { formatLoad, formatQty, formatRate } from '../../utils/format';
import './ResourcePanel.css';

export { resourceState, type ResourceReadout, type ResourceState };

export interface ResourcePanelProps {
  readouts: readonly ResourceReadout[];
  /** Left block, e.g. colony designation "KOL · TAU-CETI/E". */
  designation?: string;
  /** Micro line above the designation, e.g. "T+01:19:40". */
  subline?: string;
  /** Decorative serial in the right corner. */
  serial?: string;
  /** Extra controls on the right (time scale, menu). */
  trailing?: ReactNode;
  className?: string;
}

const SEGMENTS = RESOURCE_METER_SEGMENTS;

const STATE_TEXT: Record<ResourceState, string> = {
  nominal: '',
  low: 'niski poziom',
  critical: 'stan krytyczny',
};

/** Narrow top bar: micro label row over a tabular value, optional 10-segment meter. */
export function ResourcePanel({ readouts, designation, subline, serial, trailing, className }: ResourcePanelProps) {
  return (
    <header className={cx('hud-resbar', className)} aria-label="Surowce">
      {designation && (
        <div className="hud-resbar__id">
          {subline && <span className="hud-micro">{subline}</span>}
          <span className="hud-resbar__name">{designation}</span>
        </div>
      )}
      <dl className="hud-resbar__list">
        {readouts.map((r) => {
          const state = resourceState(r);
          const ratio = resourceRatio(r);
          const lit = ratio === undefined ? 0 : Math.round(ratio * SEGMENTS);
          const isLoad = r.kind === 'load';
          return (
            <div key={r.id} className="hud-res" data-state={state}>
              <dt className="hud-res__meta">
                <span className={cx('hud-res__led', state === 'critical' && 'hud-blink')} aria-hidden="true" />
                <span className="hud-res__code">{r.code}</span>
                <span className="hud-res__name">{r.label}</span>
                {r.rate !== undefined && (
                  <span className={cx('hud-res__rate', r.rate < 0 && 'is-negative')}>{formatRate(r.rate)}/min</span>
                )}
              </dt>
              <dd className="hud-res__data">
                <span className="hud-res__value">
                  {isLoad ? formatLoad(r.value) : formatQty(r.value)}
                  {r.max !== undefined && (
                    <span className="hud-res__max">/{isLoad ? formatLoad(r.max) : formatQty(r.max)}</span>
                  )}
                  {r.unit && <span className="hud-res__unit">{r.unit}</span>}
                </span>
                {ratio !== undefined && (
                  <span className="hud-res__meter" aria-hidden="true">
                    {Array.from({ length: SEGMENTS }, (_, i) => (
                      <span key={i} className={cx('hud-res__seg', i < lit && 'is-lit')} />
                    ))}
                  </span>
                )}
                {state !== 'nominal' && <span className="hud-visually-hidden">, {STATE_TEXT[state]}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {trailing && <div className="hud-resbar__trail">{trailing}</div>}
      {serial && (
        <span className="hud-resbar__serial" aria-hidden="true">
          {serial}
        </span>
      )}
    </header>
  );
}

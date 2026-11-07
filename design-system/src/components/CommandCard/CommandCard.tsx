import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import { formatQty } from '../../utils/format';
import { HudFrame } from '../HudFrame/HudFrame';
import { RTSButton, type Cost, type RTSButtonHandle, type RTSButtonVariant } from '../RTSButton/RTSButton';
import './CommandCard.css';

export interface CommandSlot {
  id: string;
  label: string;
  hotkey?: string;
  icon?: ReactNode;
  cost?: readonly Cost[];
  /** One line shown in the inspector, e.g. "Szkoli piechotę. 18 s." */
  description?: string;
  disabledReason?: string;
  progress?: number;
  selected?: boolean;
  variant?: RTSButtonVariant;
  onActivate?: () => void;
}

export interface CommandCardProps {
  /** Tab on the frame edge, e.g. "CMD". */
  title: string;
  /** What the commands belong to, e.g. "KOSZARY-02 · POZ. 2". */
  context?: string;
  /** Right side of the header, e.g. "KOLEJKA 1/5". */
  status?: string;
  serial?: string;
  columns?: number;
  rows?: number;
  /** Slot order is grid order; `null` (or a short array) leaves an empty, inert cell. */
  slots: ReadonlyArray<CommandSlot | null>;
  /** Listen for slot hotkeys on the window while mounted. Ignored while typing in a field. */
  hotkeys?: boolean;
  className?: string;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/**
 * Bottom-right command panel: a fixed grid of action cells divided by 1px lines,
 * a header with the selected object and an inspector line for the hovered/focused command.
 */
export function CommandCard({
  title,
  context,
  status,
  serial,
  columns = 4,
  rows = 3,
  slots,
  hotkeys = true,
  className,
}: CommandCardProps) {
  const cells = Array.from({ length: columns * rows }, (_, i) => slots[i] ?? null);
  const handles = useRef(new Map<string, RTSButtonHandle>());
  const latest = useRef(cells);
  latest.current = cells;
  const [inspectId, setInspectId] = useState<string | null>(null);

  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const slot = latest.current.find((s) => s?.hotkey && s.hotkey.toUpperCase() === key.toUpperCase());
      if (!slot) return;
      e.preventDefault();
      setInspectId(slot.id);
      handles.current.get(slot.id)?.activate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys]);

  const inspected = cells.find((s) => s?.id === inspectId) ?? null;

  return (
    <HudFrame as="section" label={title} serial={serial} className={cx('hud-cmd', className)} aria-label={`${title}: ${context ?? 'rozkazy'}`}>
      <div className="hud-cmd__head">
        <span className="hud-cmd__context">{context}</span>
        {status && <span className="hud-micro">{status}</span>}
      </div>

      <div
        className="hud-cmd__grid"
        role="group"
        aria-label="Rozkazy"
        style={{ '--cols': columns, '--rows': rows } as CSSProperties}
        onMouseLeave={() => setInspectId(null)}
      >
        {cells.map((slot, i) =>
          slot ? (
            <div
              key={slot.id}
              className="hud-cmd__cell"
              onMouseEnter={() => setInspectId(slot.id)}
              onFocus={() => setInspectId(slot.id)}
            >
              <RTSButton
                ref={(h) => {
                  if (h) handles.current.set(slot.id, h);
                  else handles.current.delete(slot.id);
                }}
                layout="cell"
                label={slot.label}
                hotkey={slot.hotkey}
                icon={slot.icon}
                cost={slot.cost}
                disabledReason={slot.disabledReason}
                progress={slot.progress}
                selected={slot.selected}
                variant={slot.variant}
                onActivate={slot.onActivate}
              />
            </div>
          ) : (
            <div key={`empty-${i}`} className="hud-cmd__cell hud-cmd__cell--empty hud-dots" aria-hidden="true">
              <span className="hud-cmd__slot-no">{String(i + 1).padStart(2, '0')}</span>
            </div>
          ),
        )}
      </div>

      <div className="hud-cmd__inspector">
        {inspected ? (
          <>
            <div className="hud-cmd__insp-head">
              <span className="hud-cmd__insp-title">{inspected.label}</span>
              {inspected.hotkey && <span className="hud-micro">KLAWISZ · {inspected.hotkey}</span>}
            </div>
            {inspected.cost && inspected.cost.length > 0 && (
              <div className="hud-cmd__insp-cost">
                {inspected.cost.map((c) => (
                  <span key={c.code} className={cx(c.missing && 'hud-alert')}>
                    {c.code} {formatQty(c.amount)}
                  </span>
                ))}
              </div>
            )}
            {inspected.disabledReason ? (
              <span className="hud-cmd__insp-reason">{inspected.disabledReason}</span>
            ) : (
              inspected.description && <span className="hud-cmd__insp-desc">{inspected.description}</span>
            )}
          </>
        ) : (
          <span className="hud-micro">Wskaż rozkaz lub użyj klawisza skrótu</span>
        )}
      </div>
    </HudFrame>
  );
}

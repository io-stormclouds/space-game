import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { motion } from '../../tokens/design-tokens';
import { cx } from '../../utils/cx';
import { formatQty } from '../../utils/format';
import './RTSButton.css';

/** One line of a cost, e.g. `{ code: 'MET', amount: 150 }`; `missing` marks the shortfall. */
export interface Cost {
  code: string;
  amount: number;
  missing?: boolean;
}

export type RTSButtonVariant = 'default' | 'primary' | 'danger';
/** `wide`: standalone action with cost and reason lines. `cell`: compact command-card slot. */
export type RTSButtonLayout = 'wide' | 'cell';

export interface RTSButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled' | 'children' | 'type'> {
  label: string;
  hotkey?: string;
  icon?: ReactNode;
  cost?: readonly Cost[];
  /**
   * Why the action is unavailable, e.g. "BRAK KRYSZTAŁU: −40". When set the button is
   * `aria-disabled` (still focusable, so the reason can be read) and activation is ignored.
   */
  disabledReason?: string;
  variant?: RTSButtonVariant;
  layout?: RTSButtonLayout;
  /** Toggle state (placement mode, autocast). Renders `aria-pressed`. */
  selected?: boolean;
  /** 0..1 while the action is running (production, research). */
  progress?: number;
  onActivate?: () => void;
}

export interface RTSButtonHandle {
  /** Press the button programmatically (hotkeys): flashes inverted and calls `onActivate`. */
  activate(): void;
  focus(): void;
}

const FLASH_MS = parseInt(motion.flash, 10);

/**
 * Chamfered action button. Every state change is an instant swap of edge/fill/ink:
 * hover lights the edge, press inverts to a solid signal block, disabled is hatched.
 */
export const RTSButton = forwardRef<RTSButtonHandle, RTSButtonProps>(function RTSButton(
  {
    label,
    hotkey,
    icon,
    cost,
    disabledReason,
    variant = 'default',
    layout = 'wide',
    selected,
    progress,
    onActivate,
    className,
    ...rest
  },
  ref,
) {
  const el = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState(false);
  const reasonId = useId();
  const blocked = Boolean(disabledReason);

  const activate = useCallback(() => {
    if (blocked) return;
    window.clearTimeout(timer.current);
    setFlash(true);
    timer.current = window.setTimeout(() => setFlash(false), FLASH_MS);
    onActivate?.();
  }, [blocked, onActivate]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useImperativeHandle(ref, () => ({ activate, focus: () => el.current?.focus() }), [activate]);

  const pct = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
  const wide = layout === 'wide';

  return (
    <>
      <button
        ref={el}
        type="button"
        className={cx('rts-btn', `rts-btn--${layout}`, variant !== 'default' && `rts-btn--${variant}`, className)}
        aria-disabled={blocked || undefined}
        aria-pressed={selected === undefined ? undefined : selected}
        aria-describedby={blocked ? reasonId : undefined}
        aria-keyshortcuts={hotkey}
        data-flash={flash || undefined}
        data-busy={pct !== undefined || undefined}
        onClick={activate}
        {...rest}
      >
        <span className="rts-btn__face">
          {icon && (
            <span className="rts-btn__icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="rts-btn__body">
            <span className="rts-btn__label">{label}</span>
            {pct !== undefined && <span className="hud-visually-hidden">, w toku {Math.round(pct * 100)}%</span>}
            {wide && cost && cost.length > 0 && (
              <span className="rts-btn__cost">
                {cost.map((c) => (
                  <span key={c.code} className={cx('rts-btn__price', c.missing && 'is-missing')}>
                    <span className="rts-btn__price-code">{c.code}</span>
                    {formatQty(c.amount)}
                  </span>
                ))}
              </span>
            )}
            {wide && blocked && (
              <span id={reasonId} className="rts-btn__reason">
                {disabledReason}
              </span>
            )}
          </span>
          {hotkey && (
            <span className="rts-btn__key" aria-hidden="true">
              {hotkey}
            </span>
          )}
          {pct !== undefined && (
            <span className="rts-btn__progress" aria-hidden="true" style={{ '--p': pct } as CSSProperties} />
          )}
        </span>
      </button>
      {!wide && blocked && (
        <span id={reasonId} className="hud-visually-hidden">
          {disabledReason}
        </span>
      )}
    </>
  );
});

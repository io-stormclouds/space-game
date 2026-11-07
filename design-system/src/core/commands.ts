// Framework-free types of action buttons and the command card.

/** One line of a cost, e.g. `{ code: 'MET', amount: 150 }`; `missing` marks the shortfall. */
export interface Cost {
  code: string;
  amount: number;
  missing?: boolean;
}

export type RTSButtonVariant = 'default' | 'primary' | 'danger';
/** `wide`: standalone action with cost and reason lines. `cell`: compact command-card slot. */
export type RTSButtonLayout = 'wide' | 'cell';

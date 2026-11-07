export type BodyId = string & { readonly __brand: 'BodyId' };
export type ShipId = string & { readonly __brand: 'ShipId' };
export type RoverId = string & { readonly __brand: 'RoverId' };

export const bodyId = (s: string): BodyId => s as BodyId;
export const shipId = (s: string): ShipId => s as ShipId;
export const roverId = (s: string): RoverId => s as RoverId;

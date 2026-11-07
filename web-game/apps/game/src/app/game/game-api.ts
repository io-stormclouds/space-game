import { InjectionToken } from '@angular/core';
import { createWorkerGameApi, type GameApi, type WorkerLike } from '@space-game/api';

/** Factory of the GameApi the app talks to. Tests provide an in-thread one. */
export const GAME_API = new InjectionToken<() => GameApi>('GAME_API', {
  providedIn: 'root',
  factory: () => () => {
    const worker = new Worker(new URL('./game.worker', import.meta.url), { type: 'module', name: 'mock-server' });
    return createWorkerGameApi(worker as unknown as WorkerLike);
  },
});

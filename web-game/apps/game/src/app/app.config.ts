import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { appViewFactories } from './world/view-factories';
import { VIEW_FACTORIES } from './world/view-factories.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
    { provide: VIEW_FACTORIES, useFactory: appViewFactories },
  ],
};

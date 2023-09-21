// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { Blazor, IBlazor } from '../GlobalExports';
import { AfterBlazorServerStartedCallback, BeforeBlazorServerStartedCallback, CircuitStartOptions, ServerInitializers } from '../Platform/Circuits/CircuitStartOptions';
import { LogLevel, Logger } from '../Platform/Logging/Logger';
import { AfterBlazorWebAssemblyStartedCallback, BeforeBlazorWebAssemblyStartedCallback, WebAssemblyInitializers, WebAssemblyStartOptions } from '../Platform/WebAssemblyStartOptions';
import { WebStartOptions } from '../Platform/WebStartOptions';
import { firstRendererAttached } from '../Rendering/WebRendererInteropMethods';

type BeforeBlazorStartedCallback = (...args: unknown[]) => Promise<void>;
export type AfterBlazorStartedCallback = (blazor: typeof Blazor) => Promise<void>;
type BeforeBlazorWebStartedCallback = (options: WebStartOptions) => Promise<void>;
type AfterBlazorWebStartedCallback = (blazor: IBlazor) => Promise<void>;
export type BlazorInitializer = {
  beforeStart: BeforeBlazorStartedCallback,
  afterStarted: AfterBlazorStartedCallback,
  beforeWebStart: BeforeBlazorWebStartedCallback,
  afterWebStarted: AfterBlazorWebStartedCallback,
  beforeWebAssemblyStart: BeforeBlazorWebAssemblyStartedCallback,
  afterWebAssemblyStarted: AfterBlazorWebAssemblyStartedCallback,
  beforeServerStart: BeforeBlazorServerStartedCallback,
  afterServerStarted: AfterBlazorServerStartedCallback,
};

export class JSInitializer {
  private afterStartedCallbacks: AfterBlazorStartedCallback[] = [];

  constructor(private singleRuntime = true, private logger?: Logger, private afterstartedCallbacks?: AfterBlazorStartedCallback[]) {
    if (afterstartedCallbacks) {
      this.afterStartedCallbacks.push(...afterstartedCallbacks);
    }
  }

  async importInitializersAsync(initializerFiles: string[], initializerArguments: unknown[]): Promise<void> {
    // This code is not called on WASM, because library intializers are imported by runtime.

    await Promise.all(initializerFiles.map(f => importAndInvokeInitializer(this, f)));

    function adjustPath(path: string): string {
      // This is the same we do in JS interop with the import callback
      const base = document.baseURI;
      path = base.endsWith('/') ? `${base}${path}` : `${base}/${path}`;
      return path;
    }

    async function importAndInvokeInitializer(jsInitializer: JSInitializer, path: string): Promise<void> {
      const adjustedPath = adjustPath(path);
      const initializer = await import(/* webpackIgnore: true */ adjustedPath) as Partial<BlazorInitializer>;
      if (initializer === undefined) {
        return;
      }

      const { beforeStart, afterStarted, beforeWebStart, afterWebStarted, beforeWebAssemblyStart, afterWebAssemblyStarted, beforeServerStart, afterServerStarted } = initializer;
      if (!jsInitializer.singleRuntime) {
        if (beforeStart || afterStarted) {
          // log warning "classic initializers will be ignored when multiple runtimes are used".
          // Skipping "adjustedPath" initializer.
          jsInitializer.logger?.log(
            LogLevel.Warning,
            `Initializer '${adjustedPath}' will be ignored because multiple runtimes are available. use 'before(web|webAssembly|server)Start' and 'after(web|webAssembly|server)Started?' instead.)`
          );
        }

        if (afterWebStarted) {
          jsInitializer.afterStartedCallbacks.push(afterWebStarted);
        }

        if (beforeWebAssemblyStart) {
          const options = initializerArguments[0] as WebStartOptions;
          if (!options.webAssembly) {
            options.webAssembly = {} as WebAssemblyStartOptions;
          }
          const partialWebAssemblyStartOptions = options.webAssembly as Partial<WebAssemblyStartOptions>;
          if (!partialWebAssemblyStartOptions.initializers) {
            partialWebAssemblyStartOptions.initializers = { beforeStart: [], afterStarted: [] };
          }
          partialWebAssemblyStartOptions.initializers.beforeStart.push(beforeWebAssemblyStart);
        }

        const options = initializerArguments[0] as WebStartOptions;
        ensureInitializers(options);

        if (beforeWebAssemblyStart) {
          options.webAssembly.initializers.beforeStart.push(beforeWebAssemblyStart);
        }

        if (afterWebAssemblyStarted) {
          options.webAssembly.initializers.afterStarted.push(afterWebAssemblyStarted);
        }

        if (beforeServerStart) {
          options.circuit.initializers.beforeStart.push(beforeServerStart);
        }

        if (afterServerStarted) {
          options.circuit.initializers.afterStarted.push(afterServerStarted);
        }

        if (afterWebStarted) {
          jsInitializer.afterStartedCallbacks.push(afterWebStarted);
        }

        if (beforeWebStart) {
          return beforeWebStart(options);
        }
      } else {
        if (afterStarted) {
          jsInitializer.afterStartedCallbacks.push(afterStarted);
        }

        if (beforeStart) {
          return beforeStart(...initializerArguments);
        }
      }

      function ensureInitializers(options: Partial<WebStartOptions>):
        asserts options is OptionsWithInitializers {
        if (!options['webAssembly']) {
          options['webAssembly'] = ({ initializers: { beforeStart: [], afterStarted: [] } }) as unknown as WebAssemblyStartOptions;
        } else if (!options['webAssembly'].initializers) {
          options['webAssembly'].initializers = { beforeStart: [], afterStarted: [] };
        }

        if (!options['circuit']) {
          options['circuit'] = ({ initializers: { beforeStart: [], afterStarted: [] } }) as unknown as CircuitStartOptions;
        } else if (!options['circuit'].initializers) {
          options['circuit'].initializers = { beforeStart: [], afterStarted: [] };
        }
      }
    }
  }

  async invokeAfterStartedCallbacks(blazor: typeof Blazor): Promise<void> {
    await firstRendererAttached;
    await Promise.all(this.afterStartedCallbacks.map(callback => callback(blazor)));
  }
}

type OptionsWithInitializers = {
  webAssembly: WebAssemblyStartOptions & { initializers: WebAssemblyInitializers },
  circuit: CircuitStartOptions & { initializers: ServerInitializers }}

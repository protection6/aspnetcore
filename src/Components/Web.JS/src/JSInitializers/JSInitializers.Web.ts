// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { Logger } from '../Platform/Logging/Logger';
import { WebStartOptions } from '../Platform/WebStartOptions';
import { JSInitializer } from './JSInitializers';

export async function fetchAndInvokeInitializers(options: Partial<WebStartOptions>, logger: Logger) : Promise<JSInitializer> {
  const jsInitializersResponse = await fetch('_blazor/initializers', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-cache',
  });

  const initializers: string[] = await jsInitializersResponse.json();
  const jsInitializer = new JSInitializer(false, logger);
  await jsInitializer.importInitializersAsync(initializers, [options]);
  return jsInitializer;
}

// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { Logger } from '../Platform/Logging/Logger';
import { WebStartOptions } from '../Platform/WebStartOptions';
import { JSInitializer } from './JSInitializers';

export async function fetchAndInvokeInitializers(options: Partial<WebStartOptions>, logger: Logger) : Promise<JSInitializer> {
  const initializersElement = document.getElementById('blazor-web-initializers');
  const initializers: string[] = initializersElement?.innerText ? JSON.parse(initializersElement.innerText) : [];
  const jsInitializer = new JSInitializer(false, logger);
  await jsInitializer.importInitializersAsync(initializers, [options]);
  return jsInitializer;
}

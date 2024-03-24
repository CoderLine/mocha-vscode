/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

export const last = <T>(it: Iterable<T>): T | undefined => {
  let last: T | undefined;
  for (const item of it) {
    last = item;
  }
  return last;
};

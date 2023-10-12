/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { identityMapping, IMappingAccessor, parseSourceMap } from './source-map';

export interface ISourceMapMaintainer {
  compiledUri: vscode.Uri;
  value: Promise<IMappingAccessor> | undefined;
  refresh(fileContents?: string): Promise<IMappingAccessor>;
  dispose(): void;
}

/** Extension-wide sourcemap store used for location mapping. */
export class SourceMapStore {
  private readonly maps = new Map<
    string,
    {
      rc: number;
      accessor?: Promise<IMappingAccessor>;
    }
  >();

  /**
   * Checks out a source map accessor of the given URI. Expects the consumer
   * to watch file changes and call refresh() if the child changes.
   */
  public maintain(uri: vscode.Uri): ISourceMapMaintainer {
    const maps = this.maps;
    const key = uri.toString();

    let rec = maps.get(key)!;
    if (!rec) {
      rec = { rc: 0 };
      maps.set(key, rec);
    }
    rec.rc++;

    return {
      compiledUri: uri,
      get value() {
        return rec.accessor;
      },
      async refresh(contents) {
        const contentsProm = fs.readFile(uri.fsPath, 'utf8') || Promise.resolve(contents);
        return (rec.accessor = contentsProm.then(
          (c) => parseSourceMap(uri, c),
          () => identityMapping(uri),
        ));
      },
      dispose() {
        if (--rec.rc === 0) {
          maps.delete(key);
        }
      },
    };
  }
}

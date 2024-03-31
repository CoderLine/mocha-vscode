/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { dataUriToBuffer } from 'data-uri-to-buffer';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';

const smUrlComment = '//# sourceMappingURL=';

export interface IMappingAccessor {
  /**
   * @param line base-0 line
   * @param col base-0 column
   */
  originalPositionFor(line: number, col: number): vscode.Location;
}

export const identityMapping = (file: vscode.Uri): IMappingAccessor => ({
  originalPositionFor(line, col) {
    return new vscode.Location(file, new vscode.Position(line, col));
  },
});

const smMappingAccessor = (file: vscode.Uri, sm: TraceMap): IMappingAccessor => ({
  originalPositionFor(line, column) {
    const {
      source,
      line: smLine,
      column: smCol,
    } = originalPositionFor(sm, { line: line + 1, column: column });
    if (!source) {
      return new vscode.Location(file, new vscode.Position(line, column));
    }

    return new vscode.Location(vscode.Uri.parse(source), new vscode.Position(smLine - 1, smCol));
  },
});

export const parseSourceMap = (
  path: vscode.Uri,
  contents: string,
): IMappingAccessor | Promise<IMappingAccessor> => {
  const start = contents.lastIndexOf(smUrlComment);
  if (start === -1) {
    return identityMapping(path);
  }

  let end = contents.indexOf('\n', start + smUrlComment.length);
  if (end === -1) {
    end = contents.length;
  }

  const sourceMapUrl = contents.slice(start + smUrlComment.length, end).trim();
  return parseSourceMapURL(path, sourceMapUrl);
};

export const parseSourceMapURL = (path: vscode.Uri, sourceMapUrl: string) => {
  const pathAsStr = path.toString();
  if (sourceMapUrl.startsWith('data:')) {
    const data = dataUriToBuffer(sourceMapUrl);
    return smMappingAccessor(path, new TraceMap(data.toString(), pathAsStr));
  }

  const sourceMapPath = fileURLToPath(new URL(sourceMapUrl, pathAsStr).toString());
  try {
    return fs
      .readFile(sourceMapPath, 'utf8')
      .then((c) => smMappingAccessor(path, new TraceMap(c, pathAsStr)))
      .catch(() => identityMapping(path));
  } catch {
    return identityMapping(path);
  }
};

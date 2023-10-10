/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { replaceVariables } from '@c4312/vscode-variables';
import { Contract } from '@hediet/json-rpc';
import { NodeJsMessageStream } from '@hediet/json-rpc-streams/src';
import { promises as fs } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import { last } from './iterable';
import { ItemType, getContainingItemsForFile, testMetadata } from './metadata';
import { OutputQueue } from './outputQueue';
import { CompleteStatus, ILog, Result, contract } from './runner-protocol';
import { SourceMapStore } from './source-map-store';

let socketCounter = 0;
const socketDir = process.platform === 'win32' ? '\\\\.\\pipe\\' : tmpdir();
const getRandomPipe = () => join(socketDir, `nodejs-test.${process.pid}-${socketCounter++}.sock`);

export type RunHandler = (
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
) => Promise<void>;

export class TestRunner {
  constructor(private readonly smStore: SourceMapStore) {}

  public makeHandler(
    wf: vscode.WorkspaceFolder,
    ctrl: vscode.TestController,
    debug: boolean,
  ): RunHandler {
    return async (request, token) => {
      const files = await this.solveArguments(ctrl, request);
      if (token.isCancellationRequested) {
        return;
      }

      const run = ctrl.createTestRun(request);
      const getTestByPath = (path: string[]): vscode.TestItem | undefined => {
        const uri = vscode.Uri.parse(path[0]);
        let item = last(getContainingItemsForFile(wf, ctrl, uri))!.item;
        if (!item) {
          return undefined;
        }

        for (let i = 1; item && i < path.length; i++) {
          item = item.children.get(path[i]);
        }

        return item;
      };

      // inline source maps read from the runtime. These will both be definitive
      // and possibly the only ones presents from transpiled code.
      const inlineSourceMaps = new Map<string, string>();
      const smStore = this.smStore.createScoped();
      const mapLocation = async (path: string, line: number | null, col: number | null) => {
        // stacktraces can have file URIs on some platforms (#7)
        const fileUri = path.startsWith('file:') ? vscode.Uri.parse(path) : vscode.Uri.file(path);
        const smMaintainer = smStore.maintain(fileUri, inlineSourceMaps.get(fileUri.fsPath));
        run.token.onCancellationRequested(() => smMaintainer.dispose());
        const sourceMap = await (smMaintainer.value || smMaintainer.refresh());
        return sourceMap.originalPositionFor(line || 1, col || 0);
      };

      try {
        const outputQueue = new OutputQueue();
        await new Promise<void>((resolve, reject) => {
          const socket = getRandomPipe();
          run.token.onCancellationRequested(() => fs.unlink(socket).catch(() => {}));

          const server = createServer((stream) => {
            run.token.onCancellationRequested(stream.end, stream);
            const extensions = this.extensions.value;

            const onLog = (test: vscode.TestItem | undefined, prefix: string, log: ILog) => {
              const location = log.sf.file
                ? mapLocation(log.sf.file, log.sf.lineNumber, log.sf.column)
                : undefined;
              outputQueue.enqueue(location, (location) => {
                run.appendOutput(prefix);
                run.appendOutput(log.chunk.replace(/\r?\n/g, '\r\n'), location, test);
              });
            };

            const reg = Contract.registerServerToStream(
              contract,
              new NodeJsMessageStream(stream, stream),
              {},
              {
                started({ id }) {
                  const test = getTestByPath(id);
                  if (test) {
                    run.started(test);
                  }
                },

                output(line) {
                  outputQueue.enqueue(() => run.appendOutput(`${line}\r\n`));
                },

                sourceMap({ testFile, sourceMapURL }) {
                  inlineSourceMaps.set(testFile, sourceMapURL);
                },

                log({ id, prefix, log }) {
                  const test = id ? getTestByPath(id) : undefined;
                  onLog(test, prefix, log);
                },

                finished({
                  id,
                  status,
                  duration,
                  actual,
                  expected,
                  error,
                  stack,
                  logs,
                  logPrefix,
                }) {
                  const test = getTestByPath(id);
                  if (!test) {
                    return;
                  }

                  for (const l of logs) {
                    onLog(test, logPrefix, l);
                  }

                  if (status === Result.Failed) {
                    const asText = error || 'Test failed';
                    const testMessage =
                      actual !== undefined && expected !== undefined
                        ? vscode.TestMessage.diff(asText, expected, actual)
                        : new vscode.TestMessage(asText);
                    const lastFrame = stack?.find((s) => !s.file?.startsWith('node:'));
                    const location = lastFrame?.file
                      ? mapLocation(lastFrame.file, lastFrame.lineNumber, lastFrame.column)
                      : undefined;
                    outputQueue.enqueue(location, (location) => {
                      testMessage.location = location;
                      run.failed(test, testMessage);
                    });
                  } else if (status === Result.Skipped) {
                    outputQueue.enqueue(() => run.skipped(test));
                  } else if (status === Result.Ok) {
                    outputQueue.enqueue(() => run.passed(test, duration));
                  }
                },
              },
            );

            reg.client
              .start({
                files,
                concurrency,
                extensions,
              })
              .then(({ status, message }) => {
                switch (status) {
                  case CompleteStatus.Done:
                    return resolve(outputQueue.drain());
                  case CompleteStatus.NodeVersionOutdated:
                    return reject(
                      new Error(
                        `This extension only works with Node.js version 19 and above (you have ${message}). You can change the setting '${this.nodejsPath.key}' if you want to use a different Node.js executable.`,
                      ),
                    );
                }
              })
              .catch(reject)
              .finally(() => reg.client.kill());
          });
          run.token.onCancellationRequested(server.close, server);
          server.once('error', reject);
          server.listen(socket);

          const resolvedNodejsParameters = this.nodejsParameters.value.map((p) =>
            replaceVariables(p),
          );
          this.spawnWorker(wf, debug, socket, run.token, resolvedNodejsParameters).then(
            () => reject(new Error('Worker executed without signalling its completion')),
            reject,
          );
        });
      } catch (e) {
        if (!token.isCancellationRequested) {
          vscode.window.showErrorMessage((e as Error).message);
        }
      } finally {
        run.end();
      }
    };
  }

  private prepareArguments(
    baseArgs: ReadonlyArray<string>,
    filter?: ReadonlyArray<vscode.TestItem>,
  ) {
    const args = [...baseArgs, '--reporter', 'json-stream'];
    if (!filter) {
      return args;
    }

    const grepRe: string[] = [];
    const runPaths = new Set<string>();

    for (const test of filter) {
      const data = testMetadata.get(test);
      if (!data) {
        continue;
      }

      if (data.type === ItemType.Test || data.type === ItemType.Suite) {
        grepRe.push(getFullName(test) + (data.type === ItemType.Test ? '$' : ' '));
      }

      runPaths.add(test.uri!.fsPath);
    }

    for (const path of runPaths) {
      args.push('--run', path);
    }

    if (grepRe.length) {
      args.push('--grep', `/^(${grepRe.join('|')})/`);
    }

    return args;
  }
}

const getFullName = (test: vscode.TestItem) => {
  let name = test.label;
  while (test.parent && testMetadata.get(test.parent)?.type === ItemType.Suite) {
    test = test.parent;
    name = `${test.label} ${name}`;
  }
  return name;
};
const escapeRe = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

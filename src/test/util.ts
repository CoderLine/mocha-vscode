/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import * as assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { setTimeout } from 'timers/promises';
import * as vscode from 'vscode';
import { getControllersForTestCommand } from '../constants';
import type { Controller } from '../controller';
import { IParsedNode, NodeKind } from '../discoverer/types';

export function findTestItem(items: vscode.TestItemCollection, parts: string | string[]) {
  if (!Array.isArray(parts)) {
    parts = parts.split('/');
  }

  if (parts.length == 0) {
    return undefined;
  }

  do {
    const child = items.get(parts.shift()!);
    if (!child) {
      return undefined;
    }

    if (parts.length === 0) {
      return child;
    }

    items = child.children;
  } while (parts.length > 0);

  return undefined;
}

export function source(...lines: string[]) {
  return lines.join('\n');
}

export function integrationTestPrepare(name: string) {
  let workspaceBackup: string;

  const workspaceFolder = path.resolve(__dirname, '..', '..', 'test-workspaces', name);
  if (!fs.existsSync(workspaceFolder)) {
    assert.fail(
      `Workspace Folder '${workspaceFolder}' doesn't exist, something is wrong with the test setup`,
    );
  }

  beforeEach(async () => {
    workspaceBackup = await backupWorkspace(workspaceFolder);
  });

  afterEach(async () => {
    await restoreWorkspace(workspaceFolder, workspaceBackup);
  });

  return workspaceFolder;
}

async function restoreWorkspace(workspaceFolder: string, workspaceBackup: string) {
  // vscode behaves badly when we delete the workspace folder; delete contents instead.
  const files = await fs.promises.readdir(workspaceFolder);
  await Promise.all(files.map((f) => rmrf(path.join(workspaceFolder, f))));

  await fs.promises.cp(workspaceBackup, workspaceFolder, { recursive: true });
  await rmrf(workspaceBackup);

  // it seems like all these files changes can require a moment for vscode's file
  // watcher to update before we can run the next test. 500 seems to do it 🤷‍♂️
  await setTimeout(500);
}

async function backupWorkspace(source: string) {
  const backupFolder = path.resolve(tmpdir(), '.mocha-vscode-test-backup', crypto.randomUUID());
  await rmrf(backupFolder);
  await fs.promises.cp(source, backupFolder, { recursive: true });

  return backupFolder;
}

export async function getController(scan: boolean = true) {
  const c = await vscode.commands.executeCommand<Controller[]>(getControllersForTestCommand);

  if (!c.length) {
    throw new Error('no controllers registered');
  }

  const controller = c[0];
  if (scan) {
    await controller.scanFiles();
  }
  return controller;
}

export function extractParsedNodes(vsItems: vscode.TestItemCollection): IParsedNode[] {
  const items: IParsedNode[] = [];

  for (const vsItem of vsItems) {
    const hasChildren = vsItem[1].children.size > 0;

    const item: IParsedNode = {
      name: vsItem[1].label,
      kind: hasChildren ? NodeKind.Suite : NodeKind.Test,
      startLine: vsItem[1].range?.start.line ?? -1,
      startColumn: vsItem[1].range?.start.character ?? -1,
      endLine: vsItem[1].range?.end.line ?? -1,
      endColumn: vsItem[1].range?.end.character ?? -1,
      children: [],
    };

    items.push(item);
    if (hasChildren) {
      item.children = extractParsedNodes(vsItem[1].children);
    }
  }

  return items;
}

type TestTreeExpectation = [string, (TestTreeExpectation[] | string)?];

function buildTreeExpectation(entry: TestTreeExpectation, c: vscode.TestItemCollection) {
  for (const [id, { error, children }] of c) {
    const node: TestTreeExpectation = [id];
    if (error instanceof vscode.MarkdownString) {
      node[1] = error.value;
    } else if (typeof error === 'string') {
      node[1] = error;
    } else {
      buildTreeExpectation(node, children);
    }

    if (entry.length === 1) {
      entry[1] = [node];
    } else if (Array.isArray(entry[1])) {
      entry[1].push(node);
    }
  }

  if (Array.isArray(entry[1])) {
    entry[1]?.sort(([a], [b]) => a.localeCompare(b));
  }
}

export function onceChanged(controller: Controller, timeout: number = 10000) {
  return new Promise<void>((resolve, reject) => {
    setTimeout(timeout).then(reject);
    const l = controller.onDidChange(() => {
      l.dispose();
      resolve();
    });
  });
}

export function buildTestTreeExpectation({ ctrl }: Controller) {
  const e = ['root', []] satisfies TestTreeExpectation;
  buildTreeExpectation(e, ctrl.items);
  return e[1];
}

export async function expectTestTree(c: Controller, tree: TestTreeExpectation[]) {
  const e = buildTestTreeExpectation(c);
  assert.deepStrictEqual(e, tree, JSON.stringify(e));
}

/** Retries deletion a few times since directories may still be in use briefly during test shutdown */
async function rmrf(path: string) {
  for (let i = 10; i >= 0; i--) {
    try {
      await fs.promises.rm(path, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i === 0) {
        throw e;
      }
    }
  }
}

export type TestState = 'enqueued' | 'started' | 'skipped' | 'failed' | 'errored' | 'passed';

export class FakeTestRun implements vscode.TestRun {
  public output: { output: string; location?: vscode.Location; test?: vscode.TestItem }[] = [];
  public states: { test: vscode.TestItem; state: TestState; message?: vscode.TestMessage }[] = [];
  public ended = false;
  public coverage: vscode.FileCoverage[] = [];

  public terminalStates() {
    const last: typeof this.states = [];
    for (let i = this.states.length - 1; i >= 0; i--) {
      const state = this.states[i];
      if (!last.some((l) => l.test === state.test)) {
        last.unshift(state);
      }
    }

    return last;
  }

  public expectStates(expected: { [test: string]: TestState[] }) {
    const actual: { [test: string]: TestState[] } = {};
    for (const { test, state } of this.states) {
      let key = test.id;
      for (let p = test.parent; p; p = p.parent) {
        key = `${p.id}/${key}`;
      }
      (actual[key] ??= []).push(state);
    }

    assert.deepStrictEqual(actual, expected, JSON.stringify(actual));
  }

  //#region fake implementation
  public readonly name = undefined;
  public readonly token = new vscode.CancellationTokenSource().token;
  public readonly isPersisted = true;

  enqueued(test: vscode.TestItem): void {
    this.states.push({ test, state: 'enqueued' });
  }
  started(test: vscode.TestItem): void {
    this.states.push({ test, state: 'started' });
  }
  skipped(test: vscode.TestItem): void {
    this.states.push({ test, state: 'skipped' });
  }
  failed(test: vscode.TestItem, message: vscode.TestMessage | readonly vscode.TestMessage[]): void {
    this.states.push({
      test,
      state: 'failed',
      message: message instanceof Array ? message[0] : message,
    });
  }
  errored(
    test: vscode.TestItem,
    message: vscode.TestMessage | readonly vscode.TestMessage[],
  ): void {
    this.states.push({
      test,
      state: 'errored',
      message: message instanceof Array ? message[0] : message,
    });
  }
  passed(test: vscode.TestItem): void {
    this.states.push({ test, state: 'passed' });
  }
  appendOutput(
    output: string,
    location?: vscode.Location | undefined,
    test?: vscode.TestItem | undefined,
  ): void {
    // console.log(output); // debug
    this.output.push({ output, location, test });
  }
  end(): void {
    this.ended = true;
  }
  addCoverage(fileCoverage: vscode.FileCoverage): void {
    this.coverage.push(fileCoverage);
  }
  onDidDispose: vscode.Event<void> = new vscode.EventEmitter<void>().event;
  //#endregion
}

export async function captureTestRun(ctrl: Controller, req: vscode.TestRunRequest) {
  const fake = new FakeTestRun();
  const createTestRun = sinon.stub(ctrl.ctrl, 'createTestRun').returns(fake);
  try {
    await req.profile!.runHandler(req, new vscode.CancellationTokenSource().token);
    return fake;
  } finally {
    createTestRun.restore();
  }
}

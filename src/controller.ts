/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { ConfigValue } from './configValue';
import { ConfigurationFile, ConfigurationList } from './configurationFile';
import { defaultTestSymbols, showConfigErrorCommand } from './constants';
import { SettingsBasedFallbackTestDiscoverer } from './discoverer/settings';
import { IParsedNode, NodeKind } from './discoverer/types';
import { DisposableStore, MutableDisposable } from './disposable';
import { last } from './iterable';
import { ICreateOpts, ItemType, getContainingItemsForFile, testMetadata } from './metadata';
import { TestRunner } from './runner';
import { ISourceMapMaintainer, SourceMapStore } from './source-map-store';
import { TsConfigStore } from './tsconfig-store';

const diagnosticCollection = vscode.languages.createDiagnosticCollection('ext-test-duplicates');

type TestNodeCountKind = '+' | '~' | '-';
class TestNodeCounter {
  private counts: Map<NodeKind, Map<TestNodeCountKind, number>> = new Map();

  public add(kind: NodeKind) {
    this.increment(kind, '+');
  }

  public update(kind: NodeKind) {
    this.increment(kind, '~');
  }

  public remove(kind: NodeKind) {
    this.increment(kind, '-');
  }

  increment(nodeKind: NodeKind, countKind: TestNodeCountKind) {
    let counts = this.counts.get(nodeKind);
    if (!counts) {
      counts = new Map([
        ['+', 0],
        ['~', 0],
        ['-', 0],
      ]);
      this.counts.set(nodeKind, counts);
    }
    counts.set(countKind, (counts.get(countKind) ?? 0) + 1);
  }

  toString() {
    const s = [];
    for (const [nodeKind, nodeKindV] of this.counts) {
      const prefix = `${NodeKind[nodeKind]}:`;
      const values = [];
      for (const [countKind, count] of nodeKindV) {
        values.push(`${countKind}${count}`);
      }
      s.push(`${prefix} ${values.join(' ')}`);
    }
    return s.join('; ');
  }
}

export class Controller {
  private readonly disposables = new DisposableStore();
  public readonly configFile: ConfigurationFile;

  /**
   * Configuration list, used for moment-in-time operations. May change
   * as the file is modified.
   */
  private currentConfig?: ConfigurationList;

  private discoverer!: SettingsBasedFallbackTestDiscoverer;

  public readonly settings = this.disposables.add(
    new ConfigValue('extractSettings', defaultTestSymbols),
  );
  private readonly watcher = this.disposables.add(new MutableDisposable());
  private readonly didChangeEmitter = new vscode.EventEmitter<void>();
  private readonly scanCompleteEmitter = new vscode.EventEmitter<void>();
  private readonly disposeEmitter = new vscode.EventEmitter<void>();
  private runProfiles = new Map<string, vscode.TestRunProfile[]>();

  /** Error item shown in the tree, if any. */
  private errorItem?: vscode.TestItem;

  /** Mapping of the top-level tests found in each compiled */
  private readonly testsInFiles = new Map<
    /* uri */ string,
    {
      hash: number;
      sourceMap: ISourceMapMaintainer;
      items: Map<string, vscode.TestItem>;
    }
  >();

  /** Change emitter used for testing, to pick up when the file watcher detects a change */
  public readonly onDidChange = this.didChangeEmitter.event;
  public readonly onScanComplete = this.scanCompleteEmitter.event;
  public readonly onDidDispose = this.disposeEmitter.event;
  private tsconfigStore?: TsConfigStore;

  public ctrl: vscode.TestController;

  /** Gets run profiles the controller has registerd. */
  public get profiles() {
    return [...this.runProfiles.values()].flat();
  }

  constructor(
    private readonly logChannel: vscode.LogOutputChannel,
    private readonly wf: vscode.WorkspaceFolder,
    private readonly smStore: SourceMapStore,
    configFileUri: vscode.Uri,
    private readonly runner: TestRunner,
  ) {
    logChannel.info(
      'New Test Controller for workspace folder and config',
      wf.uri.fsPath,
      configFileUri.fsPath,
    );
    const ctrl = (this.ctrl = vscode.tests.createTestController(
      configFileUri.toString(),
      configFileUri.fsPath,
    ));
    this.disposables.add(ctrl);
    this.configFile = this.disposables.add(new ConfigurationFile(logChannel, configFileUri, wf));

    this.recreateDiscoverer();

    const rescan = async (reason: string) => {
      try {
        logChannel.info(`Rescan of tests triggered (${reason}) - ${this.configFile.uri}}`);
        this.recreateDiscoverer();
        await this.scanFiles();
      } catch (e) {
        this.logChannel.error(e as Error, 'Failed to rescan tests');
      }
    };
    this.disposables.add(this.configFile.onDidChange(() => rescan('mocharc changed')));
    this.disposables.add(this.settings.onDidChange(() => rescan('settings changed')));
    ctrl.refreshHandler = () => {
      this.configFile.forget();
      rescan('user');
    };
    this.scanFiles();
  }

  recreateDiscoverer(newTsConfig: boolean = true) {
    if (!this.tsconfigStore) {
      newTsConfig = true;
    }

    if (newTsConfig) {
      const oldStore = this.tsconfigStore;
      if (oldStore) {
        this.disposables.remove(oldStore);
        oldStore.dispose();
      }
      this.tsconfigStore = new TsConfigStore();
      this.disposables.add(this.tsconfigStore);
    }

    this.discoverer = new SettingsBasedFallbackTestDiscoverer(
      this.logChannel,
      this.settings,
      this.tsconfigStore!,
    );
  }

  public dispose() {
    this.disposables.dispose();
    this.disposeEmitter.fire();
  }

  public async syncFile(uri: vscode.Uri, contents?: () => string) {
    this._syncFile(uri, contents?.());
  }

  private async _syncFile(uri: vscode.Uri, contents?: string) {
    if (!this.currentConfig) {
      await this.readConfig();
    }

    this.logChannel.debug('Syncing file', uri);

    const includeViaConfigs = this.currentConfig?.includesTestFile(uri);
    if (!includeViaConfigs) {
      return;
    }

    contents ??= await fs.readFile(uri.fsPath, 'utf8');

    // avoid re-parsing if the contents are the same (e.g. if a file is edited
    // and then saved.)
    const previous = this.testsInFiles.get(uri.toString());
    const hash = createHash('sha256').update(contents).digest().readInt32BE(0);
    if (hash === previous?.hash) {
      this.logChannel.debug('Cache not changed skipping update ', uri);
      return;
    }

    let tree: IParsedNode[];
    try {
      tree = await this.discoverer.discover(uri.fsPath, contents);
    } catch (e) {
      this.logChannel.error(
        'Error while test extracting ',
        (e as Error).message,
        (e as Error).stack,
      );
      this.deleteFileTests(uri.toString());

      const errorFile = last(this.getContainingItemsForFile(uri, { compiledFile: uri }))!.item!;
      errorFile.error = String(e);

      return;
    }

    if (!tree.length) {
      this.logChannel.info(`No tests found in '${uri.fsPath}'`);
      this.deleteFileTests(uri.toString());
      return;
    }

    const smMaintainer = previous?.sourceMap ?? this.smStore.maintain(uri);
    const sourceMap = await smMaintainer.refresh(contents);

    const counter = new TestNodeCounter();
    const add = (
      parent: vscode.TestItem,
      node: IParsedNode,
      start: vscode.Location,
      end: vscode.Location,
    ): vscode.TestItem => {
      let item = parent.children.get(node.name);
      if (!item) {
        item = this.ctrl.createTestItem(node.name, node.name, start.uri);
        counter.add(node.kind);
        testMetadata.set(item, {
          type: node.kind === NodeKind.Suite ? ItemType.Suite : ItemType.Test,
        });
        parent.children.add(item);
      } else {
        counter.update(node.kind);
      }
      item.range = new vscode.Range(start.range.start, end.range.end);
      item.error = node.error;

      const seen = new Map<string, vscode.TestItem>();
      for (const child of node.children) {
        const existing = seen.get(child.name);
        const start = sourceMap.originalPositionFor(child.startLine, child.startColumn);
        const end =
          child.endLine !== undefined && child.endColumn !== undefined
            ? sourceMap.originalPositionFor(child.endLine, child.endColumn)
            : start;
        if (existing) {
          addDuplicateDiagnostic(start, existing);
          continue;
        }

        seen.set(child.name, add(item, child, start, end));
      }

      for (const [id, child] of item.children) {
        if (!seen.has(id)) {
          const meta = testMetadata.get(child);
          item.children.delete(id);
          if (meta?.type === ItemType.Test) {
            counter.remove(NodeKind.Test);
          } else if (meta?.type === ItemType.Suite) {
            counter.remove(NodeKind.Suite);
          }
        }
      }

      return item;
    };

    // We assume that all tests inside a top-level describe/test are from the same
    // source file. This is probably a good assumption. Likewise we assume that a single
    // a single describe/test is not split between different files.
    const newTestsInFile = new Map<string, vscode.TestItem>();
    for (const node of tree) {
      const start = sourceMap.originalPositionFor(node.startLine, node.startColumn);
      const end =
        node.endLine !== undefined && node.endColumn !== undefined
          ? sourceMap.originalPositionFor(node.endLine, node.endColumn)
          : start;
      const file = last(this.getContainingItemsForFile(start.uri, { compiledFile: uri }))!.item!;
      file.error = undefined;
      diagnosticCollection.delete(start.uri);
      newTestsInFile.set(node.name, add(file, node, start, end));
    }

    if (previous) {
      for (const [id, test] of previous.items) {
        if (!newTestsInFile.has(id)) {
          const meta = testMetadata.get(test);
          (test.parent?.children ?? this.ctrl.items).delete(id);
          if (meta?.type === ItemType.Test) {
            counter.remove(NodeKind.Test);
          } else if (meta?.type === ItemType.Suite) {
            counter.remove(NodeKind.Suite);
          }
        }
      }
    }

    this.logChannel.info(`Reloaded tests from '${uri.fsPath}' ${counter}`);

    this.testsInFiles.set(uri.toString(), { items: newTestsInFile, hash, sourceMap: smMaintainer });
    this.didChangeEmitter.fire();
  }

  private deleteFileTests(uriStr: string) {
    const previous = this.testsInFiles.get(uriStr);
    if (!previous) {
      return;
    }

    this.testsInFiles.delete(uriStr);
    for (const [id, item] of previous.items) {
      diagnosticCollection.delete(item.uri!);
      const itemsIt = this.getContainingItemsForFile(item.uri!);

      // keep 'deleteFrom' as the node to remove if there are no nested children
      let deleteFrom: { items: vscode.TestItemCollection; id: string } | undefined;
      let last: vscode.TestItemCollection | undefined;
      for (const { children, item } of itemsIt) {
        if (item && children.size === 1) {
          deleteFrom ??= { items: last || this.ctrl.items, id: item.id };
        } else {
          deleteFrom = undefined;
        }

        last = children;
      }

      if (!last!.get(id)) {
        break;
      }

      if (deleteFrom) {
        deleteFrom.items.delete(deleteFrom.id);
      } else {
        last!.delete(id);
      }
    }

    this.didChangeEmitter.fire();
  }

  private async startWatchingWorkspace() {
    // we need to watch for *every* change due to https://github.com/microsoft/vscode/issues/60813
    const watcher = (this.watcher.value = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.wf, '**/*'),
    ));

    watcher.onDidCreate((uri) => this._syncFile(uri));
    watcher.onDidChange((uri) => this._syncFile(uri));
    watcher.onDidDelete((uri) => {
      const prefix = uri.toString();
      for (const key of this.testsInFiles.keys()) {
        if (key === prefix || (key[prefix.length] === '/' && key.startsWith(prefix))) {
          this.deleteFileTests(key);
        }
      }
    });

    await this.scanFiles();
  }

  private handleScanError() {
    this.watcher.clear();
    for (const key of this.testsInFiles.keys()) {
      this.deleteFileTests(key);
    }
    const item = (this.errorItem = this.ctrl.createTestItem('error', 'Extension Test Error'));
    item.error = new vscode.MarkdownString(
      `[View details](command:${showConfigErrorCommand}?${encodeURIComponent(
        JSON.stringify([this.configFile.uri.toString()]),
      )})`,
    );
    item.error.isTrusted = true;
    this.ctrl.items.add(item);
  }

  /** Creates run profiles for each configuration in the extension tests */
  private applyRunHandlers() {
    const oldRunHandlers = this.runProfiles;
    this.runProfiles = new Map();
    const originalName = 'Mocha Config';
    let name = originalName;
    for (let i = 2; this.runProfiles.has(name); i++) {
      name = `${originalName} #${i}`;
    }

    const prev = oldRunHandlers.get(name);
    if (prev) {
      this.runProfiles.set(name, prev);
      oldRunHandlers.delete(name);
      return;
    }

    const run = this.runner.makeHandler(this.ctrl, this.configFile, false);
    const debug = this.runner.makeHandler(this.ctrl, this.configFile, true);
    const profiles = [
      this.ctrl.createRunProfile(name, vscode.TestRunProfileKind.Run, run, true),
      this.ctrl.createRunProfile(name, vscode.TestRunProfileKind.Debug, debug, true),
    ];

    this.runProfiles.set(name, profiles);

    for (const profiles of oldRunHandlers.values()) {
      for (const profile of profiles) {
        profile.dispose();
      }
    }
  }

  private async readConfig() {
    let configs: ConfigurationList;
    try {
      configs = await this.configFile.read();
    } catch (e) {
      this.logChannel.error(e as Error, 'Failed to read config file');
      this.handleScanError();
      return;
    }

    if (configs !== this.currentConfig) {
      this.applyRunHandlers();
      this.currentConfig = configs;
    }

    return configs;
  }

  public async scanFiles() {
    if (this.errorItem) {
      this.ctrl.items.delete(this.errorItem.id);
      this.errorItem = undefined;
    }

    if (!this.watcher.value) {
      this.logChannel.trace('Missing watcher, creating it');
      // starting the watcher will call this again
      return this.startWatchingWorkspace();
    }

    const configs = await this.readConfig();
    if (!configs) {
      this.logChannel.trace('Skipping scan, no configs');
      return;
    }

    const toRemove = new Set(this.testsInFiles.keys());
    const rough = configs.roughIncludedFiles();
    const seen = new Set<string>();
    const todo2: Promise<void>[] = [];

    const processFile = (file: vscode.Uri) => {
      if (!seen.has(file.toString())) {
        todo2.push(this._syncFile(file));
        toRemove.delete(file.toString());
        seen.add(file.toString());
      }
    };

    rough.files.forEach((f) => processFile(vscode.Uri.file(f)));
    const todo = rough.patterns.map(async (pattern) => {
      const relativePattern = new vscode.RelativePattern(this.wf, pattern);
      for (const file of await vscode.workspace.findFiles(relativePattern)) {
        processFile(file);
      }
    });

    // find all patterns:
    await Promise.all(todo);
    // process all files:
    await Promise.all(todo2);

    for (const uriStr of toRemove) {
      this.deleteFileTests(uriStr);
    }

    if (this.testsInFiles.size === 0) {
      this.watcher.clear(); // stop watching if there are no tests discovered
    }

    this.scanCompleteEmitter.fire();
  }

  /** Gets the test collection for a file of the given URI, descending from the root. */
  private getContainingItemsForFile(uri: vscode.Uri, createOpts?: ICreateOpts) {
    return getContainingItemsForFile(this.configFile.uri, this.ctrl, uri, createOpts);
  }
}

const addDuplicateDiagnostic = (location: vscode.Location, existing: vscode.TestItem) => {
  const diagnostic = new vscode.Diagnostic(
    location.range,
    'Duplicate tests cannot be run individually and will not be reported correctly by the test framework. Please rename them.',
    vscode.DiagnosticSeverity.Warning,
  );

  diagnostic.relatedInformation = [
    new vscode.DiagnosticRelatedInformation(
      new vscode.Location(existing.uri!, existing.range!),
      'First declared here',
    ),
  ];

  diagnosticCollection.set(
    location.uri,
    diagnosticCollection.get(location.uri)?.concat([diagnostic]) || [diagnostic],
  );
};

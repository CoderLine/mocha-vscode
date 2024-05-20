/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import type { Event, LogLevel, LogOutputChannel, ViewColumn } from 'vscode';

export class ConsoleOuputChannel implements LogOutputChannel {
  constructor(private inner: LogOutputChannel) {}

  get logLevel(): LogLevel {
    return this.inner.logLevel;
  }

  get onDidChangeLogLevel(): Event<LogLevel> {
    return this.inner.onDidChangeLogLevel;
  }
  trace(message: string, ...args: any[]): void {
    this.inner.trace(message, ...args);
    console.trace(`[Mocha VS Code] ${message}`, ...args);
  }
  debug(message: string, ...args: any[]): void {
    this.inner.debug(message, ...args);
    console.debug(`[Mocha VS Code] ${message}`, ...args);
  }
  info(message: string, ...args: any[]): void {
    this.inner.info(message, ...args);
    console.info(`[Mocha VS Code] ${message}`, ...args);
  }
  warn(message: string, ...args: any[]): void {
    this.inner.warn(message, ...args);
    console.warn(`[Mocha VS Code] ${message}`, ...args);
  }
  error(error: string | Error, ...args: any[]): void {
    this.inner.error(error, ...args);
    console.error(`[Mocha VS Code] ${error}`, ...args);
  }
  get name(): string {
    return this.inner.name;
  }
  append(value: string): void {
    this.inner.append(value);
  }
  appendLine(value: string): void {
    this.inner.appendLine(value);
  }
  replace(value: string): void {
    this.inner.replace(value);
  }
  clear(): void {
    this.inner.clear();
  }
  show(columnOrPreserveFocus?: ViewColumn | boolean, preserveFocus?: boolean): void {
    if (typeof columnOrPreserveFocus === 'boolean') {
      this.inner.show(columnOrPreserveFocus);
    } else {
      this.inner.show(columnOrPreserveFocus, preserveFocus);
    }
  }
  hide(): void {
    this.inner.hide();
  }
  dispose(): void {
    this.inner.dispose();
  }
}

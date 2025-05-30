/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

export enum MochaEvent {
  Start = 'start',
  TestStart = 'testStart',
  Pass = 'pass',
  Fail = 'fail',
  End = 'end',
  SuiteStart = 'suiteStart',
}

export interface IStartEvent {
  total: number;
}

export interface ITestStartEvent {
  path: string[];
  currentRetry: number;
  file?: string;
}

export interface IPassEvent extends ITestStartEvent {
  duration?: number;
  speed: 'fast' | 'medium' | 'slow';
}

export interface IFailEvent extends IPassEvent {
  err: string;
  stack: string | null;
  expected?: string;
  actual?: string;
}

// biome-ignore lint/complexity/noBannedTypes: No special data
export type IEndEvent = {}

export interface ISuiteStartEvent {
  path: string[];
  file?: string;
}

export type MochaEventTuple =
  | [MochaEvent.Start, IStartEvent]
  | [MochaEvent.TestStart, ITestStartEvent]
  | [MochaEvent.Pass, IPassEvent]
  | [MochaEvent.Fail, IFailEvent]
  | [MochaEvent.End, IEndEvent]
  | [MochaEvent.SuiteStart, ISuiteStartEvent];

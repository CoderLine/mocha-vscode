/** biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: Temporary */
import type { ChildProcess } from 'node:child_process';
import type { LogOutputChannel, Uri } from 'vscode';
import type { ExtensionSettings } from '../settings';
import type { IResolvedConfiguration, ITestRuntime } from './types';

export class SettingsBasedTestRuntime implements ITestRuntime {
  public constructor(
    private _logChannel: LogOutputChannel,
    private readonly _configFileUri: Uri,

    private _settings: ExtensionSettings
  ) {}

  resolveConfiguration(): Promise<IResolvedConfiguration> {
    throw new Error('Method not implemented.');
  }
  getMochaSpawnArgs(_mochaArgs: string[]): Promise<string[]> {
    throw new Error('Method not implemented.');
  }
  launchMocha(_mochaArgs: string[]): Promise<ChildProcess> {
    throw new Error('Method not implemented.');
  }
}

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import path from 'node:path';
import type { LogOutputChannel, Uri } from 'vscode';
import { HumanError } from '../errors';
import type { ExtensionSettings } from '../settings';
import type { IResolvedConfiguration, ITestRuntime } from './types';

const startMochaScript = `import 'mocha/bin/mocha.js'`;
const loadOptionsScript = `import {loadOptions} from 'mocha/lib/cli/options.js'; console.log(JSON.stringify(loadOptions()))`;

export class NodeLikeTestRuntime implements ITestRuntime {
  public constructor(
    private logChannel: LogOutputChannel,
    private readonly configFileUri: Uri,
    private readonly settings: ExtensionSettings,
    private readonly nodeLaunchArgs: string[]
  ) {}

  async resolveConfiguration(): Promise<IResolvedConfiguration> {
    this.logChannel.trace('Loading mocha configuration via node -e');
    try {
      const config = await this.exec(
        [...this.nodeLaunchArgs, '-e', loadOptionsScript],
        path.dirname(this.configFileUri.fsPath),
        this.settings.env.value
      );
      this.logChannel.trace(`Mocha config loaded: '${config}'`);
      return JSON.parse(config);
    } catch (e) {
      this.logChannel.error(`Error loading mocha configuration`, e);
      return {
        _: [],
        ignore: []
      };
    }
  }

  private async exec(args: string[], cwd: string, env: Record<string, string>): Promise<string> {
    const node = await new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
      const p = spawn(args[0], args.slice(1), {
        cwd,
        env: {
          ...process.env,
          ...env
        }
      });
      p.on('spawn', () => resolve(p));
      p.on('error', reject);
    });

    let stdErr = '';
    let stdOut = '';
    node.stderr.on('data', d => {
      stdErr += d;
    });
    node.stdout.on('data', d => {
      stdOut += d;
    });

    await new Promise<void>((resolve, reject) => {
      node.on('error', reject);
      node.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new HumanError(
              `Error executing executing '${args[0]}', exited with code ${code}, stdout: ${stdOut}, stderr: ${stdErr}`
            )
          );
        }
      });
    });
    return stdOut;
  }

  async getMochaSpawnArgs(mochaArgs: string[]): Promise<string[]> {
    return [
      ...this.nodeLaunchArgs,
      '-e',
      startMochaScript,
      'mocha.js', // fake argv[1]
      ...mochaArgs
    ];
  }
}

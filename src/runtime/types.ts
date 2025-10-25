import type { ChildProcess } from 'node:child_process';

export interface IResolvedConfiguration {
  _: string[] | undefined;
  ignore: string[] | undefined;
}

/**
 * An abstraction on how to execute tests and resolve configurations to allow
 * specific execution runtimes like node, nvm, yarn with PnP etc. which
 * need to be launched with specific command lines.
 */
export interface ITestRuntime {
  resolveConfiguration(): Promise<IResolvedConfiguration>;
  getMochaSpawnArgs(mochaArgs: string[]): Promise<string[]>;
  launchMocha(mochaArgs: string[]): Promise<ChildProcess>;
}

// class Temp {
//     async _resolveNvmRc(): Promise<string | undefined> {
//         // the .nvmrc file can be placed in any location up the directory tree, so we do the same
//         // starting from the mocha config file
//         // https://github.com/nvm-sh/nvm/blob/06413631029de32cd9af15b6b7f6ed77743cbd79/nvm.sh#L475-L491
//         try {
//             if (!(await isNvmInstalled())) {
//                 return undefined;
//             }

//             let dir: string | undefined = path.dirname(this.uri.fsPath);

//             while (dir) {
//                 const nvmrc = path.join(dir, '.nvmrc');
//                 if (
//                     await fs.promises
//                         .access(nvmrc)
//                         .then(() => true)
//                         .catch(() => false)
//                 ) {
//                     this.logChannel.debug(`Found .nvmrc at ${nvmrc}`);
//                     return nvmrc;
//                 }

//                 const parent = path.dirname(dir);
//                 if (parent === dir) {
//                     break;
//                 }
//                 dir = parent;
//             }
//         } catch (e) {
//             this.logChannel.error(e as Error, 'Error while searching for nvmrc');
//         }

//         return undefined;
//     }

//     async getMochaSpawnArgs(customArgs: readonly string[]): Promise<string[]> {
//         const nodeSpawnArgs: string[] = await this._npxSpawnArgs();
//         return [...nodeSpawnArgs, 'exec', '--', 'mocha', '--config', this.uri.fsPath, ...customArgs];
//     }

//     private async _nodeEval(script: string): Promise<string> {
//         return await this._exec([...(await this._nodeSpawnArgs()), 'e', script]);
//     }

//     private async _exec(spawnArgs: string[]): Promise<string> {
//         const dir = path.dirname(this.uri.fsPath);

//         const node = await new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
//             const env = {
//                 ...process.env,
//                 ELECTRON_RUN_AS_NODE: '1',
//                 ...this._env.value
//             };
//             const p = spawn(spawnArgs[0], spawnArgs.slice(1), {
//                 cwd: dir,
//                 env
//             });
//             p.on('spawn', () => resolve(p));
//             p.on('error', reject);
//         });

//         let stdErr = '';
//         let stdOut = '';
//         node.stderr.on('data', d => {
//             stdErr += d;
//         });
//         node.stdout.on('data', d => {
//             stdOut += d;
//         });

//         await new Promise<void>((resolve, reject) => {
//             node.on('error', reject);
//             node.on('close', code => {
//                 this.logChannel.trace('Node Process closed');
//                 if (code === 0) {
//                     resolve();
//                 } else {
//                     reject(new NodeProcessExitedError(code, stdOut, stdErr));
//                 }
//             });
//         });
//         return stdOut;
//     }

//     private async _read() {
//            const config = this.runtime.resolveConfiguration(this)JSON.parse(
//                await this._nodeEval(
//                    `import {loadOptions} from 'mocha/lib/cli/options.js'; console.log(JSON.stringify(loadOptions()))`
//                )
//            );
//            this.logChannel.debug('Loaded mocharc via Mocha');

//            return new ConfigurationList(this.logChannel, this.uri, config, this.wf);
//        }

//     private async _resolveExecutionMode(): Promise<NodeExecutionMode> {
//         // TODO: config option to force mode?

//         this.logChannel.trace('Resolving execution mode');

//         this._pathToNvmRc ??= await this._resolveNvmRc();

//         if (
//             this._pathToNvmRc &&
//             (await fs.promises
//                 .access(this._pathToNvmRc)
//                 .then(() => true)
//                 .catch(() => false))
//         ) {
//             this.logChannel.trace('Detected NVM, using NVM as mechansim to execute commands.');
//             return NodeExecutionMode.Nvm;
//         }

//         // resolve package.json
//         const prefix = await this._exec([await getPathToNpm(this.logChannel), 'prefix']);
//         const packageJson = JSON.parse(await fs.promises.readFile(path.join(prefix, 'package.json'), 'utf-8'));
//         if (packageJson.packageManager?.startsWith('yarn')) {
//             this.logChannel.trace('Detected YARN, using YARN as mechansim to execute commands.');
//             return NodeExecutionMode.Yarn;
//         }

//         this.logChannel.trace('Using default node as mechansim to execute commands.');
//         return NodeExecutionMode.Node;
//     }

//     private async _nodeSpawnArgs() {
//         this._executionMode ??= await this._resolveExecutionMode();
//         switch (this._executionMode!) {
//             case NodeExecutionMode.Node:
//                 return [await getPathToNode(this.logChannel)];
//             case NodeExecutionMode.Nvm:
//                 return ['nvm', 'run', '--silent'];
//             case NodeExecutionMode.Yarn:
//                 return ['yarn', 'node'];
//         }
//     }

//     private async _npxSpawnArgs() {
//         this._executionMode ??= await this._resolveExecutionMode();

//         switch (this._executionMode!) {
//             case NodeExecutionMode.Node:
//                 return [await getPathToNpx(this.logChannel), '--no'];
//             case NodeExecutionMode.Nvm:
//                 return ['nvm', 'exec', '--silent', 'npx', '--no'];
//             case NodeExecutionMode.Yarn:
//                 return ['TODO'];
//         }
//     }
// }

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
}

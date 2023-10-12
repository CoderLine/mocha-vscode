/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

/** Errors with a human-readable message. */
export class HumanError extends Error {}

export class CliPackageMissing extends HumanError {
  constructor(innerError: Error) {
    // "Can't resolve 'foo' in 'C:\Users\conno\Github\vscode-extension-test-ext'"
    super(
      `${innerError.message}. Try running 'npm install @vscode/test-cli', and then 'Refresh Tests'`,
    );
  }
}

export class ConfigProcessReadError extends HumanError {
  constructor(output: string) {
    super(`Could not read .vscode-test configuration: ${output}`);
  }
}

export class TestProcessExitedError extends HumanError {
  constructor(code: number | null) {
    super(`Test process exited with code ${code}`);
  }
}
